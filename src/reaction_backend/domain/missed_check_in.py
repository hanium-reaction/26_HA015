"""블록 후 미체크 판정 — 단일 진실 소스 (근거 대장 §6.2 T1).

**T1(블록 후 미체크)**: 블록 시작 +20분이 지났는데 아직 체크인(=[▶ 시작]조차) 안 한 카드
— **push 가 아니라 인앱 배지/인박스**로 알린다(잠금 3규칙이 push 클래스를 3종으로
고정해 새 push 클래스를 못 만든다 — `NOTIFICATION_CLASSES`, `safety/push_gate.py`).

이 모듈은 "배지를 몇 번 보여줄지", "언제 사라지는지" 는 모른다 — 그건 FE 의
몫이다(reaction-frontend#224). 여기는 **판정 하나만** 한다: 지금 이 블록이 미체크
상태인가. `GET /today/agenda` 가 카드마다 이 판정을 `missedCheckIn` 필드로 실어
보내면, FE 가 배지를 그릴지 말지 스스로 정한다 — `action_cancel.py`(#214)가 이미
쓰고 있는 "판정은 서버 하나, 표현은 FE" 원칙과 같다.

⚠️ **스코프 경계**: 근거 대장 §6.2 의 중단 조건("최근 앱 세션 있음 → skip", "무응답
누적 → pause") 은 여기 없다. 그 조건들은 계산 불가능하다고 문서가 명시했다
(`app_sessions` 테이블 부재 — §6.2 "선행 조건" 각주). 이 판정은 그 억제 없이 "블록이
지났고 시작 안 함"만 본다 — 과다 발송(같은 카드를 계속 미체크로 보여줌) 여부는 FE 가
배지 노출 빈도로 조절해야 한다.

프레임워크·ORM 의존성 없음(AGENTS §4) — 원시값만 받는다.
"""

from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Final

if TYPE_CHECKING:
    from datetime import datetime

# 근거 대장 §6.2 T1 — "시작 +20분". D3(근접창 60분) 안에서 설계자가 고른 값(정직 표기).
# 이제 이 값은 **상한**이다 — `missed_check_in_delay` 참고 (ADR-0009 D5).
MISSED_CHECK_IN_DELAY: Final[timedelta] = timedelta(minutes=20)

# 유예의 하한. 이보다 짧으면 "잠깐 늦은 것" 과 "안 한 것" 을 구분할 수 없다.
MIN_MISSED_CHECK_IN_DELAY: Final[timedelta] = timedelta(minutes=5)

# 블록 길이 대비 유예 비율. 20분 상한에 닿는 지점이 약 67분이라, 한 시간 넘는 블록은
# 사실상 종전과 같은 20분을 받는다 — 짧은 블록만 완화된다.
_DELAY_RATIO: Final[float] = 0.3

# [▶ 시작] 이전에만 이 상태다 — `today.py::start_action` 이 누르는 순간 'started' 로
# 바뀐다. 이 판정은 그 전이가 **아직 안 일어난** 블록만 본다.
_UNSTARTED_BLOCK_STATUS: Final[str] = "scheduled"


def missed_check_in_delay(block_minutes: int | None) -> timedelta:
    """이 블록의 미체크 유예 — 길이에 비례하되 `[5분, 20분]` 안에서 (ADR-0009 D5).

    예전엔 길이와 무관한 **고정 20분**이었다. 계획 세션이 전부 비슷한 길이일 때는 문제가
    안 됐지만, 길이가 작업 내용을 따라가면(ADR-0009 D2) 짧은 블록에서 판정이 무의미해진다:
    15분짜리 블록은 **끝나고 5분 뒤**에야 미체크로 잡히고, 그 배지는 "지금 시작하라" 는
    신호가 아니라 "이미 지나갔다" 는 사후 통보가 된다. 시작을 유도할 수 없으니 영영
    사라지지 않는 유령 배지로 남는다.

    상한 20분을 **유지**하는 게 핵심이다. 근거 대장 §6.2 T1 이 그 값을 명시했으므로 이
    변경은 그 선을 넘지 않는 방향으로만(짧은 블록의 오탐 제거) 완화한다 — 잠금 우회가 아니다.
    비율 0.3 이면 약 67분에서 상한에 닿아, 한 시간 넘는 블록은 사실상 종전과 같다.

    `block_minutes` 가 없으면(길이를 모르는 호출자) 종전대로 상한을 쓴다.
    """
    if block_minutes is None or block_minutes <= 0:
        return MISSED_CHECK_IN_DELAY
    scaled = timedelta(minutes=block_minutes * _DELAY_RATIO)
    return max(MIN_MISSED_CHECK_IN_DELAY, min(MISSED_CHECK_IN_DELAY, scaled))


def is_missed_check_in(
    *,
    block_status: str,
    start_at: datetime,
    now: datetime,
    block_minutes: int | None = None,
) -> bool:
    """이 블록이 지금 "미체크" 상태인가 — 시작 안 했고, 유예가 지났는가.

    `block_status != 'scheduled'` 면 이미 시작했거나(started) 끝났거나(finished)
    취소됐다(cancelled) — 어느 쪽이든 "아직 안 함" 신호가 아니므로 False.

    유예는 블록 길이에 비례한다(`missed_check_in_delay`). **카드의 `estimated_minutes` 가
    아니라 블록의 실제 길이**를 쓴다 — 사용자가 주간 편집기에서 블록 길이를 바꾸면 둘이
    갈라지는데, 사용자가 보고 있는 건 블록이다.
    """
    return block_status == _UNSTARTED_BLOCK_STATUS and now >= start_at + missed_check_in_delay(
        block_minutes
    )
