"""주간 forward 재계획 — 남은 작업을 이후 구간에 다시 배치 (룰 only, LLM 0회).

배경:
    First Plan 은 `scope=horizon` 으로 배치하되 **한 번에 최대 4주(≈한 달)** 까지만 잡는다
    (`first_plan_adapter._MAX_PLAN_WEEKS`) — 그보다 먼 구간은 주간 재계획이 이어받는 전제다.
    한 주가 지나면 그동안의 실행 결과(주간 리포트)를 바탕으로 **남은 작업을 이후로 다시
    배치**해야 한다. 이 모듈은
    그 재배치의 **순수 로직**만 담는다 — DB 조회/영속화는 라우터가 맡고, 여기서는 이미 모인
    후보·회피 busy 를 받아 `plan_scheduler.schedule_actions_multiday` 로 재배치한다.

설계 결정(합의):
    - 시작점: 다음 주 월요일(이번 주는 보존, 주간 리듬).
    - 대상: 창(window) 안 **미착수 블록의 액션** + 활성 블록 없는 **planned 백로그**(수락한 회복 포함).
      과거·시작/완료된 것은 불변. 실패 원본은 미래 블록이 없어 자동 제외(회복 수락분만 재편입).
    - 중복 0: 기존 goal/node/action **재사용**, 미래 미착수 블록만 취소→교체(라우터 승인 단계).

AGENTS.md 준수:
    - §1: 산출물은 Draft. 자동 적용 금지. 원본 action_item.status 불변.
    - §2: LLM SDK 직접 import 없음.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from reaction_backend.orchestrator.goal_structuring import BusyBlock, TimeInterval, pad_busy
from reaction_backend.orchestrator.plan_scheduler import (
    PlanAction,
    PlanWindow,
    schedule_actions_multiday,
)
from reaction_backend.schemas.common import KST

__all__ = [
    "ReplanCandidate",
    "ReplanTuning",
    "ReplannedBlock",
    "build_forward_replan",
    "committed_busy_from_blocks",
    "day_bounds_kst",
    "next_week_start",
]


# `committed_busy_from_blocks` 가 확정 블록에 다는 표시 — 수면·점심·수업(다른 source)과
# 구분해 하루 상한·휴식 여백의 대상을 가른다.
_COMMITTED_BLOCK_SOURCE = "scheduled_block"


@dataclass(frozen=True, slots=True)
class ReplanCandidate:
    """재배치 단위 — 기존 ActionItem 의 투영(새로 만들지 않음)."""

    action_id: uuid.UUID
    title: str
    category: str
    estimated_minutes: int


@dataclass(frozen=True, slots=True)
class ReplanTuning:
    """스케줄러 튜닝(피크·세션·휴식·하루 상한) — outcome/기본값에서 라우터가 조립."""

    peak_windows: Sequence[PlanWindow]
    focus_chunk_min: int
    break_min: int
    daily_focus_cap_min: int


@dataclass(frozen=True, slots=True)
class ReplannedBlock:
    """재배치 결과 블록 — 기존 action 에 연결(origin_id=action_id)."""

    action_id: uuid.UUID
    title: str
    category: str
    start: datetime
    end: datetime


def next_week_start(today: date) -> date:
    """today 다음 주 월요일 (이번 주는 보존)."""
    return today + timedelta(days=(7 - today.weekday()))


def build_forward_replan(
    *,
    window_start: date,
    horizon_day: date,
    candidates: Sequence[ReplanCandidate],
    committed_busy: Sequence[BusyBlock],
    tuning: ReplanTuning,
) -> tuple[list[ReplannedBlock], list[str]]:
    """후보를 [window_start, horizon_day] 에 재배치.

    committed_busy 는 창 안의 시작/완료 블록 + 시간정책(수면/노터치) + 고정 일정을 합친
    회피 대상. (날짜별로 나눠 스케줄러 busy 콜백에 넘긴다.)

    First Plan 과 **같은 세 가지 배선**을 쓴다 (ADR-0009 D3). 예전엔 셋 다 빠져 있어서,
    첫 계획에서 지킨 것들이 매주 재계획 때 리셋됐다.

    1. `committed_min_by_day` — 그 날 **이미 확정된 집중 시간**에서 하루 상한을 이어 센다
       (#190). 빠지면 상한이 매번 0에서 시작해, 오전에 2시간 완료한 날에 상한만큼 또 얹는다.
    2. `roomy_busy_for_day` — 1차 배치는 확정 블록 앞뒤로 휴식 여백을 둔 뷰에서 고른다
       (#191). 빠지면 재배치가 진행 중인 일정에 0분 간격으로 딱 붙는다.
    3. `daily_focus_cap_min` — 후보 중 **최장 세션**보다 작지 않게 올린다. 빠지면 긴 카드가
       1차에서 전부 탈락해 상한을 무시하는 2차로 넘어간다.

    셋 다 회피 대상 중 **확정 블록(`scheduled_block`)만** 대상으로 한다 — 수면·점심·수업은
    '쉴 수 없는 시간'이지 집중 작업이 아니라, 상한에 넣으면 하루가 통째로 소진되고
    여백을 덧대면 기상 직후·수업 직후 시간이 날아간다.
    """
    busy_by_day: dict[date, list[BusyBlock]] = {}
    for b in committed_busy:
        busy_by_day.setdefault(b.interval.start.date(), []).append(b)

    committed_blocks_by_day: dict[date, list[BusyBlock]] = {
        day: [b for b in same_day if b.source == _COMMITTED_BLOCK_SOURCE]
        for day, same_day in busy_by_day.items()
    }
    committed_min_by_day: dict[date, int] = {}
    for day, committed_here in committed_blocks_by_day.items():
        total = sum(max(0, int(b.interval.duration_minutes)) for b in committed_here)
        if total:
            committed_min_by_day[day] = total

    def roomy_busy_for_day(day: date) -> list[BusyBlock]:
        same_day = busy_by_day.get(day, [])
        others = [b for b in same_day if b.source != _COMMITTED_BLOCK_SOURCE]
        padded = pad_busy(committed_blocks_by_day.get(day, []), tuning.break_min)
        return [*others, *padded]

    actions = [
        PlanAction(
            id=c.action_id,
            node_id="",
            title=c.title,
            category=c.category,
            estimated_minutes=c.estimated_minutes,
        )
        for c in candidates
    ]
    by_id = {c.action_id: c for c in candidates}

    placed, warnings = schedule_actions_multiday(
        start_day=window_start,
        horizon_day=horizon_day,
        actions=actions,
        busy_for_day=lambda day: busy_by_day.get(day, []),
        peak_windows=tuning.peak_windows,
        focus_chunk_min=tuning.focus_chunk_min,
        break_min=tuning.break_min,
        daily_focus_cap_min=max(
            tuning.daily_focus_cap_min,
            max((c.estimated_minutes for c in candidates), default=0),
        ),
        committed_min_by_day=committed_min_by_day,
        roomy_busy_for_day=roomy_busy_for_day,
    )

    blocks: list[ReplannedBlock] = []
    for pb in placed:
        cand = by_id.get(pb.origin_id) if pb.origin_id is not None else None
        if cand is None:
            continue
        blocks.append(
            ReplannedBlock(
                action_id=cand.action_id,
                title=pb.title,
                category=pb.category,
                start=pb.interval.start,
                end=pb.interval.end,
            )
        )
    return blocks, warnings


def committed_busy_from_blocks(
    intervals: Sequence[tuple[datetime, datetime]],
) -> list[BusyBlock]:
    """(start,end) 쌍들을 회피용 BusyBlock 으로 — 라우터가 committed 블록 시각을 넘긴다."""
    out: list[BusyBlock] = []
    for start, end in intervals:
        s = start.astimezone(KST)
        e = end.astimezone(KST)
        if e > s:
            out.append(BusyBlock(TimeInterval(s, e), "scheduled_block", "확정 일정"))
    return out


def day_bounds_kst(start_day: date, end_day: date) -> tuple[datetime, datetime]:
    """[start_day 00:00, (end_day+1) 00:00) KST — 재계획 창의 조회/취소 경계."""
    start_dt = datetime.combine(start_day, time(0, 0), tzinfo=KST)
    end_dt = datetime.combine(end_day + timedelta(days=1), time(0, 0), tzinfo=KST)
    return start_dt, end_dt
