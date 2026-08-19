"""근거 대장 §7.3 SQL#1~4 — 실 Postgres 에서 실행 (P1).

`docs/experiments/experiment-plan-v1.md` §1 P1: "지표 SQL 을 테스트 DB 에서 실제 실행하고
시드 데이터 기댓값을 핀 테스트로 고정". 감사로 확인된 사실 — 이 SQL 4종은 지금까지 문서에만
있었고 레포 어디에서도 실행된 적이 없었다(`.sql` 파일 0개, `report_recovery_followthrough.py`
는 SQL#2 의 ORM 재구현이지 SQL 자체를 옮긴 게 아니다).

SQL#1(태그 커버리지 구멍)은 마이그레이션이 이미 커밋해 둔 마스터 시드만으로 실행 가능해
먼저 옮겨졌다. **여기서 나머지 SQL#2~4 도 마저 옮긴다** — `execution_events`/
`recovery_attempts`/`execution_failure_tags` 트랜잭션 데이터를 각 테스트가 직접 시딩한다
(아래 `_seed_*` 헬퍼). 시드 값은 손으로 계산 가능한 작은 수로 골랐고, 기대값은 그 계산을
그대로 옮긴 것이다 — 근거 대장 SQL 원문은 **한 글자도 고치지 않았다**(핀의 의미가 "문서의
SQL 이 이 값을 낸다"이지 "이런 취지의 SQL 이 이 값을 낸다"가 아니다).

DATABASE_URL 이 없으면(로컬 기본값) 전부 스킵 — `tests/test_db.py::DB_AVAILABLE` 와 같은
게이트. CI 의 `lint-test` 잡에는 postgres 서비스가 있어 항상 실행된다. 각 테스트는
`real_db_session` 픽스처가 감싼 트랜잭션 안에서만 시딩하고 끝나면 롤백되므로(같은 파일
안에서도) 테스트끼리 데이터가 섞이지 않는다 — `:user_id` 로 사실상 이미 격리되긴 하지만,
날짜 기반 필터(SQL#3/#4)는 테이블 전체를 훑으므로 트랜잭션 격리가 없으면 위험했다.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models.action_item import ActionItem
from reaction_backend.db.models.execution_event import ExecutionEvent
from reaction_backend.db.models.execution_failure_tag import ExecutionFailureTag
from reaction_backend.db.models.recovery_attempt import RecoveryAttempt
from reaction_backend.db.models.scheduled_block import ScheduledBlock
from reaction_backend.db.models.user import User
from reaction_backend.schemas.common import KST
from tests.conftest import DB_AVAILABLE

pytestmark = pytest.mark.skipif(not DB_AVAILABLE, reason="DATABASE_URL not set")


# ── 공용 시드 헬퍼 — User/ActionItem/ScheduledBlock/ExecutionEvent 최소 구성 ──
#
# fake repo 들(tests/conftest.py)과 같은 정신이다: 각 테스트가 필요한 것만 최소로 만들고
# 나머지는 컬럼 default 에 맡긴다. 차이는 여기선 **진짜 INSERT** 라는 것 — id 는 client-side
# uuid4() 로 미리 정해 관계를 손으로 잇는다(server_default RETURNING 에 의존하지 않음).


async def _seed_user(session: AsyncSession) -> UUID:
    user_id = uuid4()
    session.add(User(id=user_id, email=f"{user_id}@test.local", name="SQL 핀 테스트 유저"))
    await session.flush()
    return user_id


async def _seed_execution(
    session: AsyncSession,
    *,
    user_id: UUID,
    completion_status: str,
    plan_start_at: datetime,
    duration_minutes: int = 30,
    goal_id: UUID | None = None,
    action_item_id: UUID | None = None,
) -> tuple[UUID, UUID]:
    """실패/성공 실행 1건 시드 — (execution_id, action_item_id) 반환.

    `action_item_id` 를 넘기면 **기존 카드에 새 실행을 잇는다**(SQL#2 의 RESCHEDULE 재실행
    시나리오처럼 같은 action_item 이 두 번째로 실행되는 경우). 안 넘기면 새 카드를 만든다.
    """
    plan_end_at = plan_start_at + timedelta(minutes=duration_minutes)

    # ⚠️ 각 INSERT 사이에 flush 를 끼운다 — 오브젝트끼리 relationship() 으로 안 이어져
    # 있고(원시 *_id 컬럼값만 준다) 있어서, 한 번에 모아 flush 하면 SQLAlchemy 의 unit-of-
    # work 가 FK 의존 순서를 못 잡고 execution_events 를 scheduled_blocks 보다 먼저 INSERT
    # 하려다 실제로 FK 위반이 났다(로컬 검증 중 재현·확인).
    if action_item_id is None:
        action_item_id = uuid4()
        session.add(
            ActionItem(
                id=action_item_id,
                user_id=user_id,
                title="SQL 핀 테스트 카드",
                target_date=plan_start_at.date(),
                goal_id=goal_id,
            )
        )
        await session.flush()

    block_id = uuid4()
    session.add(
        ScheduledBlock(
            id=block_id,
            user_id=user_id,
            action_item_id=action_item_id,
            start_at=plan_start_at,
            end_at=plan_end_at,
        )
    )
    await session.flush()

    execution_id = uuid4()
    session.add(
        ExecutionEvent(
            id=execution_id,
            action_item_id=action_item_id,
            scheduled_block_id=block_id,
            user_id=user_id,
            plan_start_at=plan_start_at,
            plan_end_at=plan_end_at,
            completion_status=completion_status,
        )
    )
    await session.flush()
    return execution_id, action_item_id


async def _seed_recovery_attempt(
    session: AsyncSession,
    *,
    user_id: UUID,
    execution_id: UUID,
    option_group: str,
    strategy_type: str,
    user_decision: str,
    decided_at: datetime | None = None,
    resulting_action_item_id: UUID | None = None,
) -> None:
    session.add(
        RecoveryAttempt(
            id=uuid4(),
            user_id=user_id,
            execution_id=execution_id,
            recovery_option_group=option_group,
            recovery_strategy_type=strategy_type,
            suggested_action_text="시드",
            user_decision=user_decision,
            recovery_decided_at=decided_at,
            resulting_action_item_id=resulting_action_item_id,
        )
    )
    await session.flush()


async def _seed_failure_tag(session: AsyncSession, *, execution_id: UUID, tag_code: str) -> None:
    session.add(ExecutionFailureTag(id=uuid4(), execution_id=execution_id, tag_code=tag_code))
    await session.flush()


# ═══════════════════════ SQL#1 — 태그 커버리지 구멍 ═══════════════════════

# 근거 대장 §7.3 SQL#1 그대로 — JSONB 라 배열 연산자(&&)가 아니라 ? 를 쓴다는 문서의
# 주석도 그대로 보존.
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


# ═══════════════════ SQL#2 — 수락률 vs 완주율 갭 (F10 원천) ═══════════════════

# 근거 대장 §7.3 SQL#2 그대로.
_ACCEPTANCE_FOLLOWTHROUGH_GAP_SQL = text("""
    -- 2) 수락률 vs 완주율 갭 (그룹별 성공 정의 — 발표 대표 그림 F10 의 원천)
    WITH failed_exec AS (
      SELECT e.id, e.user_id,
             (e.plan_start_at AT TIME ZONE 'Asia/Seoul')::date AS kst_date
      FROM   execution_events e
      WHERE  e.user_id = :user_id
        AND  e.completion_status = 'failed'
        AND  (e.plan_start_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN :d0 AND :d1
    ),
    accepted AS (
      SELECT DISTINCT ra.execution_id
      FROM   recovery_attempts ra
      WHERE  ra.execution_id IN (SELECT id FROM failed_exec)
        AND  ra.user_decision IN ('accepted','edited')      -- ADOPTED_DECISION_VALUES
    ),
    followthrough AS (
      SELECT DISTINCT ra.execution_id
      FROM   recovery_attempts ra
      JOIN   execution_events  orig_e ON orig_e.id = ra.execution_id     -- 원본(실패) 실행 → 원본 카드
      JOIN   action_items      orig_a ON orig_a.id = orig_e.action_item_id
      LEFT   JOIN action_items ai ON ai.id = ra.resulting_action_item_id -- 파생 카드 (있는 그룹만)
      LEFT   JOIN LATERAL (
               SELECT 1 FROM execution_events e2
               WHERE  e2.action_item_id = ai.id
                 AND  e2.completion_status IN ('done','over_done')
               LIMIT  1
             ) derived_hit ON TRUE
      LEFT   JOIN LATERAL (
               -- RESCHEDULE: 원본 카드 자체가 결정 이후 다시 성공했는가(파생 카드 없음, S15
               -- 주간 편집기로 원본 블록을 옮겨 재실행하는 것이 실제 경로)
               SELECT 1 FROM execution_events e3
               WHERE  e3.action_item_id = orig_e.action_item_id
                 AND  e3.completion_status IN ('done','over_done')
                 AND  e3.plan_start_at > ra.recovery_decided_at
               LIMIT  1
             ) reschedule_hit ON TRUE
      LEFT   JOIN LATERAL (
               -- PARK: 같은 goal 계보 카드가 앵커(근사: recovery_decided_at) 후 7일 내 완주했는가.
               -- goal_id 가 없는 원본 카드(습관/인박스/수동)는 계보가 없어 항상 미완주.
               SELECT 1 FROM execution_events e4
               JOIN   action_items a4 ON a4.id = e4.action_item_id
               WHERE  orig_a.goal_id IS NOT NULL
                 AND  a4.goal_id = orig_a.goal_id
                 AND  e4.completion_status IN ('done','over_done')
                 AND  e4.plan_start_at >  ra.recovery_decided_at
                 AND  e4.plan_start_at <= ra.recovery_decided_at + interval '7 days'
               LIMIT  1
             ) park_hit ON TRUE
      WHERE  ra.execution_id IN (SELECT id FROM failed_exec)
        AND  ra.user_decision IN ('accepted','edited')
        AND  (
               -- 파생 카드가 있는 그룹: 그 카드가 완주됐는가
               (ra.recovery_option_group IN ('DOWNSCOPE','CARRY_OVER') AND derived_hit IS NOT NULL)
               -- ⚠️ RESCHEDULE/PARK 는 `ra.recovery_result = 'completed'` 를 쓰지 않는다 — 파생
               -- 카드가 없어 그 컬럼을 채우는 유일한 생산자(`complete_for_action`)가 절대 매칭되지
               -- 않고(매칭 키가 resulting_action_item_id), 구조적으로 영구 'pending' 이기 때문이다.
               OR (ra.recovery_option_group = 'RESCHEDULE' AND reschedule_hit IS NOT NULL)
               OR (ra.recovery_option_group = 'PARK' AND park_hit IS NOT NULL)
             )
    )
    SELECT count(*)                                                            AS failure_n,
           round(count(*) FILTER (WHERE f.id IN (SELECT execution_id FROM accepted))::numeric
                 / NULLIF(count(*),0), 4)                                      AS acceptance_rate,
           round(count(*) FILTER (WHERE f.id IN (SELECT execution_id FROM followthrough))::numeric
                 / NULLIF(count(*),0), 4)                                      AS followthrough_rate
    FROM   failed_exec f
""")

_D0 = date(2026, 8, 1)
_D1 = date(2026, 8, 1)
_FAILED_AT = datetime(2026, 8, 1, 20, 0, tzinfo=KST)  # 21시 회고보다 앞선 실패 시각
_DECIDED_AT = datetime(2026, 8, 1, 21, 0, tzinfo=KST)  # 21시 일괄 회고
_SAME_DAY_DONE_AT = datetime(2026, 8, 1, 22, 0, tzinfo=KST)
_NEXT_DAY_DONE_AT = datetime(2026, 8, 2, 10, 0, tzinfo=KST)  # RESCHEDULE 재실행 — 결정 이후


async def _seed_acceptance_followthrough_gap_scenario(session: AsyncSession, user_id: UUID) -> None:
    """5건의 실패 실행 — 4그룹 각 1건 수락(3건 완주) + 1건 거절.

    손으로 계산 가능한 값을 고른다: 실패 5건 / 수락 4건(80%) / 완주 3건(60%).
    PARK 는 원본 카드에 goal_id 가 없어(습관/인박스/수동 출처 흉내) 앵커 창 안에 완주가
    있어도 계보 판정 자체가 안 열린다 — 수락은 됐지만 완주가 아닌 유일한 경우를 이렇게
    만든다(추가 로우 없이, "이 카드는 애초에 계보가 없다"는 있는 그대로의 사실로).
    """
    # 1) DOWNSCOPE — 수락 + 파생 카드가 같은 날 완주
    downscope_exec, _ = await _seed_execution(
        session, user_id=user_id, completion_status="failed", plan_start_at=_FAILED_AT
    )
    _, downscope_derived = await _seed_execution(
        session, user_id=user_id, completion_status="done", plan_start_at=_SAME_DAY_DONE_AT
    )
    await _seed_recovery_attempt(
        session,
        user_id=user_id,
        execution_id=downscope_exec,
        option_group="DOWNSCOPE",
        strategy_type="NANO_STEP",
        user_decision="accepted",
        decided_at=_DECIDED_AT,
        resulting_action_item_id=downscope_derived,
    )

    # 2) CARRY_OVER — 수락 + 파생 카드가 같은 날 완주
    carryover_exec, _ = await _seed_execution(
        session, user_id=user_id, completion_status="failed", plan_start_at=_FAILED_AT
    )
    _, carryover_derived = await _seed_execution(
        session, user_id=user_id, completion_status="over_done", plan_start_at=_SAME_DAY_DONE_AT
    )
    await _seed_recovery_attempt(
        session,
        user_id=user_id,
        execution_id=carryover_exec,
        option_group="CARRY_OVER",
        strategy_type="CARRYOVER_DEFAULT",
        user_decision="accepted",
        decided_at=_DECIDED_AT,
        resulting_action_item_id=carryover_derived,
    )

    # 3) RESCHEDULE — 수락 + 원본 카드 자체가 다음날 재실행되어 완주(파생 카드 없음)
    reschedule_exec, reschedule_action = await _seed_execution(
        session, user_id=user_id, completion_status="failed", plan_start_at=_FAILED_AT
    )
    await _seed_execution(
        session,
        user_id=user_id,
        completion_status="done",
        plan_start_at=_NEXT_DAY_DONE_AT,
        action_item_id=reschedule_action,  # 같은 카드의 두 번째 실행
    )
    await _seed_recovery_attempt(
        session,
        user_id=user_id,
        execution_id=reschedule_exec,
        option_group="RESCHEDULE",
        strategy_type="RESCHEDULE_DEFAULT",
        user_decision="accepted",
        decided_at=_DECIDED_AT,
    )

    # 4) PARK — 수락됐지만 원본 카드에 goal_id 가 없어 계보 판정이 안 열림(미완주)
    park_exec, _ = await _seed_execution(
        session, user_id=user_id, completion_status="failed", plan_start_at=_FAILED_AT
    )
    await _seed_recovery_attempt(
        session,
        user_id=user_id,
        execution_id=park_exec,
        option_group="PARK",
        strategy_type="GOAL_RECHECK",
        user_decision="accepted",
        decided_at=_DECIDED_AT,
    )

    # 5) 거절 — 분모에는 들어가지만 수락에도 완주에도 안 들어간다
    rejected_exec, _ = await _seed_execution(
        session, user_id=user_id, completion_status="failed", plan_start_at=_FAILED_AT
    )
    await _seed_recovery_attempt(
        session,
        user_id=user_id,
        execution_id=rejected_exec,
        option_group="DOWNSCOPE",
        strategy_type="NANO_STEP",
        user_decision="rejected",
        decided_at=_DECIDED_AT,
    )


async def test_acceptance_followthrough_gap_sql(real_db_session: AsyncSession) -> None:
    """실패 5건 / 수락 80% / 완주 60% — 손 계산과 SQL 결과가 일치하는지 핀 고정.

    이 갭(80%→60%, drop_after_accept=20%p)이 근거 대장 §0-3, §7.1 이 말하는 "수락률은
    아첨을 보상한다"의 재료다 — PARK 하나만 "수락됐지만 완주가 아님"으로 갈렸는데도
    갭이 생긴다는 것 자체가 이 지표 재정의의 존재 이유를 보여준다.
    """
    user_id = await _seed_user(real_db_session)
    await _seed_acceptance_followthrough_gap_scenario(real_db_session, user_id)

    result = await real_db_session.execute(
        _ACCEPTANCE_FOLLOWTHROUGH_GAP_SQL, {"user_id": user_id, "d0": _D0, "d1": _D1}
    )
    row = result.one()

    assert row.failure_n == 5
    assert float(row.acceptance_rate) == pytest.approx(0.8)
    assert float(row.followthrough_rate) == pytest.approx(0.6)


async def test_acceptance_followthrough_gap_sql_scopes_by_user(
    real_db_session: AsyncSession,
) -> None:
    """가드 — `:user_id` 필터가 실제로 거른다.

    다른 유저의 시나리오를 하나 더 심고, 원래 유저로 조회했을 때 값이 안 바뀌는지 확인한다
    — WHERE 절이 죽어 있으면(예: 실수로 지워지면) 분모가 10건으로 뛰어 이 테스트가 잡는다.
    """
    user_id = await _seed_user(real_db_session)
    await _seed_acceptance_followthrough_gap_scenario(real_db_session, user_id)

    other_user_id = await _seed_user(real_db_session)
    await _seed_acceptance_followthrough_gap_scenario(real_db_session, other_user_id)

    result = await real_db_session.execute(
        _ACCEPTANCE_FOLLOWTHROUGH_GAP_SQL, {"user_id": user_id, "d0": _D0, "d1": _D1}
    )
    row = result.one()
    assert row.failure_n == 5, "다른 유저 데이터가 섞였다 — :user_id 필터가 무력화된 것"


# ═══════════════════ SQL#3 — next_day_return_rate ═══════════════════

# 근거 대장 §7.3 SQL#3 그대로. Sharif & Shu(2021) 0.37/0.44/0.55 와 직접 대조하는 값.
_NEXT_DAY_RETURN_RATE_SQL = text("""
    -- 3) next_day_return_rate — Sharif & Shu (0.37 / 0.44 / 0.55) 와 직접 대조
    WITH fail_days AS (
      SELECT DISTINCT (plan_start_at AT TIME ZONE 'Asia/Seoul')::date AS d
      FROM   execution_events
      WHERE  user_id = :user_id AND completion_status = 'failed'
        AND  (plan_start_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN :d0 AND :d1
    ),
    win_days AS (
      SELECT DISTINCT (plan_start_at AT TIME ZONE 'Asia/Seoul')::date AS d
      FROM   execution_events
      WHERE  user_id = :user_id AND completion_status IN ('done','over_done')
    )
    SELECT round(count(*) FILTER (WHERE (f.d + 1) IN (SELECT d FROM win_days))::numeric
                 / NULLIF(count(*),0), 4) AS next_day_return_rate
    FROM   fail_days f
""")


async def test_next_day_return_rate_sql(real_db_session: AsyncSession) -> None:
    """실패일 2건 중 1건만 다음날 복귀 — 0.5 로 핀 고정.

    fail_day 1(08-01)의 다음날(08-02)엔 성공 실행이 있어 복귀로 잡히고, fail_day 2
    (08-03)의 다음날(08-04)엔 아무 실행도 없어 복귀가 아니다. `win_days` 는 쿼리 원문 그대로
    날짜 범위 필터가 없다 — d0/d1 밖의 성공일도 복귀 판정에 쓰인다는 뜻이라, 그 경계를 넘는
    케이스(08-02 는 :d0~:d1=08-01~08-03 범위 안이지만 win_days 자체엔 범위 제한이 없다는 것)
    까지 이 시나리오가 실제로 건드린다.
    """
    user_id = await _seed_user(real_db_session)

    # fail_day 1 — 08-01, 다음날(08-02)에 성공 실행 있음 → 복귀
    await _seed_execution(
        session=real_db_session,
        user_id=user_id,
        completion_status="failed",
        plan_start_at=datetime(2026, 8, 1, 20, 0, tzinfo=KST),
    )
    await _seed_execution(
        session=real_db_session,
        user_id=user_id,
        completion_status="done",
        plan_start_at=datetime(2026, 8, 2, 9, 0, tzinfo=KST),
    )

    # fail_day 2 — 08-03, 다음날(08-04)엔 아무 실행도 없음 → 복귀 아님
    await _seed_execution(
        session=real_db_session,
        user_id=user_id,
        completion_status="failed",
        plan_start_at=datetime(2026, 8, 3, 20, 0, tzinfo=KST),
    )

    result = await real_db_session.execute(
        _NEXT_DAY_RETURN_RATE_SQL,
        {"user_id": user_id, "d0": date(2026, 8, 1), "d1": date(2026, 8, 3)},
    )
    rate = result.scalar_one()
    assert float(rate) == pytest.approx(0.5)


async def test_next_day_return_rate_sql_is_none_when_no_failures(
    real_db_session: AsyncSession,
) -> None:
    """가드 — 실패일이 0건이면 0으로 나누는 대신 NULL(`NULLIF`)이어야 한다.

    실패가 없는 유저에게 0.0(="복귀율 0%")을 보여주면 "매번 실패하고 한 번도 안
    돌아왔다"로 오독된다 — 계획서가 정직 지표를 강조하는 이유와 같은 함정이다.
    """
    user_id = await _seed_user(real_db_session)
    result = await real_db_session.execute(
        _NEXT_DAY_RETURN_RATE_SQL,
        {"user_id": user_id, "d0": date(2026, 8, 1), "d1": date(2026, 8, 3)},
    )
    assert result.scalar_one() is None


# ═══════════════════ SQL#4 — top_failure_contexts ═══════════════════

# 근거 대장 §7.3 SQL#4 그대로. BCT 2.3 Self-monitoring 을 채우는 쿼리(근거 A5).
#
# ⚠️ **유일하게 한 군데, 실행하려면 고쳐야 했다.** 원문의 BETWEEN 좌변은 캐스트 없는
# 뺄셈(<기간 시작 파라미터> 빼기 27)이다. psql 에 리터럴 값을 직접 박아 넣으면 문제가 없지만,
# 이 레포의 모든 실행 경로가 쓰는 파라미터 바인딩(asyncpg prepared statement, SQLAlchemy
# text())으로 돌리면 Postgres 가 그 파라미터의 타입을 못 정하고 "연산자 없음: date >= integer"
# 로 죽는다 — BETWEEN 좌변의 ::date 캐스트가 우변 뺄셈 문맥까지 타입을 전파하지 않기
# 때문이다(로컬 Postgres 에서 `DEALLOCATE ALL; PREPARE q AS ...`로 타입 미지정 재현 확인).
# 의미는 그대로이고 실행 가능하게 만드는 명시 캐스트 하나만 아래 SQL 안에 더했다 — 근거
# 대장 §7.3-4 에도 이 발견과 함께 반영했다. 이 코멘트 블록 자체는 SQL 문자열 밖에 둔다 —
# SQLAlchemy `text()` 의 bind-parameter 스캐너가 SQL 주석을 이해하지 못해서, 설명 문장
# 안에 파라미터 이름을 그대로 적으면 실제 사용처와 겹쳐 바인딩이 깨진다(직접 겪음).
_TOP_FAILURE_CONTEXTS_SQL = text("""
    -- 4) top_failure_contexts — BCT 2.3 Self-monitoring 을 채우는 쿼리 (근거 A5)
    SELECT t.tag_code,
           count(*)                                            AS n,
           round(count(*)::numeric / sum(count(*)) OVER (), 4)  AS share,
           mode() WITHIN GROUP (
             ORDER BY extract(hour FROM (e.plan_start_at AT TIME ZONE 'Asia/Seoul'))
           )                                                    AS modal_hour_kst
    FROM   execution_events       e
    JOIN   execution_failure_tags t ON t.execution_id = e.id
    WHERE  e.user_id = :user_id
      AND  e.completion_status IN ('failed','partial_done')
      -- 28일 창 시작을 명시 캐스트 — 이유는 이 상수 정의 위 주석 참조. 괄호로 감싼 이유는
      -- SQLAlchemy text() 의 bind-parameter 스캐너가 "이름::캐스트"를 만나면 이름의
      -- 마지막 글자를 하나 잘라먹는 버그가 있어서다(SQLAlchemy 2.0.49 로 직접 재현·확인 —
      -- :d0::date 를 파라미터 "d" 로 잘못 인식). 공백이나 괄호로 떼면 정상 인식된다.
      AND  (e.plan_start_at AT TIME ZONE 'Asia/Seoul')::date BETWEEN (:d0)::date - 27 AND :d1
    GROUP  BY t.tag_code
    ORDER  BY n DESC
    LIMIT  3
""")


async def _seed_tagged_failure(
    session: AsyncSession, *, user_id: UUID, tag_code: str, day: date, hour: int
) -> None:
    execution_id, _ = await _seed_execution(
        session,
        user_id=user_id,
        completion_status="failed",
        plan_start_at=datetime(day.year, day.month, day.day, hour, 0, tzinfo=KST),
    )
    await _seed_failure_tag(session, execution_id=execution_id, tag_code=tag_code)


async def test_top_failure_contexts_sql(real_db_session: AsyncSession) -> None:
    """4개 태그 중 상위 3개만, share 분모는 4개 전부 — LIMIT 과 윈도우 함수의 상호작용을 핀.

    태그별 건수를 동점 없이 4/3/2/1 로 고른다(동점이면 `ORDER BY n DESC` 뒤의 순서가
    비결정적이라 어느 게 3위/4위인지 테스트가 흔들린다). 합계 10건 중 상위 3개(4+3+2=9)만
    반환되지만 `share` 는 **LIMIT 이전(GROUP BY 전체 10건)을 분모로 쓰는 윈도우 함수**라
    반환된 3행의 share 합은 0.9 지 1.0 이 아니다 — 이게 SQL 원문이 실제로 그렇게 동작하는지
    보여주는 핵심 단언이다. 4위(CONTEXT_LOSS, 1건)는 안 보이지만 분모엔 들어가 있다.
    """
    user_id = await _seed_user(real_db_session)

    # AMBIGUITY — 4건, 09시 3번 + 14시 1번 → mode=9
    for hour in (9, 9, 9, 14):
        await _seed_tagged_failure(
            real_db_session, user_id=user_id, tag_code="AMBIGUITY", day=date(2026, 8, 1), hour=hour
        )
    # FATIGUE — 3건, 10시 2번 + 15시 1번 → mode=10
    for hour in (10, 10, 15):
        await _seed_tagged_failure(
            real_db_session, user_id=user_id, tag_code="FATIGUE", day=date(2026, 8, 1), hour=hour
        )
    # DISTRACTION — 2건, 11시 2번 → mode=11
    for hour in (11, 11):
        await _seed_tagged_failure(
            real_db_session,
            user_id=user_id,
            tag_code="DISTRACTION",
            day=date(2026, 8, 1),
            hour=hour,
        )
    # CONTEXT_LOSS — 1건, LIMIT 3 밖으로 밀려나야 한다
    await _seed_tagged_failure(
        real_db_session, user_id=user_id, tag_code="CONTEXT_LOSS", day=date(2026, 8, 1), hour=12
    )

    result = await real_db_session.execute(
        _TOP_FAILURE_CONTEXTS_SQL,
        {"user_id": user_id, "d0": date(2026, 8, 1), "d1": date(2026, 8, 1)},
    )
    rows = result.all()

    assert [r.tag_code for r in rows] == ["AMBIGUITY", "FATIGUE", "DISTRACTION"]
    assert [r.n for r in rows] == [4, 3, 2]
    assert [r.modal_hour_kst for r in rows] == [9, 10, 11]
    assert [float(r.share) for r in rows] == [
        pytest.approx(0.4),
        pytest.approx(0.3),
        pytest.approx(0.2),
    ]
    # LIMIT 이전 분모(10건)를 증명 — 보이는 3행의 share 합은 1.0 이 아니라 0.9.
    assert sum(float(r.share) for r in rows) == pytest.approx(0.9)


async def test_top_failure_contexts_sql_excludes_done_and_out_of_window(
    real_db_session: AsyncSession,
) -> None:
    """가드 — `completion_status` 필터와 28일 창(`:d0 - 27`)이 실제로 작동한다.

    성공(done) 실행에 태그가 붙어도(정상 흐름상 없어야 하지만 방어적으로) 집계에 안
    들어가고, 창 밖(29일 전) 실패도 안 들어간다 — 둘 다 넣었을 때 결과가 하나도 안 바뀌면
    이 SQL 의 WHERE 절이 죽어 있는 것이다.
    """
    user_id = await _seed_user(real_db_session)

    # 정상 케이스 — 창 안의 실패 1건
    await _seed_tagged_failure(
        real_db_session, user_id=user_id, tag_code="OVERRUN", day=date(2026, 8, 15), hour=10
    )

    # 오염 시도 1 — 완료된(done) 실행에 태그 (있어선 안 되지만 필터가 죽으면 섞인다)
    done_execution_id, _ = await _seed_execution(
        real_db_session,
        user_id=user_id,
        completion_status="done",
        plan_start_at=datetime(2026, 8, 15, 11, 0, tzinfo=KST),
    )
    await _seed_failure_tag(real_db_session, execution_id=done_execution_id, tag_code="OVERRUN")

    # 오염 시도 2 — 28일 창(:d0 - 27 ~ :d1) 밖의 실패 (30일 전)
    await _seed_tagged_failure(
        real_db_session, user_id=user_id, tag_code="OVERRUN", day=date(2026, 7, 16), hour=10
    )

    result = await real_db_session.execute(
        _TOP_FAILURE_CONTEXTS_SQL,
        {"user_id": user_id, "d0": date(2026, 8, 15), "d1": date(2026, 8, 15)},
    )
    rows = result.all()

    assert len(rows) == 1
    assert rows[0].tag_code == "OVERRUN"
    assert rows[0].n == 1, f"오염된 행이 섞였다: n={rows[0].n}"
