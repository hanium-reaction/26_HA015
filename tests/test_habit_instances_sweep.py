"""habit_instances 주간 생성 cron (#22).

이 sweep 이 없을 때 실제로 깨져 있던 것 두 가지를 **위반 입력으로** 고정한다:

1. 등록 다음 주부터 `GET /today/agenda` 의 습관 섹션이 빈다 (소비자가 `week_start` 등가
   비교라 그 주 행이 없으면 조회가 0건).
2. S22 빈도 재설계(§1.4 잠금)가 **연속 3주** 인스턴스를 요구하는데 생성 주 1행뿐이라
   `evaluate_penalty` 가 영영 `None` 이었다.

둘 다 "sweep 을 지우면 빨개지는" 방향으로 쓴다 — 존재만 확인하는 테스트는 이 레포에서
여러 번 뮤턴트를 놓쳤다.
"""

from __future__ import annotations

from datetime import date, timedelta
from uuid import uuid4

import pytest

from reaction_backend.db.models.habit import Habit
from reaction_backend.db.models.user import User
from reaction_backend.orchestrator.habit_penalty import evaluate_penalty
from reaction_backend.scheduler import habit_instances
from tests.conftest import (
    FakeHabitInstanceRepo,
    FakeHabitRepo,
    FakeUserRepo,
    _FakeSession,
)

WEEK1 = date(2026, 8, 3)  # 월요일
WEEK2 = WEEK1 + timedelta(days=7)
WEEK3 = WEEK1 + timedelta(days=14)


def _user(*, state: str = "ACTIVE", anonymized: bool = False) -> User:
    u = User()
    u.id = uuid4()
    u.email = f"{u.id}@reaction.local"
    u.name = "tester"
    u.timezone = "Asia/Seoul"
    u.onboarding_state = state
    u.is_anonymized = anonymized
    u.tone_mode = "gentle"
    u.archived_at = None
    return u


def _habit(
    user_id: object,
    *,
    frequency: int = 3,
    target: int | None = None,
    archived: bool = False,
) -> Habit:
    """target 을 frequency 와 **다르게** 줄 수 있어야 어느 컬럼을 읽는지 고정할 수 있다."""
    h = Habit()
    h.id = uuid4()
    h.user_id = user_id
    h.title = "운동"
    h.category = "health"
    h.frequency_per_week = frequency
    h.target_count = frequency if target is None else target
    h.minutes_per_session = 30
    h.time_preference = "evening"
    h.priority_level = 1
    h.archived_at = date(2026, 1, 1) if archived else None
    h.consecutive_miss_weeks = 0
    h.last_penalty_evaluated_at = None
    h.last_penalty_decision = None
    return h


async def _sweep(
    week_start: date,
    *,
    user_repo: FakeUserRepo,
    habit_repo: FakeHabitRepo,
    instance_repo: FakeHabitInstanceRepo,
    session: _FakeSession | None = None,
) -> habit_instances.HabitSweepResult:
    return await habit_instances.run_habit_instances_sweep(
        week_start,
        user_repo=user_repo,
        habit_repo=habit_repo,
        instance_repo=instance_repo,
        session=session or _FakeSession(),
    )


# ── 순회 범위 ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_creates_one_instance_per_active_habit_of_active_users() -> None:
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    active, welcome, anon = _user(), _user(state="WELCOME"), _user(anonymized=True)
    for u in (active, welcome, anon):
        user_repo.register(u)
    habit_repo.seed(_habit(active.id))
    habit_repo.seed(_habit(active.id))
    habit_repo.seed(_habit(active.id, archived=True))  # soft delete 된 습관은 제외
    habit_repo.seed(_habit(welcome.id))  # 비활성 사용자 습관은 제외

    result = await _sweep(
        WEEK1, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo
    )

    assert result.total == 1  # WELCOME·익명화 제외
    assert result.ok == 1
    assert result.failed == 0
    assert result.created == 2  # archived 습관은 안 만든다
    assert len(await inst_repo.list_for_user_week(active.id, WEEK1)) == 2


@pytest.mark.asyncio
async def test_empty_active_users() -> None:
    result = await _sweep(
        WEEK1,
        user_repo=FakeUserRepo(),
        habit_repo=FakeHabitRepo(),
        instance_repo=FakeHabitInstanceRepo(),
    )
    assert result == habit_instances.HabitSweepResult(total=0, ok=0, failed=0, created=0)


# ── 이 cron 이 존재하는 이유 (회귀) ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_next_week_agenda_is_not_empty() -> None:
    """등록 주 다음 주에도 습관이 오늘 화면에 남는다.

    회귀: 생성자가 `POST /habits` 하나뿐이던 시절 WEEK2 조회는 **항상 빈 배열**이었다
    (`GET /today/agenda` → `list_for_user_week(user, current_week_start_kst())` 등가 비교).
    사용자 관점에서는 "등록 다음 주 월요일에 습관 트랙이 통째로 사라짐".
    """
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    user = _user()
    user_repo.register(user)
    habit = _habit(user.id)
    habit_repo.seed(habit)
    inst_repo.seed_instance(habit.id, WEEK1, done=3, target=3)  # 등록 주 = 라우터가 만든 행

    assert await inst_repo.list_for_user_week(user.id, WEEK2) == []  # sweep 전: 비어 있다

    await _sweep(WEEK2, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo)

    week2 = await inst_repo.list_for_user_week(user.id, WEEK2)
    assert len(week2) == 1
    assert week2[0].done_count == 0  # 새 주는 0부터
    assert week2[0].target_count == 3


@pytest.mark.asyncio
async def test_three_weekly_sweeps_unlock_s22_penalty() -> None:
    """§1.4 잠금 "3주 연속 미달 → 빈도 재설계" 가 실제로 발화할 수 있게 된다.

    `evaluate_penalty` 는 **연속 3주** 인스턴스를 요구한다. 생성 주 1행뿐이던 동안에는
    `len < 3` 에서 즉시 None — 판정 로직·`apply_penalty`·`/reviews/habit-penalty` 가 전부
    구현돼 있는데 먹일 데이터가 없어 한 번도 돌지 못했다.
    """
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    user = _user()
    user_repo.register(user)
    habit = _habit(user.id, frequency=3)
    habit_repo.seed(habit)

    # 1주만으로는 판정 불가 — 이게 고치기 전의 상태다.
    await _sweep(WEEK1, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo)
    only_one = await inst_repo.list_recent_for_habit(habit.id, WEEK1, limit=3)
    assert evaluate_penalty(only_one, habit.frequency_per_week) is None

    for week in (WEEK2, WEEK3):
        await _sweep(week, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo)

    recent = await inst_repo.list_recent_for_habit(habit.id, WEEK3, limit=3)
    assert [i.week_start for i in recent] == [WEEK3, WEEK2, WEEK1]  # 연속 3주, 최신순

    verdict = evaluate_penalty(recent, habit.frequency_per_week)
    assert verdict is not None, "3주치가 쌓였는데도 S22 가 발화하지 않는다"
    assert verdict.suggested_frequency < habit.frequency_per_week


# ── 멱등 · 값 선택 ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_rerun_creates_nothing_and_never_overwrites_progress() -> None:
    """같은 주 재실행은 1행 유지 + `done_count` 보존.

    cron 은 다회 실행 안전해야 한다(AGENTS §2). 여기서 덮어쓰면 그 주에 쌓인 체크가
    자정마다 0 으로 리셋된다 — 조용히 진행도를 지우는 최악의 실패다.
    """
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    user = _user()
    user_repo.register(user)
    habit = _habit(user.id)
    habit_repo.seed(habit)

    first = await _sweep(WEEK1, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo)
    assert first.created == 1

    instance = await inst_repo.get_for_week(habit.id, WEEK1)
    assert instance is not None
    await inst_repo.increment_done(instance)
    await inst_repo.increment_done(instance)

    second = await _sweep(
        WEEK1, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo
    )

    assert second.created == 0, "재실행이 행을 또 만들었다"
    assert len(await inst_repo.list_for_user_week(user.id, WEEK1)) == 1
    again = await inst_repo.get_for_week(habit.id, WEEK1)
    assert again is not None
    assert again.done_count == 2, "재실행이 그 주에 쌓인 체크를 지웠다"


@pytest.mark.asyncio
async def test_uses_habit_target_count_not_frequency_per_week() -> None:
    """`target_count` 를 읽는다 — S22 `apply_penalty` 가 재설계 결과를 쓰는 자리.

    프로덕션에서는 두 컬럼이 항상 같이 갱신돼 값이 같다. 그래서 `frequency_per_week` 로
    바꿔 써도 아무 테스트가 안 깨진다 — 여기서만 갈라 놓고 고정한다. 이게 어긋나면
    "주 3회로 낮췄는데 다음 주에 또 5회 목표"가 된다.
    """
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    user = _user()
    user_repo.register(user)
    habit = _habit(user.id, frequency=5, target=2)  # 페널티로 낮춰진 상태를 흉내
    habit_repo.seed(habit)

    await _sweep(WEEK1, user_repo=user_repo, habit_repo=habit_repo, instance_repo=inst_repo)

    instance = await inst_repo.get_for_week(habit.id, WEEK1)
    assert instance is not None
    assert instance.target_count == 2, "frequency_per_week(5) 를 읽고 있다 — 재설계가 무시된다"


# ── 트랜잭션 규약 (notify_sweeps 와 동일) ────────────────────────────────────


@pytest.mark.asyncio
async def test_one_user_failure_is_isolated_and_rolled_back(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """한 사용자 실패가 배치를 멈추지 않고, 세션을 aborted 로 남기지 않는다.

    rollback 이 없으면 DB 예외로 aborted 된 세션이 뒤따르는 사용자를 전부
    `PendingRollbackError` 로 죽여 실패 격리가 허상이 된다 (notify_sweeps 모듈 docstring).
    """
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    good, bad = _user(), _user()
    user_repo.register(good)
    user_repo.register(bad)
    habit_repo.seed(_habit(good.id))
    habit_repo.seed(_habit(bad.id))
    session = _FakeSession()

    original = habit_repo.list_active

    async def _flaky(user_id: object) -> list[Habit]:
        if user_id == bad.id:
            raise RuntimeError("boom")
        return await original(user_id)  # type: ignore[arg-type]

    monkeypatch.setattr(habit_repo, "list_active", _flaky)

    result = await _sweep(
        WEEK1,
        user_repo=user_repo,
        habit_repo=habit_repo,
        instance_repo=inst_repo,
        session=session,
    )

    assert result.total == 2
    assert result.ok == 1  # 실패한 사용자 하나만 건너뛴다
    assert result.failed == 1
    assert result.created == 1
    assert session.rollback_count == 1, "실패 사용자에서 rollback 하지 않았다"
    assert session.commit_count == 1, "성공한 사용자만 commit 돼야 한다"


@pytest.mark.asyncio
async def test_commit_is_per_user() -> None:
    """사용자 단위 commit — 배치 말미 일괄 commit 이면 한 명 실패로 그 주 전원을 잃는다."""
    user_repo, habit_repo, inst_repo = FakeUserRepo(), FakeHabitRepo(), FakeHabitInstanceRepo()
    for _ in range(3):
        u = _user()
        user_repo.register(u)
        habit_repo.seed(_habit(u.id))
    session = _FakeSession()

    await _sweep(
        WEEK1,
        user_repo=user_repo,
        habit_repo=habit_repo,
        instance_repo=inst_repo,
        session=session,
    )

    assert session.commit_count == 3


# ── 런타임 배선 ──────────────────────────────────────────────────────────────


def test_build_scheduler_wires_habit_instances_daily_at_0005() -> None:
    """매일 00:05 KST 에 **habit_instances job 을** 부른다.

    id 집합만 보는 테스트는 함수 바꿔치기·시각 변경을 못 잡는다 (expire_reflections 에서
    실증된 회귀 패턴). '매주 월요일'이 아니라 '매일'인 이유는 `scheduler/README.md` 참고 —
    주 1회 트리거는 재기동 한 번에 그 주 전체를 잃는다.
    """
    from reaction_backend.scheduler import runtime

    job = next(j for j in runtime.build_scheduler().get_jobs() if j.id == "habit_instances")

    assert job.func is runtime._habit_instances_job
    fields = {f.name: str(f) for f in job.trigger.fields}
    assert fields["day_of_week"] == "*", f"주 1회로 좁히면 재기동 시 그 주를 잃는다: {fields}"
    assert fields["hour"] == "0", f"생성 시각이 00시가 아니다: {fields}"
    assert fields["minute"] == "5", f"생성 분이 05분이 아니다: {fields}"
    assert str(job.trigger.timezone) == "Asia/Seoul"
    assert job.misfire_grace_time == 3600


@pytest.mark.asyncio
async def test_runtime_job_uses_the_same_week_helper_as_agenda(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """job 이 주 경계를 직접 계산하지 않고 `current_week_start_kst()` 를 쓴다.

    `GET /today/agenda` 가 읽는 주와 cron 이 쓰는 주가 **같은 함수**여야 한다. 각자 재면
    어긋난 주에 행이 생겨 습관이 안 보이고, 그건 이 cron 이 없던 것과 증상이 같다.
    """
    from reaction_backend.scheduler import runtime

    sentinel = date(2026, 8, 3)
    captured: dict[str, date] = {}

    async def _fake_scope():  # noqa: ANN202
        yield _FakeSession()

    async def _spy(week_start: date, **_: object) -> habit_instances.HabitSweepResult:
        captured["week_start"] = week_start
        return habit_instances.HabitSweepResult(total=0, ok=0, failed=0, created=0)

    monkeypatch.setattr(runtime, "_session_scope", _fake_scope)
    monkeypatch.setattr(runtime, "current_week_start_kst", lambda: sentinel)
    monkeypatch.setattr(runtime.habit_instances, "run_habit_instances_sweep", _spy)

    await runtime._habit_instances_job()

    assert captured["week_start"] == sentinel
