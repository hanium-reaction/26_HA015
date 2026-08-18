"""목표 카테고리 → 인박스 추천 자료 삽입 (BE #171 3단계).

목표가 **active 로 생긴 순간** 그 카테고리에 맞는 정적 자료(`content/<category>/<slug>.md`)
를 인박스에 시스템 항목으로 넣는다. 사용자는 인박스에서 열어 읽고, 필요 없으면 보관한다.

설계상 지켜야 하는 것 4가지:

- **멱등.** 같은 user + `resource_slug` 가 이미 있으면(**보관된 것 포함**) 넣지 않는다.
  보관은 "이 자료 안 볼래" 라는 의사표시라, 목표를 만들 때마다 되살리면 안 된다.
- **카테고리당 1건.** 자료가 늘어도 한 번에 하나만 들어간다. 인박스 도배 방지.
- **`status='classified'` 명시.** 모델 `server_default` 와 리포 기본값이 둘 다 `captured`
  인데 FE 는 그 탭을 제거해서(#129) 방치하면 **어느 탭에도 안 뜬다.**
- **`ai_category_guess` 항상 채움.** `InboxRepo.restore()` 가 이 값이 `None` 이면
  `captured` 로 되돌리므로, 비워 두면 **보관→복원 시 자료가 영영 사라진다.**

`proposed` 목표에는 넣지 않는다 — 사용자가 확정하지 않은 목표로 인박스를 채우지 않는다.
호출자가 active 인 경로에서만 부르는 것으로 보장한다(이 모듈은 status 를 다시 읽지 않는다:
실 DB 는 server_default 로, fake 는 명시 대입으로 값을 채워 두 구현이 갈릴 수 있다).
"""

from __future__ import annotations

import logging
from collections.abc import Iterable
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from reaction_backend.content import registry
from reaction_backend.repositories.inbox_repo import InboxRepo
from reaction_backend.safety.encryption import encrypt_inbox_text

logger = logging.getLogger(__name__)

# Goal 카테고리 9종 → Inbox 카테고리 6종. `db/models/goal.py` 의 모든 값을 키로 갖는
# 전사 함수여야 한다(어긋남은 테스트가 잡는다). inbox 에 없는 3종은 `other` 로 접는다.
GOAL_TO_INBOX_CATEGORY: dict[str, str] = {
    "study": "study",
    "project": "project",
    "health": "health",
    "routine": "routine",
    "schedule": "schedule",
    "career": "other",
    "relationship": "other",
    "self_dev": "other",
    "other": "other",
}

# 한 카테고리에서 한 번에 넣는 자료 수. 콘텐츠가 늘어도 상한이 유지되도록 상수로 못 박는다.
_MAX_PER_CATEGORY = 1


async def ensure_resources(
    repo: InboxRepo,
    *,
    user_id: UUID,
    goal_categories: Iterable[str],
) -> list[str]:
    """카테고리마다 자료를 최대 1건씩 인박스에 넣고, 실제로 넣은 slug 를 돌려준다.

    자료가 없는 카테고리는 아무 일도 하지 않는다. commit 은 호출자 책임.
    """
    inserted: list[str] = []
    for goal_category in dict.fromkeys(goal_categories):  # 중복 제거 + 순서 보존
        docs = registry.list_by_category(goal_category)[:_MAX_PER_CATEGORY]
        for doc in docs:
            if await repo.has_resource(user_id, doc.slug):
                continue
            await repo.create(
                user_id=user_id,
                # 카드에 그대로 렌더되는 한 줄. 제목·본문은 자료 상세로 따로 나간다.
                raw_text_encrypted=encrypt_inbox_text(doc.summary),
                ai_category_guess=GOAL_TO_INBOX_CATEGORY.get(goal_category, "other"),
                status="classified",
                source="system",
                resource_slug=doc.slug,
            )
            inserted.append(doc.slug)
    return inserted


async def ensure_resources_best_effort(
    session: AsyncSession,
    repo: InboxRepo,
    *,
    user_id: UUID,
    goal_categories: Iterable[str],
) -> list[str]:
    """`ensure_resources` 를 savepoint 로 감싼다 — 실패해도 목표 생성은 성공해야 한다.

    맨 `try/except` 로는 best-effort 가 성립하지 않는다: INSERT 가 실패하면 PostgreSQL
    트랜잭션이 abort 상태가 되어, 예외를 삼켜도 뒤따르는 `session.commit()` 까지 같이
    죽는다. `begin_nested()` 로 감싸야 자료 삽입만 롤백되고 목표는 남는다.
    (선례: `api/routes/interview.py::_persist_profile_best_effort`)
    """
    try:
        async with session.begin_nested():
            return await ensure_resources(repo, user_id=user_id, goal_categories=goal_categories)
    except Exception:  # noqa: BLE001 — 자료 삽입 실패가 목표 생성을 깨지 않게
        logger.warning("inbox resource insert failed; goal creation continues", exc_info=True)
        return []
