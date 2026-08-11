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
- frontmatter 는 평평한 `key: value` 5줄 고정. PyYAML 은 이 레포의 직접 의존성이
  아니라(langchain-core/uvicorn 경유 transitive) 쓰지 않는다. `steps` 는 목록이지만
  `|` 로 나눈 한 줄로 두어 그 계약을 지킨다.
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

# frontmatter 는 이 5개 키만 받는다. 그 외 키는 warning 후 무시.
_FRONTMATTER_KEYS: frozenset[str] = frozenset({"slug", "title", "category", "summary", "steps"})

# `steps` 는 평평한 한 줄로 유지하려고 `|` 로 나눈다 — 파서의 "key: value 만" 계약을
# 깨지 않으려는 선택이다(중첩 YAML 을 도입하면 PyYAML 이 필요해진다).
_STEP_SEP = "|"
_MAX_STEPS = 5
_MAX_STEP_LEN = 40

_FM_PREFIX = "---\n"
_FM_SEP = "\n---\n"


class ContentNotFound(KeyError):
    """`slug` 가 레지스트리에 없음. 라우트는 404 `ApiError` 로 변환해야 한다."""


class ContentMalformed(ValueError):
    """frontmatter 규격 위반. 스캔 중에는 warning 후 skip 한다."""


@dataclass(frozen=True, slots=True)
class ContentDoc:
    """자료 1건 — frontmatter 5필드 + 본문."""

    slug: str
    """파일명(확장자 제외)과 동일. 응답·URL 의 식별자."""
    title: str
    """본문 첫 `# ` 제목과 문자 단위로 같아야 한다 (FE 가 중복 제목을 걷어낼 때 대조)."""
    category: str
    """`SUPPORTED_CATEGORIES` 중 하나. 파일이 놓인 디렉토리 이름과 같아야 한다."""
    summary: str
    """인박스 카드에 쓸 한 줄 요약."""
    steps: tuple[str, ...]
    """이 자료가 제안하는 실행 가능한 한 걸음들. 사용자가 골라 오늘 할 일로 채택한다.

    그대로 `ActionItem.title` 이 되므로 카드에 들어갈 만큼 짧아야 한다. 자료가 읽고
    끝나는 글이 되지 않게 **최소 1개는 반드시 있어야 한다**.
    """
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
    # 키가 있는데 값이 빈 경우도 누락으로 본다 — `summary:` 한 줄이면 인박스 카드의
    # 한 줄 요약이 빈칸으로 나간다. 길이 상한만 있으면 빈 문자열이 그걸 통과한다.
    empty = sorted(k for k in _FRONTMATTER_KEYS if not fields[k])
    if empty:
        raise ContentMalformed(f"{source}: frontmatter 값이 비어 있다 — {empty}")
    if not body.strip():
        raise ContentMalformed(f"{source}: 본문이 비어 있다")
    return fields, body


def parse_steps(raw: str, *, source: Path) -> tuple[str, ...]:
    """`A | B | C` → `("A", "B", "C")`. 규격 위반은 `ContentMalformed`."""
    steps = tuple(s.strip() for s in raw.split(_STEP_SEP) if s.strip())
    if not steps:
        raise ContentMalformed(f"{source}: steps 가 비어 있다 — 최소 1개 필요")
    if len(steps) > _MAX_STEPS:
        raise ContentMalformed(f"{source}: steps 가 {len(steps)}개 — 최대 {_MAX_STEPS}개")
    too_long = [s for s in steps if len(s) > _MAX_STEP_LEN]
    if too_long:
        raise ContentMalformed(f"{source}: steps 항목이 {_MAX_STEP_LEN}자를 넘는다 — {too_long}")
    if len(set(steps)) != len(steps):
        raise ContentMalformed(f"{source}: steps 에 중복이 있다 — {steps}")
    return steps


@dataclass(frozen=True, slots=True)
class _RegistryState:
    by_slug: dict[str, ContentDoc]
    """`slug` → doc. slug 는 카테고리를 가로질러 전역 유일해야 한다(URL 키이므로)."""
    ordered: tuple[ContentDoc, ...]
    """(카테고리, slug) 정렬. 스캔 시 한 번만 정렬한다 — 조회마다 다시 정렬하지 않는다."""


def _scan(root: Path) -> _RegistryState:
    """`root` 아래를 훑어 레지스트리 상태를 만든다.

    규격을 벗어난 파일은 예외가 아니라 warning 후 skip — 파일 하나가 앱 import 를
    통째로 깨뜨리면 안 된다. 대신 "디스크에 있는데 등록 안 된 파일"을 테스트가 잡는다.

    `root` 를 인자로 받는 이유는 테스트가 `lru_cache` 를 건드리지 않고 스캐너 규칙
    자체를 검증하기 위해서다 — 캐시를 비우는 것을 잊으면 그 뒤 전 스위트가 오염된다.
    """
    by_slug: dict[str, ContentDoc] = {}
    resolved_root = root.resolve()

    for category_dir in sorted(p for p in root.iterdir() if p.is_dir()):
        category = category_dir.name
        if category.startswith("_") or category.startswith("."):
            continue
        if category not in SUPPORTED_CATEGORIES:
            _log.warning("content category %r not in SUPPORTED_CATEGORIES; ignored", category)
            continue
        if category_dir.is_symlink():
            # `is_dir()` 는 링크를 따라가므로 폴더 링크 하나로 파일 단위 가드가 무력해진다.
            _log.warning("content category dir %s is a symlink; ignored", category_dir)
            continue

        for md_path in sorted(category_dir.glob("*.md")):
            if md_path.is_symlink():
                # 링크 대상은 트리 밖일 수 있다 — 본문이 그대로 HTTP 로 나가므로 배제.
                _log.warning("content file %s is a symlink; ignored", md_path)
                continue
            if not md_path.resolve().is_relative_to(resolved_root):
                # 정션·중첩 링크 등 위 두 검사를 빠져나가는 경로를 최종 봉쇄.
                _log.warning("content file %s resolves outside the tree; ignored", md_path)
                continue

            m = _FILENAME_RE.match(md_path.name)
            if not m:
                _log.warning("content file %s does not match <slug>.md", md_path)
                continue
            slug = m.group("slug")

            try:
                fields, body = _parse_file(md_path)
            except ContentMalformed as e:
                # 사유를 버리면 왜 자료가 사라졌는지 알 수 없다.
                _log.warning("content file %s ignored — %s", md_path, e)
                continue
            except (UnicodeDecodeError, OSError) as e:
                # CP949 로 저장된 한글 파일 하나가 레지스트리를 통째로 무력화하면 안 된다
                # (`_state()` 는 예외를 캐시하지 않아 매 요청마다 다시 터진다).
                _log.warning("content file %s is unreadable — %s", md_path, e)
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

            try:
                steps = parse_steps(fields["steps"], source=md_path)
            except ContentMalformed as e:
                _log.warning("content file %s ignored — %s", md_path, e)
                continue

            by_slug[slug] = ContentDoc(
                slug=slug,
                title=fields["title"],
                category=category,
                summary=fields["summary"],
                steps=steps,
                body=body,
                path=md_path,
            )

    return _RegistryState(
        by_slug=by_slug,
        ordered=tuple(sorted(by_slug.values(), key=lambda d: (d.category, d.slug))),
    )


def _parse_file(md_path: Path) -> tuple[dict[str, str], str]:
    return parse_document(md_path.read_text(encoding="utf-8"), source=md_path)


@lru_cache(maxsize=1)
def _state() -> _RegistryState:
    return _scan(_content_root())


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
    """모든 자료 (카테고리, slug 정렬). 호출자가 뒤엎어도 되도록 매번 새 리스트."""
    return list(_state().ordered)


def list_by_category(category: str) -> list[ContentDoc]:
    """그 카테고리의 자료 (slug 정렬). 자료가 없거나 모르는 카테고리면 빈 리스트."""
    return [d for d in _state().ordered if d.category == category]
