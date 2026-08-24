// 만다라트(9×9) 좌표 계산과 화면 모델 — S30(초안)·S31(상시 뷰)·S32(셀 상세) 공용.
//
// 서버는 좌표(renderHint)를 내려주지 않는다 — "두 번째 진실"을 만들지 않으려고 일부러 뺐다.
// 위치는 depth·orderIndex 에서 아래 상수 하나로 순수 계산한다(#220 §FE 렌더링 규칙 1).
//
// 렌더 81칸 = 저장 73행 + 하위목표 8칸 중복 렌더(중앙만 1회, 하위목표만 2회 등장).

import type {
  MandalaCell,
  MandalaDraftResponse,
  MandalaNode,
  MandalaSource,
  MandalaSubgoal,
  MandalaTreeResponse,
} from '../types/api';

/** 3×3 안에서 중앙(4)을 뺀 8자리, 읽기 순서. */
export const SLOT = [0, 1, 2, 3, 5, 6, 7, 8] as const;

/** 중앙 블록 = 4. 축 k 는 블록 SLOT[k] 한가운데로 재등장한다. */
export const CORE_BLOCK = 4;

/** 축은 항상 정확히 8개, 축당 셀도 8개. 진척도 분모도 8 고정(#220 §5). */
export const AXIS_COUNT = 8;
export const CELL_COUNT = 8;

/** (block, cell) → 0-indexed 9×9 좌표. */
export function gridPos(block: number, cell: number): { row: number; col: number } {
  return {
    row: Math.floor(block / 3) * 3 + Math.floor(cell / 3),
    col: (block % 3) * 3 + (cell % 3),
  };
}

// ── 화면 모델 ─────────────────────────────────────────────────
// S30(초안: subgoals/cells/gaps)과 S31(승인본: MandalaNode[])은 데이터 모양이 다르지만
// 그리는 격자는 같다. 두 소스를 같은 MandalaBoard 로 정규화해 격자 컴포넌트를 하나만 둔다.

export type MandalaSlotRole = 'core' | 'axis' | 'leaf';

export interface MandalaSlot {
  role: MandalaSlotRole;
  /** 축 번호 0~7. core 는 -1. */
  axisIndex: number;
  /** 축 안의 셀 번호 0~7. core·axis 는 -1. */
  cellIndex: number;
  title: string;
  /** false = AI 가 못 채운 빈 칸. 억지로 채우지 않고 점선으로 남긴다. */
  filled: boolean;
  source: MandalaSource;
  /** 사용자가 인터뷰에서 직접 말한 축 — AI 재생성이 못 건드린다. */
  locked: boolean;
  completedAt: string | null;
  whyText: string | null;
  promotedGoalId: string | null;
  progress: number | null;
  coverage: number | null;
  /** 승인본(S31)에서만 있음. 초안(S30)은 아직 노드가 없어 null. */
  nodeId: string | null;
  /** 못 채운 사유(초안 gaps) — 빈 칸에 "왜 비었는지"를 남긴다. */
  gapReason: string | null;
}

export interface MandalaAxis {
  index: number;
  slot: MandalaSlot;
  cells: MandalaSlot[]; // 항상 8개(빈 칸 포함)
}

export interface MandalaBoard {
  statement: string;
  core: MandalaSlot;
  axes: MandalaAxis[]; // 항상 8개(빈 축 포함)
  progress: number | null;
  coverage: number | null;
}

function emptySlot(role: MandalaSlotRole, axisIndex: number, cellIndex: number): MandalaSlot {
  return {
    role,
    axisIndex,
    cellIndex,
    title: '',
    filled: false,
    source: 'rule',
    locked: false,
    completedAt: null,
    whyText: null,
    promotedGoalId: null,
    progress: null,
    coverage: null,
    nodeId: null,
    gapReason: null,
  };
}

function slotFromNode(node: MandalaNode, role: MandalaSlotRole, axisIndex: number, cellIndex: number): MandalaSlot {
  return {
    role,
    axisIndex,
    cellIndex,
    title: node.title,
    // 서버가 내려준 노드인데 제목이 비어 있으면 그것도 "빈 칸"이다.
    filled: node.title.trim() !== '',
    source: node.source,
    locked: node.locked,
    completedAt: node.completedAt,
    whyText: node.whyText,
    promotedGoalId: node.promotedGoalId,
    progress: node.progress,
    coverage: node.coverage,
    nodeId: node.nodeId,
    gapReason: null,
  };
}

/**
 * U8 응답(73노드) → 격자 모델.
 *
 * 정렬은 서버가 이미 `depth ASC, orderIndex ASC` 로 해서 내려주지만, 여기서는
 * orderIndex 를 자리 번호로 직접 쓰기 때문에 배열 순서에 의존하지 않는다.
 */
export function boardFromTree(tree: MandalaTreeResponse): MandalaBoard {
  const core = tree.nodes.find((n) => n.depth === 0) ?? null;
  const axisNodes = tree.nodes.filter((n) => n.depth === 1);
  const leafNodes = tree.nodes.filter((n) => n.depth >= 2);

  const axes: MandalaAxis[] = Array.from({ length: AXIS_COUNT }, (_, k) => {
    const axisNode = axisNodes.find((n) => n.orderIndex === k) ?? null;
    const slot = axisNode
      ? slotFromNode(axisNode, 'axis', k, -1)
      : emptySlot('axis', k, -1);
    const cells = Array.from({ length: CELL_COUNT }, (_, j) => {
      const leaf = axisNode
        ? leafNodes.find((n) => n.parentId === axisNode.nodeId && n.orderIndex === j)
        : undefined;
      return leaf ? slotFromNode(leaf, 'leaf', k, j) : emptySlot('leaf', k, j);
    });
    return { index: k, slot, cells };
  });

  const coreSlot = core
    ? slotFromNode(core, 'core', -1, -1)
    : { ...emptySlot('core', -1, -1), title: tree.statement, filled: tree.statement.trim() !== '' };

  return {
    statement: tree.statement,
    core: coreSlot,
    axes,
    progress: tree.progress,
    coverage: tree.coverage,
  };
}

/**
 * U3/U4/U5 초안 응답 → 같은 격자 모델. 승인 전이라 nodeId·완료·진척도는 없다.
 * gaps 는 못 채운 칸의 사유로 붙여, 빈 칸이 "실패"가 아니라 "의도된 여백"임을 보인다.
 */
export function boardFromDraft(
  center: { title: string; whyText?: string | null },
  subgoals: MandalaSubgoal[],
  cells: MandalaCell[],
  gaps: MandalaDraftResponse['gaps'] = [],
): MandalaBoard {
  const axes: MandalaAxis[] = Array.from({ length: AXIS_COUNT }, (_, k) => {
    const sg = subgoals.find((s) => s.orderIndex === k);
    const axisSlot: MandalaSlot = sg
      ? {
          ...emptySlot('axis', k, -1),
          title: sg.title,
          filled: sg.title.trim() !== '',
          source: sg.source ?? 'llm',
          locked: sg.locked ?? false,
          whyText: sg.whyText ?? null,
        }
      : emptySlot('axis', k, -1);

    const cellSlots = Array.from({ length: CELL_COUNT }, (_, j) => {
      const c = cells.find((x) => x.subgoalIndex === k && x.orderIndex === j);
      const gap = gaps.find((g) => g.subgoalIndex === k && g.orderIndex === j);
      if (!c || c.title.trim() === '') {
        return { ...emptySlot('leaf', k, j), gapReason: gap?.reason ?? null };
      }
      return {
        ...emptySlot('leaf', k, j),
        title: c.title,
        filled: true,
        source: c.source ?? 'llm',
        gapReason: gap?.reason ?? null,
      };
    });

    return { index: k, slot: axisSlot, cells: cellSlots };
  });

  return {
    statement: center.title,
    core: {
      ...emptySlot('core', -1, -1),
      title: center.title,
      filled: center.title.trim() !== '',
      source: 'user',
      whyText: center.whyText ?? null,
    },
    axes,
    progress: null,
    coverage: null,
  };
}

// ── 뷰 도우미 ─────────────────────────────────────────────────

/**
 * 3×3 한 블록(중앙 + 링 8칸). axisIndex=null 이면 중앙 블록(궁극목표 + 8축),
 * 아니면 그 축이 한가운데로 오는 블록(축 + 실행 셀 8개).
 */
export function blockOf(board: MandalaBoard, axisIndex: number | null): { center: MandalaSlot; ring: MandalaSlot[] } {
  if (axisIndex == null) {
    return { center: board.core, ring: board.axes.map((a) => a.slot) };
  }
  const axis = board.axes[axisIndex];
  return { center: axis.slot, ring: axis.cells };
}

export interface PlacedSlot {
  slot: MandalaSlot;
  /** 0-indexed 9×9 좌표. */
  row: number;
  col: number;
  /** 같은 축 슬롯이 두 번 등장하므로 key 를 좌표로 만든다. */
  key: string;
  /** 중앙 블록에 그려진 축인지(=탭하면 그 블록으로 줌인). */
  isAxisInCore: boolean;
}

/** 9×9 전체 조망(81칸) — 축 8칸은 중앙 블록과 자기 블록 한가운데에 두 번 그린다. */
export function fullGrid(board: MandalaBoard): PlacedSlot[] {
  const placed: PlacedSlot[] = [];
  const push = (slot: MandalaSlot, block: number, cell: number, isAxisInCore = false) => {
    const { row, col } = gridPos(block, cell);
    placed.push({ slot, row, col, key: `${row}-${col}`, isAxisInCore });
  };

  push(board.core, CORE_BLOCK, 4);
  board.axes.forEach((axis, k) => {
    push(axis.slot, CORE_BLOCK, SLOT[k], true); // 중앙 블록 안의 축
    push(axis.slot, SLOT[k], 4); // 자기 블록 한가운데로 재등장
    axis.cells.forEach((cell, j) => push(cell, SLOT[k], SLOT[j]));
  });

  return placed.sort((a, b) => (a.row - b.row) || (a.col - b.col));
}

// ── 표시용 라벨 ───────────────────────────────────────────────

export const SOURCE_LABEL: Record<MandalaSource, string> = {
  llm: 'AI가 제안',
  rule: '규칙으로 채움',
  user: '내가 씀',
};

// 칸 우상단 아이콘은 aria-hidden 이라, 그 아이콘이 나타내는 사실을 라벨이 대신 말해야
// 한다(#240). 예전에는 잠금·직접 씀이 어디에도 없어서 스크린리더로는 알 수 없었다.
function slotStateWords(slot: MandalaSlot): string {
  const words: string[] = [];
  if (slot.locked) words.push('내가 직접 말한 축이라 잠김');
  if (slot.filled && slot.source === 'user' && !slot.locked) words.push('내가 직접 씀');
  return words.length ? `, ${words.join(', ')}` : '';
}

/** 축 위치를 말로 — 위치가 곧 의미라 스크린리더 라벨에 반드시 넣는다(#220 §4). */
export function slotAriaLabel(board: MandalaBoard, slot: MandalaSlot): string {
  if (slot.role === 'core') return `가운데 칸, 궁극적 목표, ${slot.title || '아직 비어 있음'}`;
  const axisTitle = board.axes[slot.axisIndex]?.slot.title || `${slot.axisIndex + 1}번 축`;
  if (slot.role === 'axis') {
    const done = slot.progress != null ? `, 진행률 ${Math.round(slot.progress * 100)}퍼센트` : '';
    return `${slot.axisIndex + 1}번 축, ${slot.title || '아직 비어 있음'}${done}${slotStateWords(slot)}`;
  }
  const state = !slot.filled ? '빈 칸' : slot.completedAt ? '완료' : '미완료';
  return `${axisTitle} 그룹, ${slot.cellIndex + 1}번째 칸, ${slot.title || '아직 비어 있음'}, ${state}${slotStateWords(slot)}`;
}

/** 축의 "몇 칸 채웠나" — 분모는 항상 8 고정(1칸 하고 100% 로 보이는 착시 방지). */
export function axisFilledCount(axis: MandalaAxis): number {
  return axis.cells.filter((c) => c.filled).length;
}

export function axisDoneCount(axis: MandalaAxis): number {
  return axis.cells.filter((c) => c.completedAt != null).length;
}

// ── 승인 전 로컬 편집 보존 ────────────────────────────────────
// 셀 편집(HITL 최하위 층)은 승인(U6)까지 서버 호출이 0회다 — 앱이 죽으면 편집이 통째로
// 날아가므로 planId 키로 localStorage 에 즉시 저장한다(#220 §3).

const DRAFT_KEY = (planId: string) => `reaction.mandalaDraft.${planId}`;

export interface MandalaLocalEdit {
  subgoals: MandalaSubgoal[];
  cells: MandalaCell[];
  centerWhyText: string | null;
}

export function saveLocalEdit(planId: string, edit: MandalaLocalEdit): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY(planId), JSON.stringify(edit));
  } catch {
    // 저장 공간 부족 등 — 편집 자체를 막지는 않는다.
  }
}

export function loadLocalEdit(planId: string): MandalaLocalEdit | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY(planId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MandalaLocalEdit;
    if (!Array.isArray(parsed.subgoals) || !Array.isArray(parsed.cells)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalEdit(planId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY(planId));
  } catch {
    /* noop */
  }
}
