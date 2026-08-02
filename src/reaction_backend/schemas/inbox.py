"""Inbox 도메인 스키마 (api-contract §18) — S24 Life Inbox / S25 Triage."""

from __future__ import annotations

from typing import Literal

from pydantic import Field

from reaction_backend.schemas.common import CamelModel

# Inbox 항목 라이프사이클 + category enum (DB 모델과 일치)
InboxStatus = Literal["captured", "classified", "archived", "promoted"]
InboxCategory = Literal["study", "project", "health", "routine", "schedule", "other"]
# 항목 출처 (BE #171) — system 은 목표 카테고리에 맞춰 자동으로 넣어 준 추천 자료.
InboxSource = Literal["user", "system"]


class InboxItem(CamelModel):
    """Inbox 항목 — GET/POST/PATCH/convert-* 응답.

    `raw_text` 는 응답에서 복호화된 평문. DB 는 `raw_text_encrypted` (AES-256-GCM).
    """

    inbox_id: str
    raw_text: str
    ai_category_guess: str | None
    user_category: str | None
    status: str
    promoted_goal_id: str | None
    # 승격 대상 구분 — status=promoted 일 때만 'goal'/'action', 그 외 null.
    # goal 은 promoted_goal_id 로 딥링크, action 은 오늘 실행 화면으로 이동.
    promoted_to: Literal["goal", "action"] | None = None
    # 출처와 자료 slug (#171). `promoted_to` 와 달리 **파생이 아니라 저장 컬럼 그대로**다.
    # `resource_slug` 에는 ID prefix 를 붙이지 않는다 — FE 가 그대로 URL 에 넣는다.
    source: InboxSource = "user"
    resource_slug: str | None = None


class InboxCreateRequest(CamelModel):
    """POST /inbox — 1줄 캡처."""

    raw_text: str = Field(min_length=1)


class InboxUpdateRequest(CamelModel):
    """PATCH /inbox/{id} — userCategory override 또는 status 변경."""

    user_category: InboxCategory | None = None
    status: InboxStatus | None = None


class InboxClassification(CamelModel):
    """LLM Structured Output — `aiClient.run("inbox/classify")` 응답 schema (내부 사용).

    Tool Executor 가 강제 검증. fallback 룰도 같은 schema 로 반환.
    """

    ai_category_guess: InboxCategory
    confidence: float = Field(ge=0.0, le=1.0)
    suggested_title: str
    needs_user_override: bool


class InboxResourceDetail(CamelModel):
    """GET /inbox/resources/{slug} — 시스템 항목이 가리키는 정적 자료 본문.

    `markdown` 은 frontmatter 를 걷어낸 본문이다(파일 원문이 아니다). FE 는 첫 H1 이
    `title` 과 같을 때만 본문에서 덜어내므로 **둘 다 가공 없이** 실어야 한다.
    """

    slug: str
    title: str
    markdown: str
