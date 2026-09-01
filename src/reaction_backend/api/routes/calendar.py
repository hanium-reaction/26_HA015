"""Calendar — Google Calendar 연동 (S04, api-contract §9).

Issue #17 (Alpha MVP)은 캘린더 OAuth 자체를 P1 로 미뤘었다. **그 보류가 해제됐다** —
연결(`connect`/`disconnect`)이 실구현이다. 계기는 ADR-0009 D4: 계획을 분 단위로 짜기
시작하면서 "외부 일정 앞뒤"를 모르는 스케줄러가 못 지킬 계획을 만들기 때문이다.

범위는 **읽기 전용**이다. 스코프는 `calendar.freebusy` 하나 — 구간의 길이와 인접성만
있으면 스케줄러의 세 룰이 성립하고 제목·장소는 필요 없다. `events.insert`(write-back)는
**P1 유지**이고 `sync-preview`/`approve-insert` 는 아직 stub 이다.

`GOOGLE_CALENDAR_ENABLED=false`(기본)면 연결 엔드포인트는 501 로 남는다 — Cloud 콘솔
셋업(client_secret·리디렉션 URI)은 사람 손이 필요해서, 준비 전에 배포돼도 사용자가
깨진 동의 화면을 만나지 않게 하는 안전핀이다.
"""

import logging
from datetime import datetime
from http import HTTPStatus
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.api.deps import CurrentUser
from reaction_backend.api.mock.calendar import DEMO_FREEBUSY
from reaction_backend.config import get_settings
from reaction_backend.db.session import get_db
from reaction_backend.integrations.google_calendar import oauth, token_store
from reaction_backend.schemas.calendar import (
    ApproveInsertResult,
    BusyInterval,
    CalendarConnection,
    CalendarConnectRequest,
    CalendarEventPreview,
    FreeBusy,
    SyncPreview,
)
from reaction_backend.schemas.common import KST
from reaction_backend.schemas.errors import ApiError, ErrorCode

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])

SessionDep = Annotated[AsyncSession, Depends(get_db)]


def _require_enabled() -> None:
    """기능 스위치 + 자격증명 확인. 어느 하나라도 없으면 예전처럼 501."""
    cfg = get_settings()
    if (
        cfg.google_calendar_enabled
        and cfg.google_oauth_client_id
        and cfg.google_oauth_client_secret
    ):
        return
    raise ApiError(
        ErrorCode.COMMON_NOT_IMPLEMENTED,
        "Google Calendar 연결은 아직 준비 중이에요. 지금은 '수동 입력으로 시작'을 눌러주세요.",
        http_status=HTTPStatus.NOT_IMPLEMENTED,
    )


def _connect_failed(reason: str) -> ApiError:
    """토큰 교환 실패 → 422. 새 에러 코드를 만들지 않는다 (에러 체계 변경은 AGENTS §8).

    보낸 `code` 가 만료·재사용·불일치라는 뜻이라 입력 검증 실패로 본다 — 레포 관례대로
    `COMMON_VALIDATION_ERROR` + 422. Google 의 `error` 값은 사용자에게 의미가 없어
    노출하지 않고 로그(`reason`)로만 남긴다.
    """
    return ApiError(
        ErrorCode.COMMON_VALIDATION_ERROR,
        "캘린더 연결에 실패했어요. 다시 시도해 주세요.",
        http_status=HTTPStatus.UNPROCESSABLE_ENTITY,
    )


@router.post("/connect")
async def connect_calendar(
    body: CalendarConnectRequest, user: CurrentUser, session: SessionDep
) -> CalendarConnection:
    """authorization code → 토큰 암호화 저장. 재호출은 기존 연결을 갱신한다.

    멱등하다 — 같은 사용자가 다시 연결하면 새 행이 아니라 기존 행을 되살린다
    (`user_id` 유니크 + soft delete 라 새 INSERT 는 제약에 걸린다).
    """
    _require_enabled()
    try:
        bundle = await oauth.exchange_code(body.code)
    except oauth.OAuthError as exc:
        logger.info("calendar_connect_failed", extra={"reason": exc.reason})
        raise _connect_failed(exc.reason) from exc

    connection = await token_store.save(session, user_id=user.id, bundle=bundle)
    await session.commit()
    return CalendarConnection(
        provider=connection.provider,
        connected=True,
        scopes=connection.scopes.split(),
    )


@router.delete("/connect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_calendar(user: CurrentUser, session: SessionDep) -> None:
    """연결 해제 — `revoked_at` soft delete + Google 쪽 권한 회수(best-effort).

    연결이 없어도 **204** 다. 해제는 멱등해야 한다 — 두 번 눌렀다고 404 를 주면
    "이미 끊긴 상태"가 실패로 보인다.

    우리 DB 를 먼저 확정하고 원격 회수는 그 뒤에 한다. 순서를 뒤집으면 Google 은
    끊겼는데 우리는 연결됐다고 믿는 상태가 생긴다.
    """
    _require_enabled()
    connection = await token_store.get_active(session, user_id=user.id)
    if connection is None:
        return None

    refresh_token = token_store.refresh_token_of(connection)
    await token_store.mark_revoked(session, connection)
    await session.commit()
    await oauth.revoke(refresh_token)
    return None


@router.get("/freebusy")
async def get_freebusy(
    from_: Annotated[str, Query(alias="from")],
    to: Annotated[str, Query()],
) -> FreeBusy:
    """[stub] read-only freebusy 조회. from·to 는 조회 범위 (스텁은 고정 구간 반환)."""
    return FreeBusy(busy=[BusyInterval(start=iv.start, end=iv.end) for iv in DEMO_FREEBUSY])


@router.post("/sync-preview")
async def sync_preview() -> SyncPreview:
    """[stub] 계획 → 캘린더 이벤트 미리보기 + 충돌 체크."""
    events = [
        CalendarEventPreview(
            title="캡스톤 설계",
            start=datetime(2026, 5, 26, 10, 0, tzinfo=KST),
            end=datetime(2026, 5, 26, 12, 0, tzinfo=KST),
            conflict=False,
        ),
        CalendarEventPreview(
            title="토익 공부",
            start=datetime(2026, 5, 26, 14, 0, tzinfo=KST),
            end=datetime(2026, 5, 26, 15, 0, tzinfo=KST),
            conflict=True,
        ),
    ]
    return SyncPreview(events=events, conflict_count=1)


@router.post("/events/approve-insert")
async def approve_insert() -> ApproveInsertResult:
    """[stub] 사용자 승인 이벤트 일괄 삽입. Idempotency-Key 필수 (미들웨어가 강제)."""
    return ApproveInsertResult(inserted_count=2)
