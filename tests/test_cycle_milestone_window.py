"""이번 주기가 다룰 마일스톤 구간 — 순수 함수 (ADR-0007 §1 커서 모델 / PR-5).

배경: 분해 프롬프트는 "확정 마일스톤 전부를 branch 로 써라" 와 "이 구간을 총 N개 세션으로
채워라" 를 동시에 지시받는다. LLM 은 둘을 **세션을 전 마일스톤에 얇게 펴 발라** 만족시킨다.
실측(로컬 최신 main, 실 LLM): 마감 14주·84시간짜리 목표인데 4주·24시간 계획이 마일스톤
4개를 전부 소진하고 마지막 세션이 "이력서 기재용 문구 작성" 이었다 — 사용자는 84시간짜리
목표를 24시간 안에 끝내라는 계획을 받고, 같은 응답의 경고문은 "나머지는 나중에 채운다" 고
말한다.

프롬프트에 이미 "앞쪽 마일스톤부터", "구간 밖 단계는 leaf 를 만들지 마라" 가 있는데도
그랬다. 그래서 룰로 자른다 — 안 주면 만들 수가 없다.
"""

from __future__ import annotations

from reaction_backend.orchestrator.first_plan_adapter import cycle_milestone_window
from reaction_backend.schemas.planning import MilestoneDraft


def _ms(*titles: str) -> list[MilestoneDraft]:
    return [MilestoneDraft(title=t, summary="") for t in titles]


def test_far_deadline_takes_only_the_front_slice() -> None:
    """마감 14주 · 이번 창 4주 · 마일스톤 4개 → 1개. 실측 사례 그대로."""
    got = cycle_milestone_window(
        _ms("기초", "프로젝트 1·2", "프로젝트 3·배포", "최종 점검"),
        cursor=0,
        horizon_weeks=4,
        full_horizon_weeks=14,
    )
    assert [m.title for m in got] == ["기초"]


def test_nearer_deadline_takes_more() -> None:
    """마감이 가까울수록 이번 주기가 더 많이 가져간다 — 비율이 그렇게 만든다."""
    ms = _ms("A", "B", "C", "D")
    assert len(cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=8)) == 2
    assert len(cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=5)) == 3


def test_deadline_inside_the_window_takes_everything() -> None:
    """마감이 이번 창 안이면 전부 — 지금 다 하는 게 맞다."""
    ms = _ms("A", "B", "C")
    assert cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=3) == ms
    assert cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=4) == ms


def test_cursor_advances_past_completed_milestones() -> None:
    """끝낸 것 다음부터 — 이게 없으면 주기가 돌아도 매번 1번을 다시 분해한다.

    Stage A 가 저장된 뼈대를 그대로 돌려주므로(PR-2.5) 분해 입력은 매 주기 동일하다.
    커서만이 "이번엔 여기부터" 를 말해 준다.
    """
    ms = _ms("기초", "중급", "심화", "마무리")

    got = cycle_milestone_window(ms, cursor=2, horizon_weeks=4, full_horizon_weeks=14)

    assert [m.title for m in got] == ["심화"]


def test_never_returns_empty_while_milestones_remain() -> None:
    """마감이 아무리 멀어도 최소 1개 — 0개면 분해가 뼈대 없이 자유 구성으로 떨어져
    사용자가 확정한 구조가 통째로 무시된다."""
    got = cycle_milestone_window(_ms("A", "B"), cursor=0, horizon_weeks=1, full_horizon_weeks=520)
    assert [m.title for m in got] == ["A"]


def test_all_completed_keeps_the_last_one_as_scaffold() -> None:
    """전부 끝냈는데도 계획을 세우려 하면 마지막 하나를 남긴다.

    정상 흐름이라면 '목표 완료 확인'(6b)이 먼저 뜬다. 그래도 여기로 오면 뼈대 없이
    자유 구성으로 떨어지는 것보다 마지막 단계를 이어가는 편이 낫다.
    """
    got = cycle_milestone_window(_ms("A", "B"), cursor=2, horizon_weeks=4, full_horizon_weeks=14)
    assert [m.title for m in got] == ["B"]


def test_no_deadline_does_not_narrow() -> None:
    """마감이 없으면 비율을 낼 기준이 없다 — 자르지 않는다(마감 없는 목표는 애초에
    마일스톤 층을 두지 않는 게 설계, §12)."""
    ms = _ms("A", "B", "C")
    assert cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=None) == ms
    assert cycle_milestone_window(ms, cursor=0, horizon_weeks=4, full_horizon_weeks=0) == ms


def test_empty_input_is_empty() -> None:
    """마일스톤을 안 보낸 계획(Stage A 건너뜀)은 그대로 자유 분해."""
    assert cycle_milestone_window(None, cursor=0, horizon_weeks=4, full_horizon_weeks=14) == []
    assert cycle_milestone_window([], cursor=0, horizon_weeks=4, full_horizon_weeks=14) == []
