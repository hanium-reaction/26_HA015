"""GoalNode — 목표 만다라트 분해 트리.

self-FK 로 parent → children 관계. depth 0 = root (Goal 자체와 매칭).
Goal Structuring Orchestrator → Planning Agent (LLM Call ②) 가 생성.

`tree_kind` 로 **계획 분해 트리**(`'plan'`, 기존 전량)와 **궁극목표 만다라트**(`'mandala'`,
PR5+)를 한 테이블 안에서 분리한다(마이그레이션 `1ee508b967ba`). 이 컬럼이 오염 차단의
축이다 — 읽기(`goal_repo.list_nodes`)·보관(`_archive_goal_nodes`)·카드 교체
(`_replaceable_action`)·목표 재사용(`materialize_goals`) 넷 다 `tree_kind` 를 걸러야
계획 승인이 만다라 트리를 삼키거나 그 반대가 일어나지 않는다.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from reaction_backend.db.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from reaction_backend.db.models.goal import Goal


GOAL_NODE_TYPE_VALUES = ("core", "subgoal", "milestone", "leaf")

# goal_nodes.tree_kind — PG enum 대신 String+CHECK(마이그레이션 docstring 근거).
GOAL_NODE_TREE_KIND_VALUES = ("plan", "mandala")

# goal_nodes.source — AI 가 채운 칸 / 룰 패딩 칸 / 사용자가 직접 쓴 칸.
GOAL_NODE_SOURCE_VALUES = ("llm", "rule", "user")


class GoalNode(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "goal_nodes"

    __table_args__ = (
        CheckConstraint("tree_kind IN ('plan', 'mandala')", name="ck_goal_nodes_tree_kind"),
        CheckConstraint("source IN ('llm', 'rule', 'user')", name="ck_goal_nodes_source"),
        CheckConstraint(
            "tree_kind <> 'mandala' OR (depth BETWEEN 0 AND 2 AND order_index BETWEEN 0 AND 7)",
            name="ck_goal_nodes_mandala_shape",
        ),
        CheckConstraint(
            "tree_kind <> 'mandala' OR "
            "(depth = 0 AND node_type = 'core'    AND is_leaf = false) OR "
            "(depth = 1 AND node_type = 'subgoal' AND is_leaf = false) OR "
            "(depth = 2 AND node_type = 'leaf'    AND is_leaf = true)",
            name="ck_goal_nodes_mandala_type",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    goal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # self-FK. NULL = root node (depth 0).
    parent_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goal_nodes.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)

    # 노드 유형 — DB 설계서 v0.7.1 §5.6
    node_type: Mapped[str] = mapped_column(
        Enum(*GOAL_NODE_TYPE_VALUES, name="goal_node_type"),
        nullable=False,
        server_default="subgoal",
    )

    # depth 0 = root, 1 = phase, 2 = milestone (대략). 만다라 트리는 0=core/1=subgoal/2=leaf.
    depth: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # 형제 노드 간 순서 (만다라트 1~8) — DB 설계서 v0.7.1 §5.6
    order_index: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))

    # 최하위(ActionItem과 연결 가능) 여부 — DB 설계서 v0.7.1 §5.6
    is_leaf: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    # 트리 종류 — 계획 분해('plan', 기존 전량) vs 궁극목표 만다라트('mandala', PR5+).
    tree_kind: Mapped[str] = mapped_column(String(16), nullable=False, server_default="plan")

    # 이 칸을 누가 채웠는가 — AI(llm) / 폴백 패딩(rule) / 사용자가 직접(user). FE 점선 렌더.
    source: Mapped[str] = mapped_column(String(8), nullable=False, server_default="user")

    # 만다라 셀 메타 — "왜 이 8개인가"(Goal.why_now 의 노드판). 계획 트리는 안 쓴다.
    why_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    # 카드가 없는 셀도 직접 완료 체크 — 진척도 롤업이 COUNT(completed_at) 으로 끝난다.
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 사용자가 인터뷰에서 직접 말한 축 — 재생성(regenerate-branch)이 못 건드린다.
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("false"))

    # 하위목표 → 학기 Goal 승격 링크. 승격된 Goal 이 삭제돼도 이 노드는 남는다(SET NULL).
    promoted_goal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("goals.id", ondelete="SET NULL"),
        nullable=True,
    )

    # ── relationships ──
    goal: Mapped[Goal] = relationship(back_populates="nodes", foreign_keys=[goal_id])
    parent: Mapped[GoalNode | None] = relationship(
        remote_side="GoalNode.id",
        back_populates="children",
    )
    children: Mapped[list[GoalNode]] = relationship(
        back_populates="parent",
        cascade="all, delete-orphan",
    )
