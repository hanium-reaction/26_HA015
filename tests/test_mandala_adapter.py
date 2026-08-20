"""`mandala_adapter` — 결정적 후보정(층②) + 완전 폴백(층③) + 영속화(persist_mandala) 순수 테스트.

LLM 호출 0회 — `shape_*`/`rule_*` 는 입력→출력이 결정적이라 표로 검증 가능. `persist_mandala`
만 fake session 을 쓴다(DB 쓰기가 핵심이라 순수 함수가 아니다).
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.orchestrator import mandala_adapter
from reaction_backend.orchestrator.interview_catalog import ULTIMATE_DOMAIN_OPTIONS
from reaction_backend.schemas.common import now_kst
from reaction_backend.schemas.mandala import (
    MandalaCell,
    MandalaCellItem,
    MandalaSubgoal,
    MandalaSubgoalItem,
)
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome

GOAL_ID = UUID("66666666-6666-4666-8666-666666666666")


def _outcome(**overrides: Any) -> UltimateGoalOutcome:
    base: dict[str, Any] = {
        "session_id": "iv_x",
        "generated_at": now_kst(),
        "end_reason": "completed",
        "ambiguity_final": 0.1,
        "analysis_source": "llm",
        "statement": "메이저리그 8구단 드래프트 1순위",
        "domain": "체력·컨디션",
        "horizon_years": 5,
        "measure": "드래프트 1라운드 지명",
        "success_image": "구단 유니폼을 입고 첫 공을 던지는 순간",
        "identity_note": "프로 지망생",
        "current_position": "고교 3학년",
        "constraints": ["부상 이력"],
        "values": [],
        "assets": None,
        "pillars_hint": [],
        "unresolved_slots": [],
    }
    base.update(overrides)
    return UltimateGoalOutcome(**base)


# ───────────────────── shape_subgoals (층②) ─────────────────────


def test_shape_subgoals_pads_with_domain_catalog_when_llm_underdelivers() -> None:
    """LLM 이 3개만 냈으면 나머지 5개는 도메인 축 카탈로그로 패딩되고 source='rule'."""
    raw = [MandalaSubgoalItem(title=t) for t in ("체력", "기술", "멘탈")]
    result = mandala_adapter.shape_subgoals(raw, pillars_hint=[], fell_back=False)

    assert len(result) == 8
    assert [sg.order_index for sg in result] == list(range(8))
    llm_titles = {sg.title for sg in result[:3]}
    assert llm_titles == {"체력", "기술", "멘탈"}
    assert all(sg.source == "llm" for sg in result[:3])
    padded = result[3:]
    assert all(sg.source == "rule" for sg in padded)
    assert all(sg.title in ULTIMATE_DOMAIN_OPTIONS for sg in padded)


def test_shape_subgoals_truncates_when_llm_overdelivers() -> None:
    """LLM 이 12개(스키마 상한)를 내도 앞 8개만 남는다."""
    raw = [MandalaSubgoalItem(title=f"축{i}") for i in range(12)]
    result = mandala_adapter.shape_subgoals(raw, pillars_hint=[], fell_back=False)
    assert len(result) == 8
    assert [sg.title for sg in result] == [f"축{i}" for i in range(8)]


def test_shape_subgoals_pillars_hint_always_locked_and_present() -> None:
    """사용자가 인터뷰에서 직접 말한 축은 LLM 출력에 없어도 강제로 포함되고 locked=True."""
    raw = [MandalaSubgoalItem(title="LLM축1"), MandalaSubgoalItem(title="LLM축2")]
    result = mandala_adapter.shape_subgoals(raw, pillars_hint=["구위", "멘탈"], fell_back=False)

    by_title = {sg.title: sg for sg in result}
    assert by_title["구위"].locked is True
    assert by_title["구위"].source == "user"
    assert by_title["멘탈"].locked is True
    # pillars_hint 가 먼저 배치되므로 order_index 0, 1.
    assert by_title["구위"].order_index == 0
    assert by_title["멘탈"].order_index == 1
    assert len(result) == 8


def test_shape_subgoals_dedupes_titles() -> None:
    """LLM 이 pillars_hint 와 같은 제목을 또 내도 중복 슬롯을 만들지 않는다."""
    raw = [MandalaSubgoalItem(title="구위"), MandalaSubgoalItem(title="새 축")]
    result = mandala_adapter.shape_subgoals(raw, pillars_hint=["구위"], fell_back=False)
    titles = [sg.title for sg in result]
    assert titles.count("구위") == 1


def test_shape_subgoals_marks_rule_source_on_fallback() -> None:
    """LLM 호출 자체가 폴백(fell_back=True)이면 원본 항목도 source='rule'."""
    raw = [MandalaSubgoalItem(title="체력")]
    result = mandala_adapter.shape_subgoals(raw, pillars_hint=[], fell_back=True)
    assert result[0].source == "rule"


# ───────────────────── shape_cells / shape_branch_cells (층②) ─────────────────────


def _subgoals() -> list[MandalaSubgoal]:
    return [
        MandalaSubgoal(order_index=i, title=f"축{i}", source="llm", locked=False) for i in range(8)
    ]


def test_shape_cells_groups_by_axis_and_fills_gaps_when_short() -> None:
    """축0 은 2개만, 축1 은 0개 — 부족분은 억지로 채우지 않고 gaps 로 남는다."""
    raw = [
        MandalaCellItem(subgoal_index=0, title="셀A"),
        MandalaCellItem(subgoal_index=0, title="셀B"),
    ]
    cells, gaps = mandala_adapter.shape_cells(raw, subgoals=_subgoals(), fell_back=False)

    axis0 = [c for c in cells if c.subgoal_index == 0]
    assert [c.title for c in axis0] == ["셀A", "셀B"]
    assert len(cells) == 2  # 다른 축엔 원본이 없으므로 전부 gap
    assert len(gaps) == 8 * 8 - 2
    # 축0 의 남은 6칸도 gap 이어야 한다.
    axis0_gaps = [g for g in gaps if g.subgoal_index == 0]
    assert len(axis0_gaps) == 6


def test_shape_cells_ignores_items_pointing_at_unknown_axis() -> None:
    """넘겨받은 `subgoals` 에 없는 subgoal_index 를 가리키는 항목은 조용히 버려진다.

    LLM 스키마 자체는 0~7 만 허용하지만(`MandalaCellItem.subgoal_index`), 이번 호출의
    `subgoals` 가 그보다 적을 수 있다 — 예: 방어적 재시도 경로에서 축이 일부만 확정된 경우.
    """
    raw = [MandalaCellItem(subgoal_index=7, title="유령 셀")]
    cells, _ = mandala_adapter.shape_cells(raw, subgoals=_subgoals()[:5], fell_back=False)
    assert cells == []


def test_shape_cells_dedupes_within_axis_but_not_across_axes() -> None:
    raw = [
        MandalaCellItem(subgoal_index=0, title="러닝"),
        MandalaCellItem(subgoal_index=0, title="러닝"),  # 같은 축 중복 — 하나만 남는다
        MandalaCellItem(subgoal_index=1, title="러닝"),  # 다른 축은 같은 제목이어도 무방
    ]
    cells, _ = mandala_adapter.shape_cells(raw, subgoals=_subgoals(), fell_back=False)
    axis0 = [c for c in cells if c.subgoal_index == 0]
    axis1 = [c for c in cells if c.subgoal_index == 1]
    assert len(axis0) == 1
    assert len(axis1) == 1


def test_shape_branch_cells_preserves_locked_cells_and_fills_rest() -> None:
    """`locked_cells`(source='user')는 절대 안 바뀌고, 새 후보가 나머지를 채운다."""
    locked = [MandalaCell(subgoal_index=2, order_index=0, title="사용자 편집", source="user")]
    raw = [MandalaCellItem(subgoal_index=2, title=f"새 후보{i}") for i in range(10)]

    cells, gaps = mandala_adapter.shape_branch_cells(
        raw, subgoal_index=2, locked_cells=locked, fell_back=False
    )

    assert cells[0].title == "사용자 편집"
    assert cells[0].source == "user"
    assert len(cells) == 8  # locked 1 + 새 후보 7
    assert gaps == []
    assert all(c.subgoal_index == 2 for c in cells)


def test_shape_branch_cells_ignores_locked_cells_from_other_axis() -> None:
    """`locked_cells` 에 다른 축 셀이 섞여 들어와도(방어적 호출) 이 축엔 영향 없다."""
    locked = [MandalaCell(subgoal_index=5, order_index=0, title="다른 축 편집", source="user")]
    raw = [MandalaCellItem(subgoal_index=2, title="새 후보")]

    cells, _ = mandala_adapter.shape_branch_cells(
        raw, subgoal_index=2, locked_cells=locked, fell_back=False
    )
    titles = [c.title for c in cells]
    assert "다른 축 편집" not in titles
    assert "새 후보" in titles


# ───────────────────── 완전 폴백 (층③) ─────────────────────


def test_rule_subgoals_always_yields_eight() -> None:
    plan = mandala_adapter.rule_subgoals(_outcome(pillars_hint=["구위"]))
    assert len(plan.subgoals) == 8
    assert plan.subgoals[0].title == "구위"


def test_rule_subgoals_pure_catalog_when_no_pillars_hint() -> None:
    plan = mandala_adapter.rule_subgoals(_outcome(pillars_hint=[]))
    titles = {s.title for s in plan.subgoals}
    assert titles == set(ULTIMATE_DOMAIN_OPTIONS)


def test_rule_cells_generates_eight_per_axis_with_stepped_titles() -> None:
    plan = mandala_adapter.rule_cells(_subgoals())
    assert len(plan.cells) == 64
    axis0 = [c.title for c in plan.cells if c.subgoal_index == 0]
    assert axis0 == [f"축0 {i}단계" for i in range(1, 9)]


def test_rule_branch_cells_skips_locked_titles() -> None:
    subgoal = MandalaSubgoal(order_index=3, title="축3", source="llm", locked=False)
    locked = [MandalaCell(subgoal_index=3, order_index=0, title="축3 1단계", source="user")]
    plan = mandala_adapter.rule_branch_cells(subgoal, locked)
    titles = [c.title for c in plan.cells]
    assert "축3 1단계" not in titles  # 잠긴 제목과 겹치는 룰 생성분은 스킵
    assert len(titles) == 7


# ───────────────────── context_from_ultimate ─────────────────────


def test_context_from_ultimate_formats_horizon_and_lists() -> None:
    ctx = mandala_adapter.context_from_ultimate(
        _outcome(horizon_years=None, constraints=["부상", "체중"], pillars_hint=["구위"])
    )
    assert ctx["horizon"] == "기한 없음"
    assert ctx["constraints"] == "부상, 체중"
    assert "구위" in ctx["pillars_hint"]
    assert ctx["locked_axes"] == ctx["pillars_hint"]


def test_context_from_ultimate_defaults_missing_fields() -> None:
    ctx = mandala_adapter.context_from_ultimate(_outcome(measure="", success_image=""))
    assert ctx["measure"] == "(미입력)"
    assert ctx["success_image"] == "(미입력)"


# ───────────────────── persist_mandala ─────────────────────


class _NodeResult:
    def __init__(self, rows: list[Any]) -> None:
        self._rows = rows

    def scalars(self) -> _NodeResult:
        return self

    def all(self) -> list[Any]:
        return list(self._rows)


class _NodeSession:
    """`select(GoalNode)` 만 라우팅하는 fake session — `persist_mandala`/`_archive_previous_mandala`."""

    def __init__(self, *, nodes: list[GoalNode] | None = None) -> None:
        self._nodes = list(nodes or [])
        self.added: list[Any] = []

    async def execute(self, stmt: Any) -> _NodeResult:  # noqa: ARG002
        return _NodeResult(self._nodes)

    def add(self, obj: Any) -> None:
        self.added.append(obj)

    async def flush(self) -> None:
        return None


def _goal(*, goal_id: UUID = GOAL_ID, title: str = "궁극목표") -> Goal:
    g = Goal()
    g.id = goal_id
    g.title = title
    return g


async def test_persist_mandala_writes_root_subgoals_and_cells() -> None:
    subgoals = _subgoals()
    cells = [MandalaCell(subgoal_index=0, order_index=0, title="러닝", source="llm")]
    session = _NodeSession()

    root, activated = await mandala_adapter.persist_mandala(
        session,  # type: ignore[arg-type]
        goal=_goal(),
        center_why_text="왜냐면",
        subgoals=subgoals,
        cells=cells,
    )

    assert root.tree_kind == "mandala"
    assert root.node_type == "core"
    assert root.depth == 0
    assert root.parent_node_id is None
    assert root.why_text == "왜냐면"
    assert activated == 1 + 8 + 1  # root + 8축 + 셀 1개

    subgoal_nodes = [n for n in session.added if n.node_type == "subgoal"]
    leaf_nodes = [n for n in session.added if n.node_type == "leaf"]
    assert len(subgoal_nodes) == 8
    assert len(leaf_nodes) == 1
    assert all(n.parent_node_id == root.id for n in subgoal_nodes)
    assert leaf_nodes[0].parent_node_id in {n.id for n in subgoal_nodes}
    assert leaf_nodes[0].tree_kind == "mandala"


async def test_persist_mandala_archives_previous_active_tree() -> None:
    """이 goal 아래 기존 활성 만다라 트리는 새로 승인할 때 보관된다(재승인 누적 방지)."""
    old_root = GoalNode()
    old_root.id = uuid4()
    old_root.goal_id = GOAL_ID
    old_root.tree_kind = "mandala"
    old_root.archived_at = None
    session = _NodeSession(nodes=[old_root])

    await mandala_adapter.persist_mandala(
        session,  # type: ignore[arg-type]
        goal=_goal(),
        center_why_text=None,
        subgoals=_subgoals(),
        cells=[],
    )

    assert old_root.archived_at is not None
