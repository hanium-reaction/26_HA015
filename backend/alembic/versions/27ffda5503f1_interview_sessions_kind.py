"""interview_sessions.kind 추가 — 궁극목표 인터뷰(#PR2) 를 위한 기반 (PR1)

Revision ID: 27ffda5503f1
Revises: 09fa61fbf06f
Create Date: 2026-08-20 14:28:53.951129

인터뷰 세션에 "무엇에 대한 인터뷰인가"(kind)를 붙인다. 지금은 'plan' 뿐이라 관찰 가능한
동작 변화는 없다 — 다음 PR 이 'ultimate'(궁극목표) 를 추가할 때 `interview_repo`/락/필수
슬롯 판정이 이미 kind 인자를 받게 해 둬서, 그 PR 이 순수 추가만 하면 되게 하는 선행 작업.

⚠️ PG enum 을 쓰지 않는다 — enum 은 `ALTER TYPE ... ADD VALUE` 가 같은 트랜잭션에서 바로
사용 불가하고, DROP VALUE 자체가 없어 downgrade 가 타입 재생성 + USING 캐스팅이 된다
(`f5a6b7c8d9e0` 가 이 레포가 겪은 실제 사례). `String(16) + CHECK` 는 값 추가가 CHECK 교체
1줄이고 downgrade 가 `drop_column` 대칭이다. CHECK 에 'ultimate' 를 미리 포함해 다음 PR 이
이 마이그레이션을 다시 건드리지 않게 한다(아직 그 값을 쓰는 코드는 없다).

⚠️ DB 마이그레이션 — AGENTS §8 "먼저 팀 합의".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "27ffda5503f1"
down_revision: str | Sequence[str] | None = "09fa61fbf06f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema — interview_sessions.kind (NOT NULL, default 'plan')."""
    op.add_column(
        "interview_sessions",
        sa.Column("kind", sa.String(16), nullable=False, server_default="plan"),
    )
    op.create_check_constraint(
        "ck_interview_sessions_kind",
        "interview_sessions",
        "kind IN ('plan', 'ultimate')",
    )
    op.create_index(
        "ix_interview_sessions_user_kind_ended",
        "interview_sessions",
        ["user_id", "kind", "ended_at"],
    )


def downgrade() -> None:
    """Downgrade schema — kind 제거."""
    op.drop_index("ix_interview_sessions_user_kind_ended", table_name="interview_sessions")
    op.drop_constraint("ck_interview_sessions_kind", "interview_sessions", type_="check")
    op.drop_column("interview_sessions", "kind")
