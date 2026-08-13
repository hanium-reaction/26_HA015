"""scripts.backfill_card_target_dates — 원장 round-trip + 되돌리기 판단 (#229 마지막 단계).

이 스크립트는 **되돌릴 수 없는 변경**을 만든다 — 원본 날짜를 담은 컬럼이 없어서 술어로
옛 집합을 재구성할 수 없다. 그래서 원장(ledger) 파일이 유일한 복원 경로이고, 여기서
못 박는 것도 그 경로가 실제로 작동하는지다:

1. `ledger_document` → `parse_ledger_document` round-trip 이 값을 보존하는가.
2. `plan_revert` 가 **최신 변경을 조용히 덮어쓰지 않는가** — 카드가 사라졌거나 그 사이
   다른 작업이 날짜를 또 바꿨으면 되돌리지 않고 skip 해야 한다.

DB 배선 함수(`_load_backfill_rows`/`run_backfill`/`run_revert`)는 선례
(`cleanup_duplicate_plans.py`)와 같은 원칙으로 로컬에서 단위 테스트하지 않는다 — 라이브
dry-run 이 실제 검증이다.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from uuid import uuid4

from scripts.backfill_card_target_dates import (
    BackfillRow,
    RevertDecision,
    ledger_document,
    parse_ledger_document,
    plan_revert,
)


def _row(**overrides: object) -> BackfillRow:
    defaults: dict[str, object] = {
        "card_id": uuid4(),
        "user_id": uuid4(),
        "title": "합격 수기 블로그나 유튜브 3개 분석",
        "old_target_date": date(2026, 7, 29),
        "new_target_date": date(2026, 8, 3),
    }
    defaults.update(overrides)
    return BackfillRow(**defaults)  # type: ignore[arg-type]


# ── 원장 round-trip ───────────────────────────────────────


def test_ledger_round_trip_preserves_every_field() -> None:
    rows = [_row(), _row(old_target_date=date(2026, 7, 1), new_target_date=date(2026, 12, 31))]
    doc = ledger_document(rows, applied_at=datetime(2026, 8, 14, 0, 40, tzinfo=UTC))

    restored = parse_ledger_document(doc)

    assert restored == rows


def test_ledger_document_survives_json_serialization() -> None:
    """실제로는 파일에 썼다가 다시 읽는다 — dataclass 를 바로 넘기지 않고 JSON 문자열을 거친다."""
    rows = [_row()]
    doc = ledger_document(rows, applied_at=datetime(2026, 8, 14, tzinfo=UTC))

    raw = json.dumps(doc, ensure_ascii=False)
    restored = parse_ledger_document(json.loads(raw))

    assert restored == rows


def test_ledger_document_has_applied_at_timestamp() -> None:
    doc = ledger_document([], applied_at=datetime(2026, 8, 14, 0, 40, tzinfo=UTC))
    assert doc["applied_at"] == "2026-08-14T00:40:00+00:00"


def test_parse_rejects_malformed_document() -> None:
    import pytest

    with pytest.raises(ValueError, match="entries"):
        parse_ledger_document({"oops": []})


# ── 되돌리기 판단 ─────────────────────────────────────────


def test_plan_revert_restores_unchanged_cards() -> None:
    """정상 경로 — 원장 이후 아무도 안 건드렸으면 되돌린다."""
    row = _row()
    decisions = plan_revert([row], {row.card_id: row.new_target_date})

    assert decisions == [RevertDecision(row, "revert")]


def test_plan_revert_skips_cards_touched_since_backfill() -> None:
    """백필 이후 다른 작업(재계획 승인·수동 편집)이 날짜를 또 바꿨으면 덮어쓰지 않는다.

    되돌리기가 '최신값' 을 모르고 원장의 값으로 강제로 되돌리면, 방금 있었던 정당한
    변경이 조용히 사라진다 — 이 테스트가 그 사고를 막는다.
    """
    row = _row()
    later_date = date(2026, 9, 1)  # 원장의 new_target_date 와 다른, 그 사이 바뀐 값
    decisions = plan_revert([row], {row.card_id: later_date})

    assert decisions == [
        RevertDecision(
            row,
            "skip_mismatch",
            f"현재값 {later_date} != 원장의 신규값 {row.new_target_date} — 그 사이 다른 변경이 있었다",
        )
    ]


def test_plan_revert_skips_missing_cards() -> None:
    """카드가 삭제·조회 불가면(다른 스크립트로 archive 됐을 수도) 되돌릴 대상이 없다."""
    row = _row()
    decisions = plan_revert([row], {})

    assert decisions[0].action == "skip_missing"


def test_plan_revert_handles_each_entry_independently() -> None:
    """원장 안 카드 하나가 mismatch 여도 나머지는 정상적으로 revert 대상이어야 한다."""
    ok = _row()
    stale = _row()
    decisions = plan_revert(
        [ok, stale],
        {ok.card_id: ok.new_target_date, stale.card_id: date(2099, 1, 1)},
    )

    by_id = {d.row.card_id: d.action for d in decisions}
    assert by_id[ok.card_id] == "revert"
    assert by_id[stale.card_id] == "skip_mismatch"
