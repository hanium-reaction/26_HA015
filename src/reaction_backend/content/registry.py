"""Content Registry — 인박스 추천 자료용 정적 마크다운 (BE #171 1단계).

파일 기반 단일 진실 소스:
    content/<category>/<slug>.md

- 디렉토리 스캔으로 자동 발견 → `slug → ContentDoc`.
- `prompts/registry.py` 의 골격(lazy `lru_cache` 스캔 + `reload()` + warn-and-skip)을
  따르되 **버전 접미사와 latest 승격은 두지 않는다**. 프롬프트는 A/B 를 위해 그 의미론이
  의도된 설계지만, 여기는 사용자가 그대로 읽는 글이라 "파일을 떨구는 것만으로 문구가
  조용히 갈리는" 성질이 위험하다. 자료를 고치려면 그 파일을 고친다.
- `get(slug)` 은 스캔이 만든 dict 참조뿐이다. slug 를 경로와 결합하지 않으므로
  경로 순회(`../`)가 방어 코드 없이도 성립하지 않는다 — 이 성질을 깨지 말 것.
- frontmatter 는 평평한 `key: value` 4줄 고정. PyYAML 은 이 레포의 직접 의존성이
  아니라(langchain-core/uvicorn 경유 transitive) 쓰지 않는다.
- `body` 는 frontmatter 를 걷어낸 본문. FE 는 `remark-frontmatter` 를 쓰지 않아
  머리말이 그대로 실리면 setext heading 으로 파싱돼 화면이 깨진다.

카테고리는 Goal 카테고리 9종(`db/models/goal.py`)과 같아야 한다. `content/` 는
`prompts/` 처럼 leaf 라 db 를 import 하지 않고, 어긋남은 sync 테스트가 잡는다.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

_log = logging.getLogger(__name__)

# Goal 카테고리 9종과 동일해야 한다 (db/models/goal.py `GOAL_CATEGORY_VALUES`).
# 여기서 db 를 import 하면 leaf 성질이 깨지므로 값을 복제하고 테스트로 고정한다.
SUPPORTED_CATEGORIES: frozenset[str] = frozenset(
    {
        "study",
        "project",
        "health",
        "routine",
        "schedule",
        "career",
        "relationship",
        "self_dev",
        "other",
    }
)

# 파일명(확장자 제외) = slug. `GET /inbox/resources/{slug}` 경로에 그대로 들어가므로
# 소문자 영숫자와 하이픈만 허용한다. 밑줄·대문자·점은 탈락(조용히 skip + warning).
_FILENAME_RE = re.compile(r"^(?P<slug>[a-z0-9][a-z0-9-]{2,47})\.md$")

# frontmatter 는 이 4개 키만 받는다. 그 외 키는 warning 후 무시.
_FRONTMATTER_KEYS: frozenset[str] = frozenset({"slug", "title", "category", "summary"})

_FM_PREFIX = "---\n"
_FM_SEP = "\n---\n"


class ContentNotFound(KeyError):
    """`slug` 가 레지스트리에 없음. 라우트는 404 `ApiError` 로 변환해야 한다."""


class ContentMalformed(ValueError):
    """frontmatter 규격 위반. 스캔 중에는 warning 후 skip 한다."""


@dataclass(frozen=True, slots=True)
class ContentDoc:
    """자료 1건 — frontmatter 4필드 + 본문."""

    slug: str
    """파일명(확장자 제외)과 동일. 응답·URL 의 식별자."""
    title: str
    """본문 첫 `# ` 제목과 문자 단위로 같아야 한다 (FE 가 중복 제목을 걷어낼 때 대조)."""
    category: str
    """`SUPPORTED_CATEGORIES` 중 하나. 파일이 놓인 디렉토리 이름과 같아야 한다."""
    summary: str
    """인박스 카드에 쓸 한 줄 요약."""
    body: str
    """frontmatter 를 걷어낸 마크다운 본문. 응답의 `markdown` 필드로 그대로 나간다."""
    path: Path


def _content_root() -> Path:
    """이 모듈 옆 폴더 트리. 단일 진실 소스."""
    return Path(__file__).resolve().parent


def parse_document(text: str, *, source: Path) -> tuple[dict[str, str], str]:
    """`---` 로 감싼 평평한 머리말을 (필드, 본문) 으로 가른다.

    중첩·리스트·멀티라인·따옴표를 지원하지 않는다 — 규격을 벗어나면 `ContentMalformed`.
    값에 `:` 가 있어도 첫 `:` 만 구분자로 쓰므로 안전하다.
    """
    if not text.startswith(_FM_PREFIX):
        raise ContentMalformed(f"{source}: frontmatter 가 '---' 로 시작하지 않는다")

    end = text.find(_FM_SEP, len(_FM_PREFIX) - 1)
    if end == -1:
        raise ContentMalformed(f"{source}: frontmatter 를 닫는 '---' 가 없다")

    raw_fields = text[len(_FM_PREFIX) : end]
    body = text[end + len(_FM_SEP) :]

    fields: dict[str, str] = {}
    for line in raw_fields.splitlines():
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        if not sep:
            raise ContentMalformed(f"{source}: frontmatter 줄에 ':' 가 없다 — {line!r}")
        key = key.strip()
        if key not in _FRONTMATTER_KEYS:
            _log.warning("content %s: unknown frontmatter key %r; ignored", source, key)
            continue
        if key in fields:
            raise ContentMalformed(f"{source}: frontmatter 키 중복 — {key!r}")
        fields[key] = value.strip()

    missing = sorted(_FRONTMATTER_KEYS - fields.keys())
    if missing:
        raise ContentMalformed(f"{source}: frontmatter 필수 키 누락 — {missing}")
    if not body.strip():
        raise ContentMalformed(f"{source}: 본문이 비어 있다")
    return fields, body


@dataclass(frozen=True, slots=True)
class _RegistryState:
    by_slug: dict[str, ContentDoc]
    """`slug` → doc. slug 는 카테고리를 가로질러 전역 유일해야 한다(URL 키이므로)."""


def _scan() -> _RegistryState:
    root = _content_root()
    by_slug: dict[str, ContentDoc] = {}

    for category_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        category = category_dir.name
        if category.startswith("_") or category.startswith("."):
            continue
        if category not in SUPPORTED_CATEGORIES:
            _log.warning("content category %r not in SUPPORTED_CATEGORIES; ignored", category)
            continue

        for md_path in sorted(category_dir.glob("*.md")):
            if md_path.is_symlink():
                # 링크 대상은 트리 밖일 수 있다 — 본문이 그대로 HTTP 로 나가므로 배제.
                _log.warning("content file %s is a symlink; ignored", md_path)
                continue

            m = _FILENAME_RE.match(md_path.name)
            if not m:
                _log.warning("content file %s does not match <slug>.md", md_path)
                continue
            slug = m.group("slug")

            try:
                fields, body = _parse_file(md_path)
            except ContentMalformed:
                _log.warning("content file %s has malformed frontmatter; ignored", md_path)
                continue

            if fields["slug"] != slug:
                _log.warning(
                    "content file %s: frontmatter slug %r != filename; ignored",
                    md_path,
                    fields["slug"],
                )
                continue
            if fields["category"] != category:
                _log.warning(
                    "content file %s: frontmatter category %r != directory %r; ignored",
                    md_path,
                    fields["category"],
                    category,
                )
                continue
            if slug in by_slug:
                _log.warning("content slug %r duplicated at %s; first one kept", slug, md_path)
                continue

            by_slug[slug] = ContentDoc(
                slug=slug,
                title=fields["title"],
                category=category,
                summary=fields["summary"],
                body=body,
                path=md_path,
            )

    return _RegistryState(by_slug=by_slug)


def _parse_file(md_path: Path) -> tuple[dict[str, str], str]:
    return parse_document(md_path.read_text(encoding="utf-8"), source=md_path)


@lru_cache(maxsize=1)
def _state() -> _RegistryState:
    return _scan()


def reload() -> None:
    """테스트/핫리로드 — 파일 변경 후 캐시 무효화."""
    _state.cache_clear()


def get(slug: str) -> ContentDoc:
    """`slug` → 자료. 없으면 `ContentNotFound`.

    slug 를 경로와 결합하지 않는다 — `../` 같은 입력은 그냥 dict miss 가 된다.
    """
    doc = _state().by_slug.get(slug)
    if doc is None:
        raise ContentNotFound(slug)
    return doc


def list_all() -> list[ContentDoc]:
    """모든 자료 (카테고리, slug 정렬)."""
    return sorted(_state().by_slug.values(), key=lambda d: (d.category, d.slug))


def list_by_category(category: str) -> list[ContentDoc]:
    """그 카테고리의 자료 (slug 정렬). 자료가 없거나 모르는 카테고리면 빈 리스트."""
    return [d for d in list_all() if d.category == category]
