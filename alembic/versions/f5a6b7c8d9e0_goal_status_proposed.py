"""goal_status 에 proposed 추가 + 계획 없는 목표 보관

딥 인터뷰를 마치기만 해도 목표가 `active` 로 저장돼(#96), 계획을 승인하지 않고 나간 목표가
진짜 목표와 구분 없이 쌓였다(실측: 67개 중 43개가 계획이 하나도 없는 active).

`proposed`(잠정) 상태를 도입해 인터뷰 완료 → proposed / 계획 승인 → active 로 나눈다.
분류 화면에는 계속 보이므로 #96 의 목적(인터뷰 후 목표가 보인다)은 유지된다.

기존 데이터: action_item 이 하나도 매달리지 않은 목표는 계획으로 이어진 적이 없다는 뜻이므로
보관(archived)으로 넘긴다. soft 처리라 행은 남고 화면에서만 사라진다(hard delete 금지).

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
"""

from collections.abc import Sequence

from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: str | Sequence[str] | None = "e4f5a6b7c8d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # PG12+ 는 트랜잭션 안에서 ADD VALUE 가 가능하다. 단 같은 트랜잭션에서 그 값을 **사용**할
    # 수는 없으므로, 아래 백필은 기존 값('archived')만 쓴다.
    op.execute("ALTER TYPE goal_status ADD VALUE IF NOT EXISTS 'proposed'")

    # 계획(action_item)이 하나도 없는 목표 = 인터뷰만 하고 승인하지 않은 잔재 → 보관.
    op.execute(
        """
        UPDATE goals g
           SET status = 'archived',
               archived_at = COALESCE(g.archived_at, now()),
               updated_at = now()
         WHERE g.archived_at IS NULL
           AND g.status = 'active'
           AND NOT EXISTS (
                 SELECT 1
                   FROM action_items a
                   JOIN goal_nodes n ON a.goal_node_id = n.id
                  WHERE n.goal_id = g.id
               )
        """
    )


def downgrade() -> None:
    # 보관된 목표를 되살린다 — 어느 것이 이 마이그레이션 때문인지 구분할 수 없으므로
    # '계획 없는 archived' 를 대상으로 한다(업그레이드가 만든 집합과 동일).
    op.execute(
        """
        UPDATE goals g
           SET status = 'active',
               archived_at = NULL,
               updated_at = now()
         WHERE g.status = 'archived'
           AND NOT EXISTS (
                 SELECT 1
                   FROM action_items a
                   JOIN goal_nodes n ON a.goal_node_id = n.id
                  WHERE n.goal_id = g.id
               )
        """
    )
    # 아직 proposed 인 행이 있으면 enum 값을 지울 수 없으므로 먼저 active 로 되돌린다.
    op.execute("UPDATE goals SET status = 'active' WHERE status = 'proposed'")
    # PostgreSQL 은 enum 값 DROP 을 지원하지 않는다 — 타입을 다시 만들어 갈아끼운다.
    # 컬럼 DEFAULT('active'::goal_status)가 걸려 있으면 타입 변경이 캐스팅 실패로 막히므로
    # 잠깐 떼었다가 새 타입으로 다시 붙인다.
    op.execute("ALTER TABLE goals ALTER COLUMN status DROP DEFAULT")
    op.execute("ALTER TYPE goal_status RENAME TO goal_status_old")
    op.execute("CREATE TYPE goal_status AS ENUM ('active', 'archived', 'completed')")
    op.execute(
        "ALTER TABLE goals ALTER COLUMN status TYPE goal_status USING status::text::goal_status"
    )
    op.execute("ALTER TABLE goals ALTER COLUMN status SET DEFAULT 'active'::goal_status")
    op.execute("DROP TYPE goal_status_old")
