"""링크뿐인 참고 자료를 열어 프롬프트에 싣는다 (BE #226 1단계).

이 기능의 가치는 하나다 — 지금까지 **사용자가 준 정보를 버리고 있었다.** 링크만 준 목표는
`(없음)` 으로 떨어져, 분해가 목표·완료기준만 보고 잡혔다. 그 방어 자체는 옳았다(링크가
있다는 이유로 '자료 있음' 처리하면 LLM 이 지어낸다 — 실측 '20강' 회귀).

그래서 여기서 고정하는 것:
- 열었으면 **그 본문이 프롬프트에 실리고**, 되묻기는 사라진다(방금 반영해 놓고 "못 읽었어요"
  라고 하면 거짓말이다).
- 못 열었으면 **예전 동작 그대로** — `(없음)` + 되묻기. 사유별 문구로만 달라진다.
- 링크와 함께 설명을 적었으면 **건드리지 않는다**. 사용자가 쓴 글을 수집물로 덮지 않는다.
"""

from __future__ import annotations

import pytest

from reaction_backend.integrations.web_fetch import fetcher, url_guard
from reaction_backend.orchestrator import first_plan_adapter, materials_resolver


def _fetch_returns(monkeypatch: pytest.MonkeyPatch, result: fetcher.FetchResult) -> list[str]:
    seen: list[str] = []

    async def _fake(url: str) -> fetcher.FetchResult:
        seen.append(url)
        return result

    monkeypatch.setattr(materials_resolver.fetcher, "fetch_text", _fake)
    return seen


# ── URL 추출 ──────────────────────────────────────────────


@pytest.mark.parametrize(
    ("note", "expected"),
    [
        ("https://ex.com/a", ["https://ex.com/a"]),
        # `www.` 로 시작하는 답도 링크뿐으로 판정되므로 열 수 있어야 한다 — 스킴을 붙여준다.
        ("www.ex.com/syllabus", ["https://www.ex.com/syllabus"]),
        # 문장 끝 구두점이 URL 에 붙어 404 가 되던 흔한 실수.
        ("https://ex.com/a.", ["https://ex.com/a"]),
        ("(https://ex.com/a)", ["https://ex.com/a"]),
        ("https://a.com/1 https://b.com/2", ["https://a.com/1", "https://b.com/2"]),
        ("", []),
    ],
)
def test_extract_urls(note: str, expected: list[str]) -> None:
    assert first_plan_adapter.extract_urls(note) == expected


def test_link_only_note_always_yields_at_least_one_url() -> None:
    """'링크뿐' 판정과 URL 추출이 **같은 패턴**을 써야 한다.

    어긋나면 링크뿐이라고 판정해 놓고 열 URL 을 못 찾아 그 자료는 영영 '(없음)' 이다.
    """
    for note in ["https://ex.com/a", "www.ex.com/b", "  https://ex.com/c  ", "https://ex.com/d."]:
        assert first_plan_adapter.materials_is_link_only(note)
        assert first_plan_adapter.extract_urls(note), f"열 URL 을 못 찾았다: {note}"


# ── resolve ───────────────────────────────────────────────


async def test_fetched_body_becomes_the_materials(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _fetch_returns(monkeypatch, fetcher.FetchResult("1주차 OT\n2주차 스레드", None))
    resolved = await materials_resolver.resolve("https://lecture.example/syllabus")

    assert resolved.ok
    assert "2주차 스레드" in (resolved.text or "")
    assert resolved.notice is None
    assert seen == ["https://lecture.example/syllabus"]


async def test_note_with_description_is_never_fetched(monkeypatch: pytest.MonkeyPatch) -> None:
    """사용자가 쓴 설명이 있으면 그게 실제 내용이다 — 수집물로 덮지 않는다."""
    seen = _fetch_returns(monkeypatch, fetcher.FetchResult("웹에서 긁어온 것", None))
    resolved = await materials_resolver.resolve("https://ex.com/s 1주차 스레드, 2주차 VM")

    assert seen == [], "설명이 있는데 링크를 열었다"
    assert not resolved.ok and resolved.notice is None


async def test_empty_note_is_not_fetched(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _fetch_returns(monkeypatch, fetcher.FetchResult("x", None))
    assert not (await materials_resolver.resolve(None)).ok
    assert not (await materials_resolver.resolve("   ")).ok
    assert seen == []


async def test_only_the_first_link_is_opened(monkeypatch: pytest.MonkeyPatch) -> None:
    """왕복 1회 — 링크를 여러 개 줘도 계획 생성이 그만큼 늦어지면 안 된다."""
    seen = _fetch_returns(monkeypatch, fetcher.FetchResult("본문", None))
    await materials_resolver.resolve("https://a.com/1 https://b.com/2 https://c.com/3")
    assert seen == ["https://a.com/1"]


@pytest.mark.parametrize(
    ("reason", "fragment"),
    [
        (fetcher.REASON_LOGIN_REQUIRED, "로그인"),
        (fetcher.REASON_NOT_FOUND, "페이지가 없"),
        (fetcher.REASON_UNSUPPORTED_TYPE, "파일"),
        (fetcher.REASON_TIMEOUT, "제때"),
        (url_guard.REASON_PRIVATE, "열 수 없는 주소"),
    ],
)
async def test_failure_notices_explain_why(
    monkeypatch: pytest.MonkeyPatch, reason: str, fragment: str
) -> None:
    """ "가끔 되고 가끔 안 되는" 기능으로 읽히지 않게 사유를 구분해 말한다."""
    _fetch_returns(monkeypatch, fetcher.FetchResult(None, reason))
    resolved = await materials_resolver.resolve("https://ex.com/x")

    assert not resolved.ok
    assert resolved.notice is not None
    assert fragment in resolved.notice
    assert "붙여넣어" in resolved.notice, "되묻기(다음 행동)가 빠졌다"


async def test_unknown_reason_still_gets_a_notice(monkeypatch: pytest.MonkeyPatch) -> None:
    """사유 상수가 늘어나도 사용자가 빈 문구를 보지 않는다."""
    _fetch_returns(monkeypatch, fetcher.FetchResult(None, "brand_new_reason"))
    resolved = await materials_resolver.resolve("https://ex.com/x")
    assert resolved.notice and "붙여넣어" in resolved.notice


# ── 프롬프트·경고 연결 ────────────────────────────────────


def test_fetched_materials_replace_the_none_sentinel() -> None:
    note = "https://ex.com/syllabus"
    assert first_plan_adapter.materials_for_prompt(note) == "(없음)"
    assert first_plan_adapter.materials_for_prompt(note, fetched="1주차 OT") == "1주차 OT"
    # 못 가져왔으면(None) 예전 그대로 — 이게 회귀 방지선이다.
    assert first_plan_adapter.materials_for_prompt(note, fetched=None) == "(없음)"


def test_fetched_materials_are_clipped() -> None:
    """토큰 budget — 수집물은 붙여넣기보다 길기 쉽다."""
    long_body = "가" * 5000
    out = first_plan_adapter.materials_for_prompt("https://ex.com/x", fetched=long_body)
    assert len(out) < len(long_body)
    assert out.endswith("…(이하 생략)")


def test_user_pasted_text_still_wins_when_nothing_was_fetched() -> None:
    assert first_plan_adapter.materials_for_prompt("1주차 스레드") == "1주차 스레드"
