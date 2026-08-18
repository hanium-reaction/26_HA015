"""Content — 사용자에게 그대로 노출되는 정적 마크다운 자료 (인박스 추천 자료, BE #171).

진입점:

    from reaction_backend.content import registry

    doc = registry.get("exercise-plan-that-bends")   # 없으면 ContentNotFound
    docs = registry.list_by_category("health")       # 없으면 []

작성 규칙은 `content/README.md`. 규격은 `tests/test_content_registry.py` 가 고정한다.
"""

from reaction_backend.content import registry
from reaction_backend.content.registry import ContentDoc, ContentMalformed, ContentNotFound

__all__ = ["ContentDoc", "ContentMalformed", "ContentNotFound", "registry"]
