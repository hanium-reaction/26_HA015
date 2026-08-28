"""프로필 메모리 (#A-1·A-2) — 인터뷰 지속형 선호 → Policy Snapshot 레이어 영속 + 설정 편집.

3층: ① 매핑 순수 함수(한국어 칩→enum/버킷) ② GET/PATCH /settings/profile 라우트.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any, cast

from fastapi.testclient import TestClient

from reaction_backend.orchestrator import profile_memory as pm


def test_seed_slots_from_profile_reverses_editable_fields() -> None:
    """설정에서 수정 가능한 프로필 필드 → 재인터뷰 시드 슬롯값으로 역매핑(#reduce-reask)."""
    beh = cast(Any, SimpleNamespace(energy_cycle="evening", attention_span=50))
    inter = cast(Any, SimpleNamespace(recovery_tone="gentle"))
    seed = pm.seed_slots_from_profile(
        behavioral=beh,
        interaction=inter,
        focus_mode_prefs={"downscope_unit_min": 15, "rest_ok": False},
    )
    assert seed["time.peak_window"] == {"type": "chip", "values": ["저녁"]}
    assert seed["energy.focus_duration"] == {"type": "chip", "values": ["50분"]}
    assert seed["recovery.tone"] == {"type": "chip", "values": ["따뜻"]}
    assert seed["recovery.downscope_unit"] == {"type": "chip", "values": ["15분"]}
    assert seed["recovery.rest_ok"] == {"type": "chip", "values": ["아니오"]}
    # 활동창(preferred_*)은 설정 편집 대상이 아니라 프로필로 만들지 않는다 → 호출자가 원답 사용.
    assert "time.activity_window" not in seed


def test_seed_slots_from_profile_empty_when_absent() -> None:
    """프로필·focus_mode 가 없으면 빈 시드 → 오버레이가 지난 인터뷰 원답을 덮지 않는다."""
    assert pm.seed_slots_from_profile(behavioral=None, interaction=None, focus_mode_prefs={}) == {}


# ───────────────────────── 매핑 순수 함수 ─────────────────────────


def test_energy_cycle_from_peak() -> None:
    assert pm.energy_cycle_from_peak(["오전"]) == "morning"
    assert pm.energy_cycle_from_peak(["저녁", "오전"]) == "evening"  # 첫 값 기준
    assert pm.energy_cycle_from_peak(["변동"]) == "varies"
    assert pm.energy_cycle_from_peak([]) == "varies"
    assert pm.energy_cycle_from_peak(["없는칩"]) == "varies"  # 미지원 → 안전 폴백


def test_chunk_bucket() -> None:
    assert pm.chunk_bucket(None) == "30"
    assert pm.chunk_bucket(50) == "60"
    assert pm.chunk_bucket(90) == "90"
    assert pm.chunk_bucket(120) == "90"


def test_recovery_tone_enum() -> None:
    assert pm.recovery_tone_enum("따뜻") == "gentle"
    assert pm.recovery_tone_enum("담백") == "normal"
    assert pm.recovery_tone_enum("유머") == "encouraging"
    assert pm.recovery_tone_enum("모르는값") == "normal"  # 폴백


def test_recovery_speed_from_prefs() -> None:
    """회복 최소 단위 + 휴식 수용 → fast/medium/slow 파생."""
    assert pm.recovery_speed_from_prefs(10, True) == "fast"  # 작은 단위 + 휴식 OK
    assert pm.recovery_speed_from_prefs(5, True) == "fast"
    assert pm.recovery_speed_from_prefs(30, True) == "slow"  # 큰 단위만 가능
    assert pm.recovery_speed_from_prefs(45, False) == "slow"
    assert pm.recovery_speed_from_prefs(15, True) == "medium"
    assert pm.recovery_speed_from_prefs(10, False) == "medium"  # 휴식 거부 → fast 아님
    assert pm.recovery_speed_from_prefs(None, True) == "medium"


# ───────────────────────── GET/PATCH /settings/profile ─────────────────────────


def test_get_profile_empty_when_not_set(client: TestClient) -> None:
    """인터뷰가 아직 안 채웠으면 각 항목 null (행 미생성)."""
    resp = client.get("/settings/profile")
    assert resp.status_code == 200
    body = resp.json()
    assert body["behavioral"] is None
    assert body["interaction"] is None


def test_patch_profile_creates_and_persists(client: TestClient) -> None:
    resp = client.patch(
        "/settings/profile",
        json={
            "energyCycle": "morning",
            "attentionSpan": 50,
            "timeChunkPreference": "60",
            "recoveryTone": "gentle",
            "reminderFrequency": "minimal",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["behavioral"]["energyCycle"] == "morning"
    assert body["behavioral"]["attentionSpan"] == 50
    assert body["behavioral"]["timeChunkPreference"] == "60"
    assert body["interaction"]["recoveryTone"] == "gentle"
    assert body["interaction"]["reminderFrequency"] == "minimal"

    # 재조회 시 유지 (영속)
    got = client.get("/settings/profile").json()
    assert got["behavioral"]["energyCycle"] == "morning"
    assert got["interaction"]["recoveryTone"] == "gentle"


def test_patch_profile_partial_keeps_others(client: TestClient) -> None:
    """지정 필드만 갱신 — 나머지는 유지."""
    client.patch("/settings/profile", json={"attentionSpan": 40, "recoveryTone": "encouraging"})
    resp = client.patch("/settings/profile", json={"energyCycle": "evening"})
    body = resp.json()
    assert body["behavioral"]["energyCycle"] == "evening"
    assert body["behavioral"]["attentionSpan"] == 40  # 유지
    assert body["interaction"]["recoveryTone"] == "encouraging"  # 유지


def test_patch_recovery_prefs_round_trip(client: TestClient) -> None:
    """회복 선호(downscopeUnitMin·restOk) → focus_mode_preferences 저장/조회."""
    resp = client.patch("/settings/profile", json={"downscopeUnitMin": 15, "restOk": False})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["downscopeUnitMin"] == 15
    assert body["restOk"] is False

    got = client.get("/settings/profile").json()
    assert got["downscopeUnitMin"] == 15
    assert got["restOk"] is False


def test_patch_profile_invalid_enum(client: TestClient) -> None:
    resp = client.patch("/settings/profile", json={"energyCycle": "bogus"})
    assert resp.status_code == 422


def test_profile_requires_auth(unauthed_client: TestClient) -> None:
    assert unauthed_client.get("/settings/profile").status_code == 401


def test_patch_activity_window_round_trip(client: TestClient) -> None:
    """활동 시간대(계획 배치 창) 편집 → focus_mode_preferences 저장/조회 (#editable-activity-window)."""
    resp = client.patch(
        "/settings/profile", json={"activityStart": "06:00", "activityEnd": "24:00"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["activityStart"] == "06:00"
    assert body["activityEnd"] == "24:00"
    got = client.get("/settings/profile").json()
    assert got["activityStart"] == "06:00"
    assert got["activityEnd"] == "24:00"


def test_patch_activity_window_invalid(client: TestClient) -> None:
    assert client.patch("/settings/profile", json={"activityStart": "25:00"}).status_code == 422


def test_seed_normalizes_to_catalog_notation() -> None:
    """프로필의 분 값이 **카탈로그 표기**로 시드된다 — `"120분"` 이 아니라 `"2시간 이상"`.

    시드는 `routes/interview._persist_turn` 을 타고 `interview_slot_answers` 에 UPSERT 되므로,
    옵션에 없는 표기를 넣으면 **사용자가 고른 적 없는 값이 사용자의 답으로** 남는다.
    실제로 그랬고(v2.01 시드 루프), 오염된 프로필에서는 `"2분"` 이 답인 것처럼 남아 백필을
    틀리게 할 뻔했다.
    """
    beh = cast(Any, SimpleNamespace(energy_cycle="evening", attention_span=120))
    seed = pm.seed_slots_from_profile(behavioral=beh, interaction=None, focus_mode_prefs={})
    assert seed["energy.focus_duration"] == {"type": "chip", "values": ["2시간 이상"]}


def test_seed_skips_values_the_user_could_never_have_picked() -> None:
    """카탈로그 옵션에 못 맞추는 값은 **시드하지 않는다** — 그 슬롯은 열린 채 다시 묻는다.

    `PATCH /settings/profile` 이 `attention_span` 을 `ge=5` 로 허용해 45 같은 값이 있을 수
    있고, 파서 사고로 2 가 남아 있을 수도 있다. 지어낸 답으로 슬롯을 닫는 것보다 실제 보기를
    들고 한 번 더 묻는 편이 낫다.
    """
    for span in (2, 45, 240):
        beh = cast(Any, SimpleNamespace(energy_cycle="evening", attention_span=span))
        seed = pm.seed_slots_from_profile(behavioral=beh, interaction=None, focus_mode_prefs={})
        assert "energy.focus_duration" not in seed, span
        assert seed["time.peak_window"] == {"type": "chip", "values": ["저녁"]}  # 나머지는 그대로
