"""집중 지속(attention_span) 백필 — 파서 사고로 오염된 프로필 복구 (v2.00 후속).

배경: 인터뷰 슬롯 `energy.focus_duration` 의 칩 **"2시간 이상"** 을 숫자만 긁는 파서가
**2(분)** 으로 읽었다. 계획 승인 시 `profile_memory` 가 그 값을
`behavioral_profiles.attention_span` 에 그대로 적었으므로, 수정(v2.00) 이전에 그 칩을 고르고
계획을 승인한 사용자의 프로필에 **2** 가 남아 있다.

**저장된 슬롯 답(raw chip)은 오염되지 않았다** — 고친 파서로 다시 읽으면 정확한 값이 나온다.
그래서 이 백필은 추측하지 않는다: 사용자가 실제로 고른 칩을 다시 읽어 넣는다.
슬롯 답이 없으면(인터뷰 기록 삭제 등) 기본값(30분)으로 올려 **붕괴만 막고**, 정확한 값은
재인터뷰에 맡긴다.

`time_chunk_preference` 도 같은 값에서 파생되므로 함께 고친다(`profile_memory.chunk_bucket`).

⚠️ **계획 자체는 백필 대상이 아니다.** 이미 만들어진 계획의 카드 길이는 사용자가 보고
승인한 값이라 서버가 조용히 바꾸면 안 된다(HITL). 프로필을 고치면 **다음 계획 생성부터**
정상이 된다.

안전:
  - 기본은 **dry-run**(아무것도 쓰지 않음). 실제 적용은 `--apply` 명시.
  - `--user-email` 로 범위를 좁힐 수 있다.
  - `--apply` 는 (user_id, email, old/new attention_span, old/new chunk) 를 원장 JSON 으로
    남긴다. 원본 값은 술어로 재구성할 수 없으므로(사용자마다 다름) 이 파일이 유일한 복원 경로다.
  - `--revert-from <원장>` 으로 되돌린다. 이것도 기본 dry-run.
    프로필의 **현재** 값이 원장의 new 와 다르면(그 사이 재인터뷰 등으로 바뀜) skip 한다.

⚠️ **원장은 `$APP_DIR` 밖에 쓸 것** — `deploy.yml` 의 `rsync -a --delete` 가 앱 디렉터리를
매번 갈아엎는다(`backfill_card_target_dates` 와 같은 이유).

실행:
  uv run python -m scripts.preview_attention_span_backfill                        # 대상 확인
  uv run python -m scripts.backfill_attention_span                                # dry-run
  uv run python -m scripts.backfill_attention_span --apply --ledger-path <경로>     # 적용
  uv run python -m scripts.backfill_attention_span --revert-from <원장> --apply     # 되돌리기
"""

from __future__ import annotations

import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from uuid import UUID

from sqlalchemy import select

from reaction_backend.db.models.behavioral_profile import BehavioralProfile
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.orchestrator.profile_memory import chunk_bucket
from reaction_backend.schemas.common import now_kst
from scripts.preview_attention_span_backfill import IMPOSSIBLE_BELOW_MIN, PollutedProfile, collect

# 슬롯 답을 못 찾은 행에 넣을 값 — `profile_memory` 의 `prefs.focus_duration_min or 30` 과 동일.
FALLBACK_ATTENTION_SPAN = 30


# ─────────────────────────────────────────────────────────────────────────────
# 순수 로직 (DB 무관, 단위 테스트 대상)
# ─────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class BackfillRow:
    user_id: UUID
    email: str
    old_attention_span: int
    new_attention_span: int
    old_chunk: str
    new_chunk: str
    source: str  # "chip" | "fallback"


def plan_backfill(rows: list[PollutedProfile]) -> list[BackfillRow]:
    """오염 행 → 적용할 변경. 값이 안 바뀌는 행은 제외한다(빈 UPDATE 방지)."""
    out: list[BackfillRow] = []
    for r in rows:
        if r.fixable:
            assert r.recomputed is not None  # fixable 정의상
            new_span, source = r.recomputed, "chip"
        else:
            new_span, source = FALLBACK_ATTENTION_SPAN, "fallback"
        new_chunk = chunk_bucket(new_span)
        if new_span == r.current_attention_span and new_chunk == r.current_chunk:
            continue
        out.append(
            BackfillRow(
                user_id=r.user_id,
                email=r.email,
                old_attention_span=r.current_attention_span,
                new_attention_span=new_span,
                old_chunk=r.current_chunk,
                new_chunk=new_chunk,
                source=source,
            )
        )
    return out


def ledger_document(rows: list[BackfillRow], *, applied_at: datetime) -> dict[str, object]:
    """원장 JSON. 사용자마다 원본 값이 달라 술어로 재구성이 불가능하므로 유일한 복원 경로다."""
    return {
        "applied_at": applied_at.isoformat(),
        "entries": [
            {
                "user_id": str(r.user_id),
                "email": r.email,
                "old_attention_span": r.old_attention_span,
                "new_attention_span": r.new_attention_span,
                "old_chunk": r.old_chunk,
                "new_chunk": r.new_chunk,
                "source": r.source,
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
            user_id=UUID(e["user_id"]),
            email=e["email"],
            old_attention_span=int(e["old_attention_span"]),
            new_attention_span=int(e["new_attention_span"]),
            old_chunk=str(e["old_chunk"]),
            new_chunk=str(e["new_chunk"]),
            source=str(e["source"]),
        )
        for e in entries
    ]


@dataclass(frozen=True, slots=True)
class RevertDecision:
    row: BackfillRow
    action: str  # "revert" | "skip_missing" | "skip_mismatch"
    reason: str | None = None


def plan_revert(entries: list[BackfillRow], current: dict[UUID, int]) -> list[RevertDecision]:
    """되돌려도 되는지 사용자별로 판단 (아무것도 변형하지 않는 순수 함수).

    프로필이 사라졌거나 현재 값이 원장의 `new_attention_span` 과 다르면(그 사이 재인터뷰
    등으로 다시 바뀌었다는 뜻) **건드리지 않는다** — 되돌리기가 최신 변경을 덮으면 안 된다.
    """
    decisions: list[RevertDecision] = []
    for e in entries:
        now = current.get(e.user_id)
        if now is None:
            decisions.append(RevertDecision(e, "skip_missing", "프로필이 없다"))
        elif now != e.new_attention_span:
            decisions.append(
                RevertDecision(e, "skip_mismatch", f"현재 {now}분 ≠ 원장 {e.new_attention_span}분")
            )
        else:
            decisions.append(RevertDecision(e, "revert"))
    return decisions


# ─────────────────────────────────────────────────────────────────────────────
# 실행
# ─────────────────────────────────────────────────────────────────────────────


def _default_ledger_path() -> Path:
    stamp = now_kst().strftime("%Y%m%d-%H%M%S")
    return Path(f"attention-span-backfill-{stamp}.json")


async def run_backfill(
    *, apply: bool, user_email: str | None = None, ledger_path: Path | None = None
) -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        polluted = await collect(session, user_email)
        rows = plan_backfill(polluted)

        if not rows:
            print(f"✅ 백필할 행 없음 (attention_span < {IMPOSSIBLE_BELOW_MIN} 인 프로필이 없다).")
            return

        print(f"{'적용' if apply else 'dry-run'} — 대상 {len(rows)}건\n")
        for r in rows:
            print(
                f"  {r.email:<38} attention_span {r.old_attention_span:>3} → "
                f"{r.new_attention_span:>3}  chunk {r.old_chunk} → {r.new_chunk}  ({r.source})"
            )
        if not apply:
            print("\n적용하려면 --apply --ledger-path <경로> 를 붙여 다시 실행한다.")
            return

        path = ledger_path or _default_ledger_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(ledger_document(rows, applied_at=now_kst()), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        by_user = {r.user_id: r for r in rows}
        result = await session.execute(
            select(BehavioralProfile).where(BehavioralProfile.user_id.in_(list(by_user)))
        )
        updated = 0
        for profile in result.scalars():
            row = by_user[profile.user_id]
            profile.attention_span = row.new_attention_span
            profile.time_chunk_preference = row.new_chunk
            updated += 1
        await session.commit()
        print(f"\n✅ 백필 완료 — {updated}건. 원장: {path}")


async def run_revert(*, apply: bool, ledger_path: Path, user_email: str | None = None) -> None:
    entries = parse_ledger_document(json.loads(ledger_path.read_text(encoding="utf-8")))
    if user_email:
        entries = [e for e in entries if e.email == user_email]
    if not entries:
        print("원장에 되돌릴 항목이 없다.")
        return

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        result = await session.execute(
            select(BehavioralProfile).where(
                BehavioralProfile.user_id.in_([e.user_id for e in entries])
            )
        )
        profiles = {p.user_id: p for p in result.scalars()}
        decisions = plan_revert(entries, {uid: p.attention_span for uid, p in profiles.items()})

        for d in decisions:
            mark = "되돌림" if d.action == "revert" else f"skip({d.reason})"
            print(
                f"  {d.row.email:<38} {d.row.new_attention_span} → "
                f"{d.row.old_attention_span}  {mark}"
            )
        if not apply:
            print("\n실제로 되돌리려면 --apply 를 붙인다.")
            return

        reverted = 0
        for d in decisions:
            if d.action != "revert":
                continue
            profile = profiles[d.row.user_id]
            profile.attention_span = d.row.old_attention_span
            profile.time_chunk_preference = d.row.old_chunk
            reverted += 1
        await session.commit()
        print(f"\n✅ 되돌리기 완료 — {reverted}건.")


def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="attention_span 파서 사고 백필 (v2.00 후속)")
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
                apply=args.apply, ledger_path=Path(args.revert_from), user_email=args.user_email
            )
        )
    else:
        asyncio.run(
            run_backfill(
                apply=args.apply,
                user_email=args.user_email,
                ledger_path=Path(args.ledger_path) if args.ledger_path else None,
            )
        )


if __name__ == "__main__":
    main()
