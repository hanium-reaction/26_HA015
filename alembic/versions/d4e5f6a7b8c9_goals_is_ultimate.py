"""goals.is_ultimate — 사용자당 1개뿐인 궁극목표 행을 식별 (PR5 선행)

Revision ID: d4e5f6a7b8c9
Revises: 1ee508b967ba
Create Date: 2026-08-20 15:10:00.000000

궁극목표는 신규 테이블 없이 기존 `goals` 행 1개로 둔다(§3.2, `status='active'`,
`goal_tier='parked'`). 그런데 `POST /goals`(`routes/goals.py:135`)가 `goal_tier` 를
사용자 입력 그대로 받아 일반 목표도 `tier='parked'` 로 만들 수 있어서, `status='active'
AND goal_tier='parked'` 만으로는 "이 행이 궁극목표인가"를 안정적으로 구분할 수 없다.
`POST /goals/ultimate` 가 재호출 시 **같은 행을 갱신**(사용자당 1개, 신규 409 없음)하려면
그 1개를 O(1)로 찾을 판별자가 필요하다 — 이 컬럼이 그 판별자다.

⚠️ PG enum 을 쓰지 않는다(Boolean 이라 애초에 enum 후보가 아니지만, 이 레포의 다른 신규
컬럼과 같은 이유로 String+CHECK 대신 native Boolean 을 쓴다 — 값이 2종 고정이라 CHECK 로
막을 값 공간이 없다).

부분 유니크 인덱스로 "사용자당 궁극목표 1개"를 DB 레벨에서도 보장한다(앱 레벨의 upsert
로직이 뚫리는 경우의 두 번째 방어선) — `archived_at IS NULL` 가드라 보관된 옛 궁극목표는
셈에서 빠지고, 사용자가 궁극목표를 삭제하고 다시 만드는 경로를 막지 않는다.

⚠️ DB 마이그레이션 — AGENTS §8 "먼저 팀 합의".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e5f6a7b8c9"
down_revision: str | Sequence[str] | None = "1ee508b967ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema — goals.is_ultimate (NOT NULL, default false) + 사용자당 1개 부분 유니크."""
    op.add_column(
        "goals",
        sa.Column("is_ultimate", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_index(
        "uq_goals_user_ultimate",
        "goals",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_ultimate = true AND archived_at IS NULL"),
    )


def downgrade() -> None:
    """Downgrade schema — is_ultimate 제거. DELETE 문 0개."""
    op.drop_index("uq_goals_user_ultimate", table_name="goals")
    op.drop_column("goals", "is_ultimate")
