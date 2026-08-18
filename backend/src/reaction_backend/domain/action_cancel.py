"""카드 취소 가능 판정 — 단일 진실 소스 (BE #214).

이 규칙은 **두 곳에서 같이 쓰인다**: `GET /today/agenda` 가 카드마다 실어 보내는
`cancellable` 과, `POST /today/actions/{id}/cancel` 의 가드. 한쪽에만 두면 FE 가 버튼을
띄워 놓고 눌렀을 때 422 를 받는 상태로 조용히 어긋난다 — FE 가 #214 에서 정확히 그
드리프트를 우려했고(FE #196·#200 에서 실제로 겪었다고), 그래서 판정은 여기 하나뿐이다.

프레임워크·ORM 의존성 없음(AGENTS §4) — 원시값만 받는다.
"""

from __future__ import annotations

from typing import Final

# 취소를 열어 주는 출처. `goal`/`habit` 파생은 계획 정합성(주간 그리드·습관 카운트)이
# 걸려 있어 별건이고, `recovery_*` 는 `resulting_action_item_id` 로 회복 지표
# (`complete_for_action`·`abandon_stale`)와 얽혀 있어 취소하면 지표가 깨진다.
CANCELLABLE_SOURCES: Final[frozenset[str]] = frozenset({"inbox", "manual"})

# 취소는 '아직 시작도 안 한 일' 만 지운다. 시작한 뒤엔 체크인·회고가 정답이다.
CANCELLABLE_STATUS: Final[str] = "planned"


def is_cancellable(*, status: str, source: str, has_execution_history: bool) -> bool:
    """이 카드를 취소(보관)할 수 있는가.

    세 조건이 **전부** 참이어야 한다:
    - `status == 'planned'` — 시작한 카드는 실행 이력이 지표의 근거라 지우면 안 된다.
    - `source ∈ {inbox, manual}` — 사용자가 스스로 담은 것만.
    - 실행 이력 없음 — status 가 planned 로 남아 있어도 시작했다 되돌아온 이력이 있으면
      그 카드는 '없던 일' 이 아니다.
    """
    return (
        status == CANCELLABLE_STATUS and source in CANCELLABLE_SOURCES and not has_execution_history
    )


def rejection_reason(*, status: str, source: str, has_execution_history: bool) -> str | None:
    """취소할 수 없는 이유 — 사용자에게 그대로 보여줄 문구. 취소 가능하면 None.

    FE 가 사유별로 다른 안내를 띄울 수 있어야 한다(#214 코멘트). 공용 문구
    '입력값을 확인해 주세요' 는 여기서 틀린 말이다 — 사용자가 입력한 게 없다.
    """
    if is_cancellable(status=status, source=source, has_execution_history=has_execution_history):
        return None
    if status != CANCELLABLE_STATUS or has_execution_history:
        return "이미 시작한 일이라 취소할 수 없어요. 오늘 회고에서 정리해 주세요."
    return "이 카드는 계획에 묶여 있어 취소할 수 없어요."
