"""링크뿐인 참고 자료를 실제 본문으로 바꾼다 (BE #226 1단계).

지금까지는 사용자가 링크만 주면 `(없음)` 으로 떨어뜨렸다. 옳은 방어였다 — 링크가 있다는
이유로 '자료 있음' 처리하면 LLM 이 내용을 아는 척하며 지어냈다(`first_plan_adapter.
materials_is_link_only` 주석의 실측: 존재 여부도 모르는 '20강' 구성). 하지만 그건
**사용자가 준 정보를 버리는** 방식이기도 했다.

그래서 열어본다. **못 열면 지금과 똑같이 `(없음)`** 이라 회귀 위험이 없다.

저장하지 않는다 — 가져온 본문은 프롬프트 변수로만 쓰고 버린다. 인박스 항목으로 노출하려면
수집물 저장소와 slug 발급이 필요한데 그건 마이그레이션(AGENTS §8)이라 2단계다(#226).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from reaction_backend.integrations.web_fetch import fetcher, url_guard
from reaction_backend.orchestrator import first_plan_adapter

logger = logging.getLogger(__name__)

# 사용자에게 보일 문구 — 왜 못 열었는지를 구분해야 "가끔 되고 가끔 안 되는" 기능으로
# 읽히지 않는다. 키는 fetcher/url_guard 의 REASON_* 상수.
_REASON_MESSAGES: dict[str, str] = {
    fetcher.REASON_LOGIN_REQUIRED: "로그인이 필요한 페이지라 제가 열 수 없었어요.",
    fetcher.REASON_NOT_FOUND: "링크를 열어봤는데 페이지가 없었어요.",
    fetcher.REASON_UNSUPPORTED_TYPE: "글이 아니라 파일이라 제가 읽을 수 없었어요.",
    fetcher.REASON_EMPTY: "페이지에서 읽을 만한 내용을 찾지 못했어요.",
    fetcher.REASON_TIMEOUT: "페이지가 제때 열리지 않았어요.",
    url_guard.REASON_PRIVATE: "열 수 없는 주소예요.",
    url_guard.REASON_SCHEME: "열 수 없는 주소예요.",
    url_guard.REASON_PORT: "열 수 없는 주소예요.",
    url_guard.REASON_MALFORMED: "링크 형식을 알아볼 수 없었어요.",
    url_guard.REASON_DNS: "링크의 주소를 찾을 수 없었어요.",
}
_FALLBACK_MESSAGE = "링크를 여는 데 실패했어요."


@dataclass(frozen=True)
class ResolvedMaterials:
    """가져온 본문(`text`)과, 못 가져왔을 때 사용자에게 할 말(`notice`)."""

    text: str | None
    notice: str | None

    @property
    def ok(self) -> bool:
        return self.text is not None


NOT_ATTEMPTED = ResolvedMaterials(None, None)


def _notice(reason: str | None) -> str:
    head = _REASON_MESSAGES.get(reason or "", _FALLBACK_MESSAGE)
    return f"참고 자료를 링크로 주셨는데 {head} 내용을 직접 붙여넣어 주시면 그대로 반영할게요."


async def resolve(note: str | None) -> ResolvedMaterials:
    """자료 답이 **링크뿐일 때만** 열어본다.

    설명을 함께 적었으면 그건 이미 실제 내용이므로 건드리지 않는다 — 사용자가 쓴 글을
    수집물로 덮어쓰지 않기 위해서다.
    """
    if not note or not first_plan_adapter.materials_is_link_only(note):
        return NOT_ATTEMPTED
    urls = first_plan_adapter.extract_urls(note)
    if not urls:
        return NOT_ATTEMPTED

    # **첫 링크 하나만** 연다 — 왕복이 늘면 계획 생성이 그만큼 늦어지고(#179 타임아웃),
    # 여러 개를 준 경우 보통 첫 번째가 본 자료다(나머지는 참고·부록). 상한을 상수로 두지
    # 않는 이유: 뮤테이션에서 '값을 바꿔도 아무 일이 없는' 장식용 상수로 드러났다.
    result = await fetcher.fetch_text(urls[0])
    if result.ok:
        logger.info("materials link fetched (%d chars)", len(result.text or ""))
        return ResolvedMaterials(result.text, None)
    logger.info("materials link not fetched: %s", result.reason)
    return ResolvedMaterials(None, _notice(result.reason))
