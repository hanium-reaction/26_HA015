"""주간 forward 재계획 오케스트레이터 단위 테스트 (`orchestrator/replan.py`).

순수 로직만 검증(DB 무관): 다음 주부터 재배치 / 기존 action_id 재사용 / 확정 일정 회피.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta

from reaction_backend.orchestrator.goal_structuring import (
    BusyBlock,
    TimeInterval,
    time_policies_to_busy,
)
from reaction_backend.orchestrator.plan_scheduler import PlanWindow
from reaction_backend.orchestrator.replan import (
    ReplanCandidate,
    ReplanTuning,
    _longest_session_min,
    build_forward_replan,
    day_bounds_kst,
    next_week_start,
)
from reaction_backend.schemas.common import KST

WED = date(2026, 7, 8)  # 수요일
NEXT_MON = date(2026, 7, 13)  # 그 다음 주 월요일

_TUNING = ReplanTuning(
    peak_windows=(PlanWindow(time(12, 0), time(18, 0)),),
    focus_chunk_min=60,
    break_min=10,
    daily_focus_cap_min=180,
)


def _dt(day: date, hh: int, mm: int = 0) -> datetime:
    return datetime.combine(day, time(hh, mm), tzinfo=KST)


def _sleep_busy(days: list[date]) -> list[BusyBlock]:
    """각 날짜에 수면(23:00~08:00) busy — 활동창(08~23)만 free 로 남긴다."""
    policy = type(
        "P",
        (),
        {
            "policy_type": "sleep",
            "payload": {"start_time": "23:00", "end_time": "08:00"},
            "is_active": True,
        },
    )()
    out: list[BusyBlock] = []
    for d in days:
        out.extend(time_policies_to_busy(d, [policy]))
    return out


def _candidate(title: str, minutes: int) -> ReplanCandidate:
    return ReplanCandidate(
        action_id=uuid.uuid4(), title=title, category="study", estimated_minutes=minutes
    )


def test_next_week_start_is_following_monday() -> None:
    assert next_week_start(WED) == NEXT_MON
    assert next_week_start(date(2026, 7, 13)) == date(2026, 7, 20)  # 월요일 → 다음 주 월요일


def test_replans_from_next_week_reusing_action_ids() -> None:
    cands = [_candidate(f"남은 작업{i}", 50) for i in range(3)]
    window_days = [NEXT_MON, date(2026, 7, 14), date(2026, 7, 15)]
    blocks, warnings = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=date(2026, 7, 17),
        candidates=cands,
        committed_busy=_sleep_busy(window_days + [date(2026, 7, 16), date(2026, 7, 17)]),
        tuning=_TUNING,
    )
    assert not warnings
    assert len(blocks) == 3
    # 모든 블록은 다음 주 월요일 이후 + 기존 action_id 를 그대로 재사용.
    src_ids = {c.action_id for c in cands}
    for b in blocks:
        assert b.start.date() >= NEXT_MON
        assert b.action_id in src_ids
    # 피크(오후) 우선 → 첫 블록은 12:00 이후.
    assert min(b.start for b in blocks).time() >= time(12, 0)


def test_avoids_committed_blocks() -> None:
    """이미 시작/확정된 일정(회의 12~17)이 busy 로 들어오면 그 구간을 피해 배치한다."""
    meeting = BusyBlock(
        TimeInterval(_dt(NEXT_MON, 12, 0), _dt(NEXT_MON, 17, 0)), "scheduled_block", "회의"
    )
    busy = [*_sleep_busy([NEXT_MON, date(2026, 7, 14)]), meeting]
    blocks, _ = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=date(2026, 7, 14),
        candidates=[_candidate("남은 작업", 50)],
        committed_busy=busy,
        tuning=_TUNING,
    )
    assert len(blocks) == 1
    iv = blocks[0]
    # 회의(12~17)와 겹치지 않아야 한다.
    assert not (iv.start < _dt(NEXT_MON, 17, 0) and _dt(NEXT_MON, 12, 0) < iv.end)


def test_empty_candidates_yield_no_blocks() -> None:
    blocks, warnings = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=date(2026, 7, 17),
        candidates=[],
        committed_busy=_sleep_busy([NEXT_MON]),
        tuning=_TUNING,
    )
    assert blocks == []
    assert warnings == []


def test_day_bounds_kst_covers_inclusive_range() -> None:
    start_dt, end_dt = day_bounds_kst(NEXT_MON, date(2026, 7, 15))
    assert start_dt == _dt(NEXT_MON, 0, 0)
    assert end_dt == _dt(date(2026, 7, 16), 0, 0)  # 15일 포함 → 16일 00:00 미만


# ─────────── First Plan 과 같은 배선 (ADR-0009 D3) ───────────


def _committed(day: date, from_h: int, to_h: int) -> BusyBlock:
    return BusyBlock(TimeInterval(_dt(day, from_h), _dt(day, to_h)), "scheduled_block", "확정 일정")


def test_replan_counts_committed_minutes_toward_the_daily_cap() -> None:
    """이미 확정된 집중 시간이 하루 상한에 포함된다 (#190 를 재계획에도).

    예전 재계획은 `committed_min_by_day` 를 안 넘겨 상한이 매번 0에서 시작했다. 그래서
    오전에 3시간을 이미 확정한 날에 상한(180분)만큼 또 얹어, 그 날 총량이 상한의 두 배가 됐다.
    """
    days = [NEXT_MON + timedelta(days=i) for i in range(7)]
    busy = [*_sleep_busy(days), _committed(NEXT_MON, 8, 11)]  # 월요일 오전 3시간 확정

    blocks, _ = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=NEXT_MON + timedelta(days=6),
        candidates=[_candidate("남은 일", 120)],
        committed_busy=busy,
        tuning=_TUNING,
    )

    assert blocks
    # 확정 180분 + 120분 = 300분 > 상한 180분 → 월요일은 1차 배치에서 건너뛴다.
    assert blocks[0].start.date() != NEXT_MON, (
        f"이미 3시간 확정된 날에 또 얹었다 — {blocks[0].start}"
    )


def test_replan_keeps_a_break_from_committed_blocks() -> None:
    """1차 배치는 확정 블록에 0분 간격으로 딱 붙지 않는다 (#191 를 재계획에도)."""
    days = [NEXT_MON + timedelta(days=i) for i in range(7)]
    committed = _committed(NEXT_MON, 12, 13)  # 피크(12~18) 선두를 한 시간 차지
    blocks, _ = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=NEXT_MON + timedelta(days=6),
        candidates=[_candidate("남은 일", 60)],
        committed_busy=[*_sleep_busy(days), committed],
        tuning=_TUNING,
    )

    assert blocks
    same_day = [b for b in blocks if b.start.date() == NEXT_MON]
    assert same_day, "월요일 피크에 자리가 남았는데 배치되지 않았다"
    # 13:00 에 딱 붙지 않고 break_min(10분) 뒤인 13:10 이후에 시작한다.
    assert same_day[0].start >= _dt(NEXT_MON, 13, 10), (
        f"확정 블록 종료(13:00)에 딱 붙었다 — {same_day[0].start}"
    )


def test_replan_daily_cap_rises_to_fit_the_longest_candidate() -> None:
    """후보 하나가 하루 상한보다 길어도 1차 배치가 그날을 통째로 거르지 않는다.

    상한(180분)보다 긴 240분 후보가 있으면, 상한 검사(`used>0 and used+240>180`)가 이미
    뭔가 잡힌 모든 날에서 탈락해 케이던스가 무너진다 — First Plan 의 `daily_cap_for_plan`
    과 같은 이유로 후보 최장 길이까지 상한을 올린다.

    집중 용량이 240분인 사용자의 실제 재계획 튜닝을 쓴다(`_replan_tuning_for` 는
    `focus_chunk_min` 을 그 용량으로 잡는다) — 청크가 60분이면 240분 후보가 먼저 4조각으로
    쪼개져 상한 검사에 걸릴 일이 아예 없다.
    """
    tuning = ReplanTuning(
        peak_windows=_TUNING.peak_windows,
        focus_chunk_min=240,  # 집중 용량 240분 사용자 → 분할 없음
        break_min=_TUNING.break_min,
        daily_focus_cap_min=180,  # density standard 프리셋
    )
    days = [NEXT_MON + timedelta(days=i) for i in range(7)]
    blocks, warnings = build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=NEXT_MON + timedelta(days=6),
        candidates=[_candidate("짧은 작업", 30), _candidate("긴 작업", 240)],
        committed_busy=_sleep_busy(days),
        tuning=tuning,
    )

    assert not warnings
    assert len(blocks) == 2  # 240분이 통째로 배치된다(분할 없음)
    assert max(int((b.end - b.start).total_seconds() // 60) for b in blocks) == 240


def test_longest_session_min_measures_sessions_not_cards() -> None:
    """상한을 올릴 기준은 쪼개기 **뒤** 세션 길이다 (#adr9-hotfix).

    스케줄러가 배치하는 단위는 카드가 아니라 `_split_minutes` 로 쪼갠 세션이라,
    `focus_chunk_min` 보다 긴 카드는 어차피 나뉜다. 카드 길이로 올리면 필요 없는 여유가
    생겨 그 날 총량이 프리셋을 넘는다(감사 실측: 하루 180분 상한에 240분이 쌓임).
    """
    assert _longest_session_min([], _TUNING) == 0
    assert _longest_session_min([_candidate("짧은", 30)], _TUNING) == 30
    # chunk(60)보다 긴 카드는 60짜리 세션들로 쪼개진다 → 상한을 240 까지 올릴 이유가 없다.
    assert _longest_session_min([_candidate("긴 것", 240)], _TUNING) == 60
    assert _longest_session_min([_candidate("짧은", 30), _candidate("긴 것", 240)], _TUNING) == 60
    # 집중 용량이 240 인 사용자(=chunk 240)는 안 쪼개지므로 그대로 올린다.
    roomy = ReplanTuning(
        peak_windows=_TUNING.peak_windows,
        focus_chunk_min=240,
        break_min=_TUNING.break_min,
        daily_focus_cap_min=180,
    )
    assert _longest_session_min([_candidate("긴 것", 240)], roomy) == 240


def test_replan_passes_the_session_based_cap_to_the_scheduler(monkeypatch) -> None:  # noqa: ANN001
    """`build_forward_replan` 이 스케줄러에 넘기는 하루 상한을 **값으로** 고정한다.

    배치 결과만 보면 stride 분산 때문에 상한이 안 걸리는 조합이 흔해, 상한이 부풀어도
    테스트가 통과한다(실제로 그런 버전을 한 번 썼다가 뮤테이션 검사에서 걸렀다).
    그래서 스케줄러 호출 인자를 직접 가로채 확인한다.
    """
    from reaction_backend.orchestrator import replan as replan_mod

    seen: dict[str, int] = {}

    def _spy(**kwargs):  # noqa: ANN003
        seen["cap"] = kwargs["daily_focus_cap_min"]
        return [], []

    monkeypatch.setattr(replan_mod, "schedule_actions_multiday", _spy)

    build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=NEXT_MON + timedelta(days=6),
        candidates=[_candidate("짧은", 60), _candidate("긴 것", 240)],
        committed_busy=[],
        tuning=_TUNING,  # chunk=60, cap=180
    )
    assert seen["cap"] == 180, (
        f"240분 카드는 4×60 세션으로 쪼개지므로 상한을 올릴 이유가 없다 — 실제 {seen['cap']}분"
    )

    roomy = ReplanTuning(
        peak_windows=_TUNING.peak_windows,
        focus_chunk_min=240,
        break_min=_TUNING.break_min,
        daily_focus_cap_min=180,
    )
    build_forward_replan(
        window_start=NEXT_MON,
        horizon_day=NEXT_MON + timedelta(days=6),
        candidates=[_candidate("긴 것", 240)],
        committed_busy=[],
        tuning=roomy,
    )
    assert seen["cap"] == 240, "안 쪼개지는 240분 세션은 상한을 그만큼 올려야 한다"
