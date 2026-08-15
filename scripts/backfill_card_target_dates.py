"""나머지 카드 백필 — 활성 블록의 KST 날짜로 target_date 를 옮긴다 (#229 §8 결정, 마지막 단계).

배경: #223(PR)이 `action_items.target_date` 의 의미를 "계획 시작일" → "그 카드의 **가장
이른 활성 블록의 KST 날짜**" 로 바꿨는데, 배포(2026-08-12 12:20 KST) 이전에 승인된 카드는
옛 의미로 남아 있다. `scripts.cancel_stale_plan_cards` 가 이미 **활성 블록이 전부 과거인
카드**를 archive+cancel 로 정리했으므로, 이 스크립트가 다루는 대상은 자동으로 **오늘/미래로
옮겨지는 카드만** 남는다 — `drifted_cards_stmt()` 를 필터 없이 그대로 재사용하면 된다
(과거분은 이미 archived_at 이 찍혀 그 WHERE 에서 자연히 빠진다).

**되돌릴 수 없는 변경이다** — 원래 값을 담은 컬럼이 없어서, 나중에 술어로 옛 집합을
재구성할 수도 없다(카드마다 새 값이 다르다). 그래서 `--apply` 는 반드시 **원장(ledger)**
을 남기고, 이 스크립트 자신이 `--revert-from` 으로 그 원장을 읽어 되돌릴 수 있다.

⚠️ **원장은 `$APP_DIR` 밖에 쓸 것** — `deploy.yml` 이 `rsync -a --delete`(`.env`/`.venv`/
`.git` 제외 전부)로 앱 디렉터리를 매번 갈아엎는다. self-hosted EC2 runner 는 실행 간
디스크가 유지되므로, 앱 디렉터리 밖의 절대경로(예: `~/reaction-backfill-ledgers/`)에 쓰면
다음 배포에도 살아남는다. 기본값은 개발 편의용일 뿐이며 운영 워크플로는 반드시
`--ledger-path` 를 명시한다.

안전:
  - 기본은 **dry-run**(아무것도 쓰지 않음). 실제 적용은 `--apply` 명시.
  - `--user-email` 로 범위를 좁힐 수 있다.
  - `--apply` 는 매 카드의 (card_id, user_id, title, old_target_date, new_target_date)
    를 원장 JSON 파일로 남긴다.
  - `--revert-from <원장파일>` 로 되돌린다. 이것도 기본 dry-run — 실제 적용은 `--apply`
    를 같이 줘야 한다. 카드의 **현재** target_date 가 원장의 new_target_date 와 다르면
    (그 사이 다른 변경이 있었다는 뜻) 그 카드는 건드리지 않고 skip 으로 보고한다.

실행 (라이브 EC2 self-hosted runner 에서 workflow_dispatch 로):
  uv run python -m scripts.backfill_card_target_dates                                   # dry-run
  uv run python -m scripts.backfill_card_target_dates --apply --ledger-path <경로>        # 적용
  uv run python -m scripts.backfill_card_target_dates --revert-from <원장> --apply        # 되돌리기
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models import ActionItem, User
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.schemas.common import now_kst, to_kst
from scripts.preview_card_target_date_backfill import drifted_cards_stmt

# ─────────────────────────────────────────────────────────────────────────────
# 순수 로직 — 원장 직렬화/역직렬화, 되돌리기 계획 (DB 무관, 단위 테스트 대상)
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class BackfillRow:
    card_id: UUID
    user_id: UUID
    title: str
    old_target_date: date
    new_target_date: date


def ledger_document(rows: list[BackfillRow], *, applied_at: datetime) -> dict[str, object]:
    """원장 파일에 쓸 JSON 구조. 카드마다 원본 값이 달라 술어로 재구성이 불가능하므로,
    이 파일이 유일한 복원 경로다."""
    return {
        "applied_at": applied_at.isoformat(),
        "entries": [
            {
                "card_id": str(r.card_id),
                "user_id": str(r.user_id),
                "title": r.title,
                "old_target_date": r.old_target_date.isoformat(),
                "new_target_date": r.new_target_date.isoformat(),
            }
            for r in rows
        ],
    }


def parse_ledger_document(data: dict[str, object]) -> list[BackfillRow]:
    """`ledger_document` 의 역함수 — round-trip 이 깨지면 되돌리기가 조용히 틀린다."""
    entries = data.get("entries")
    if not isinstance(entries, list):
        raise ValueError("원장 형식이 아니다 — 'entries' 배열이 없다")
    return [
        BackfillRow(
            card_id=UUID(e["card_id"]),
            user_id=UUID(e["user_id"]),
            title=e["title"],
            old_target_date=date.fromisoformat(e["old_target_date"]),
            new_target_date=date.fromisoformat(e["new_target_date"]),
        )
        for e in entries
    ]


@dataclass(frozen=True, slots=True)
class RevertDecision:
    row: BackfillRow
    action: str  # "revert" | "skip_missing" | "skip_mismatch"
    reason: str | None = None


def plan_revert(
    entries: list[BackfillRow], current_targets: dict[UUID, date]
) -> list[RevertDecision]:
    """원장을 되돌려도 되는지 카드별로 판단한다 (아무것도 변형하지 않는 순수 함수).

    카드가 이미 사라졌거나(삭제/조회 불가) 현재 날짜가 원장의 `new_target_date` 와
    다르면(그 사이 다른 승인·편집이 그 카드를 다시 건드렸다는 뜻) **건드리지 않는다** —
    되돌리기가 최신 변경을 조용히 덮어쓰면 안 된다.
    """
    decisions: list[RevertDecision] = []
    for e in entries:
        current = current_targets.get(e.card_id)
        if current is None:
            decisions.append(
                RevertDecision(e, "skip_missing", "카드를 찾을 수 없다(삭제·보관됐을 수 있음)")
            )
        elif current != e.new_target_date:
            decisions.append(
                RevertDecision(
                    e,
                    "skip_mismatch",
                    f"현재값 {current} != 원장의 신규값 {e.new_target_date} "
                    "— 그 사이 다른 변경이 있었다",
                )
            )
        else:
            decisions.append(RevertDecision(e, "revert"))
    return decisions


# ─────────────────────────────────────────────────────────────────────────────
# DB 러너
# ─────────────────────────────────────────────────────────────────────────────


async def _load_backfill_rows(
    session: AsyncSession, *, user_email: str | None
) -> tuple[list[BackfillRow], dict[UUID, str]]:
    stmt = drifted_cards_stmt()  # 필터 없음 — 과거분은 이미 archived_at 이 찍혀 자동 제외
    if user_email is not None:
        stmt = stmt.join(User, User.id == ActionItem.user_id).where(User.email == user_email)
    rows = (await session.execute(stmt)).all()

    backfill_rows = [
        BackfillRow(
            card_id=r[0], user_id=r[1], title=r[2], old_target_date=r[3], new_target_date=r[4]
        )
        for r in rows
    ]
    labels = await _user_labels(session, {r.user_id for r in backfill_rows})
    return backfill_rows, labels


async def _user_labels(session: AsyncSession, user_ids: set[UUID]) -> dict[UUID, str]:
    labels: dict[UUID, str] = {}
    for uid in user_ids:
        u = await session.get(User, uid)
        labels[uid] = f"{u.name} <{u.email}>" if u is not None else str(uid)
    return labels


def _print_backfill_report(
    rows: list[BackfillRow], labels: dict[UUID, str], *, apply: bool
) -> None:
    head = "APPLY" if apply else "DRY-RUN (변경 없음)"
    print(f"\n=== 카드 날짜 백필 [{head}] ===")
    if not rows:
        print("백필할 카드가 없다.")
        return
    users = {r.user_id for r in rows}
    print(f"대상 카드 {len(rows)}건 · 계정 {len(users)}명\n")
    for r in sorted(rows, key=lambda r: (labels.get(r.user_id, str(r.user_id)), r.old_target_date)):
        print(
            f"· {labels.get(r.user_id, r.user_id)}  {r.title[:40]}\n"
            f"    카드 {r.card_id}  {r.old_target_date} → {r.new_target_date}"
        )
    print(f"\n합계: 카드 {len(rows)}건 날짜 이동")


async def run_backfill(*, apply: bool, user_email: str | None, ledger_path: Path | None) -> None:
    sm = get_sessionmaker()
    async with sm() as session:
        rows, labels = await _load_backfill_rows(session, user_email=user_email)
        _print_backfill_report(rows, labels, apply=apply)
        if not apply or not rows:
            return

        if ledger_path is None:
            ts = to_kst(now_kst()).strftime("%Y%m%dT%H%M%S")
            ledger_path = Path.home() / "reaction-backfill-ledgers" / f"backfill-{ts}.json"
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        applied_at = now_kst()
        ledger_path.write_text(
            json.dumps(ledger_document(rows, applied_at=applied_at), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        card_ids = [r.card_id for r in rows]
        by_id = {r.card_id: r for r in rows}
        for action in (
            await session.execute(select(ActionItem).where(ActionItem.id.in_(card_ids)))
        ).scalars():
            action.target_date = by_id[action.id].new_target_date
        await session.commit()

        print(f"\n✅ 적용 완료 — 카드 {len(rows)}건.")
        print(f"   원장: {ledger_path}")
        print("   되돌리려면: --revert-from <원장 경로> --apply")


# ─────────────────────────────────────────────────────────────────────────────
# 되돌리기
# ─────────────────────────────────────────────────────────────────────────────


def _print_revert_report(
    decisions: list[RevertDecision], labels: dict[UUID, str], *, apply: bool
) -> None:
    head = "APPLY" if apply else "DRY-RUN (변경 없음)"
    print(f"\n=== 백필 되돌리기 [{head}] ===")
    if not decisions:
        print("원장이 비었다.")
        return
    by_action: dict[str, int] = {}
    for d in decisions:
        by_action[d.action] = by_action.get(d.action, 0) + 1
        who = labels.get(d.row.user_id, str(d.row.user_id))
        line = f"· [{d.action}] {who}  {d.row.title[:36]}  {d.row.new_target_date} → {d.row.old_target_date}"
        if d.reason:
            line += f"  ({d.reason})"
        print(line)
    print(f"\n합계: {by_action}")


async def run_revert(*, apply: bool, ledger_path: Path, user_email: str | None) -> None:
    entries = parse_ledger_document(json.loads(ledger_path.read_text(encoding="utf-8")))
    if user_email is not None:
        sm = get_sessionmaker()
        async with sm() as session:
            u = (
                await session.execute(select(User.id).where(User.email == user_email))
            ).scalar_one_or_none()
        entries = [e for e in entries if u is not None and e.user_id == u]

    sm = get_sessionmaker()
    async with sm() as session:
        cards = (
            (
                await session.execute(
                    select(ActionItem).where(ActionItem.id.in_([e.card_id for e in entries]))
                )
            )
            .scalars()
            .all()
        )
        current_targets = {c.id: c.target_date for c in cards if c.archived_at is None}
        labels = await _user_labels(session, {e.user_id for e in entries})

        decisions = plan_revert(entries, current_targets)
        _print_revert_report(decisions, labels, apply=apply)
        if not apply:
            return

        by_id = {c.id: c for c in cards}
        reverted = 0
        for d in decisions:
            if d.action != "revert":
                continue
            by_id[d.row.card_id].target_date = d.row.old_target_date
            reverted += 1
        await session.commit()
        print(f"\n✅ 되돌리기 완료 — 카드 {reverted}건.")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="카드 target_date 를 활성 블록의 KST 날짜로 백필 (#229)"
    )
    p.add_argument("--apply", action="store_true", help="실제 적용 (미지정 시 dry-run)")
    p.add_argument("--user-email", default=None, help="특정 사용자만 (기본: 전체)")
    p.add_argument("--ledger-path", default=None, help="원장 파일 경로 (미지정 시 자동 생성)")
    p.add_argument("--revert-from", default=None, help="이 원장 파일을 읽어 되돌린다")
    return p.parse_args()


def main() -> None:
    args = _parse_args()
    if args.revert_from:
        asyncio.run(
            run_revert(
                apply=args.apply,
                ledger_path=Path(args.revert_from),
                user_email=args.user_email,
            )
        )
    else:
        ledger_path = Path(args.ledger_path) if args.ledger_path else None
        asyncio.run(
            run_backfill(apply=args.apply, user_email=args.user_email, ledger_path=ledger_path)
        )


if __name__ == "__main__":
    main()
