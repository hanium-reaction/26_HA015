"""Content Registry 규격 핀 (BE #171 1단계).

이 자료는 가공 없이 사용자 화면에 그대로 렌더된다. 그래서 여기 단언들은 "레지스트리가
동작한다"가 아니라 **"커밋된 자료가 계약을 지킨다"** 를 고정한다.

특히 주의한 것 4가지:

- **디스크 ↔ 레지스트리 전수 대조를 (카테고리, slug) 쌍으로.** slug 만 비교하면 이미
  등록된 것과 stem 이 같은 파일이 등록에 실패해도 집합이 안 변해 그냥 통과한다
  (기존 자료를 복사해 새 카테고리 초안을 만드는 게 가장 흔한 작성 흐름이다).
- **공허한 통과 차단.** `for doc in list_all(): assert ...` 는 스캐너 본문을 지우면 0회
  순회로 전부 통과한다. 모든 루프 앞에 기대 집합을 단언한다.
- **frontmatter 가 본문에 남지 않는지.** FE 는 `remark-frontmatter` 를 쓰지 않아서
  머리말이 응답에 실리면 setext heading 으로 파싱돼 화면이 깨진다.
- **원격 자원 금지.** 자료에 외부 이미지가 있으면 자료를 연 사용자의 IP·열람 시각이
  제3자로 나간다. '어떤 회복 자료를 언제 열었는지'는 민감 신호다.
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

import reaction_backend
from reaction_backend.content import registry
from reaction_backend.content.registry import ContentMalformed, ContentNotFound
from reaction_backend.db.models.goal import GOAL_CATEGORY_VALUES
from reaction_backend.safety.banned_words import scan

# 지금 커밋된 자료 — (카테고리, slug). 새 자료를 추가하면 **이 집합도 같이 늘려야 한다.**
# 자료가 조용히 사라지는 것과 조용히 늘어나는 것을 둘 다 잡으려고 일부러 하드코딩한다
# (content/README.md 의 "새 자료를 추가할 때" 절과 같은 내용).
EXPECTED_DOCS = {
    ("career", "count-what-you-control"),
    ("health", "exercise-plan-that-bends"),
    ("health", "exercise-restart-after-a-miss"),
    ("other", "decide-the-first-move"),
    ("project", "stop-where-you-can-restart"),
    ("relationship", "a-short-message-is-enough"),
    ("routine", "a-gap-is-not-a-reset"),
    ("schedule", "plan-for-the-gaps"),
    ("self_dev", "you-can-stop-halfway"),
    ("study", "decide-where-to-stop"),
}
EXPECTED_SLUGS = {slug for _, slug in EXPECTED_DOCS}


def _expected_slugs(category: str) -> set[str]:
    """그 카테고리에 기대되는 slug 들 — 카테고리가 늘어도 검사가 안 흐려지게."""
    return {slug for cat, slug in EXPECTED_DOCS if cat == category}


# 길이 예산. content/README.md 의 "길이 예산" 줄과 **같이** 고쳐야 한다 (값을 복제해
# 두면 한쪽만 바뀐다 — 실제로 리뷰에서 3중 불일치가 나왔다).
_MAX_TITLE = 16
_MAX_SUMMARY = 45
_MIN_BODY = 750
_MAX_BODY = 1_400

_RAW_HTML_RE = re.compile(r"<[a-zA-Z/!]")
_DEEP_HEADING_RE = re.compile(r"^#{4,}\s", re.MULTILINE)
_TASK_LIST_RE = re.compile(r"^\s*[-*]\s+\[[ xX]\]", re.MULTILINE)
_FOOTNOTE_RE = re.compile(r"\[\^")
_IMAGE_RE = re.compile(r"!\[[^\]]*\]\(")
_LINK_TARGET_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]*)\)")


def _content_dir() -> Path:
    """구현(`registry._content_root`)과 **다른 경로**로 독립 열거하기 위한 루트."""
    return Path(reaction_backend.__file__).resolve().parent / "content"


def _disk_docs() -> set[tuple[str, str]]:
    """디스크의 (카테고리 폴더명, 파일 stem). slug 만 모으면 중복 stem 을 흡수한다."""
    return {(p.parent.name, p.stem) for p in _content_dir().rglob("*.md") if p.name != "README.md"}


# ── 등록 자체 ──────────────────────────────────────────────


def test_expected_documents_are_registered() -> None:
    """기대한 자료가 정확히 그만큼 등록된다 (누락도 초과도 잡는다)."""
    assert {(d.category, d.slug) for d in registry.list_all()} == EXPECTED_DOCS


def test_every_markdown_file_on_disk_is_registered() -> None:
    """디스크의 모든 `.md` 가 실제로 등록됐는가.

    스캐너가 규격 미달 파일을 조용히 skip 하므로, 구현과 다른 경로로 열거해 대조한다.
    (카테고리, stem) 쌍으로 비교해야 `health/x.md` 를 `routine/` 에 복사해 두고
    frontmatter category 를 안 고친 경우처럼 **stem 이 겹치는 미등록 파일**을 잡는다.
    """
    assert _disk_docs() == EXPECTED_DOCS


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
        "EXERCISE-PLAN-THAT-BENDS",
        "exercise-plan-that-bends ",
        "",
    ],
)
def test_get_never_touches_the_filesystem(hostile: str) -> None:
    """조회는 dict 참조뿐이라 경로 순회가 성립하지 않는다.

    구현이 `root / slug` 로 바뀌거나 slug 를 관대하게 정규화하면 일부가 통과하게 된다.
    """
    with pytest.raises(ContentNotFound):
        registry.get(hostile)


@pytest.mark.parametrize("category", sorted({c for c, _ in EXPECTED_DOCS}))
def test_list_by_category_filters(category: str) -> None:
    """카테고리 필터가 **그 카테고리 것만** 준다 — 다른 카테고리가 섞이면 엉뚱한 자료가 꽂힌다."""
    expected = _expected_slugs(category)
    assert expected, "기대 집합이 비면 검사가 공허하다"
    assert {d.slug for d in registry.list_by_category(category)} == expected


@pytest.mark.parametrize("category", ["healt", "health ", "HEALTH", "ealth", "definitely-not"])
def test_list_by_category_requires_exact_match(category: str) -> None:
    """`==` 를 `startswith`/`in` 으로 바꾸는 뮤턴트를 잡는다."""
    assert registry.list_by_category(category) == []


def test_every_goal_category_has_content() -> None:
    """goal 9종이 **전부** 채워졌다 — 어떤 카테고리로 목표를 세워도 자료를 받는다.

    예전엔 '자료 없는 카테고리는 빈 리스트' 를 검사했는데, 9종이 다 채워지며 그 상황이
    실물로 사라졌다(그 가드가 실제로 발동해 알려 줬다). 대신 **커버리지 자체**를 고정한다
    — 자료를 지우거나 규격 위반으로 미등록되면 여기서 걸린다.

    "자료 0건이면 삽입 0건" 분기는 `tests/test_inbox_resources.py` 에서 레지스트리를
    비워 검증한다.
    """
    assert {c for c, _ in EXPECTED_DOCS} == set(GOAL_CATEGORY_VALUES)
    for category in GOAL_CATEGORY_VALUES:
        assert registry.list_by_category(category), f"{category}: 자료가 없다"


def test_list_all_is_sorted_by_category_then_slug() -> None:
    """정렬 키를 기대값에 직접 박는다 — 자기 출력에서 재유도하면 키를 바꿔도 통과한다."""
    assert [(d.category, d.slug) for d in registry.list_all()] == sorted(EXPECTED_DOCS)


def test_list_all_returns_a_fresh_list_each_call() -> None:
    """캐시된 상태는 프로세스 전역이다 — 호출자가 목록을 뒤엎어도 다음 호출이 멀쩡해야 한다."""
    first = registry.list_all()
    first.clear()
    assert {d.slug for d in registry.list_all()} == EXPECTED_SLUGS


def test_content_doc_is_immutable() -> None:
    """frozen 이 아니면 한 요청이 고친 값이 프로세스 전역에 남는다."""
    doc = registry.get("exercise-plan-that-bends")
    with pytest.raises(AttributeError):
        doc.title = "바뀜"  # type: ignore[misc]


def test_reload_rebuilds_the_cache() -> None:
    """`reload()` 를 no-op 으로 바꾸면 개발 중 자료 수정이 반영되지 않는다."""
    before = registry.get("exercise-plan-that-bends")
    registry.reload()
    after = registry.get("exercise-plan-that-bends")
    assert before is not after, "reload() 가 캐시를 비우지 않았다"
    assert before.body == after.body
    assert {(d.category, d.slug) for d in registry.list_all()} == EXPECTED_DOCS


# ── 커밋된 자료가 계약을 지키는가 ──────────────────────────


def test_slug_and_category_match_file_location() -> None:
    """frontmatter 가 파일 위치와 어긋나면 등록 자체가 안 되지만, 그걸 여기서도 못 박는다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert doc.path.stem == doc.slug
        assert doc.path.parent.name == doc.category


def test_body_matches_file_content_without_frontmatter() -> None:
    """본문이 실제 파일에서 온 것이고, frontmatter 는 걷혔는가."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
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
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        first_line = doc.body.lstrip().splitlines()[0]
        assert first_line == f"# {doc.title}", f"{doc.slug}: 첫 제목이 title 과 다르다"


def test_documents_pass_the_banned_word_filter() -> None:
    """자료는 LLM 출력이 아니라 Tool Executor 필터를 안 탄다 — 여기가 유일한 게이트다.

    주의: 사전이 어간 부분문자열 매칭이라 활용형('게으른')은 통과한다. 통과가 곧
    안전을 뜻하지 않으므로 사람 리뷰가 여전히 필요하다.
    """
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        for label, text in (("title", doc.title), ("summary", doc.summary), ("body", doc.body)):
            assert scan(text) == (), f"{doc.slug}.{label}: 금지어 {scan(text)}"


# 사전에 없지만 이 제품과 정면으로 어긋나는 프레이밍. 앱이 재는 건 연속 달성이 아니라
# 회복률이고, 톤 잠금은 의지력 귀인을 금지한다.
_PRESSURE_TERMS = (
    "무조건",
    "무슨 일이 있어도",
    "작심삼일",
    "핑계",
    "변명",
    "의지력",
    "스트릭",
    "근손실",
)


def test_documents_avoid_pressure_framing() -> None:
    """금지어 사전이 못 잡는 성과 압박 어휘 — 리뷰에서 실제로 새어 들어왔던 축이다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        haystack = f"{doc.title}\n{doc.summary}\n{doc.body}"
        for term in _PRESSURE_TERMS:
            assert term not in haystack, f"{doc.slug}: 성과 압박 표현 {term!r}"


def test_documents_use_only_renderable_markdown() -> None:
    """FE 는 `rehype-raw` 없이 렌더한다 — raw HTML 은 태그가 그대로 노출된다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert not _RAW_HTML_RE.search(doc.body), f"{doc.slug}: raw HTML"
        assert "&nbsp;" not in doc.body, f"{doc.slug}: HTML 엔티티"
        assert not _DEEP_HEADING_RE.search(doc.body), f"{doc.slug}: #### 이상 제목"
        assert not _TASK_LIST_RE.search(doc.body), f"{doc.slug}: 체크박스 목록"
        assert not _FOOTNOTE_RE.search(doc.body), f"{doc.slug}: 각주"
        assert "```" not in doc.body, f"{doc.slug}: 코드 펜스"


def test_documents_have_no_remote_resources() -> None:
    """외부 이미지는 자료를 연 사용자의 IP·열람 시각을 제3자에게 보낸다.

    `react-markdown` 의 기본 `urlTransform` 은 `javascript:`/`data:` 만 막고 원격
    https 는 그대로 통과시킨다. 즉 이걸 막을 곳은 여기뿐이다.
    """
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert not _IMAGE_RE.search(doc.body), f"{doc.slug}: 이미지 (원격 자산 금지)"
        for target in _LINK_TARGET_RE.findall(doc.body):
            assert not target.strip().lower().startswith(("http://", "https://", "//")), (
                f"{doc.slug}: 외부 링크 {target!r}"
            )


def test_summary_is_plain_text() -> None:
    """summary 는 인박스 카드에 그대로 박히는 문자열이다 — 마크다운이 렌더되지 않는다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert not _RAW_HTML_RE.search(doc.summary), f"{doc.slug}: summary 에 HTML"
        assert not _IMAGE_RE.search(doc.summary), f"{doc.slug}: summary 에 이미지"
        assert "**" not in doc.summary, f"{doc.slug}: summary 에 강조 문법"
        assert "\n" not in doc.summary, f"{doc.slug}: summary 는 한 줄이어야 한다"


def test_documents_fit_the_length_budget() -> None:
    """모바일 시트/인박스 카드 실측 예산. 넘치면 제목이 잘리거나 카드가 늘어난다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert doc.title, f"{doc.slug}: title 이 비었다"
        assert doc.summary, f"{doc.slug}: summary 가 비었다"
        assert len(doc.title) <= _MAX_TITLE, f"{doc.slug}: title {len(doc.title)}자"
        assert len(doc.summary) <= _MAX_SUMMARY, f"{doc.slug}: summary {len(doc.summary)}자"
        assert _MIN_BODY <= len(doc.body) <= _MAX_BODY, f"{doc.slug}: body {len(doc.body)}자"
        assert doc.summary.strip() == doc.summary


def test_known_document_content_is_stable() -> None:
    """대표 1건의 실제 문자열 — '엉뚱한 파일을 읽는' 뮤턴트는 이 단언으로만 죽는다."""
    doc = registry.get("exercise-restart-after-a-miss")
    assert doc.category == "health"
    assert doc.title == "운동이 밀린 날, 다시 잇기"
    assert "## 걸린 것에 맞는 한 걸음" in doc.body
    assert "| 걸린 것 | 한 걸음 |" in doc.body


def test_restart_document_covers_every_reason_it_lists() -> None:
    """사유를 나열해 놓고 표에 빠뜨리면 '내 경우만 답이 없다'로 읽힌다."""
    body = registry.get("exercise-restart-after-a-miss").body
    listed = {line[2:].strip() for line in body.splitlines() if line.startswith("- ")}
    reasons = {r for r in listed if r.endswith("어요")}
    assert len(reasons) >= 6, f"사유 목록을 못 찾았다: {reasons}"
    table = body.split("## 걸린 것에 맞는 한 걸음", 1)[1]
    for reason in reasons:
        assert reason in table, f"'{reason}' 에 대응하는 한 걸음이 표에 없다"


# ── frontmatter 파서 ───────────────────────────────────────

_SOURCE = Path("memory.md")


def parse(text: str) -> tuple[dict[str, str], str]:
    return registry.parse_document(text, source=_SOURCE)


def test_parse_document_splits_fields_and_body() -> None:
    fields, body = parse(
        "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\nsteps: X\n---\n\n# T\n"
    )
    assert fields == {
        "slug": "a-slug",
        "title": "T",
        "category": "health",
        "summary": "S",
        "steps": "X",
    }
    assert body == "\n# T\n"


def test_parse_document_keeps_colons_inside_values() -> None:
    """값에 `:` 가 있어도 첫 `:` 만 구분자다."""
    fields, _ = parse(
        "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: a: b\nsteps: X\n---\n\nx\n"
    )
    assert fields["summary"] == "a: b"


def test_parse_document_ignores_unknown_keys() -> None:
    """모르는 키는 무시(예외 아님) — 나중에 키가 늘어도 구버전이 죽지 않는다."""
    fields, _ = parse(
        "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\nsteps: X\nauthor: Y\n---\n\nx\n"
    )
    assert "author" not in fields


@pytest.mark.parametrize(
    ("text", "reason", "guard"),
    [
        ("# no frontmatter\n", "머리말 없음", "'---' 로 시작하지 않는다"),
        ("---\nslug: a-slug\n\n# unterminated\n", "닫는 --- 없음", "닫는 '---' 가 없다"),
        (
            "---\nslug: a-slug\ntitle: T\ncategory: health\n---\n\nx\n",
            "summary 누락",
            "필수 키 누락",
        ),
        (
            "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary: S\nsteps: X\n---\n\n  \n",
            "본문 비어 있음",
            "본문이 비어 있다",
        ),
        ("---\nslug: a-slug\nbroken line\n---\n\nx\n", "':' 없는 줄", "':' 가 없다"),
        (
            "---\nslug: a\nslug: b\ntitle: T\ncategory: health\nsummary: S\nsteps: X\n---\n\nx\n",
            "키 중복",
            "키 중복",
        ),
        (
            "---\nslug: a-slug\ntitle: T\ncategory: health\nsummary:\nsteps: X\n---\n\nx\n",
            "summary 값이 빔 — 카드 요약이 빈칸으로 나간다",
            "값이 비어 있다",
        ),
        (
            "---\nslug: a-slug\ntitle:   \ncategory: health\nsummary: S\nsteps: X\n---\n\nx\n",
            "title 값이 공백뿐",
            "값이 비어 있다",
        ),
    ],
)
def test_parse_document_rejects_malformed(text: str, reason: str, guard: str) -> None:
    """`guard` 까지 고정한다 — 필수 키가 늘면 모든 케이스가 '누락' 으로 먼저 터져,
    값-비었음·빈 본문 가드를 붙잡던 단언이 조용히 사라진다(리뷰에서 실증된 회귀)."""
    with pytest.raises(ContentMalformed, match=guard):
        parse(text)


# ── 스캐너 가드 ────────────────────────────────────────────
#
# 실 트리에는 규격을 어긴 파일이 없으므로, 가드를 지워도 위 테스트들은 전부 초록이다
# (뮤테이션으로 실증했다). 여기서만 tmp 트리로 가드가 실제로 발동하는지 확인한다.
# `_scan(root)` 를 직접 부르므로 `lru_cache` 를 건드리지 않는다 — 캐시를 비우는 것을
# 잊어 그 뒤 전 스위트가 tmp 트리를 보게 되는 사고가 구조적으로 불가능하다.


def _write(root: Path, rel: str, *, slug: str, category: str, title: str = "T") -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        f"---\nslug: {slug}\ntitle: {title}\ncategory: {category}\n"
        f"summary: S\nsteps: 한 걸음 하기\n---\n\n# {title}\n",
        encoding="utf-8",
    )
    return path


def _scanned(root: Path) -> set[str]:
    return set(registry._scan(root).by_slug)


def test_scan_accepts_a_wellformed_tree(tmp_path: Path) -> None:
    """가드 테스트들이 공허하지 않도록, 같은 방식으로 만든 정상 파일은 등록됨을 먼저 고정."""
    _write(tmp_path, "health/good-slug.md", slug="good-slug", category="health")
    assert _scanned(tmp_path) == {"good-slug"}


def test_scan_skips_slug_not_matching_filename(tmp_path: Path) -> None:
    """frontmatter slug 와 파일명이 어긋나면 등록하지 않는다 (URL 키가 갈리므로)."""
    _write(tmp_path, "health/good-slug.md", slug="other-slug", category="health")
    assert _scanned(tmp_path) == set()


def test_scan_skips_category_not_matching_directory(tmp_path: Path) -> None:
    _write(tmp_path, "health/good-slug.md", slug="good-slug", category="study")
    assert _scanned(tmp_path) == set()


def test_scan_skips_unsupported_category_directory(tmp_path: Path) -> None:
    _write(tmp_path, "fitness/good-slug.md", slug="good-slug", category="fitness")
    assert _scanned(tmp_path) == set()


@pytest.mark.parametrize(
    "filename",
    [
        "Good-Slug.md",
        "good_slug.md",
        "ab.md",
        "good slug.md",
        "good-slug.markdown",
        "-good-slug.md",
        f"{'a' * 49}.md",
    ],
)
def test_scan_skips_filenames_outside_the_slug_spec(tmp_path: Path, filename: str) -> None:
    stem = filename.rsplit(".", 1)[0]
    _write(tmp_path, f"health/{filename}", slug=stem, category="health")
    assert _scanned(tmp_path) == set()


def test_scan_accepts_slug_at_the_length_limit(tmp_path: Path) -> None:
    """상한 경계를 함께 고정해야 정규식 길이를 바꾸는 뮤턴트가 죽는다."""
    slug = "a" * 48
    _write(tmp_path, f"health/{slug}.md", slug=slug, category="health")
    assert _scanned(tmp_path) == {slug}


def test_scan_skips_malformed_frontmatter(tmp_path: Path) -> None:
    """파일 하나가 깨져도 예외가 아니라 skip — 앱 import 가 통째로 죽으면 안 된다."""
    path = tmp_path / "health" / "good-slug.md"
    path.parent.mkdir(parents=True)
    path.write_text("# frontmatter 가 없어요\n", encoding="utf-8")
    assert _scanned(tmp_path) == set()


def test_scan_survives_a_file_that_is_not_utf8(tmp_path: Path) -> None:
    """CP949 로 저장된 한글 파일 하나가 레지스트리를 통째로 무력화하면 안 된다.

    `_state()` 는 예외를 캐시하지 않으므로, 새어 나가면 매 요청이 500 이 된다.
    """
    _write(tmp_path, "health/good-slug.md", slug="good-slug", category="health")
    broken = tmp_path / "health" / "cp949-slug.md"
    broken.write_bytes(
        "---\nslug: cp949-slug\ntitle: 제목\ncategory: health\nsummary: 요약\n---\n\n# 제목\n".encode(
            "cp949"
        )
    )
    assert _scanned(tmp_path) == {"good-slug"}


def test_scan_keeps_first_of_duplicate_slugs_across_categories(tmp_path: Path) -> None:
    """slug 는 URL 키라 카테고리를 가로질러 유일해야 한다."""
    _write(tmp_path, "health/dup-slug.md", slug="dup-slug", category="health")
    _write(tmp_path, "study/dup-slug.md", slug="dup-slug", category="study")
    state = registry._scan(tmp_path)
    assert set(state.by_slug) == {"dup-slug"}
    assert state.by_slug["dup-slug"].category == "health"


def test_scan_skips_symlinked_files(tmp_path: Path) -> None:
    """링크 대상은 트리 밖일 수 있고 본문이 그대로 HTTP 로 나간다 — 배제한다."""
    outside = _write(tmp_path, "outside/linked-slug.md", slug="linked-slug", category="health")
    link_dir = tmp_path / "health"
    link_dir.mkdir(parents=True, exist_ok=True)
    try:
        (link_dir / "linked-slug.md").symlink_to(outside)
    except (OSError, NotImplementedError) as e:  # Windows 는 권한/개발자 모드 필요
        pytest.skip(f"심볼릭 링크를 만들 수 없는 환경: {e}")
    assert _scanned(tmp_path) == set()


def test_scan_skips_symlinked_category_directories(tmp_path: Path) -> None:
    """`is_dir()` 는 링크를 따라가므로 폴더 링크 하나로 파일 단위 가드가 무력해진다."""
    outside_root = tmp_path / "outside"
    _write(outside_root, "health/leaked-slug.md", slug="leaked-slug", category="health")
    root = tmp_path / "root"
    root.mkdir()
    try:
        (root / "health").symlink_to(outside_root / "health", target_is_directory=True)
    except (OSError, NotImplementedError) as e:
        pytest.skip(f"디렉토리 링크를 만들 수 없는 환경: {e}")
    assert _scanned(root) == set()


@pytest.mark.skipif(sys.platform != "win32", reason="정션은 Windows 전용")
def test_scan_skips_windows_junction_category_dirs(tmp_path: Path) -> None:
    """정션은 `is_symlink()` 가 False 라 링크 가드를 빠져나간다.

    이걸 막는 건 `resolve().is_relative_to(root)` 최종 봉쇄뿐이다. 관리자 권한이
    필요 없어서 개발자 PC 에서 실제로 만들어질 수 있는 경로다.
    """
    outside_root = tmp_path / "outside"
    _write(outside_root, "health/leaked-slug.md", slug="leaked-slug", category="health")
    root = tmp_path / "root"
    root.mkdir()
    link = root / "health"
    result = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(outside_root / "health")],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        pytest.skip(f"정션을 만들 수 없는 환경: {result.stderr!r}")
    assert not link.is_symlink(), "정션이 심볼릭 링크로 잡히면 이 테스트의 전제가 바뀐다"
    assert _scanned(root) == set()


def test_scan_orders_by_category_then_slug(tmp_path: Path) -> None:
    """커밋된 자료가 전부 `health` 라 실 트리로는 정렬 키를 고정할 수 없다.

    slug 만으로 정렬하는 뮤턴트는 여기서만 죽는다 (aaa-slug 가 앞으로 온다).
    """
    _write(tmp_path, "study/aaa-slug.md", slug="aaa-slug", category="study")
    _write(tmp_path, "health/zzz-slug.md", slug="zzz-slug", category="health")
    ordered = [(d.category, d.slug) for d in registry._scan(tmp_path).ordered]
    assert ordered == [("health", "zzz-slug"), ("study", "aaa-slug")]


# ── steps (자료의 출구) ────────────────────────────────────
#
# `steps` 가 비면 자료는 읽고 끝나는 막다른 길이 된다 — 이 기능의 핵심이라 최소 1개를
# 강제하고, 그대로 `ActionItem.title` 이 되므로 길이·중복까지 고정한다.

_MAX_STEPS = 5
_MAX_STEP_LEN = 40


def test_every_document_offers_at_least_one_step() -> None:
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        assert doc.steps, f"{doc.slug}: steps 가 없다 — 읽고 끝나는 자료가 된다"
        assert len(doc.steps) <= _MAX_STEPS, f"{doc.slug}: steps {len(doc.steps)}개"


def test_steps_fit_an_action_card() -> None:
    """실행 카드 제목이 되므로 짧아야 하고, 중복이면 같은 할 일이 두 번 생긴다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        for step in doc.steps:
            assert step == step.strip() and step, f"{doc.slug}: 공백 step"
            assert len(step) <= _MAX_STEP_LEN, f"{doc.slug}: step {len(step)}자 — {step!r}"
        assert len(set(doc.steps)) == len(doc.steps), f"{doc.slug}: step 중복"


def test_steps_pass_the_banned_word_filter() -> None:
    """step 은 오늘 할 일 카드에 그대로 박힌다 — 본문과 같은 톤 게이트를 통과해야 한다."""
    docs = registry.list_all()
    assert {(d.category, d.slug) for d in docs} == EXPECTED_DOCS
    for doc in docs:
        for step in doc.steps:
            assert scan(step) == (), f"{doc.slug}: step 금지어 {scan(step)} — {step!r}"
            for term in _PRESSURE_TERMS:
                assert term not in step, f"{doc.slug}: step 성과 압박 {term!r}"


def test_parse_steps_splits_and_trims() -> None:
    assert registry.parse_steps(" A |B  | C ", source=_SOURCE) == ("A", "B", "C")


@pytest.mark.parametrize(
    ("raw", "reason"),
    [
        ("", "빈 문자열"),
        ("  |  ", "공백뿐"),
        (" | ".join(f"s{i}" for i in range(6)), "6개 — 상한 초과"),
        ("a" * 41, "40자 초과"),
        ("같은 걸음 | 같은 걸음", "중복"),
    ],
)
def test_parse_steps_rejects_malformed(raw: str, reason: str) -> None:
    with pytest.raises(ContentMalformed):
        registry.parse_steps(raw, source=_SOURCE)


def test_parse_steps_accepts_the_boundaries() -> None:
    """상한 경계를 함께 고정해야 숫자를 바꾸는 뮤턴트가 죽는다."""
    assert len(registry.parse_steps(" | ".join(f"s{i}" for i in range(5)), source=_SOURCE)) == 5
    assert registry.parse_steps("a" * 40, source=_SOURCE) == ("a" * 40,)


def test_scan_skips_documents_without_steps(tmp_path: Path) -> None:
    """steps 없는 자료는 등록되지 않는다 — 출구 없는 자료를 배포하지 않기 위해."""
    path = tmp_path / "health" / "good-slug.md"
    path.parent.mkdir(parents=True)
    path.write_text(
        "---\nslug: good-slug\ntitle: T\ncategory: health\nsummary: S\n---\n\n# T\n",
        encoding="utf-8",
    )
    assert _scanned(tmp_path) == set()
