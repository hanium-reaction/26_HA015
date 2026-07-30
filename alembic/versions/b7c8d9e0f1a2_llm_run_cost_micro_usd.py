"""llm_runs.cost_micro_usd — 정수 센트로는 표현이 안 되는 호출 비용

`cost_cents` 는 Integer 라 싼 호출이 통째로 0 이 된다. 인터뷰 1회는 약 0.05센트라
반올림하면 0 이고, 1,095회를 더해도 0 이다(실제로는 약 $0.5). 모델별 단가가 6배 차이나는
상황에서 이 정밀도로는 "어느 모듈이 돈을 쓰는가" 에 답할 수 없다.

백만분의 1 USD 정수로 따로 기록한다 — 부동소수 누적 오차가 없고 가장 싼 호출도 세 자리
유효숫자가 남는다. `cost_cents` 는 DB 설계서 §5.28 계약이라 그대로 둔다(반올림 유지).

기존 행은 **0 으로 남긴다**(소급 계산 안 함). 이 시점 이전 `tokens_out` 은 사고(thinking)
토큰을 빼고 기록돼 있어(실측 33% 누락) 소급하면 틀린 숫자가 진짜처럼 쌓인다. 추세를 볼 때
이 마이그레이션 시점을 경계로 봐야 한다.

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-07-30
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "llm_runs",
        sa.Column(
            "cost_micro_usd",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
    )


def downgrade() -> None:
    op.drop_column("llm_runs", "cost_micro_usd")
