"""요청 1건 = trace_id 1개 (#370). `llm_runs.trace_id` 의 유일한 공급자.

## 왜 이게 관측용이 아니라 **가드의 일부**인가

`safety/endpoint_rate_limit` 는 "이 사용자가 오늘 이 엔드포인트를 몇 번 실행했는가" 를
센다고 말해 왔지만, 실제로는 `llm_runs` **행 수**(= LLM 호출 수)를 셌다. 둘은 같지 않다 —
실측(#370):

| 엔드포인트 1회 | llm_runs 행 |
| --- | --- |
| `POST /interview/.../answers` (칩 답) | 2 (ambiguity + next_question) |
| `POST /interview/.../answers` (자유서술) | 3 (+ slot_extraction) |
| `POST /plans/generate` | 최대 7 (분해×3 + 검토×3 + 마일스톤, `MAX_REPLAN=2`) |

그래서 상한 20 은 "20회 실행"이 아니라 인터뷰 8턴이었고, **필수 슬롯 18개짜리 계획
인터뷰(완주 49콜)를 아무도 끝낼 수 없었다.** 상한을 올리는 건 증상 처치다 — 노드를 하나
더 붙이는 순간 같은 사고가 재발한다(실제로 `harvest_slots` 가 추가되며 2콜→3콜이 됐다).

**단위를 고친다.** 한 요청 안의 모든 LLM 호출이 같은 trace_id 를 달면, 가드는
`COUNT(DISTINCT trace_id)` 로 세어 주석이 약속한 값을 그대로 얻는다. 그러면 호출자가 LLM
호출을 몇 번 하든 상한이 조여지지 않는다.

## 왜 파라미터가 아니라 ContextVar 인가

trace_id 를 인자로 넘기려면 라우터 → 오케스트레이터 → 노드 → `aiClient.run` 까지 11개
호출부를 전부 고쳐야 하고, **다음에 추가되는 호출부는 또 빠뜨린다** — 그게 이 버그가 난
방식이다. ContextVar 는 미들웨어가 요청 경계에서 한 번 심으면 그 요청 안의 모든 await 가
자동으로 물려받으므로, 앞으로 생길 호출부까지 공짜로 덮는다.

이 레포에서 안전한 이유: 가드가 걸린 경로(interview/planning/recovery)는 라우터가
오케스트레이터를 **인라인 await** 한다. BackgroundTasks·`create_task`·`to_thread` 로
LLM 호출을 넘기는 곳이 하나도 없다(2026-08-28 확인). 그런 경로가 생기면 contextvars 가
따라가는지 확인하고, 안 따라가면 그 경로만 `trace_id=` 를 명시로 넘긴다.

요청 밖(cron·스크립트)은 trace_id 가 None 이다 — 그 경로는 사용자별 상한 대상이 아니고,
가드는 None 행을 각각 1회로 세어 예전과 같게 동작한다(fail-safe, `endpoint_rate_limit` 참조).
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

from starlette.types import ASGIApp, Message, Receive, Scope, Send

#: 현재 요청의 trace_id. 요청 밖(cron·스크립트·테스트)에서는 None.
_TRACE_ID: ContextVar[str | None] = ContextVar("reaction_trace_id", default=None)

#: 응답에 실어 주는 헤더 — 사용자가 문의할 때 로그를 찾는 손잡이.
TRACE_HEADER = b"x-request-id"


def new_trace_id() -> str:
    """새 trace_id. `llm_runs.trace_id` 가 `String(60)` 이라 32자 hex 로 충분하다."""
    return uuid.uuid4().hex


def get_trace_id() -> str | None:
    """현재 요청의 trace_id (요청 밖이면 None)."""
    return _TRACE_ID.get()


def set_trace_id(trace_id: str | None) -> None:
    """테스트·비 HTTP 진입점(스크립트)에서 직접 심을 때만. 미들웨어가 있으면 부를 일 없다."""
    _TRACE_ID.set(trace_id)


class CorrelationMiddleware:
    """요청마다 trace_id 를 심고 `X-Request-ID` 로 돌려준다.

    ⚠️ **클라이언트가 보낸 `X-Request-ID` 를 쓰지 않는다.** trace_id 가
    `endpoint_rate_limit` 의 계수 단위가 된 순간부터 이건 관측값이 아니라 **가드 입력**이다.
    클라이언트가 값을 고를 수 있으면 매 요청에 같은 값을 보내 하루치 호출을 1회로 접어
    상한을 통째로 우회할 수 있다. 그래서 서버가 생성한 값만 쓴다 — 요청 헤더는 무시한다.
    (분산 추적으로 클라이언트 상관관계가 필요해지면, 상한 계수와 **다른 필드**로 받는다.)
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        trace_id = new_trace_id()
        _TRACE_ID.set(trace_id)
        raw = trace_id.encode("ascii")

        async def send_with_header(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.append((TRACE_HEADER, raw))
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, send_with_header)
