"""recovery_attempts.prompt_version/assigned_arm/first_viewed_at + llm_runs.reason

Revision ID: 09fa61fbf06f
Revises: 8680c4567ca6
Create Date: 2026-08-19 00:00:00.000000

회복 재설계 실험 계획서(docs/experiments/experiment-plan-v1.md §1) 선행조건 P4/P5/P6 +
L1-4(fallback 3분해) 선행 계측.

- `recovery_attempts.prompt_version` (P4): 온라인 결과 ↔ 프롬프트 버전 조인. 이 실행의
  personalize 호출이 쓴 `RunResult.prompt_version` 을 그대로 저장 — `llm_runs.prompt_version`
  과 같은 포맷(`registry.PromptTemplate.version`, 예: "2"). 카드 여러 장이 한 번의 생성
  호출에서 나오므로(선두 카드만 실제로 personalize 되지만) `llm_fallback_used` 와 같은
  범위로, 그 배치 전체에 같은 값을 적는다 — 기존 필드와 의미 범위를 다르게 만들지 않는다.
- `recovery_attempts.assigned_arm` (P5): L3-1 온라인 실험 배정 기록용 빈 칸. **배정 로직은
  이 마이그레이션 범위 밖**이다 — 배정 방식(주 단위 블록·이월 통제 등, experiment-plan-v1.md
  §4 L3-0)은 IRB 승인 전까지 미확정이라, 컬럼만 만들고 채우는 코드는 W4 로 미룬다.
- `recovery_attempts.first_viewed_at` (P6): 카드가 API 응답으로 처음 나간 시각 — "노출"의
  근사치다(클라이언트가 실제로 렌더링했는지는 FE 계측 없이는 모른다). 최초 1회만 채우고
  이후 재호출(멱등 경로)엔 덮어쓰지 않는다.
- `llm_runs.reason` (L1-4 선행): `RunResult.reason`(rate_limited/timeout/validation/budget/
  banned/unavailable/no_prompt/provider_error) 을 그대로 저장. 지금까지 이 값은 로그에만
  남고 DB엔 안 남아, fallback 을 원인별로 나눠 보는 게 불가능했다(`llm_runs.error` 로는
  안 된다 — timeout 은 `str(TimeoutError())` 가 빈 문자열이라 falsy 체크에 걸려 NULL 로
  저장된다).

전부 nullable — 기존 행은 NULL, 백필 없음. 4컬럼 모두 순수 ADD COLUMN, FK 없음, 롤백 무해.

⚠️ DB 마이그레이션 — AGENTS.md §8 "먼저 팀 합의" 대상이나, 4컬럼 전부 experiment-plan-v1.md
§1 P-표에서 이미 "W1 에 반드시 처리" 로 팀 합의된 항목(#255 머지)이라 이 PR 자체가 그 합의
실행분이다. 리뷰에서 범위·타입 이견이 있으면 여기서 조정.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "09fa61fbf06f"
down_revision: str | Sequence[str] | None = "8680c4567ca6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema — recovery_attempts 3컬럼 + llm_runs.reason, 전부 nullable."""
    op.add_column(
        "recovery_attempts",
        sa.Column("prompt_version", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "recovery_attempts",
        sa.Column("assigned_arm", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "recovery_attempts",
        sa.Column("first_viewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "llm_runs",
        sa.Column("reason", sa.String(length=30), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema — 4컬럼 제거."""
    op.drop_column("llm_runs", "reason")
    op.drop_column("recovery_attempts", "first_viewed_at")
    op.drop_column("recovery_attempts", "assigned_arm")
    op.drop_column("recovery_attempts", "prompt_version")
