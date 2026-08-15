"""HTML → 텍스트 (BE #226).

파서 라이브러리를 새로 넣지 않고 표준 라이브러리 `html.parser` 로 간다 — `content/
registry.py` 에서 PyYAML(직접 의존이 아니라 transitive 라 상류가 끊으면 조용히 깨진다)
을 피해 수제 파서로 갔던 것과 같은 판단이다.

완벽한 본문 추출(readability)이 목적이 아니다. 분해 프롬프트가 쓸 **강의계획서·요구사항·
목차 같은 텍스트 뼈대**만 건지면 되고, 어차피 2000자로 잘려 나간다.
"""

from __future__ import annotations

import re
from html.parser import HTMLParser
from typing import Final

# 내용이 아니라 코드·스타일인 태그. 안쪽 텍스트를 통째로 버린다.
_SKIP_TAGS: Final[frozenset[str]] = frozenset(
    {"script", "style", "noscript", "template", "svg", "head"}
)
# 텍스트가 붙어 버리면 안 되는(줄바꿈으로 끊어야 하는) 블록 태그.
_BREAK_TAGS: Final[frozenset[str]] = frozenset(
    {
        "p",
        "div",
        "br",
        "li",
        "tr",
        "section",
        "article",
        "header",
        "footer",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "table",
        "blockquote",
    }
)

_BLANK_RUN = re.compile(r"\n{3,}")
_SPACE_RUN = re.compile(r"[ \t ]{2,}")


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIP_TAGS:
            self._skip_depth += 1
        elif tag in _BREAK_TAGS:
            self._chunks.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIP_TAGS:
            # 여는 태그 없이 닫는 태그만 오는 깨진 문서에서 음수로 내려가지 않게 한다.
            self._skip_depth = max(self._skip_depth - 1, 0)
        elif tag in _BREAK_TAGS:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            self._chunks.append(data)

    def text(self) -> str:
        return "".join(self._chunks)


def html_to_text(html: str) -> str:
    """태그를 걷어낸 본문. 공백·빈 줄은 압축한다(토큰 낭비 방지)."""
    parser = _TextExtractor()
    parser.feed(html)
    parser.close()
    lines = [_SPACE_RUN.sub(" ", line).strip() for line in parser.text().splitlines()]
    return _BLANK_RUN.sub("\n\n", "\n".join(lines)).strip()
