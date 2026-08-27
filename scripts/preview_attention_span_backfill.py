"""집중 지속(attention_span) 오염 행 미리보기 — 백필 대상 선별 (읽기 전용).

배경: 인터뷰 슬롯 `energy.focus_duration` 의 칩 **"2시간 이상"** 을 숫자만 긁는 파서가
**2(분)** 으로 읽었다(v2.00 에서 수정). 계획 승인 시 `profile_memory` 가 그 값을
`behavioral_profiles.attention_span` 에 그대로 적었으므로, 수정 이전에 그 칩을 고르고
계획을 승인한 사용자의 프로필에는 **2** 가 남아 있다.

선별 술어가 `attention_span < 15` 인 이유: 이 값의 출처는 칩 4종(25/50/90/120분)과
미응답 기본값(30)뿐이라 **정상 경로로는 15 미만이 나올 수 없다**. 즉 15 미만은 전부
파서 사고의 흔적이다(`first_plan_adapter._MIN_ACTION_MINUTES` 와 같은 경계).

읽기 전용이다 — 실제 갱신은 `scripts.backfill_attention_span` 이 한다.

실행:
  uv run python -m scripts.preview_attention_span_backfill
  uv run python -m scripts.preview_attention_span_backfill --user-email someone@example.com
"""

from __future__ import annotations

import argparse
import asyncio
from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.db.models.behavioral_profile import BehavioralProfile
from reaction_backend.db.models.interview_session import InterviewSession
from reaction_backend.db.models.interview_slot_answer import InterviewSlotAnswer
from reaction_backend.db.models.user import User
from reaction_backend.db.session import get_sessionmaker
from reaction_backend.orchestrator.interview_adapter import chip_duration_min

# 정상 경로로 나올 수 있는 최솟값 — 칩은 25/50/90/120, 미응답 기본은 30.
# 이보다 작으면 파서 사고다. `first_plan_adapter._MIN_ACTION_MINUTES` 와 같은 경계.
IMPOSSIBLE_BELOW_MIN = 15

FOCUS_SLOT_KEY = "energy.focus_duration"


@dataclass(frozen=True, slots=True)
class PollutedProfile:
    """백필 후보 한 행 — 현재 값과, 슬롯 답에서 다시 읽은 값."""

    user_id: UUID
    email: str
    current_attention_span: int
    current_chunk: str
    chip_answer: str | None
    recomputed: int | None

    @property
    def fixable(self) -> bool:
        """슬롯 답이 남아 있어 정확한 값을 되찾을 수 있는가."""
        return self.recomputed is not None and self.recomputed >= IMPOSSIBLE_BELOW_MIN


def polluted_profiles_stmt(user_email: str | None = None) -> Select[tuple[BehavioralProfile, User]]:
    """오염된 `behavioral_profiles` 행 + 사용자. 백필/미리보기가 **같은 술어**를 쓴다."""
    stmt = (
        select(BehavioralProfile, User)
        .join(User, User.id == BehavioralProfile.user_id)
        .where(BehavioralProfile.attention_span < IMPOSSIBLE_BELOW_MIN)
    )
    if user_email:
        stmt = stmt.where(User.email == user_email)
    return stmt.order_by(User.email)


async def latest_focus_chip(session: AsyncSession, user_id: UUID) -> str | None:
    """그 사용자의 **가장 최근** 인터뷰에서 고른 집중 지속 칩 원문. 없으면 None.

    슬롯 답(raw chip)은 그대로 남아 있으므로, 고친 파서로 다시 읽으면 정확한 값이 나온다 —
    프로필 값만 파생 시점에 오염된 것이다.
    """
    stmt = (
        select(InterviewSlotAnswer.value)
        .join(InterviewSession, InterviewSession.id == InterviewSlotAnswer.session_id)
        .where(
            InterviewSession.user_id == user_id,
            InterviewSlotAnswer.slot_key == FOCUS_SLOT_KEY,
        )
        .order_by(InterviewSession.started_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    row = result.scalar_one_or_none()
    if row is None:
        return None
    chips = row.get("values") if isinstance(row, dict) else None
    if isinstance(chips, list) and chips:
        return str(chips[0])
    return None


async def collect(session: AsyncSession, user_email: str | None = None) -> list[PollutedProfile]:
    """오염 행마다 '지금 값' 과 '슬롯 답에서 다시 읽은 값' 을 나란히 모은다."""
    result = await session.execute(polluted_profiles_stmt(user_email))
    out: list[PollutedProfile] = []
    for profile, user in result.all():
        chip = await latest_focus_chip(session, user.id)
        out.append(
            PollutedProfile(
                user_id=user.id,
                email=user.email,
                current_attention_span=profile.attention_span,
                current_chunk=profile.time_chunk_preference,
                chip_answer=chip,
                recomputed=chip_duration_min({"type": "chip", "values": [chip]}) if chip else None,
            )
        )
    return out


async def run(user_email: str | None = None) -> list[PollutedProfile]:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        rows = await collect(session, user_email)

    if not rows:
        print("✅ 오염된 프로필 없음 — attention_span 이 전부 15분 이상이다.")
        return rows

    print(f"⚠️  오염 의심 프로필 {len(rows)}건 (attention_span < {IMPOSSIBLE_BELOW_MIN})\n")
    for r in rows:
        arrow = f"{r.recomputed}분" if r.fixable else "복구 불가(슬롯 답 없음)"
        print(
            f"  {r.email:<38} attention_span={r.current_attention_span:>3} "
            f"chunk={r.current_chunk:<3} 칩={r.chip_answer or '-':<10} → {arrow}"
        )
    fixable = sum(1 for r in rows if r.fixable)
    print(f"\n  복구 가능 {fixable}건 / 복구 불가 {len(rows) - fixable}건")
    if fixable < len(rows):
        print("  복구 불가 행은 백필이 기본값(30분)으로 올린다 — 재인터뷰하면 정확해진다.")
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="attention_span 오염 행 미리보기 (읽기 전용)")
    parser.add_argument("--user-email", default=None, help="특정 사용자만 (기본: 전체)")
    args = parser.parse_args()
    asyncio.run(run(args.user_email))


if __name__ == "__main__":
    main()
