"""Content Registry 규격 핀 (BE #171 1단계).

이 자료는 가공 없이 사용자 화면에 그대로 렌더된다. 그래서 여기 단언들은 "레지스트리가
동작한다"가 아니라 **"커밋된 자료가 계약을 지킨다"** 를 고정한다.

특히 주의한 것 3가지:

- **디스크 ↔ 레지스트리 전수 대조.** 스캐너는 규격 미달 파일을 warning 후 조용히 skip
  한다. 테스트가 구현과 다른 경로로 파일을 독립 열거하지 않으면, 오타 하나로 자료가
  통째로 빠져도 전 스위트가 초록이다.
- **공허한 통과 차단.** `for doc in list_all(): assert ...` 는 스캐너 본문을 지우면 0회
  순회로 전부 통과한다. 모든 루프 앞에 기대 slug 집합을 단언한다.
- **frontmatter 가 본문에 남지 않는지.** FE 는 `remark-frontmatter` 를 쓰지 않아서
  머리말이 응답에 실리면 setext heading 으로 파싱돼 화면이 깨진다.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

import reaction_backend
from reaction_backend.content import registry
from reaction_backend.content.registry import ContentMalformed, ContentNotFound
from reaction_backend.db.models.goal import GOAL_CATEGORY_VALUES
from reaction_backend.safety.banned_words import scan

# 지금 커밋된 자료. 새 자료를 추가하면 이 집합도 같이 늘려야 한다 — 자료가 조용히
# 사라지거나 조용히 늘어나는 것을 둘 다 잡기 위해 일부러 하드코딩한다.
EXPECTED_SLUGS = {"exercise-plan-that-bends", "exercise-restart-after-a-miss"}

# 길이 예산 (모바일 375px 실측 기준, content/README.md 와 같은 값).
_MAX_TITLE = 16
_MAX_SUMMARY = 45
_MAX_BODY = 1_400

_RAW_HTML_RE = re.compile(r"<[a-zA-Z/!]")
_DEEP_HEADING_RE = re.compile(r"^#{4,}\s", re.MULTILINE)
_TASK_LIST_RE = re.compile(r"^\s*[-*]\s+\[[ xX]\]", re.MULTILINE)
_FOOTNOTE_RE = re.compile(r"\[\^")


def _content_dir() -> Path:
    """구현(`registry._content_root`)과 **다른 경로**로 독립 열거하기 위한 루트."""
    return Path(reaction_backend.__file__).resolve().parent / "content"


def _disk_slugs() -> set[str]:
    return {p.stem for p in _content_dir().rglob("*.md") if p.name != "README.md"}


# ── 등록 자체 ──────────────────────────────────────────────


def test_expected_documents_are_registered() -> None:
    """기대한 자료가 정확히 그만큼 등록된다 (누락도 초과도 잡는다)."""
    assert {d.slug for d in registry.list_all()} == EXPECTED_SLUGS


def test_every_markdown_file_on_disk_is_registered() -> None:
    """디스크의 모든 `.md` 가 실제로 등록됐는가.

    스캐너가 규격 미달 파일을 조용히 skip 하므로, 구현과 다른 경로로 열거해 대조한다.
    이 단언이 없으면 파일명 오타·frontmatter 누락이 warning 만 남기고 통과한다.
    """
    assert _disk_slugs() == EXPECTED_SLUGS


def test_registry_root_matches_package_layout() -> None:
    """레지스트리가 보는 루트가 실제 패키지 트리인가 (경로 계산이 어긋나면 전부 빈다)."""
    registered = {d.path.resolve() for d in registry.list_all()}
    assert registered
    for path in registered:
        assert path.is_relative_to(_content_dir())


# ── 카테고리 화이트리스트 ──────────────────────────────────


def test_supported_categories_match_goal_categories() -> None:
    """`content/` 는 leaf 라 db 를 import 하지 않는다 — 대신 여기서 drift 를 잡는다."""
    assert set(GOAL_CATEGORY_VALUES) == registry.SUPPORTED_CATEGORIES


def test_category_directories_are_all_whitelisted() -> None:
    """화이트리스트에 없는 폴더는 통째로 무시된다 — 그런 폴더가 커밋되지 않았는지."""
    dirs = {p.name for p in _content_dir().iterdir() if p.is_dir() and not p.name.startswith("_")}
    assert dirs
    assert dirs <= registry.SUPPORTED_CATEGORIES


# ── 조회 계약 ──────────────────────────────────────────────


def test_get_roundtrips_for_every_document() -> None:
    """모든 slug 가 자기 문서로 되돌아온다 ('항상 첫 항목 반환' 뮤턴트를 잡는다)."""
    docs = registry.list_all()
    assert len(docs) >= 2, "1건뿐이면 라운드트립이 공허해진다"
    for doc in docs:
        assert registry.get(doc.slug).path == doc.path


def test_get_unknown_slug_raises() -> None:
    """없으면 None 이 아니라 예외 — 조용한 fallback 은 사고를 은폐한다."""
    with pytest.raises(ContentNotFound):
        registry.get("no-such-resource")


@pytest.mark.parametrize(
    "hostile",
    [
        "../../../etc/passwd",
        "../health/exercise-plan-that-bends",
        "health/exercise-plan-that-bends",
        "exercise-plan-that-bends.md",
        "",
    ],
)
def test_get_never_touches_the_filesystem(hostile: str) -> None:
    """조회는 dict 참조뿐이라 경로 순회가 성립하지 않는다.

    구현이 `root / slug` 로 바뀌면 이 중 일부가 실제 파일을 열어 통과하게 된다.
    """
    with pytest.raises(ContentNotFound):
        registry.get(hostile)


def test_list_by_category_filters() -> None:
    assert {d.slug for d in registry.list_by_category("health")} == EXPECTED_SLUGS


@pytest.mark.parametrize("category", ["study", "career", "definitely-not-a-category"])
def test_list_by_category_empty_for_categories_without_content(category: str) -> None:
    """자료 없는 카테고리는 빈 리스트 — 삽입 트리거가 여기에 기댄다(자료 0건이면 삽입 0건)."""
    assert registry.list_by_category(category) == []


def test_list_all_is_sorted() -> None:
    docs = registry.list_all()
    assert [(d.category, d.slug) for d in docs] == sorted((d.category, d.slug) for d in docs)


# ── 커밋된 자료가 계약을 지키는가 ──────────────────────────


def test_slug_and_category_match_file_location() -> None:
    """frontmatter 가 파일 위치와 어긋나면 등록 자체가 안 되지만, 그걸 여기서도 못 박는다."""
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        assert doc.path.stem == doc.slug
        assert doc.path.parent.name == doc.category


def test_body_matches_file_content_without_frontmatter() -> None:
    """본문이 실제 파일에서 온 것이고, frontmatter 는 걷혔는가."""
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        raw = doc.path.read_text(encoding="utf-8")
        assert doc.body, f"{doc.slug}: 본문이 비었다"
        assert raw.endswith(doc.body), f"{doc.slug}: 본문이 파일 내용과 다르다"
        assert not doc.body.lstrip().startswith("---"), f"{doc.slug}: frontmatter 가 본문에 남았다"
        assert "slug:" not in doc.body
        assert "summary:" not in doc.body


def test_first_heading_equals_title() -> None:
    """FE 는 첫 H1 이 헤더 제목과 같을 때만 덜어낸다 — 어긋나면 제목이 두 번 뜬다."""
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        first_line = doc.body.lstrip().splitlines()[0]
        assert first_line == f"# {doc.title}", f"{doc.slug}: 첫 제목이 title 과 다르다"


def test_documents_pass_the_banned_word_filter() -> None:
    """자료는 LLM 출력이 아니라 Tool Executor 필터를 안 탄다 — 여기가 유일한 게이트다.

    주의: 사전이 어간 부분문자열 매칭이라 활용형('게으른')은 통과한다. 통과가 곧
    안전을 뜻하지 않으므로 사람 리뷰가 여전히 필요하다.
    """
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        for label, text in (("title", doc.title), ("summary", doc.summary), ("body", doc.body)):
            assert scan(text) == (), f"{doc.slug}.{label}: 금지어 {scan(text)}"


def test_documents_use_only_renderable_markdown() -> None:
    """FE 는 `rehype-raw` 없이 렌더한다 — raw HTML 은 태그가 그대로 노출된다."""
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        assert not _RAW_HTML_RE.search(doc.body), f"{doc.slug}: raw HTML"
        assert "&nbsp;" not in doc.body, f"{doc.slug}: HTML 엔티티"
        assert not _DEEP_HEADING_RE.search(doc.body), f"{doc.slug}: #### 이상 제목"
        assert not _TASK_LIST_RE.search(doc.body), f"{doc.slug}: 체크박스 목록"
        assert not _FOOTNOTE_RE.search(doc.body), f"{doc.slug}: 각주"
        assert "```" not in doc.body, f"{doc.slug}: 코드 펜스"


def test_documents_fit_the_length_budget() -> None:
    """모바일 시트/인박스 카드 실측 예산. 넘치면 제목이 잘리거나 카드가 늘어난다."""
    docs = registry.list_all()
    assert {d.slug for d in docs} == EXPECTED_SLUGS
    for doc in docs:
        assert len(doc.title) <= _MAX_TITLE, f"{doc.slug}: title {len(doc.title)}자"
        assert len(doc.summary) <= _MAX_SUMMARY, f"{doc.slug}: summary {len(doc.summary)}자"
        assert len(doc.body) <= _MAX_BODY, f"{doc.slug}: body {len(doc.body)}자"
        assert doc.summary.strip() == doc.summary


def test_known_document_content_is_stable() -> None:
    """대표 1건의 실제 문자열 — '엉뚱한 파일을 읽는' 뮤턴트는 이 단언으로만 죽는다."""
    doc = registry.get("exercise-restart-after-a-miss")
    assert doc.category == "health"
    assert doc.title == "운동이 밀린 날, 다시 잇기"
    assert "## 걸린 것에 맞는 한 걸음" in doc.body
    assert "| 걸린 것 | 한 걸음 |" in doc.body


# ── frontmatter 파서 ───────────────────────────────────────

_SOURCE = Path("memory.md")


def test_parse_document_splits_fields_and_body() -> None:
    fields, body = parse("---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\n---\n\n# T\n")
    assert fields == {"slug": "a-slug", "title": "T", "category": "health", "summary": "S"}
    assert body == "\n# T\n"


def test_parse_document_keeps_colons_inside_values() -> None:
    """값에 `:` 가 있어도 첫 `:` 만 구분자다."""
    fields, _ = parse("---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: a: b\n---\n\nx\n")
    assert fields["summary"] == "a: b"


def test_parse_document_ignores_unknown_keys() -> None:
    """모르는 키는 무시(예외 아님) — 나중에 키가 늘어도 구버전이 죽지 않는다."""
    fields, _ = parse(
        "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\nauthor: X\n---\n\nx\n"
    )
    assert "author" not in fields


@pytest.mark.parametrize(
    ("text", "reason"),
    [
        ("# no frontmatter\n", "머리말 없음"),
        ("---\nslug: a-slug\n\n# unterminated\n", "닫는 --- 없음"),
        ("---\nslug: a-slug\ntitle: T\ncategory: health\n---\n\nx\n", "summary 누락"),
        (
            "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\n---\n\n  \n",
            "본문 비어 있음",
        ),
        ("---\nslug: a-slug\nbroken line\n---\n\nx\n", "':' 없는 줄"),
        (
            "---\nslug: a\nslug: b\ntitle: T\ncategory: health\nsummary: S\n---\n\nx\n",
            "키 중복",
        ),
    ],
)
def test_parse_document_rejects_malformed(text: str, reason: str) -> None:
    with pytest.raises(ContentMalformed):
        parse(text)


def parse(text: str) -> tuple[dict[str, str], str]:
    return registry.parse_document(text, source=_SOURCE)
