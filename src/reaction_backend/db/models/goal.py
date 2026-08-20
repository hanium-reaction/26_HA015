"""Goal — 사용자 목표 (S26). Focus / Maintain / Parked 3 tier.

규칙 (잠금):
- Focus 최대 3개
- Maintain 최대 5개
- Parked 자유 (보류한 목표)
- soft delete only (archived_at)

목표 분해는 `goal_nodes` (만다라트 트리). Planning Agent 가 사용.
"""

from __future__ import annotations

import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, Enum, ForeignKey, Integer, String, Text, text  # noqa: F401
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from reaction_backend.db.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from reaction_backend.db.models.goal_node import GoalNode
    from reaction_backend.db.models.user import User


GOAL_TIER_VALUES = ("focus", "maintain", "parked")

# proposed: 딥 인터뷰가 추출했지만 **계획이 아직 승인되지 않은** 잠정 목표.
#   인터뷰만 마치고 계획을 승인하지 않은 목표가 진짜 목표와 구분 없이 쌓이던 문제(#96 후속).
#   분류 화면에는 계속 보이되(그게 #96 의 목적) 승인 시 active 로 승격되고, 승격되지 않은
#   것은 다음 인터뷰가 대체(supersede)한다.
GOAL_STATUS_VALUES = ("active", "archived", "completed", "proposed")

GOAL_CATEGORY_VALUES = (
    "study",
    "project",
    "health",
    "routine",
    "schedule",
    "career",
    "relationship",
    "self_dev",
    "other",
)


class Goal(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "goals"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)

    category: Mapped[str] = mapped_column(
        Enum(*GOAL_CATEGORY_VALUES, name="goal_category"),
        nullable=False,
        server_default="other",
    )

    goal_tier: Mapped[str] = mapped_column(
        Enum(*GOAL_TIER_VALUES, name="goal_tier"),
        nullable=False,
        server_default="maintain",
    )

    # Planning Agent 의 horizon 계산에 사용 (가장 먼 focus deadline)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)

    # 1 (가장 높음) ~ 5 (가장 낮음) — DB 설계서 v0.7.1 §5.5
    priority_level: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("3"))

    # 총 예상 소요 분 — DB 설계서 v0.7.1 §5.5
    estimated_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 이번 주 분류 라벨 (예: '2026-W21-focus') — Planning Agent 핵심, DB 설계서 v0.7.1 §5.5
    week_tier_key: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # Goal 라이프사이클 — DB 설계서 v0.7.1 §5.5
    status: Mapped[str] = mapped_column(
        Enum(*GOAL_STATUS_VALUES, name="goal_status"),
        nullable=False,
        server_default="active",
    )

    # ── 우리 개선 (ADR §4 보존) ──
    # "왜 지금" 이유 — Morning Brief 카드의 reasonWhyNow 에 사용
    why_now: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 첫 동작 한 줄 — S11 Action Detail 의 first_step prefill
    first_step: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 이 행이 "그" 궁극목표인지 — status='active'+tier='parked' 만으로는 일반 목표와 구분이
    # 안 된다(POST /goals 가 goal_tier 를 그대로 받는다). 사용자당 최대 1개(마이그레이션의
    # 부분 유니크 인덱스가 보장) — POST /goals/ultimate 가 이 컬럼으로 기존 행을 찾아 갱신한다.
    is_ultimate: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    # ── relationships ──
    user: Mapped[User] = relationship()
    # goal_nodes.promoted_goal_id 가 goals.id 를 가리키는 **두 번째** FK 라(하위목표 →
    # 학기 Goal 승격 링크), foreign_keys 로 트리 소속 FK(goal_id) 쪽임을 명시해야 한다 —
    # 안 그러면 SQLAlchemy 가 둘 중 뭘 쓸지 몰라 AmbiguousForeignKeysError 를 던진다.
    nodes: Mapped[list[GoalNode]] = relationship(
        back_populates="goal",
        cascade="all, delete-orphan",
        foreign_keys="GoalNode.goal_id",
    )
