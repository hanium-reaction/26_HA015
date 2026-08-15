"""'과거 33건' 정리 — 백필해도 오늘 탭에 못 돌아오는 유령 카드를 archive+cancel (#229).

배경: `scripts.preview_card_target_date_backfill` 이 라이브에서 측정한 결과(2026-08-13),
어긋난 카드 73건 중 **33건은 활성 블록이 전부 과거**라 target_date 를 백필해도 과거
날짜로 옮겨질 뿐 오늘 탭에 안 뜬다 — 사실상 죽은 계획 산출물이다. 팀 결정(#229 코멘트):
이 33건은 백필하지 않고 **archive+cancel** 로 정리한다.

카드만 archive 하고 블록을 안 건드리면 안 된다 — `ScheduledBlockRepo.list_week` 는
ActionItem 과 조인하면서 `archived_at IS NULL` 을 걸지 않고 `block_status != 'cancelled'`
만 보므로, 블록을 살려두면 유령이 주간 그리드에 계속 보이고 새 계획 생성 시 busy 로도
남아 계속 배치를 밀어낸다(#229 실측 증상 중 하나). `supersede_previous_plan`
(first_plan_adapter.py)이 카드·블록을 항상 함께 처리하는 이유와 같다.

대상 집합은 프리뷰의 '과거' 버킷과 **정확히 같아야 한다** — 팀이 승인한 건 그 화면에
나온 33건이지 독자적으로 다시 정의한 집합이 아니다. 그래서 셀렉터를 새로 안 짜고
`drifted_cards_stmt(only_past_as_of=오늘)` 을 그대로 재사용한다.

soft delete only(AGENTS §2) — action_item.archived_at, scheduled_block.block_status=
'cancelled'. **원본 status 는 건드리지 않는다**(#214 와 같은 원칙 — 이 카드들은
`status='planned'` 로 남아 실행 이력이 없었음을 그대로 보존한다).

안전:
  - 기본은 **dry-run**(아무것도 쓰지 않음). 실제 적용은 `--apply` 명시.
  - `--user-email` 로 범위를 좁힐 수 있다(기본: 프리뷰가 실측한 전체 5계정).
  - 적용 시 카드마다 (card_id, user_id, title, target_date, 취소된 block_id 목록)을
    전부 출력한다 — 복원하려면 이 목록으로 `archived_at=NULL` / `block_status='scheduled'`
    를 수동으로 되돌릴 수 있다(백필과 달리 날짜를 새로 계산하지 않으므로 원본 값이
    출력에 그대로 남는다).

실행 (라이브 EC2 self-hosted runner 에서 workflow_dispatch 로):
  uv run python -m scripts.cancel_stale_plan_cards            # dry-run
  uv run python -m scripts.cancel_stale_plan_cards --apply    # 실제 적용
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass, field
from datetime import date, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models import ActionItem, ScheduledBlock, User
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.schemas.common import now_kst
from scripts.preview_card_target_date_backfill import drifted_cards_stmt

# ─────────────────────────────────────────────────────────────────────────────
# 보고 구조
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(slots=True)
class StaleCardReport:
    card_id: UUID
    user_id: UUID
    title: str
    old_target_date: date
    would_be_target_date: date  # 참고용 — 백필했어도 이 과거 날짜였을 것
    cancelled_block_ids: list[UUID] = field(default_factory=list)


@dataclass(slots=True)
class CleanupPlan:
    reports: list[StaleCardReport] = field(default_factory=list)

    @property
    def archive_action_ids(self) -> list[UUID]:
        return [r.card_id for r in self.reports]

    @property
    def cancel_block_ids(self) -> list[UUID]:
        return [bid for r in self.reports for bid in r.cancelled_block_ids]


def group_active_block_ids(rows: list[tuple[UUID, UUID]]) -> dict[UUID, list[UUID]]:
    """(action_item_id, block_id) 쌍들을 액션별로 묶는다 (DB 무관 — 단위 테스트 대상).

    카드 하나가 여러 활성 블록을 가질 수 있다(분할 세션) — 그 전부를 취소해야
    유령이 남지 않는다. 호출자가 이미 `block_status != 'cancelled'` 로 걸러서 넘긴다.
    """
    out: dict[UUID, list[UUID]] = {}
    for action_id, block_id in rows:
        out.setdefault(action_id, []).append(block_id)
    return out


# ─────────────────────────────────────────────────────────────────────────────
# DB 러너
# ─────────────────────────────────────────────────────────────────────────────


async def _load_plan(
    session: AsyncSession, *, user_email: str | None
) -> tuple[CleanupPlan, dict[UUID, str]]:
    today = now_kst().date()
    stmt = drifted_cards_stmt(only_past_as_of=today)
    if user_email is not None:
        stmt = stmt.join(User, User.id == ActionItem.user_id).where(User.email == user_email)
    rows = (await session.execute(stmt)).all()

    plan = CleanupPlan(
        reports=[
            StaleCardReport(
                card_id=r[0],
                user_id=r[1],
                title=r[2],
                old_target_date=r[3],
                would_be_target_date=r[4],
            )
            for r in rows
        ]
    )
    if not plan.reports:
        return plan, {}

    card_ids = [r.card_id for r in plan.reports]
    blocks = (
        await session.execute(
            select(ScheduledBlock.action_item_id, ScheduledBlock.id).where(
                ScheduledBlock.action_item_id.in_(card_ids),
                ScheduledBlock.block_status != "cancelled",
            )
        )
    ).all()
    by_action = group_active_block_ids([(row[0], row[1]) for row in blocks])
    for r in plan.reports:
        r.cancelled_block_ids = by_action.get(r.card_id, [])

    labels: dict[UUID, str] = {}
    for uid in {r.user_id for r in plan.reports}:
        u = await session.get(User, uid)
        labels[uid] = f"{u.name} <{u.email}>" if u is not None else str(uid)
    return plan, labels


def _print_report(plan: CleanupPlan, labels: dict[UUID, str], *, apply: bool) -> None:
    head = "APPLY" if apply else "DRY-RUN (변경 없음)"
    print(f"\n=== 과거 카드 정리 [{head}] ===")
    if not plan.reports:
        print("정리할 카드가 없다 — '과거' 버킷이 비었다.")
        return

    users = {r.user_id for r in plan.reports}
    print(f"대상 카드 {len(plan.reports)}건 · 계정 {len(users)}명")
    print()
    for r in sorted(plan.reports, key=lambda r: (labels.get(r.user_id, str(r.user_id)), r.title)):
        print(
            f"· {labels.get(r.user_id, r.user_id)}  {r.title[:40]}\n"
            f"    카드 {r.card_id}  현재날짜 {r.old_target_date} "
            f"(백필해도 {r.would_be_target_date})\n"
            f"    취소될 블록 {len(r.cancelled_block_ids)}건: "
            f"{', '.join(str(b) for b in r.cancelled_block_ids) or '(없음)'}"
        )
    print(
        f"\n합계: 카드 {len(plan.archive_action_ids)} 보관 · 블록 {len(plan.cancel_block_ids)} 취소"
    )


async def run(*, apply: bool, user_email: str | None) -> CleanupPlan:
    sm = get_sessionmaker()
    async with sm() as session:
        plan, labels = await _load_plan(session, user_email=user_email)
        _print_report(plan, labels, apply=apply)

        if not apply or not plan.reports:
            return plan

        archived_at = datetime.now().astimezone()
        archive_ids = set(plan.archive_action_ids)
        cancel_ids = set(plan.cancel_block_ids)
        # 실제 ORM 행을 다시 로드해 변형 (soft delete only, status 는 불변).
        for a in (
            await session.execute(select(ActionItem).where(ActionItem.id.in_(archive_ids)))
        ).scalars():
            a.archived_at = archived_at
        for b in (
            await session.execute(select(ScheduledBlock).where(ScheduledBlock.id.in_(cancel_ids)))
        ).scalars():
            if b.block_status != "cancelled":
                b.block_status = "cancelled"
        await session.commit()
        print("\n✅ 적용 완료 (soft delete — archived_at / block_status=cancelled).")
        print("   복원하려면 위 카드/블록 id 목록으로 archived_at=NULL·'scheduled' 를 수동 복구.")
        return plan


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="백필해도 오늘 탭에 못 돌아오는 과거 카드를 archive+cancel"
    )
    p.add_argument("--apply", action="store_true", help="실제 적용 (미지정 시 dry-run)")
    p.add_argument("--user-email", default=None, help="특정 사용자만 (기본: 전체)")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    asyncio.run(run(apply=args.apply, user_email=args.user_email))


if __name__ == "__main__":
    main()
