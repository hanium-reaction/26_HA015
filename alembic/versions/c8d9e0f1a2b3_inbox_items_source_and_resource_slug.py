"""inbox_items.source + resource_slug — 목표 카테고리에 맞는 추천 자료를 인박스에 (#171)

인박스는 지금까지 100% 사용자 입력이었다. 목표를 세우면 그 카테고리 자료를 항목으로
넣어 주려면 "이건 시스템이 넣은 자료" 라는 걸 표현할 수단이 필요한데, 기존 컬럼
(`raw_text_encrypted`/`ai_category_guess`/`user_category`/`status`/`promoted_goal_id`)
으로는 전혀 구분할 수 없다.

- `source` — 'user'(직접 캡처) / 'system'(자동 삽입). 기존 행은 전부 'user' 로 백필된다.
- `resource_slug` — 시스템 항목이 가리키는 `content/<category>/<slug>.md`. **멱등 키**로도
  쓴다: 같은 user + slug 가 이미 있으면(보관된 것 포함) 다시 넣지 않는다. 사용자가 보관으로
  치운 자료를 목표를 만들 때마다 되살리지 않기 위해서다.

enum 이름은 `inbox_source` 로 새로 만든다 — `action_items.source` 가 이미 `action_source`
라는 별개 타입을 점유하고 있고 값 집합이 다르다.

⚠️ DB 마이그레이션 — AGENTS §8 "먼저 팀 합의". #171 에서 합의 완료.

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-07-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c8d9e0f1a2b3"
down_revision = "b7c8d9e0f1a2"
branch_labels = None
depends_on = None

# 값 없이 이름만으로도 drop 할 수 있게 모듈 상수로 둔다.
_INBOX_SOURCE = sa.Enum(*("user", "system"), name="inbox_source")


def upgrade() -> None:
    # `op.add_column` 은 `create_table` 과 달리 before_create 이벤트를 쏘지 않아
    # CREATE TYPE 을 emit 하지 않는다 — 명시적으로 먼저 만들어야 한다.
    _INBOX_SOURCE.create(op.get_bind(), checkfirst=True)

    # NOT NULL + server_default 라 기존 행이 전부 'user' 로 백필된다.
    # PG 11+ 는 DEFAULT 가 있는 ADD COLUMN 을 테이블 재작성 없이 처리한다.
    op.add_column(
        "inbox_items",
        sa.Column("source", _INBOX_SOURCE, nullable=False, server_default="user"),
    )
    op.add_column(
        "inbox_items",
        sa.Column("resource_slug", sa.String(length=64), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("inbox_items", "resource_slug")
    op.drop_column("inbox_items", "source")
    # 타입을 남기면 다시 upgrade 할 때 CREATE TYPE 이 'already exists' 로 깨진다.
    sa.Enum(name="inbox_source").drop(op.get_bind(), checkfirst=True)
