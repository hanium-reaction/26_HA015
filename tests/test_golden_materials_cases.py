"""자료 골든셋 48건의 무결성 (L1-6).

이 골든셋은 자료 기반 계획 품질(적중률·할루시네이션율) 평가의 **공통 입력**이다. 여기가
조용히 망가지면 "자료를 주면 계획이 좋아진다" 는 주장 전체가 거짓 위에 서게 되므로 구조를
테스트로 고정한다.

특히 못 박는 것:
- 블록별 건수 — 사양(`docs/experiments/experiment-plan-v1.md` §2 L1-6)과 1:1
- **재현성** — 생성기를 다시 돌리면 디스크 파일과 바이트 단위로 같아야 한다.
- **`expected_items` 가 실제로 자료 안에 있는 문자열인가** — 정답이 자료에 없으면 적중률이
  영원히 0 이 되고, 그건 지표가 아니라 버그다.
- **`forbidden_items` 가 실제로 자료에 없는가** — 자료에 있는 걸 금지어로 두면 "지어냈다"
  판정이 거짓 양성이 된다. 이 골든셋에서 가장 깨지기 쉬운 불변식이다.
- **적대적 케이스가 실제로 적대적인가** — `must_not_contain` 문구가 자료 본문에 실제로
  심겨 있어야 한다. 안 그러면 그 단언은 통과해도 아무것도 검증하지 않는다.
- **날짜가 절대값으로 새어 들어가지 않았는가** — 고정 날짜는 하루만 지나도 판정을 뒤집는다.
"""

from __future__ import annotations

import json
from collections import Counter

import pytest
from scripts.build_golden_materials_cases import (
    EXPECTED_COUNTS,
    EXPECTED_TOTAL,
    MATERIALS,
    OUTPUT_PATH,
    build_cases,
    to_jsonl,
)

PROVENANCES = {"pasted", "link_fetched", "none", "unfetchable"}


@pytest.fixture(scope="module")
def cases() -> list[dict]:
    """디스크의 골든셋. 생성기 출력이 아니라 **커밋된 파일**을 읽는다."""
    assert OUTPUT_PATH.exists(), (
        f"골든셋 파일이 없다: {OUTPUT_PATH} — "
        "`uv run python -m scripts.build_golden_materials_cases` 로 생성할 것"
    )
    return [json.loads(line) for line in OUTPUT_PATH.read_text(encoding="utf-8").splitlines()]


def test_total_and_block_counts_match_the_spec(cases: list[dict]) -> None:
    """사양의 표와 1:1. 블록 하나가 줄면 그 블록이 검증하던 축이 통째로 사라진다."""
    assert len(cases) == EXPECTED_TOTAL
    assert dict(Counter(c["block"] for c in cases)) == EXPECTED_COUNTS
    assert sum(EXPECTED_COUNTS.values()) == EXPECTED_TOTAL, "사양 표 자체가 합이 안 맞는다"


def test_file_on_disk_matches_the_generator(cases: list[dict]) -> None:
    """재현성 — 커밋된 파일 == 생성기 출력. 손으로 고친 흔적이 있으면 여기서 죽는다."""
    assert to_jsonl(build_cases()) == OUTPUT_PATH.read_text(encoding="utf-8")


def test_case_ids_are_unique(cases: list[dict]) -> None:
    ids = [c["case_id"] for c in cases]
    assert len(ids) == len(set(ids)), "중복 case_id — 결과 집계가 조용히 덮어써진다"


def test_every_case_is_marked_synthetic(cases: list[dict]) -> None:
    """합성 비율을 보고서에서 숨길 수 없게 — 라이브 자료는 한 건도 안 썼다."""
    assert all(c["synthetic"] is True for c in cases)


def test_provenance_and_text_agree(cases: list[dict]) -> None:
    """자료 유무는 provenance 가 단일 진실 소스다 — text/url 이 그와 어긋나면 안 된다."""
    for c in cases:
        m = c["materials"]
        assert m["provenance"] in PROVENANCES, c["case_id"]
        if m["provenance"] in {"pasted", "link_fetched"}:
            assert m["text"], f"{c['case_id']}: 자료가 있다고 해놓고 본문이 비었다"
        else:
            assert m["text"] is None, f"{c['case_id']}: 자료가 없다고 해놓고 본문이 있다"
        if m["provenance"] == "unfetchable":
            assert m["url"], f"{c['case_id']}: 못 여는 링크 케이스인데 url 이 없다"


def test_expected_items_actually_appear_in_the_material(cases: list[dict]) -> None:
    """정답이 자료 안에 실제로 있어야 적중률이 지표가 된다.

    자료가 없는 블록(no_material/unfetchable)은 덮을 대상이 없으므로 정답도 비어 있어야
    한다 — 비어 있지 않으면 영원히 0% 가 나오는 가짜 지표가 된다.
    """
    for c in cases:
        text = c["materials"]["text"]
        if text is None:
            assert c["expected_items"] == [], (
                f"{c['case_id']}: 자료가 없는데 정답 항목이 있다 — 적중률이 항상 0 이 된다"
            )
            continue
        for item in c["expected_items"]:
            assert item in text, f"{c['case_id']}: 정답 '{item}' 이 자료 본문에 없다"


def test_forbidden_items_are_actually_absent_from_the_material(cases: list[dict]) -> None:
    """금지 항목이 자료에 있으면 '지어냈다' 판정이 거짓 양성이 된다.

    이 골든셋에서 가장 깨지기 쉬운 불변식 — 목차 문구를 손보다가 뺐던 주제를 다시 넣으면
    할루시네이션율이 조용히 부풀어 오른다.
    """
    for c in cases:
        text = c["materials"]["text"]
        if text is None:
            continue
        for item in c["forbidden_items"]:
            assert item not in text, (
                f"{c['case_id']}: 금지 항목 '{item}' 이 자료 본문에 실제로 들어 있다 — "
                "빼든지 forbidden 에서 제외하든지 해야 한다"
            )


def test_noise_items_are_present_in_the_material(cases: list[dict]) -> None:
    """`noise_items` 는 `forbidden_items` 와 **정반대 불변식**이다.

    잡음은 자료 안에 실제로 있어야 한다(그래야 '골라내는가' 를 물을 수 있다). 계획에 실리면
    안 된다는 점만 같고, 자료 안 존재 여부가 반대라 필드를 나눴다 — 한 필드로 합치면
    "자료에 없는 걸 지어냈다" 와 "자료의 잡음을 그대로 베꼈다" 가 한 수치로 섞인다.
    """
    for c in cases:
        if not c["noise_items"]:
            continue
        text = c["materials"]["text"]
        assert text is not None, c["case_id"]
        for item in c["noise_items"]:
            assert item in text, f"{c['case_id']}: 잡음 '{item}' 이 자료에 없다 — 공허한 단언"


def test_only_noisy_block_carries_noise_items(cases: list[dict]) -> None:
    """잡음 지표는 잡음 블록에서만 정의된다 — 다른 블록에 새면 집계가 오염된다."""
    for c in cases:
        has_noise = bool(c["noise_items"])
        assert has_noise is (c["block"] == "grounded_noisy"), c["case_id"]


def test_omission_probe_and_no_material_share_the_same_forbidden_set() -> None:
    """두 블록은 **같은 금지어 집합**으로 비교돼야 한다.

    omission_probe 의 등장률은 그 자체로 오답률이 아니라 no_material 대비 증감으로 읽는다
    (생성기 docstring 참조). 집합이 갈라지면 그 비교가 성립하지 않는다.
    """
    by_source: dict[str, dict[str, set[str]]] = {}
    for c in build_cases():
        if c["block"] not in {"omission_probe", "no_material"}:
            continue
        key = c["materials"]["source_key"]
        by_source.setdefault(key, {})[c["block"]] = set(c["forbidden_items"])
    assert by_source, "비교할 케이스가 없다"
    for key, blocks in by_source.items():
        assert blocks["omission_probe"] == blocks["no_material"], (
            f"{key}: 두 블록의 forbidden 집합이 다르다 — 증감 비교가 무의미해진다"
        )


def test_adversarial_cases_are_actually_adversarial(cases: list[dict]) -> None:
    """`must_not_contain` 문구가 자료에 실제로 심겨 있어야 그 단언이 무언가를 검증한다."""
    adversarial = [c for c in cases if c["block"] == "adversarial_injection"]
    assert len(adversarial) == EXPECTED_COUNTS["adversarial_injection"]
    for c in adversarial:
        markers = c["assertions"]["must_not_contain"]
        assert markers, f"{c['case_id']}: 적대적 케이스인데 금지 문구가 없다"
        text = c["materials"]["text"]
        assert text is not None
        for marker in markers:
            assert marker in text, (
                f"{c['case_id']}: 금지 문구 '{marker}' 가 자료에 심겨 있지 않다 — "
                "통과해도 아무것도 검증하지 않는 공허한 단언이다"
            )


def test_only_unfetchable_block_expects_a_reask(cases: list[dict]) -> None:
    """되묻기는 '자료를 못 열었을 때' 의 정상 동작이다 — 다른 블록에서 기대하면 안 된다."""
    for c in cases:
        expected = c["block"] == "unfetchable"
        assert c["assertions"]["expect_reask"] is expected, c["case_id"]


def test_unfetchable_cases_forbid_pretending_to_know_the_material(cases: list[dict]) -> None:
    """못 연 자료의 내용을 아는 척하면 결함 — #226 이 기록한 '20강 지어내기' 가 그 사례다."""
    for c in cases:
        if c["block"] != "unfetchable":
            continue
        assert c["forbidden_items"], f"{c['case_id']}: 아는 척 판정용 금지 항목이 비었다"


def test_no_absolute_dates_leaked_into_cases(cases: list[dict]) -> None:
    """마감은 오프셋으로만. 고정 날짜는 하루만 지나도 판정을 뒤집는다(s10 드라이버 전례)."""
    blob = json.dumps(cases, ensure_ascii=False)
    assert "2026-" not in blob and "2027-" not in blob, (
        "절대 날짜가 골든셋에 들어갔다 — deadline_offset_days 로만 표현할 것"
    )
    for c in cases:
        assert isinstance(c["goal"]["deadline_offset_days"], int)
        assert c["goal"]["deadline_offset_days"] > 0, c["case_id"]


def test_every_material_is_used_by_the_grounded_blocks(cases: list[dict]) -> None:
    """자료 6종이 모두 쓰여야 도메인 편향을 피한다 — 하나가 빠지면 조용히 커버리지가 준다."""
    used = {c["materials"]["source_key"] for c in cases if c["block"] == "grounded_clean"}
    assert used == {m.key for m in MATERIALS}


def test_noisy_block_carries_navigation_noise(cases: list[dict]) -> None:
    """잡음 블록이 실제로 지저분해야 '목차만 골라 쓰는가' 를 물을 수 있다."""
    noisy = [c for c in cases if c["block"] == "grounded_noisy"]
    assert len(noisy) == EXPECTED_COUNTS["grounded_noisy"]
    for c in noisy:
        text = c["materials"]["text"] or ""
        assert "회원가입" in text and "이용약관" in text, c["case_id"]
        assert c["noise_items"], f"{c['case_id']}: 잡음 블록인데 잡음 지표가 비었다"
