"""만다라트(Mandala) 도메인 스키마 (§3.7, §6.2, §8.2) — 궁극목표 8축×8칸 생성/승인.

세 층으로 나뉜다:
1. **LLM Structured Output** (`MandalaSubgoalPlan`/`MandalaCellPlan`) — `aiClient.run(schema=...)`
   강제 검증. 개수를 느슨하게 둔다(§5.6 층① — 스키마를 min/max=8 로 조이면 LLM 이 7개를
   냈을 때 재시도 3회 끝에 8개 **전부**가 자리표시자가 된다).
2. **후보정 후 고정 형태** (`MandalaSubgoal`/`MandalaCell`/`MandalaGap`) — `mandala_adapter` 가
   패딩·중복제거·잘라내기(§5.6 층②)를 거쳐 항상 8개(축)/축당 ≤8개(셀)로 맞춘 결과.
3. **경계 요청/응답** — Draft Layer(HITL). AI 산출 응답은 `DraftMixin` 상속 →
   사용자 [수락] 전까지 `is_draft=True`(AGENTS §1.4, ADR-0005 §7.2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from reaction_backend.schemas.common import CamelModel, DraftMixin, KstDatetime

MandalaSource = Literal["llm", "rule", "user"]

# ─────────────────────────────────────────────────────────────────────────────
# LLM Structured Output — 느슨한 개수 제약(§5.6 층①)
# ─────────────────────────────────────────────────────────────────────────────


class MandalaSubgoalItem(CamelModel):
    """Stage A(`planning/mandala_subgoals`) LLM 출력 원소 — 후보정 전."""

    title: str = Field(min_length=1, max_length=10)
    why_text: str | None = None


class MandalaSubgoalPlan(CamelModel):
    """Stage A LLM Structured Output — 8개를 목표로 하되 1~12개까지 허용."""

    subgoals: list[MandalaSubgoalItem] = Field(min_length=1, max_length=12)


class MandalaCellItem(CamelModel):
    """Stage B(`planning/mandala_cells`·`planning/mandala_cells_branch`) LLM 출력 원소."""

    subgoal_index: int = Field(ge=0, le=7)
    title: str = Field(min_length=1, max_length=16)


class MandalaCellPlan(CamelModel):
    """Stage B LLM Structured Output — 못 채운 칸은 그냥 적게 낸다(억지로 채우지 않음)."""

    cells: list[MandalaCellItem] = Field(default_factory=list, max_length=64)


# ─────────────────────────────────────────────────────────────────────────────
# 후보정 후 — 항상 고정 형태 (mandala_adapter.shape_* 의 출력)
# ─────────────────────────────────────────────────────────────────────────────


class MandalaSubgoal(CamelModel):
    """확정된 하위목표(축) 1개 — 항상 정확히 8개(order_index 0~7)."""

    order_index: int = Field(ge=0, le=7)
    title: str = Field(min_length=1, max_length=10)  # §7.7 — depth1 ≤10자, 서버가 상한 강제
    why_text: str | None = None
    source: MandalaSource = "llm"
    locked: bool = False  # 사용자가 인터뷰(pillars_hint)에서 직접 말한 축 — 재생성이 못 건드림


class MandalaCell(CamelModel):
    """확정된 실행 셀 1개 — 한 축(subgoal_index)당 최대 8개(order_index 0~7)."""

    subgoal_index: int = Field(ge=0, le=7)
    order_index: int = Field(ge=0, le=7)
    title: str = Field(min_length=1, max_length=16)  # §7.7 — depth2 ≤16자
    source: MandalaSource = "llm"


class MandalaGap(CamelModel):
    """못 채운 칸 — 억지 패딩 대신 사유만 남긴다(`goal_decompose.v1.md` 의 패턴과 동일)."""

    subgoal_index: int = Field(ge=0, le=7)
    order_index: int = Field(ge=0, le=7)
    reason: str


class MandalaCenterPreview(CamelModel):
    """중앙 칸(궁극목표 본문) 미리보기."""

    title: str
    why_text: str | None = None


# ─────────────────────────────────────────────────────────────────────────────
# 요청
# ─────────────────────────────────────────────────────────────────────────────


class MandalaSubgoalsRequest(CamelModel):
    """POST /plans/mandala/subgoals(U2) 요청 — Stage A. lock 없음, DB 쓰기 0."""

    goal_id: str


class MandalaGenerateRequest(CamelModel):
    """POST /plans/mandala/generate(U3) 요청 — Stage A 에서 사용자가 확인·편집한 8축 그대로.

    구조(축 개수·순서) 편집은 여기까지다 — Stage B 이후 축은 규모가 고정된다.
    """

    goal_id: str
    subgoals: list[MandalaSubgoal] = Field(min_length=8, max_length=8)


class MandalaRegenerateBranchRequest(CamelModel):
    """POST /plans/mandala/{planId}/regenerate-branch(U5) 요청 — 링(8칸) 1개만 재생성.

    `edited_subgoals`/`edited_cells` 는 재생성 대상이 아닌 나머지 칸의 **현재 편집 상태**를
    함께 실어 보낸다 — 서버는 검증 없이 그대로 되돌려줄 뿐이다(HITL, 승인 전 편집은 로컬
    상태가 권위). 비우면 저장된 draft 스냅샷을 그대로 쓴다.
    """

    subgoal_index: int = Field(ge=0, le=7)
    user_hint: str | None = None
    edited_subgoals: list[MandalaSubgoal] = Field(default_factory=list)
    edited_cells: list[MandalaCell] = Field(default_factory=list)


class MandalaApproveRequest(CamelModel):
    """POST /plans/mandala/{planId}/approve(U6) 요청 — 승인 전 편집본을 통째로 실어 보낸다.

    셀 편집(HITL 최하위 층)은 승인 전까지 서버 호출이 없다(§7.6) — 최종 제출에 실려서야
    처음 서버에 닿는다.
    """

    center_why_text: str | None = None
    subgoals: list[MandalaSubgoal] = Field(min_length=8, max_length=8)
    cells: list[MandalaCell] = Field(default_factory=list)


# ─────────────────────────────────────────────────────────────────────────────
# 응답 — Draft Layer(DraftMixin: is_draft/ai_source 강제)
# ─────────────────────────────────────────────────────────────────────────────


class MandalaSubgoalsResponse(DraftMixin):
    """U2 응답 — Stage A. lock 없음, DB 쓰기 0."""

    goal_id: str
    center: MandalaCenterPreview
    subgoals: list[MandalaSubgoal]  # 항상 8


class MandalaDraftResponse(DraftMixin):
    """U3/U4/U5 응답 — Stage B 결과(초안) 스냅샷. `plan_drafts.payload`(kind="mandala") 대응."""

    plan_id: str
    goal_id: str
    center: MandalaCenterPreview
    subgoals: list[MandalaSubgoal]  # 8
    cells: list[MandalaCell]  # ≤64
    gaps: list[MandalaGap]
    generated_at: KstDatetime


class MandalaApproveResponse(CamelModel):
    """U6 응답 — 명시 승인 endpoint 이므로 `is_draft=False`(ADR-0005 §7.2)."""

    plan_id: str
    is_draft: Literal[False] = False
    goal_id: str
    root_node_id: str
    activated: int  # 영속된 goal_nodes 수 (1 + 8 + 채워진 leaf 수)
    skipped: int  # gaps 로 남아 저장하지 않은 칸 수
    activated_at: KstDatetime


__all__ = [
    "MandalaApproveRequest",
    "MandalaApproveResponse",
    "MandalaCell",
    "MandalaCellItem",
    "MandalaCellPlan",
    "MandalaCenterPreview",
    "MandalaDraftResponse",
    "MandalaGap",
    "MandalaGenerateRequest",
    "MandalaRegenerateBranchRequest",
    "MandalaSubgoal",
    "MandalaSubgoalItem",
    "MandalaSubgoalPlan",
    "MandalaSubgoalsRequest",
    "MandalaSubgoalsResponse",
]
