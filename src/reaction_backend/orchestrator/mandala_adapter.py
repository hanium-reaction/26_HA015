"""만다라트 결정적 후보정 + 영속화 (§5.6, §3.4) — LLM 산출을 항상 고정 형태로 맞춘다.

**층 ②** — 스키마를 느슨하게 둔 LLM 원본(층①, `MandalaSubgoalPlan`/`MandalaCellPlan`)을
받아 8축/축당 ≤8칸으로 패딩·중복제거·잘라내기 한다. 8축 전부를 폴백 처리하는 대신
`min_length=1` 정도의 느슨한 스키마 + 여기서의 결정적 보정을 쓰는 이유는
`first_plan_adapter.py:341-342` 의 교훈과 같다 — "일부만 자리표시자인 것보다
스키마 위반으로 전부 자리표시자가 되는 게 훨씬 나쁘다".

**층 ③** — `rule_subgoals`/`rule_cells` 는 LLM 호출 자체가 완전히 실패했을 때(`aiClient.run`
의 `fallback=`)만 쓰이는 완전 결정적 생성기다.

`persist_mandala` 는 승인(U6) 시 `goal_nodes` 에 `tree_kind='mandala'` 로 73행(≤)을 쓴다 —
PR3 의 오염 차단 축(R1/W1/W2/W3, `1ee508b967ba`)이 이미 이 값을 전제로 계획 트리와
분리해 둔 자리다.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models.goal import Goal
from reaction_backend.db.models.goal_node import GoalNode
from reaction_backend.orchestrator.interview_catalog import ULTIMATE_DOMAIN_OPTIONS
from reaction_backend.schemas.common import now_kst
from reaction_backend.schemas.mandala import (
    MandalaCell,
    MandalaCellItem,
    MandalaCellPlan,
    MandalaGap,
    MandalaSource,
    MandalaSubgoal,
    MandalaSubgoalItem,
    MandalaSubgoalPlan,
)
from reaction_backend.schemas.ultimate_goal import UltimateGoalOutcome

_SUBGOAL_TITLE_MAX = 10  # §7.7 — depth1 ≤10자
_CELL_TITLE_MAX = 16  # §7.7 — depth2 ≤16자
_RING_SIZE = 8


def format_titles(titles: Sequence[str]) -> str:
    """프롬프트에 넣을 제목 목록 — 없으면 '(없음)'."""
    return "\n".join(f"- {t}" for t in titles) if titles else "(없음)"


def format_subgoals_list(subgoals: Sequence[MandalaSubgoal]) -> str:
    """Stage B(`planning/mandala_cells`) 의 `{{subgoals}}` — 확정된 8축을 인덱스와 함께."""
    return "\n".join(f"{sg.order_index}: {sg.title}" for sg in subgoals)


def context_from_ultimate(outcome: UltimateGoalOutcome) -> dict[str, str]:
    """`UltimateGoalOutcome` → Stage A/B 공용 프롬프트 변수(P4/P5, §8.2).

    `locked_axes` 는 `pillars_hint` 와 같은 원천 데이터를 담는다 — 사용자가 인터뷰에서
    직접 말한 축이 곧 "제목·순서 유지, 개명 금지" 대상이라 별도로 관리할 값이 없다.
    """
    horizon = f"{outcome.horizon_years}년" if outcome.horizon_years else "기한 없음"
    pillars = format_titles(outcome.pillars_hint)
    return {
        "statement": outcome.statement,
        "domain": outcome.domain or "(미입력)",
        "horizon": horizon,
        "measure": outcome.measure or "(미입력)",
        "success_image": outcome.success_image or "(미입력)",
        "current_position": outcome.current_position or "(미입력)",
        "constraints": ", ".join(outcome.constraints) if outcome.constraints else "(없음)",
        "pillars_hint": pillars,
        "locked_axes": pillars,
    }


# ─────────────────────────────────────────────────────────────────────────────
# 층② — 결정적 후보정 (LLM 원본 또는 층③ 폴백 원본을 공통으로 통과)
# ─────────────────────────────────────────────────────────────────────────────


def shape_subgoals(
    raw: Sequence[MandalaSubgoalItem], *, pillars_hint: Sequence[str], fell_back: bool
) -> list[MandalaSubgoal]:
    """LLM(또는 룰) 원본 → 항상 정확히 8개(`order_index` 0~7).

    우선순위: ① `pillars_hint`(사용자가 직접 말한 축, `locked=True` · `source="user"`) →
    ② LLM/룰 원본(중복 제거) → ③ 그래도 모자라면 `ULTIMATE_DOMAIN_OPTIONS` 카탈로그 패딩.
    `pillars_hint` 는 몇 개를 말했든 절대 빠지지 않는다 — 이게 곧 "재생성이 못 건드리는 축"
    보장의 원천이다.
    """
    seen: set[str] = set()
    result: list[MandalaSubgoal] = []

    def _add(title: str, why_text: str | None, source: MandalaSource, locked: bool) -> bool:
        key = title.strip()[:_SUBGOAL_TITLE_MAX]
        if not key or key in seen:
            return False
        seen.add(key)
        result.append(
            MandalaSubgoal(
                order_index=len(result), title=key, why_text=why_text, source=source, locked=locked
            )
        )
        return len(result) >= _RING_SIZE

    for hint in pillars_hint:
        if _add(hint, None, "user", True):
            break
    if len(result) < _RING_SIZE:
        llm_source: MandalaSource = "rule" if fell_back else "llm"
        for item in raw:
            if _add(item.title, item.why_text, llm_source, False):
                break
    if len(result) < _RING_SIZE:
        for axis in ULTIMATE_DOMAIN_OPTIONS:
            if _add(axis, None, "rule", False):
                break
    return result


def _shape_one_axis_cells(
    raw_titles: Sequence[str],
    *,
    subgoal_index: int,
    locked_titles: Sequence[str],
    fell_back: bool,
) -> tuple[list[MandalaCell], list[MandalaGap]]:
    seen: set[str] = set()
    cells: list[MandalaCell] = []

    def _add(title: str, source: MandalaSource) -> bool:
        key = title.strip()[:_CELL_TITLE_MAX]
        if not key or key in seen:
            return False
        seen.add(key)
        cells.append(
            MandalaCell(
                subgoal_index=subgoal_index, order_index=len(cells), title=key, source=source
            )
        )
        return len(cells) >= _RING_SIZE

    for t in locked_titles:
        if _add(t, "user"):
            break
    if len(cells) < _RING_SIZE:
        cell_source: MandalaSource = "rule" if fell_back else "llm"
        for t in raw_titles:
            if _add(t, cell_source):
                break
    # 못 채운 칸은 억지로 채우지 않는다(§5.6) — gaps 로 남겨 FE 가 점선 렌더.
    gaps = [
        MandalaGap(
            subgoal_index=subgoal_index, order_index=i, reason="AI가 이 칸을 채우지 못했어요"
        )
        for i in range(len(cells), _RING_SIZE)
    ]
    return cells, gaps


def shape_cells(
    raw: Sequence[MandalaCellItem], *, subgoals: Sequence[MandalaSubgoal], fell_back: bool
) -> tuple[list[MandalaCell], list[MandalaGap]]:
    """LLM(또는 룰) 원본 → 축별로 묶어 각 축 ≤8칸 + 못 채운 칸은 `gaps`."""
    by_axis: dict[int, list[str]] = {sg.order_index: [] for sg in subgoals}
    for item in raw:
        if item.subgoal_index in by_axis:
            by_axis[item.subgoal_index].append(item.title)

    all_cells: list[MandalaCell] = []
    all_gaps: list[MandalaGap] = []
    for sg in subgoals:
        cells, gaps = _shape_one_axis_cells(
            by_axis.get(sg.order_index, []),
            subgoal_index=sg.order_index,
            locked_titles=(),  # Stage B 최초 생성 시점엔 사용자가 편집한 셀이 아직 없다.
            fell_back=fell_back,
        )
        all_cells.extend(cells)
        all_gaps.extend(gaps)
    return all_cells, all_gaps


def shape_branch_cells(
    raw: Sequence[MandalaCellItem],
    *,
    subgoal_index: int,
    locked_cells: Sequence[MandalaCell],
    fell_back: bool,
) -> tuple[list[MandalaCell], list[MandalaGap]]:
    """링(8칸) 1개 재생성(U5) 후보정 — `locked_cells`(source="user") 는 절대 안 바뀐다."""
    raw_titles = [item.title for item in raw if item.subgoal_index == subgoal_index]
    locked_titles = [c.title for c in locked_cells if c.subgoal_index == subgoal_index]
    return _shape_one_axis_cells(
        raw_titles, subgoal_index=subgoal_index, locked_titles=locked_titles, fell_back=fell_back
    )


# ─────────────────────────────────────────────────────────────────────────────
# 층③ — 완전 폴백 (LLM 호출 자체가 실패했을 때만, `aiClient.run(fallback=...)`)
# ─────────────────────────────────────────────────────────────────────────────


def rule_subgoals(outcome: UltimateGoalOutcome) -> MandalaSubgoalPlan:
    """Stage A 완전 폴백 — `pillars_hint` + 도메인 축 카탈로그로 8개를 만든다."""
    items = [MandalaSubgoalItem(title=t[:_SUBGOAL_TITLE_MAX]) for t in outcome.pillars_hint]
    seen = {i.title for i in items}
    for axis in ULTIMATE_DOMAIN_OPTIONS:
        if len(items) >= _RING_SIZE:
            break
        if axis not in seen:
            items.append(MandalaSubgoalItem(title=axis))
            seen.add(axis)
    return MandalaSubgoalPlan(subgoals=items[:_RING_SIZE])


def rule_cells(subgoals: Sequence[MandalaSubgoal]) -> MandalaCellPlan:
    """Stage B 완전 폴백 — 축별 "{축} N단계"(`first_plan.py` 의 "N회차" 패턴 차용)."""
    items = [
        MandalaCellItem(
            subgoal_index=sg.order_index, title=f"{sg.title} {j + 1}단계"[:_CELL_TITLE_MAX]
        )
        for sg in subgoals
        for j in range(_RING_SIZE)
    ]
    return MandalaCellPlan(cells=items)


def rule_branch_cells(
    subgoal: MandalaSubgoal, locked_cells: Sequence[MandalaCell]
) -> MandalaCellPlan:
    """링 재생성(U5) 완전 폴백 — 잠긴 칸은 그대로, 나머지는 "{축} N단계" 로 채운다."""
    locked_titles = {c.title for c in locked_cells if c.subgoal_index == subgoal.order_index}
    items = [
        MandalaCellItem(
            subgoal_index=subgoal.order_index,
            title=f"{subgoal.title} {j + 1}단계"[:_CELL_TITLE_MAX],
        )
        for j in range(_RING_SIZE)
        if f"{subgoal.title} {j + 1}단계"[:_CELL_TITLE_MAX] not in locked_titles
    ]
    return MandalaCellPlan(cells=items)


# ─────────────────────────────────────────────────────────────────────────────
# 영속화 (U6 승인) — tree_kind='mandala' (PR3 오염 차단 축 전제)
# ─────────────────────────────────────────────────────────────────────────────


async def _archive_previous_mandala(session: AsyncSession, *, goal_id: uuid.UUID) -> None:
    """이 goal 의 기존 활성 만다라 트리를 보관 — `_archive_goal_nodes`(계획 트리)의 만다라판.

    부분 유니크 인덱스 `uq_goal_nodes_mandala_root`(goal_id, tree_kind='mandala' AND
    archived_at IS NULL)가 이전 트리를 보관하지 않으면 재승인 시 새 root INSERT 를 막는다
    (재생성→재승인을 반복해도 옛 73칸이 쌓이지 않게).
    """
    stmt = select(GoalNode).where(
        GoalNode.goal_id == goal_id,
        GoalNode.tree_kind == "mandala",
        GoalNode.archived_at.is_(None),
    )
    rows = (await session.execute(stmt)).scalars().all()
    now = now_kst()
    for n in rows:
        n.archived_at = now


async def persist_mandala(
    session: AsyncSession,
    *,
    goal: Goal,
    center_why_text: str | None,
    subgoals: Sequence[MandalaSubgoal],
    cells: Sequence[MandalaCell],
) -> tuple[GoalNode, int]:
    """편집본 → `goal_nodes` 73행(≤). 반환: (root 노드, 영속 행 수 = 1 + 8 + len(cells)).

    셀이 없는 칸은 만들지 않는다(억지 패딩 금지, §5.6) — `activated` 가 73보다 작을 수 있다.
    """
    await _archive_previous_mandala(session, goal_id=goal.id)

    # id 는 flush 로 받지 않고 여기서 미리 채운다(`first_plan_adapter.py` 의 GoalNode 생성과
    # 같은 이유) — 같은 트랜잭션 안에서 자식의 parent_node_id 로 곧바로 써야 하고, DB
    # server_default 왕복(flush) 없이도(테스트의 fake session 포함) 항상 값이 있어야 한다.
    root = GoalNode()
    root.id = uuid.uuid4()
    root.goal_id = goal.id
    root.parent_node_id = None
    root.title = goal.title
    root.node_type = "core"
    root.depth = 0
    root.order_index = 0
    root.is_leaf = False
    root.tree_kind = "mandala"
    root.source = "llm"
    root.why_text = center_why_text
    session.add(root)

    subgoal_nodes: dict[int, GoalNode] = {}
    for sg in subgoals:
        node = GoalNode()
        node.id = uuid.uuid4()
        node.goal_id = goal.id
        node.parent_node_id = root.id
        node.title = sg.title
        node.node_type = "subgoal"
        node.depth = 1
        node.order_index = sg.order_index
        node.is_leaf = False
        node.tree_kind = "mandala"
        node.source = sg.source
        node.why_text = sg.why_text
        node.locked = sg.locked
        session.add(node)
        subgoal_nodes[sg.order_index] = node

    persisted_cells = 0
    for cell in cells:
        parent = subgoal_nodes.get(cell.subgoal_index)
        if parent is None:  # 방어적 — subgoals 밖의 index 는 무시(있을 수 없지만 조용히 스킵)
            continue
        node = GoalNode()
        node.id = uuid.uuid4()
        node.goal_id = goal.id
        node.parent_node_id = parent.id
        node.title = cell.title
        node.node_type = "leaf"
        node.depth = 2
        node.order_index = cell.order_index
        node.is_leaf = True
        node.tree_kind = "mandala"
        node.source = cell.source
        session.add(node)
        persisted_cells += 1

    await session.flush()
    activated = 1 + len(subgoal_nodes) + persisted_cells
    return root, activated


__all__ = [
    "context_from_ultimate",
    "format_subgoals_list",
    "format_titles",
    "persist_mandala",
    "rule_branch_cells",
    "rule_cells",
    "rule_subgoals",
    "shape_branch_cells",
    "shape_cells",
    "shape_subgoals",
]
