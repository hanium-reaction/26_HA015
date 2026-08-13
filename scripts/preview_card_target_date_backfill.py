"""카드 날짜 백필 사전 실측 — 무엇이 얼마나 바뀌는지 읽기 전용으로 센다 (#229).

배경: #223(PR)이 `action_items.target_date` 의 의미를 "계획 시작일" → "그 카드의 **가장
이른 활성 블록의 KST 날짜**" 로 바꿨는데, 그 규칙은 **신규 INSERT** 에서만 적용됐다
(`first_plan_adapter.py` 의 `_apply_once`). 배포(2026-08-12 12:20 KST) 이전에 승인된 카드는
옛 의미로 DB 에 남아 있고, 오늘 아젠다는 `target_date` 로만 조회하므로
(`action_item_repo.list_by_date`) 그 계정은 **블록은 있는데 오늘 카드가 0장**이 된다.
주간 그리드는 블록을 직접 읽어 멀쩡하다 — 이 비대칭이 #229 의 진단 지문이다.

**아무것도 쓰지 않는다** — SELECT 뿐. `--apply` 같은 옵션 자체가 없다
(선례: `preview_expire_reflections.py`).

이 프리뷰가 답해야 하는 질문은 "몇 행이 바뀌나" 가 아니라 **"백필하면 실제로 몇 명이
오늘 탭을 되찾나"** 다. 활성 블록이 전부 과거인 카드는 과거 날짜로 옮겨질 뿐 오늘 탭에
돌아오지 않기 때문에, 행 수만 세면 효과를 과대평가하게 된다. 그래서 새 날짜를
**과거/오늘/미래**로 나눠 집계한다.

실행 (라이브 EC2 self-hosted runner 에서 workflow_dispatch 로):
  uv run python -m scripts.preview_card_target_date_backfill
"""

from __future__ import annotations

import asyncio
from collections import Counter, defaultdict
from datetime import date
from typing import Any, NamedTuple
from uuid import UUID

from sqlalchemy import Date, Select, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models import ActionItem, ExecutionEvent, ScheduledBlock, User
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.schemas.common import now_kst, to_kst

# 백필 대상 출처. **넓히지 말 것** — `recovery_*` 를 포함하면 `abandon_stale`
# (recovery_repo) 이 target_date 를 구동 조건으로 쓰기 때문에, 앞당겨진 회복 카드가 다음
# 04:00 cron 에서 pending → abandoned 로 확정되고 `recovery_duration_minutes` 가 영구
# NULL 이 된다(average_recovery_minutes 손실). 하중을 받는 가드다.
BACKFILL_SOURCE = "goal"

# 시작한 적 없는 카드만 본다. `status='planned'` 만으로는 부족하다 — 실행 이력이 있는
# planned 카드에는 '시작 누른 시각'에 꽂힌 즉석 블록(create_adhoc_block)이 있어, 날짜가
# 사용자가 우연히 버튼 누른 날로 튈 수 있다.
BACKFILL_STATUS = "planned"


class Drift(NamedTuple):
    """카드 하나의 현재 날짜와 규칙상 있어야 할 날짜."""

    card_id: UUID
    user_id: UUID
    title: str
    old_day: date
    new_day: date

    @property
    def shift_days(self) -> int:
        return (self.new_day - self.old_day).days


def first_active_block_day() -> Any:
    """카드별 '가장 이른 활성 블록의 KST 날짜' 서브쿼리.

    규칙의 출처는 `api/routes/planning.py` 의 `edit_block` —
    `min(to_kst(b.start_at) for b if b.block_status != 'cancelled').date()`.
    `start_at` 이 timestamptz 라 `timezone('Asia/Seoul', ...)` 가 KST 로컬시각을 준다.
    """
    return (
        select(
            ScheduledBlock.action_item_id.label("action_item_id"),
            cast(func.min(func.timezone("Asia/Seoul", ScheduledBlock.start_at)), Date).label(
                "first_day"
            ),
        )
        .where(ScheduledBlock.block_status != "cancelled")
        .group_by(ScheduledBlock.action_item_id)
        .subquery()
    )


def drifted_cards_stmt() -> Select[Any]:
    """백필 대상 = 활성 블록이 있는데 카드 날짜가 그 블록 날짜와 어긋난 카드.

    ⚠️ 실제 백필 UPDATE 를 만들 때 이 WHERE 를 **그대로** 재사용할 것. 프리뷰와 실행의
    판정이 갈라지면 실측한 수와 다른 행이 바뀐다(선례: `preview_expire_reflections.py`
    가 `expire_unreflected` 와 WHERE 동일성을 테스트로 고정한다).
    """
    blocks = first_active_block_day()
    started = (
        select(ExecutionEvent.id).where(ExecutionEvent.action_item_id == ActionItem.id).exists()
    )
    return (
        select(
            ActionItem.id,
            ActionItem.user_id,
            ActionItem.title,
            ActionItem.target_date,
            blocks.c.first_day,
        )
        .join(blocks, blocks.c.action_item_id == ActionItem.id)
        .where(
            ActionItem.source == BACKFILL_SOURCE,
            ActionItem.status == BACKFILL_STATUS,
            ActionItem.archived_at.is_(None),
            ~started,
            ActionItem.target_date != blocks.c.first_day,
        )
    )


def bucket_by_when(drifts: list[Drift], today: date) -> dict[str, list[Drift]]:
    """새 날짜를 과거/오늘/미래로 가른다 — '오늘 탭이 실제로 살아나는가' 의 근거."""
    out: dict[str, list[Drift]] = {"past": [], "today": [], "future": []}
    for d in drifts:
        key = "today" if d.new_day == today else ("past" if d.new_day < today else "future")
        out[key].append(d)
    return out


def _histogram(values: list[int]) -> list[tuple[str, int]]:
    """이동 폭(일)을 구간으로 묶는다 — 개별 값은 길고 분포만 보면 충분하다."""
    buckets = Counter[str]()
    for v in values:
        if v == 0:
            buckets["0일"] += 1
        elif abs(v) <= 7:
            buckets["±1~7일"] += 1
        elif abs(v) <= 30:
            buckets["±8~30일"] += 1
        else:
            buckets["±31일 이상"] += 1
    order = ["0일", "±1~7일", "±8~30일", "±31일 이상"]
    return [(k, buckets[k]) for k in order if buckets[k]]


async def _preview(session: AsyncSession) -> None:
    today = now_kst().date()
    print(f"기준 시각: {now_kst().isoformat()}  ·  오늘(KST): {today}")
    print(
        f"대상 조건: source={BACKFILL_SOURCE!r} · status={BACKFILL_STATUS!r} · 미보관 · "
        "실행 이력 없음 · 활성 블록 보유 · 날짜 불일치"
    )
    print()

    rows = (await session.execute(drifted_cards_stmt())).all()
    if not rows:
        print("어긋난 카드 0건 — 백필할 것이 없다.")
        return

    drifts = [
        Drift(card_id=r[0], user_id=r[1], title=r[2], old_day=r[3], new_day=r[4]) for r in rows
    ]
    emails: dict[UUID, str] = {
        row[0]: row[1]
        for row in (
            await session.execute(
                select(User.id, User.email).where(User.id.in_({d.user_id for d in drifts}))
            )
        ).all()
    }

    def who(uid: UUID) -> str:
        return emails.get(uid, str(uid)[:8])

    by_when = bucket_by_when(drifts, today)
    users = {d.user_id for d in drifts}

    print(f"■ 어긋난 카드 {len(drifts)}건 · 영향 계정 {len(users)}명")
    print()
    print("■ 백필 후 새 날짜가 언제인가 (오늘 탭 복구 여부의 근거)")
    print(
        f"  오늘  : 카드 {len(by_when['today']):3d}건 · 계정 {len({d.user_id for d in by_when['today']}):2d}명  ← 오늘 탭이 살아난다"
    )
    print(
        f"  미래  : 카드 {len(by_when['future']):3d}건 · 계정 {len({d.user_id for d in by_when['future']}):2d}명  ← 그 날짜에 뜬다"
    )
    print(
        f"  과거  : 카드 {len(by_when['past']):3d}건 · 계정 {len({d.user_id for d in by_when['past']}):2d}명  ← 옮겨도 오늘 탭엔 안 뜬다"
    )
    print()

    print("■ 날짜 이동 폭 (새 날짜 − 현재 날짜)")
    for label, n in _histogram([d.shift_days for d in drifts]):
        print(f"  {label:12s} {n:3d}건")
    print()

    # 지금 오늘 탭이 비어 있는 계정 = 백필이 실제로 구제하는 대상
    today_now: dict[UUID, int] = {
        row[0]: row[1]
        for row in (
            await session.execute(
                select(ActionItem.user_id, func.count())
                .where(
                    ActionItem.user_id.in_(users),
                    ActionItem.target_date == today,
                    ActionItem.archived_at.is_(None),
                )
                .group_by(ActionItem.user_id)
            )
        ).all()
    }
    gains: dict[UUID, int] = defaultdict(int)
    for d in by_when["today"]:
        gains[d.user_id] += 1

    print("■ 계정별 (현재 오늘 카드 → 백필 후 증가분)")
    for uid in sorted(users, key=lambda u: (-gains.get(u, 0), who(u))):
        n_now = today_now.get(uid, 0)
        gain = gains.get(uid, 0)
        mark = "  ← 지금 오늘 탭이 비어 있다" if n_now == 0 and gain > 0 else ""
        cards = sum(1 for d in drifts if d.user_id == uid)
        print(f"  {who(uid)[:38]:40s} 어긋남 {cards:3d}건 · 오늘 {n_now:2d}장 → +{gain}{mark}")
    print()

    print("■ 샘플 (최대 20건)")
    for d in sorted(drifts, key=lambda d: (who(d.user_id), d.old_day))[:20]:
        print(
            f"  {who(d.user_id)[:22]:24s} {d.old_day} → {d.new_day} "
            f"({d.shift_days:+d}일)  {d.title[:24]}"
        )
    print()
    print("※ 이 스크립트는 아무것도 쓰지 않았다. 백필 실행은 별도 스크립트(--apply)로 한다.")
    print("※ 되돌리려면 원본 target_date 가 필요하다 — 백필 스크립트가 원장 파일을 남길 것.")


async def _main() -> None:
    async with get_sessionmaker()() as session:
        await _preview(session)
        await session.rollback()  # 읽기 전용 — 방어적으로 명시


if __name__ == "__main__":
    print(f"[preview-card-target-date-backfill] {to_kst(now_kst()).isoformat()} — READ-ONLY")
    asyncio.run(_main())
