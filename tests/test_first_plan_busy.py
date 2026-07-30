"""#118-3 통합 테스트 — DB busy(기존 블록 + 고정일정 + 시간정책)가 실제로 스케줄러에
도달해 회피되는지, `first_plan.schedule_blocks` 노드를 통해 검증한다.

기존 라우트 테스트의 `_FakeSession.execute` 는 항상 `[]` 라, `_existing_busy_by_day` /
`_fixed_schedules` / `_db_time_policies` 가 실 busy 를 스케줄러에 넣는 경로가 한 번도 안
돌았다. 여기서는 쿼리 대상 테이블별로 시드 행을 돌려주는 fake session 으로 그 경로를 태운다.
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from uuid import uuid4

from reaction_backend.db.models.fixed_schedule import FixedSchedule
from reaction_backend.db.models.scheduled_block import ScheduledBlock
from reaction_backend.db.models.time_policy import TimePolicy
from reaction_backend.orchestrator import first_plan, first_plan_adapter
from reaction_backend.orchestrator.goal_structuring import (
    BusyBlock,
    DraftScheduledBlock,
    TimeInterval,
)
from reaction_backend.schemas.interview import (
    AvailabilityProfile,
    GoalCandidate,
    IdentityContext,
    InterviewOutcome,
    PreferenceProfile,
    TimeRange,
)
from reaction_backend.schemas.planning import ActionItemDraft, GoalDecomposition, GoalNodeDraft
from tests.conftest import DEMO_USER_UUID, _FakeResult, _FakeSession

KST = timezone(timedelta(hours=9))
TUE = date(2026, 7, 14)  # 화요일
THU = date(2026, 7, 16)


def _at(d: date, h: int, m: int = 0) -> datetime:
    return datetime.combine(d, time(h, m), tzinfo=KST)


class _RoutingSession(_FakeSession):
    """쿼리 대상 테이블별로 시드 행을 돌려주는 fake session — 실 busy 를 스케줄러까지 흘린다."""

    def __init__(
        self,
        *,
        blocks: list[ScheduledBlock],
        fixed: list[FixedSchedule],
        policies: list[TimePolicy],
    ) -> None:
        super().__init__()
        self._blocks = blocks
        self._fixed = fixed
        self._policies = policies

    async def execute(self, stmt: Any, params: Any = None) -> _FakeResult:  # noqa: ARG002
        sql = str(stmt).lower()
        # superseded_card_ids(재생성 교체대상) — 없음(시드 미교체) → busy 유지.
        if "action_items" in sql:
            return _FakeResult([])
        if "fixed_schedules" in sql:
            return _FakeResult(self._fixed)
        if "time_policies" in sql:
            return _FakeResult(self._policies)
        if "scheduled_blocks" in sql:
            return _FakeResult(self._blocks)
        return _FakeResult([])


def _seed_block(day: date, sh: int, eh: int) -> ScheduledBlock:
    b = ScheduledBlock()
    b.id = uuid4()
    b.user_id = DEMO_USER_UUID
    b.action_item_id = uuid4()
    b.start_at = _at(day, sh)
    b.end_at = _at(day, eh)
    b.block_status = "scheduled"
    b.source = "ai_plan"
    return b


def _seed_fixed(days: list[str], sh: int, eh: int, title: str) -> FixedSchedule:
    f = FixedSchedule()
    f.id = uuid4()
    f.user_id = DEMO_USER_UUID
    f.title = title
    f.days_of_week = days
    f.start_time = time(sh, 0)
    f.end_time = time(eh, 0)
    return f


def _seed_policy(policy_type: str, payload: dict[str, str]) -> TimePolicy:
    p = TimePolicy()
    p.id = uuid4()
    p.user_id = DEMO_USER_UUID
    p.policy_type = policy_type
    p.payload = payload
    p.is_active = True
    return p


def _outcome() -> InterviewOutcome:
    return InterviewOutcome(
        session_id="t",
        generated_at=datetime.now(KST),
        end_reason="completed",
        ambiguity_final=0.1,
        analysis_source="llm",
        identity=IdentityContext(role="대3", season="학기중"),
        core_goals=[
            GoalCandidate(
                title="프로젝트",
                category="study",
                is_heaviest=True,
                tentative_tier="focus",
                confidence=0.9,
                deadline="2026-07-16",
            )
        ],
        availability=AvailabilityProfile(
            activity_window=TimeRange(start="09:00", end="23:30"), peak_window=["오후"]
        ),
        preferences=PreferenceProfile(recovery_tone="담백", rest_ok=True, downscope_unit_min=10),
        horizon="2026-07-16",
    )


def _state() -> Any:
    state = first_plan.initial_state(
        user_id=DEMO_USER_UUID, outcome=_outcome(), target_date=TUE.isoformat(), scope="horizon"
    )
    gp = GoalDecomposition(
        goal_nodes=[
            GoalNodeDraft(
                node_id="n1",
                parent_id=None,
                title="root",
                node_type="root",
                order_index=0,
                is_leaf=True,
            )
        ],
        action_items=[
            ActionItemDraft(
                node_id="n1",
                title=f"작업{i}",
                estimated_minutes=50,
                category="study",
                first_step="시작",
            )
            for i in range(3)
        ],
        policy_violations=[],
    )
    return {**state, "goal_plan": gp}


def _overlaps(bstart: datetime, bend: datetime, wstart: datetime, wend: datetime) -> bool:
    return bstart < wend and wstart < bend


async def test_schedule_blocks_avoids_db_busy_all_three_sources() -> None:
    """기존 블록 + 고정일정(수업) + DB 정책(점심)이 스케줄러까지 도달해 회피된다."""
    session = _RoutingSession(
        blocks=[_seed_block(TUE, 13, 15)],  # 기존 계획 블록 화 13:00~15:00
        fixed=[_seed_fixed(["tue", "thu"], 10, 12, "전공 수업")],  # 화·목 10:00~12:00
        policies=[_seed_policy("lunch", {"start_time": "12:00", "end_time": "13:00"})],  # 매일 점심
    )
    config: Any = {"configurable": {"session": session, "tone_mode": None}}

    new_state = await first_plan.schedule_blocks(_state(), config)
    blocks = new_state["scheduled_blocks"]
    assert blocks, "블록이 하나는 배치돼야 한다"

    for b in blocks:
        bs = b.start.astimezone(KST)
        be = b.end.astimezone(KST)
        wk = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[bs.weekday()]
        # 점심(매일 12~13) 회피
        assert not _overlaps(bs, be, _at(bs.date(), 12), _at(bs.date(), 13)), f"점심 겹침: {bs}"
        # 수업(화·목 10~12) 회피
        if wk in ("tue", "thu"):
            assert not _overlaps(bs, be, _at(bs.date(), 10), _at(bs.date(), 12)), f"수업 겹침: {bs}"
        # 기존 블록(화 13~15) 회피
        if bs.date() == TUE:
            assert not _overlaps(bs, be, _at(TUE, 13), _at(TUE, 15)), f"기존 블록 겹침: {bs}"


async def test_schedule_blocks_no_db_busy_uses_full_window() -> None:
    """DB busy 가 비면(빈 세션) outcome 활동창만으로 배치 — 회피 로직이 no-op."""
    session = _RoutingSession(blocks=[], fixed=[], policies=[])
    config: Any = {"configurable": {"session": session, "tone_mode": None}}
    new_state = await first_plan.schedule_blocks(_state(), config)
    assert len(new_state["scheduled_blocks"]) == 3  # 3 액션 전부 배치(막는 busy 없음)


def _freq_state(*, deadline: str | None = "2026-08-01", sessions: int = 7) -> Any:
    """'매일'(frequency=7) 목표 + N개 세션 leaf — 요일 분산을 end-to-end 로 검증하기 위한 상태.

    deadline=None 이면 습관형(마감 없음) 코너 — _schedule_end 가 창을 하루로 붕괴시키는 경로.
    sessions 를 rate(7)의 배수가 아니게 주면 배치 창 올림 경로를 탄다.
    """
    outcome = InterviewOutcome(
        session_id="t-freq",
        generated_at=datetime.now(KST),
        end_reason="completed",
        ambiguity_final=0.1,
        analysis_source="llm",
        identity=IdentityContext(role="대3", season="학기중"),
        core_goals=[
            GoalCandidate(
                title="아침 운동",
                category="health",
                is_heaviest=True,
                tentative_tier="focus",
                confidence=0.9,
                session_length_min=50,
                frequency_per_week=7,  # 매일
                deadline=deadline,
            )
        ],
        availability=AvailabilityProfile(
            activity_window=TimeRange(start="06:00", end="23:30"), peak_window=["오전"]
        ),
        preferences=PreferenceProfile(recovery_tone="담백", rest_ok=True, downscope_unit_min=10),
        horizon=deadline,
    )
    state = first_plan.initial_state(
        user_id=DEMO_USER_UUID, outcome=outcome, target_date=TUE.isoformat(), scope="horizon"
    )
    gp = GoalDecomposition(
        goal_nodes=[
            GoalNodeDraft(
                node_id="n1",
                parent_id=None,
                title="root",
                node_type="root",
                order_index=0,
                is_leaf=False,
            ),
            *(
                GoalNodeDraft(
                    node_id=f"l{i}",
                    parent_id="n1",
                    title=f"운동 {i + 1}회차",
                    node_type="leaf",
                    order_index=i,
                    is_leaf=True,
                )
                for i in range(sessions)
            ),
        ],
        action_items=[
            ActionItemDraft(
                node_id=f"l{i}",
                title=f"운동 {i + 1}회차",
                estimated_minutes=50,
                category="health",
                first_step="스트레칭 5분",
            )
            for i in range(sessions)
        ],
        policy_violations=[],
    )
    return {**state, "goal_plan": gp}


async def test_schedule_blocks_daily_frequency_spreads_across_seven_days() -> None:
    """'매일'(frequency=7) → 7개 세션이 한 주(weeks_needed=1) 안 **서로 다른 7일**에 분산된다.

    회귀 방지: '매일 운동' 이 주 1일로만 몰리던 문제. frequency 가 주당 rate=7 → schedule_blocks
    의 weeks_needed=ceil(7/7)=1 로 배치 창을 한 주로 좁히고, 스케줄러 stride 가 요일마다 하나씩 편다.
    """
    session = _RoutingSession(blocks=[], fixed=[], policies=[])
    config: Any = {"configurable": {"session": session, "tone_mode": None}}
    new_state = await first_plan.schedule_blocks(_freq_state(), config)
    blocks = new_state["scheduled_blocks"]
    assert len(blocks) == 7, "7개 세션이 모두 배치돼야 한다"
    distinct_days = {b.start.astimezone(KST).date() for b in blocks}
    assert len(distinct_days) == 7, (
        f"서로 다른 7일에 분산돼야 하는데 {len(distinct_days)}일에 몰렸다"
    )
    # 배치 창이 한 주(TUE~+6일)로 좁혀졌는지 — 먼 마감(08-01)까지 흩뿌리지 않는다.
    assert max(distinct_days) <= TUE + timedelta(days=6)


async def test_schedule_blocks_daily_frequency_spreads_even_without_deadline() -> None:
    """마감 **없는** '매일' 습관도 7일에 분산된다 — 배치 창 하루-붕괴 회귀 봉합.

    회귀(시나리오 프로브로 발견): 마감 없는 습관형 목표는 _schedule_end(horizon=None)가 배치
    창을 target_date **하루**로 붕괴시켜, 주당 rate 만큼의 세션이 전부 첫날에 몰렸다('매일'이
    '하루 몰빵'). 운동·영어 같은 습관은 대개 마감이 없어 정작 빈도 기능의 주 용도에서 깨졌다.
    schedule_blocks 가 마감 없는 horizon 계획에서 density_end(weeks_needed 주)로 창을 펴야 한다.
    """
    session = _RoutingSession(blocks=[], fixed=[], policies=[])
    config: Any = {"configurable": {"session": session, "tone_mode": None}}
    new_state = await first_plan.schedule_blocks(_freq_state(deadline=None), config)
    blocks = new_state["scheduled_blocks"]
    assert len(blocks) == 7, "7개 세션이 모두 배치돼야 한다"
    distinct_days = {b.start.astimezone(KST).date() for b in blocks}
    assert len(distinct_days) == 7, (
        f"마감 없어도 서로 다른 7일에 분산돼야 하는데 {len(distinct_days)}일에 몰렸다"
    )
    # 마감이 없어도 무한 미래로 흩뿌리지 않고 한 주(days_needed ≤ 7)로 바운드된다.
    assert max(distinct_days) <= TUE + timedelta(days=6)


async def test_daily_frequency_stays_daily_when_sessions_are_not_a_week_multiple() -> None:
    """세션 수가 주(rate)의 배수가 아니어도 '매일'은 **매일**로 남는다.

    실측 회귀(로컬 E2E): 마감 8/15 + '매일'(rate 7) 인데 분해가 8세션만 나왔다. 배치 창을
    '필요한 주 수'로 올림하면 ceil(8/7)=2주=14일이라, stride 가 8세션을 14일에 흩뿌려
    **격일**(주 4회)이 됐다. 사용자가 고른 케이던스가 조용히 반토막 난 것.
    일 단위로 환산하면 ceil(8×7/7)=8일 → 연속 8일, 하루 1개가 유지된다.
    """
    session = _RoutingSession(blocks=[], fixed=[], policies=[])
    config: Any = {"configurable": {"session": session, "tone_mode": None}}
    new_state = await first_plan.schedule_blocks(
        _freq_state(deadline="2026-08-15", sessions=8), config
    )
    blocks = new_state["scheduled_blocks"]
    assert len(blocks) == 8, "8개 세션이 모두 배치돼야 한다"
    distinct_days = {b.start.astimezone(KST).date() for b in blocks}
    assert len(distinct_days) == 8, f"8일에 하루씩 배치돼야 하는데 {len(distinct_days)}일에 몰렸다"
    # 창이 정확히 8일 — 예전 주 단위 올림(14일)이면 빈 날이 6일 생겼다.
    assert max(distinct_days) - min(distinct_days) == timedelta(days=7), (
        f"연속 8일이어야 하는데 {max(distinct_days) - min(distinct_days)} 에 퍼졌다"
    )


# ── #190 하루 과부하 안내 ──────────────────────────────────────────────────


def _draft(day: date, hh: int, minutes: int) -> DraftScheduledBlock:
    start = datetime.combine(day, time(hh, 0), tzinfo=KST)
    return DraftScheduledBlock(
        interval=TimeInterval(start, start + timedelta(minutes=minutes)),
        origin="goal",
        origin_id=None,
        title="카드",
        category="study",
    )


def test_daily_overload_notice_counts_other_goals_too() -> None:
    """다른 목표의 확정분까지 합쳐서 상한 초과를 판단한다 — 사용자가 마주할 총량이 그것이다."""
    day = date(2026, 7, 30)
    notice = first_plan_adapter.daily_overload_notice(
        [_draft(day, 20, 60)],  # 이 계획은 60분뿐
        committed_min_by_day={day: 180},  # 다른 목표가 이미 180분
        cap_min=180,
    )
    assert notice is not None
    assert "7월 30일" in notice
    assert "4.0시간" in notice


def test_daily_overload_notice_silent_within_cap() -> None:
    """상한 안이면 아무 말도 하지 않는다 — 정상 계획에 잡음을 얹지 않는다."""
    day = date(2026, 7, 30)
    assert (
        first_plan_adapter.daily_overload_notice(
            [_draft(day, 20, 60)], committed_min_by_day={day: 120}, cap_min=180
        )
        is None
    )


def test_daily_overload_notice_names_one_day_and_counts_rest() -> None:
    """초과한 날이 여럿이면 가장 무거운 하루만 짚고 나머지는 개수로 — 날마다 늘어놓지 않는다."""
    d1, d2 = date(2026, 7, 30), date(2026, 7, 31)
    notice = first_plan_adapter.daily_overload_notice(
        [_draft(d1, 20, 240), _draft(d2, 20, 200)],
        committed_min_by_day={},
        cap_min=180,
    )
    assert notice is not None
    assert "7월 30일" in notice and "7월 31일" not in notice
    assert "2일" in notice


# ── #191 여백 덧대기 ───────────────────────────────────────────────────────


def test_pad_busy_adds_margin_on_both_sides() -> None:
    day = date(2026, 7, 30)
    iv = TimeInterval(
        datetime.combine(day, time(18, 0), tzinfo=KST),
        datetime.combine(day, time(19, 0), tzinfo=KST),
    )
    padded = first_plan_adapter.pad_busy([BusyBlock(iv, "scheduled_block", "기존")], 20)
    assert padded[0].interval.start == datetime.combine(day, time(17, 40), tzinfo=KST)
    assert padded[0].interval.end == datetime.combine(day, time(19, 20), tzinfo=KST)


def test_pad_busy_clamps_to_the_same_day() -> None:
    """자정을 넘기지 않는다 — free 계산이 하루 단위라 앞뒤 날로 새면 안 된다."""
    day = date(2026, 7, 30)
    iv = TimeInterval(
        datetime.combine(day, time(23, 50), tzinfo=KST),
        datetime.combine(day, time(23, 59), tzinfo=KST),
    )
    padded = first_plan_adapter.pad_busy([BusyBlock(iv, "scheduled_block", "기존")], 30)
    assert padded[0].interval.end == datetime.combine(day, time(0, 0), tzinfo=KST) + timedelta(
        days=1
    )


def test_pad_busy_noop_when_no_margin() -> None:
    day = date(2026, 7, 30)
    iv = TimeInterval(
        datetime.combine(day, time(18, 0), tzinfo=KST),
        datetime.combine(day, time(19, 0), tzinfo=KST),
    )
    blocks = [BusyBlock(iv, "scheduled_block", "기존")]
    assert first_plan_adapter.pad_busy(blocks, 0) == blocks


def test_committed_minutes_by_day_sums_existing_blocks() -> None:
    day = date(2026, 7, 30)
    busy = {
        day: [
            BusyBlock(
                TimeInterval(
                    datetime.combine(day, time(18, 0), tzinfo=KST),
                    datetime.combine(day, time(19, 30), tzinfo=KST),
                ),
                "scheduled_block",
                "기존",
            ),
            BusyBlock(
                TimeInterval(
                    datetime.combine(day, time(21, 0), tzinfo=KST),
                    datetime.combine(day, time(22, 0), tzinfo=KST),
                ),
                "scheduled_block",
                "기존",
            ),
        ]
    }
    assert first_plan_adapter.committed_minutes_by_day(busy) == {day: 150}
