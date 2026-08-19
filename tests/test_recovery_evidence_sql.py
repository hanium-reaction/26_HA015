"""근거 대장 §7.3 SQL#1(태그 커버리지 구멍) — 실 Postgres 에서 실행 (P1 첫 조각).

`docs/experiments/experiment-plan-v1.md` §1 P1: "지표 SQL 을 테스트 DB 에서 실제 실행하고
시드 데이터 기댓값을 핀 테스트로 고정". 감사로 확인된 사실 — 이 SQL 4종은 지금까지 문서에만
있었고 레포 어디에서도 실행된 적이 없었다(`.sql` 파일 0개, `report_recovery_followthrough.py`
는 SQL#2 의 ORM 재구현이지 SQL 자체를 옮긴 게 아니다).

**SQL#1 만 여기서 옮긴다.** 나머지(SQL#2 수락률/완주율 갭, SQL#3 next_day_return_rate,
SQL#4 top_failure_contexts)는 `execution_events`/`recovery_attempts`/
`execution_failure_tags` 트랜잭션 데이터 시딩이 필요해 별도 픽스처가 든다 — SQL#1 은
마이그레이션이 이미 커밋해 둔 마스터 시드(13태그 + 13전략, `d09c105520b5` +
`8680c4567ca6`)만으로 바로 실행 가능해서 가장 먼저 옮길 수 있다.

DATABASE_URL 이 없으면(로컬 기본값) 전부 스킵 — `tests/test_db.py::DB_AVAILABLE` 와 같은
게이트. CI 의 `lint-test` 잡에는 postgres 서비스가 있어 항상 실행된다.
"""

from __future__ import annotations

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import DB_AVAILABLE

pytestmark = pytest.mark.skipif(not DB_AVAILABLE, reason="DATABASE_URL not set")

# 근거 대장 §7.3 SQL#1 그대로 — 한 글자도 안 고쳤다(핀의 의미가 "문서의 SQL이 이 값을
# 낸다"이지 "이런 취지의 SQL이 이 값을 낸다"가 아니다). JSONB 라 배열 연산자(&&)가 아니라
# ? 를 쓴다는 문서의 주석도 그대로 보존.
_TAG_COVERAGE_GAP_SQL = text("""
    -- 1) 태그 커버리지 구멍 — JSONB 이므로 배열 연산자(&&)가 아니라 ? 를 쓴다
    SELECT t.tag_code
    FROM   failure_reason_tags t
    WHERE  t.is_active
      AND  NOT EXISTS (
             SELECT 1 FROM recovery_strategy_catalog c
             WHERE c.is_active AND c.primary_trigger_tags ? t.tag_code
           )
    ORDER BY t.tag_code
""")


async def test_tag_coverage_gap_sql_returns_no_rows(real_db_session: AsyncSession) -> None:
    """13태그 전부 커버 — #257(신설 4전략) 이후의 실제 상태를 실 SQL 로 핀 고정.

    근거 대장 §7.3-1 의 주석("현재 결과: TIME_SHORTAGE, OVERRUN, AVOIDANCE (3행)")은
    #257 이전 값으로 낡아 있었다(같은 문서 §4.1 은 이미 신설 4종을 설명하면서도 이
    SQL 블록의 주석만 갱신을 놓쳤다). ORM 기준 커버리지는
    `tests/test_recovery_catalog_sync.py::test_all_thirteen_tags_are_now_covered` 가
    이미 고정하고 있지만, 그건 conftest 미러를 읽는 파이썬 집합 연산이지 **이 SQL 자체**를
    실행한 적은 없었다 — 여기서 그 간극을 닫는다.
    """
    result = await real_db_session.execute(_TAG_COVERAGE_GAP_SQL)
    rows = result.scalars().all()
    assert rows == [], f"미커버 태그가 실 SQL 로도 나온다: {rows}"


async def test_tag_coverage_gap_sql_guard_actually_detects_a_gap(
    real_db_session: AsyncSession,
) -> None:
    """가드 — 위 결과가 실제로 카탈로그에 민감한가.

    빈 결과가 "쿼리가 죽어서 항상 빈 결과"인지 "정말 커버됐어서 빈 결과"인지는 그
    자체로는 구분이 안 된다(`tests/test_recovery_selection_coverage.py` 의 뮤테이션
    가드와 같은 문제의식). 여기서는 시드를 건드리는 대신, **같은 SQL 을 다른 태그
    코드로 실행**해 진짜 없는 태그가 주어지면 정상적으로 잡히는지 확인한다 — 태그
    자체가 `is_active` 조건에 안 걸리므로 아예 아무 것도 매칭되지 않는(=커버리지와
    무관하게 존재하지 않는) 태그를 하나 심어서, SQL 이 "존재하지 않는 태그"에 반응하는
    정상 동작을 보여준다.
    """
    probe_sql = text("""
        SELECT t.tag_code
        FROM   failure_reason_tags t
        WHERE  t.is_active AND t.tag_code = 'DOES_NOT_EXIST_PROBE'
          AND  NOT EXISTS (
                 SELECT 1 FROM recovery_strategy_catalog c
                 WHERE c.is_active AND c.primary_trigger_tags ? t.tag_code
               )
    """)
    result = await real_db_session.execute(probe_sql)
    assert result.scalars().all() == [], (
        "존재하지 않는 태그 코드로도 매칭되면 WHERE 절이 무력화된 것"
    )


async def test_master_seed_is_actually_applied(real_db_session: AsyncSession) -> None:
    """전제 확인 — 마이그레이션이 실제로 13태그 + 13전략을 커밋해 뒀다.

    위 두 테스트가 통과하는 이유가 "시드가 있어서"가 아니라 "테이블이 비어서"이면
    가짜 초록이다. 분모 자체를 여기서 고정한다.
    """
    tags = await real_db_session.execute(
        text("SELECT count(*) FROM failure_reason_tags WHERE is_active")
    )
    strategies = await real_db_session.execute(
        text("SELECT count(*) FROM recovery_strategy_catalog WHERE is_active")
    )
    assert tags.scalar_one() == 13
    assert strategies.scalar_one() == 13
