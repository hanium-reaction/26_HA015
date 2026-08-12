"""brief 프롬프트 회귀 (#224) — 변수 집합과 '지어내기 금지' 규칙 고정.

morning_brief 는 하드코딩 스텁 3개를 받던 시절 LLM 이 "(데이터 없음)" 자리를
"어제는 조용히 잘 보냈어요" 로 메웠다(라이브 실측). 프롬프트의 방어 규칙이 조용히
빠지면 코드는 초록인 채 그 회귀가 돌아오므로, 규칙의 핵심 문구를 여기서 고정한다.
"""

from __future__ import annotations

import re
from pathlib import Path

_PROMPT = (
    Path(__file__).resolve().parents[2]
    / "src"
    / "reaction_backend"
    / "prompts"
    / "brief"
    / "morning_brief.v1.md"
).read_text(encoding="utf-8")

_PLACEHOLDER_RE = re.compile(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}")

# scheduler/morning_brief.py 의 variables= 와 동기화 — 어긋나면 렌더가 빈 값을 남긴다.
_CODE_VARS = {
    "today_kst",
    "yesterday_summary",
    "today_focus_cards",
    "today_maintain_cards",
    "behavioral_summary",
}


def test_placeholders_match_code_variables() -> None:
    assert set(_PLACEHOLDER_RE.findall(_PROMPT)) == _CODE_VARS


def test_forbids_fabricating_yesterday() -> None:
    """어제 데이터가 없으면 어제를 언급하지 않는다 — #224 문제 1의 방어선."""
    assert "(어제 카드 없음)" in _PROMPT
    assert "지어내지 마라" in _PROMPT
    assert "어제에 대해 아무 말도 하지 마라" in _PROMPT


def test_requires_mentioning_todays_card() -> None:
    """카드가 있으면 headline 이 그 카드를 언급해야 한다 — #224 문제 2의 방어선."""
    assert "제목 그대로 언급" in _PROMPT


def test_pins_length_rule() -> None:
    """길이 상한이 프롬프트에 남아 있는지 — 스키마(max_length=140)와 이중 방어."""
    assert "70~120자" in _PROMPT
    assert "120자를 절대 넘기지 마라" in _PROMPT


def test_narrows_adjustment_hints() -> None:
    """hints 는 '오늘 카드 조정 제안'만 — 웰니스 일반론 금지, 근거 없으면 빈 배열."""
    assert "빈 배열" in _PROMPT
    assert "웰니스" in _PROMPT
