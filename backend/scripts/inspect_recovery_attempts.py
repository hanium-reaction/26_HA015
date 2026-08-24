"""회복 카드 1장 단위 상세 조회 — 도그푸딩 점검용 (읽기 전용).

`report_recovery_followthrough.py`(수락률 vs 완주율 **집계**)와
`report_llm_run_metrics.py`(LLM 지연·fallback **집계**)로는 답이 안 나오는 세 가지를 본다:

1. **어떤 전략이 뽑혔나** — 신설 4종(#257 `TIMEBOX_REBUDGET`/`BUFFER_INSERT`/
   `SELF_FORGIVENESS_NANO`/`GOAL_RECHECK`)에 실제로 도달했는가. 룰 엔진 커버리지
   (L1-3)는 카탈로그 전수 카운트로 이미 고정돼 있지만, **실사용 태그에서 뽑히는지**는
   별개 질문이다.
2. **나머지 카드는 어떻게 됐나** — 집계는 "수락 1건"만 말하고 나머지가 거절인지
   건너뛰기인지 아직 미결정인지 구분하지 않는다. `rejected`/`skipped`/`pending` 은
   에스컬레이션(근거 대장 §5.1)의 `recovery_rejected_streak` 에서 서로 다르게 취급된다.
3. **회복 블록이 언제로 잡혔나** — 여기가 이 스크립트를 만든 이유다. 아래 참조.

**과거 배치 검출 (핵심)**: `orchestrator/recovery.py::shift_to_recovery_day` 는 회복
블록이 이미 지난 시각에 놓이는 걸 `now + RECOVERY_MIN_LEAD_MINUTES` 로 보정하는데,
**두 조건을 모두** 만족할 때만 보정한다 — (1) 같은 날 안 (2) 그 날 23시 전 종료. 21시
일괄 회고(AGENTS.md §1 의 상정 경로)에서는 둘 다 성립하지만, **23시 이후나 자정을
넘겨 회고하면 둘 다 깨진다**:

- 23:30 결정 → `ends_before_night` 위반(보정 시각이 23시를 넘김)
- 00:30 결정 → `same_day` 위반(보정 기준일이 원본 카드 날짜와 다름)

어느 쪽이든 보정이 안 걸려 블록이 **원본 실패 시각(과거)** 에 그대로 놓인다. 과거
블록은 `pre_card` 스윕 창(`[now+2m, now+7m)`)을 영영 못 만나 **알림이 안 가고**, 주간
그리드에서 실패한 원본과 같은 좌표에 겹쳐 그려진다. 집계 리포트에는 "완주 0건"으로만
보여서 원인이 안 드러난다 — 그래서 여기서 블록 시각을 결정 시각과 직접 비교한다.

**개인정보**: 카드 문구(`suggested_action_text`)는 사용자 콘텐츠다. Actions 로그에
전문을 남기지 않도록 **앞 60자만** 출력한다 — "템플릿 그대로인가 개인화됐는가"를
확인하는 데는 그걸로 충분하고, 그 이상은 이 스크립트의 목적이 아니다.

**아무것도 쓰지 않는다** — SELECT 뿐. `--apply` 같은 옵션 자체가 없다
(선례: `report_recovery_followthrough.py`).

이름이 `report_`(집계)도 `preview_`(cron 드라이런)도 아닌 이유: 이건 지표도 아니고
곧 있을 쓰기의 예고도 아니라, 행 단위로 들여다보는 **점검 도구**다.

실행 (라이브 EC2 self-hosted runner 에서 workflow_dispatch 로):
  uv run python -m scripts.inspect_recovery_attempts
"""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import TYPE_CHECKING, NamedTuple
from uuid import UUID

from sqlalchemy import select

from reaction_backend.db.models.action_item import ActionItem
from reaction_backend.db.models.execution_event import ExecutionEvent
from reaction_backend.db.models.execution_failure_tag import ExecutionFailureTag
from reaction_backend.db.models.recovery_attempt import RecoveryAttempt
from reaction_backend.db.models.recovery_strategy_catalog import RecoveryStrategyCatalog
from reaction_backend.db.models.scheduled_block import ScheduledBlock
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.schemas.common import now_kst, to_kst

if TYPE_CHECKING:
    from datetime import date, datetime

    from sqlalchemy.ext.asyncio import AsyncSession

# #257 로 신설된 전략 — "실사용 태그에서 실제로 뽑히는가"가 이 스크립트의 질문 1.
# 출처: alembic/versions/8680c4567ca6_seed_recovery_strategy_gap_fill.py
NEW_STRATEGY_TYPES = (
    "TIMEBOX_REBUDGET",
    "BUFFER_INSERT",
    "SELF_FORGIVENESS_NANO",
    "GOAL_RECHECK",
)

# 회복으로 만들어진 블록만 본다 — 원본 실패 블록과 구분하는 유일한 키.
# 출처: api/routes/recovery.py::approve_replan (source="recovery").
_RECOVERY_BLOCK_SOURCE = "recovery"

# 카드 문구 출력 상한 (모듈 docstring "개인정보" 참조).
TEXT_PREVIEW_CHARS = 60


def preview_text(text: str | None, limit: int = TEXT_PREVIEW_CHARS) -> str:
    """카드 문구를 앞 `limit` 자까지만 — 잘렸으면 말줄임표를 붙인다."""
    if not text:
        return "(없음)"
    flat = " ".join(text.split())
    return flat if len(flat) <= limit else flat[:limit] + "…"


def is_stale_placement(block_start_at: datetime | None, decided_at: datetime | None) -> bool:
    """회복 블록이 **결정 시각보다 과거**에 놓였는가 — 알림이 영영 안 가는 배치.

    경계(`==`)는 과거가 아니다. 여기서 잡으려는 건 `shift_to_recovery_day` 의 보정이
    **안 걸린** 경우이고, 그 경우 블록은 원본 실패 시각이라 결정 시각보다 **확실히**
    앞선다 — 같은 시각이면 그 상황이 아니다.

    둘 중 하나라도 없으면 판정하지 않는다(False) — 블록이 아직 없는 건(= replan 미승인)
    '잘못 놓였다'와 다른 상태이고, 그건 호출부가 따로 표시한다.
    """
    if block_start_at is None or decided_at is None:
        return False
    return block_start_at < decided_at


def new_strategies_reached(strategy_types: list[str]) -> list[str]:
    """뽑힌 전략 중 #257 신설 4종에 해당하는 것 — 카탈로그 정의 순서를 유지한다."""
    seen = set(strategy_types)
    return [s for s in NEW_STRATEGY_TYPES if s in seen]


class AttemptDetail(NamedTuple):
    """회복 카드 1장 + 그 카드가 만들어 낸 것들 (표시에 필요한 것만)."""

    attempt_id: UUID
    option_group: str
    strategy_type: str
    trigger_tag: str | None
    user_decision: str
    suggested_action_text: str | None
    llm_fallback_used: bool
    prompt_version: str | None
    first_viewed_at: datetime | None
    recovery_decided_at: datetime | None
    resulting_action_item_id: UUID | None


class ExecutionDetail(NamedTuple):
    """실패한 실행 1건 + 그 실행에 달린 회복 카드 전부."""

    execution_id: UUID
    completion_status: str
    plan_start_at: datetime
    original_title: str
    failure_tags: list[str]
    attempts: list[AttemptDetail]


async def _fetch_execution_details(session: AsyncSession) -> list[ExecutionDetail]:
    """회복 카드가 하나라도 달린 실행 전부 — 최신 실행이 먼저."""
    attempt_stmt = select(
        RecoveryAttempt.execution_id,
        RecoveryAttempt.id,
        RecoveryAttempt.recovery_option_group,
        RecoveryAttempt.recovery_strategy_type,
        RecoveryAttempt.trigger_tag,
        RecoveryAttempt.user_decision,
        RecoveryAttempt.suggested_action_text,
        RecoveryAttempt.llm_fallback_used,
        RecoveryAttempt.prompt_version,
        RecoveryAttempt.first_viewed_at,
        RecoveryAttempt.recovery_decided_at,
        RecoveryAttempt.resulting_action_item_id,
    ).order_by(RecoveryAttempt.created_at)

    by_execution: dict[UUID, list[AttemptDetail]] = defaultdict(list)
    for row in (await session.execute(attempt_stmt)).all():
        by_execution[row[0]].append(AttemptDetail(*row[1:]))
    if not by_execution:
        return []

    exec_stmt = (
        select(
            ExecutionEvent.id,
            ExecutionEvent.completion_status,
            ExecutionEvent.plan_start_at,
            ActionItem.title,
        )
        .join(ActionItem, ActionItem.id == ExecutionEvent.action_item_id)
        .where(ExecutionEvent.id.in_(by_execution.keys()))
        .order_by(ExecutionEvent.plan_start_at.desc())
    )
    tag_stmt = select(ExecutionFailureTag.execution_id, ExecutionFailureTag.tag_code).where(
        ExecutionFailureTag.execution_id.in_(by_execution.keys())
    )
    tags: dict[UUID, list[str]] = defaultdict(list)
    for execution_id, tag_code in (await session.execute(tag_stmt)).all():
        tags[execution_id].append(tag_code)

    return [
        ExecutionDetail(
            execution_id=execution_id,
            completion_status=completion_status,
            plan_start_at=plan_start_at,
            original_title=title,
            failure_tags=tags.get(execution_id, []),
            attempts=by_execution[execution_id],
        )
        for execution_id, completion_status, plan_start_at, title in (
            await session.execute(exec_stmt)
        ).all()
    ]


async def _fetch_derived_actions(
    session: AsyncSession, action_ids: set[UUID]
) -> dict[UUID, tuple[str, date, str]]:
    """파생 action_item id → (제목, target_date, status)."""
    if not action_ids:
        return {}
    stmt = select(ActionItem.id, ActionItem.title, ActionItem.target_date, ActionItem.status).where(
        ActionItem.id.in_(action_ids)
    )
    return {r[0]: (r[1], r[2], r[3]) for r in (await session.execute(stmt)).all()}


async def _fetch_recovery_blocks(
    session: AsyncSession, action_ids: set[UUID]
) -> dict[UUID, tuple[datetime, datetime]]:
    """파생 action_item id → (블록 시작, 끝). `source='recovery'` 인 블록만."""
    if not action_ids:
        return {}
    stmt = select(
        ScheduledBlock.action_item_id, ScheduledBlock.start_at, ScheduledBlock.end_at
    ).where(
        ScheduledBlock.action_item_id.in_(action_ids),
        ScheduledBlock.source == _RECOVERY_BLOCK_SOURCE,
    )
    return {r[0]: (r[1], r[2]) for r in (await session.execute(stmt)).all()}


async def _fetch_catalog_labels(session: AsyncSession) -> dict[str, str]:
    """strategy_type → label_ko (없으면 코드 그대로 표시)."""
    stmt = select(RecoveryStrategyCatalog.strategy_type, RecoveryStrategyCatalog.label_ko)
    return {r[0]: r[1] for r in (await session.execute(stmt)).all()}


_DECISION_LABEL = {
    "accepted": "수락",
    "edited": "수정",
    "rejected": "거절",
    "skipped": "건너뜀",
    "pending": "미결정",
}


def _stamp(dt: datetime | None) -> str:
    return to_kst(dt).strftime("%m/%d %H:%M") if dt is not None else "—"


async def _inspect(session: AsyncSession) -> None:
    print(f"기준 시각: {now_kst().isoformat()}")
    print(
        "대상: 회복 카드가 1장이라도 만들어진 실행 전부. 카드 문구는 앞 "
        f"{TEXT_PREVIEW_CHARS}자만 출력한다(사용자 콘텐츠)."
    )
    print()

    details = await _fetch_execution_details(session)
    if not details:
        print("recovery_attempts 0건 — 볼 게 없다.")
        return

    labels = await _fetch_catalog_labels(session)
    derived_ids = {
        a.resulting_action_item_id
        for d in details
        for a in d.attempts
        if a.resulting_action_item_id is not None
    }
    derived = await _fetch_derived_actions(session, derived_ids)
    blocks = await _fetch_recovery_blocks(session, derived_ids)

    all_strategies: list[str] = []
    stale_n = 0
    no_block_n = 0

    for d in details:
        print(f"■ 실행 {d.execution_id}  [{d.completion_status}]")
        print(f'  원본: "{d.original_title}"  계획 {_stamp(d.plan_start_at)}')
        print(f"  실패 태그: {', '.join(d.failure_tags) if d.failure_tags else '(없음)'}")
        print(f"  카드 {len(d.attempts)}장:")

        for a in d.attempts:
            all_strategies.append(a.strategy_type)
            decision = _DECISION_LABEL.get(a.user_decision, a.user_decision)
            source = "룰 템플릿" if a.llm_fallback_used else f"LLM({a.prompt_version or '?'})"
            new_mark = " ★신설" if a.strategy_type in NEW_STRATEGY_TYPES else ""
            print(
                f"    [{decision}] {a.option_group} / {a.strategy_type}{new_mark}"
                f"  trigger={a.trigger_tag or '—'}  {source}  노출={_stamp(a.first_viewed_at)}"
            )
            label = labels.get(a.strategy_type, a.strategy_type)
            print(f"        {label} — {preview_text(a.suggested_action_text)}")

            if a.resulting_action_item_id is None:
                continue
            info = derived.get(a.resulting_action_item_id)
            if info is not None:
                title, target_date, status = info
                print(f'        → 파생 카드: "{title}"  target_date={target_date}  status={status}')
            block = blocks.get(a.resulting_action_item_id)
            if block is None:
                no_block_n += 1
                print("        → 회복 블록: 없음 (replan 미승인 — S20 approve 를 안 거쳤다)")
            else:
                start_at, end_at = block
                print(
                    f"        → 회복 블록: {_stamp(start_at)} ~ {to_kst(end_at).strftime('%H:%M')}"
                )
                if is_stale_placement(start_at, a.recovery_decided_at):
                    stale_n += 1
                    print(
                        f"           ⚠️ 결정 시각({_stamp(a.recovery_decided_at)})보다 과거 — "
                        "shift_to_recovery_day 보정이 안 걸렸다. pre_card 스윕 창을 "
                        "영영 못 만나 알림이 안 간다(모듈 docstring 참조)."
                    )
        print()

    reached = new_strategies_reached(all_strategies)
    print(f"■ 카드 총 {len(all_strategies)}장 / 실행 {len(details)}건")
    print(
        f"■ #257 신설 4종 도달: {', '.join(reached) if reached else '없음'} "
        f"({len(reached)}/{len(NEW_STRATEGY_TYPES)})"
    )
    if no_block_n:
        print(f"■ 회복 블록 없음(replan 미승인): {no_block_n}건")
    if stale_n:
        print(f"■ ⚠️ 과거에 놓인 회복 블록: {stale_n}건 — 이 카드들은 알림을 못 받는다")
    print()
    print("※ 이 스크립트는 아무것도 쓰지 않았다.")


async def _main() -> None:
    async with get_sessionmaker()() as session:
        await _inspect(session)
        await session.rollback()  # 읽기 전용 — 방어적으로 명시


if __name__ == "__main__":
    print(f"[inspect-recovery-attempts] {to_kst(now_kst()).isoformat()} — READ-ONLY")
    asyncio.run(_main())
