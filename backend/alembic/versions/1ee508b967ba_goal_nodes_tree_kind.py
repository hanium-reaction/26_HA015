"""goal_nodes.tree_kind + 만다라 셀 메타 6컬럼 (PR3)

Revision ID: 1ee508b967ba
Revises: 27ffda5503f1
Create Date: 2026-08-20 16:08:26.155685

계획 분해 트리(`tree_kind='plan'`)와 궁극목표 만다라트(`tree_kind='mandala'`)를
`goal_nodes` 한 테이블 안에서 분리한다. 이 컬럼이 없으면 계획 승인(`_archive_goal_nodes`)
한 번에 만다라 73칸이 통째로 archived 되는 사고가 난다 — 이 마이그레이션은 그 사고를 막는
축이지, 아직 만다라 생성 기능 자체를 켜지 않는다(PR5+).

추가 컬럼:
- `tree_kind` — 'plan'(기존 전량) | 'mandala'. PG enum 대신 String+CHECK — enum 은
  `ALTER TYPE ADD VALUE` 가 같은 트랜잭션에서 못 쓰이고 DROP VALUE 가 아예 없어 downgrade 가
  타입 재생성+USING 캐스팅이 된다(`f5a6b7c8d9e0` 가 이 레포가 겪은 실제 사례).
- `source` — 'llm'(기존 전량, 계획 분해 LLM 산출) | 'rule' | 'user'. AI 가 채운 칸/룰 패딩
  칸/사용자가 직접 쓴 칸을 구분해 FE 가 점선 렌더에 쓴다.
- `why_text` / `completed_at` — 만다라 셀 메타(카드 없는 셀의 직접 완료·"왜 이 8개인가").
- `locked` — 사용자가 인터뷰에서 직접 말한 축은 재생성이 못 건드리게.
- `promoted_goal_id` — 하위목표 → 학기 Goal 승격 링크 (SET NULL, hard delete 아님).

`goal_id` 는 NOT NULL 로 유지한다 — nullable 로 풀면 downgrade 가 `goal_id IS NULL` 행을
지워야 하고 그건 DELETE 문이 된다(AGENTS §2 hard delete 금지). NOT NULL 유지로 downgrade 가
`drop_column` 만으로 대칭이 된다(DELETE 문 0개).

⚠️ 만다라 형상 CHECK(`ck_goal_nodes_mandala_shape`/`_type`)는 전부 `tree_kind <> 'mandala' OR`
가드가 붙는다 — 기존 행은 전부 `tree_kind='plan'`이라 좌항이 참이 되어 검증이 즉시 통과한다.
가드 없이 걸면 기존 행의 depth↔node_type 불일치(server_default 조합상 depth=0인데
node_type='subgoal'인 root 가 존재할 수 있다)로 마이그레이션이 실패한다.

⚠️ DB 마이그레이션 — AGENTS §8 "먼저 팀 합의".
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "1ee508b967ba"
down_revision: str | Sequence[str] | None = "27ffda5503f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema — goal_nodes 6컬럼 + 형상 제약 + action_items 인덱스."""
    # ── 1) tree_kind: nullable 로 추가 → 백필 → NOT NULL ──
    op.add_column("goal_nodes", sa.Column("tree_kind", sa.String(16), nullable=True))
    op.execute("UPDATE goal_nodes SET tree_kind = 'plan' WHERE tree_kind IS NULL")
    op.alter_column(
        "goal_nodes",
        "tree_kind",
        existing_type=sa.String(16),
        nullable=False,
        server_default="plan",
    )
    op.create_check_constraint(
        "ck_goal_nodes_tree_kind", "goal_nodes", "tree_kind IN ('plan', 'mandala')"
    )

    # ── 2) source: 기존 행은 계획 LLM 이 만든 것이므로 'llm' 이 정확 ──
    op.add_column("goal_nodes", sa.Column("source", sa.String(8), nullable=True))
    op.execute("UPDATE goal_nodes SET source = 'llm' WHERE source IS NULL")
    op.alter_column(
        "goal_nodes",
        "source",
        existing_type=sa.String(8),
        nullable=False,
        server_default="user",
    )
    op.create_check_constraint(
        "ck_goal_nodes_source", "goal_nodes", "source IN ('llm', 'rule', 'user')"
    )

    # ── 3) 셀 메타 (전부 nullable — 백필 불필요) ──
    op.add_column("goal_nodes", sa.Column("why_text", sa.Text(), nullable=True))
    op.add_column(
        "goal_nodes", sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "goal_nodes",
        sa.Column("locked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("goal_nodes", sa.Column("promoted_goal_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        "fk_goal_nodes_promoted_goal_id",
        "goal_nodes",
        "goals",
        ["promoted_goal_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # ── 4) 만다라 형상 제약 — 전부 tree_kind='mandala' 가드가 붙는다 ──
    op.create_check_constraint(
        "ck_goal_nodes_mandala_shape",
        "goal_nodes",
        "tree_kind <> 'mandala' OR (depth BETWEEN 0 AND 2 AND order_index BETWEEN 0 AND 7)",
    )
    op.create_check_constraint(
        "ck_goal_nodes_mandala_type",
        "goal_nodes",
        "tree_kind <> 'mandala' OR "
        "(depth = 0 AND node_type = 'core'    AND is_leaf = false) OR "
        "(depth = 1 AND node_type = 'subgoal' AND is_leaf = false) OR "
        "(depth = 2 AND node_type = 'leaf'    AND is_leaf = true)",
    )
    # 한 부모 아래 같은 칸 번호 중복 금지. root(parent NULL)는 NULL 비교라 안 걸리므로 분리.
    op.create_index(
        "uq_goal_nodes_mandala_slot",
        "goal_nodes",
        ["parent_node_id", "order_index"],
        unique=True,
        postgresql_where=sa.text(
            "tree_kind='mandala' AND archived_at IS NULL AND parent_node_id IS NOT NULL"
        ),
    )
    op.create_index(
        "uq_goal_nodes_mandala_root",
        "goal_nodes",
        ["goal_id"],
        unique=True,
        postgresql_where=sa.text(
            "tree_kind='mandala' AND archived_at IS NULL AND parent_node_id IS NULL"
        ),
    )

    # ── 5) 진척도 롤업용 인덱스 (59acd6c5f086 의 인덱스 목록에서 빠져 있던 것) ──
    op.create_index(op.f("ix_action_items_goal_node_id"), "action_items", ["goal_node_id"])


def downgrade() -> None:
    """Downgrade schema — DELETE 문 0개(goal_id NOT NULL 유지 덕분에 drop_column 만으로 대칭)."""
    op.drop_index(op.f("ix_action_items_goal_node_id"), table_name="action_items")
    op.drop_index("uq_goal_nodes_mandala_root", table_name="goal_nodes")
    op.drop_index("uq_goal_nodes_mandala_slot", table_name="goal_nodes")
    for constraint in (
        "ck_goal_nodes_mandala_type",
        "ck_goal_nodes_mandala_shape",
        "ck_goal_nodes_source",
        "ck_goal_nodes_tree_kind",
    ):
        op.drop_constraint(constraint, "goal_nodes", type_="check")
    op.drop_constraint("fk_goal_nodes_promoted_goal_id", "goal_nodes", type_="foreignkey")
    for column in (
        "promoted_goal_id",
        "locked",
        "completed_at",
        "why_text",
        "source",
        "tree_kind",
    ):
        op.drop_column("goal_nodes", column)
