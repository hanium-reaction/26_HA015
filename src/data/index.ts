import type {
  Task,
  Goal,
  Block,
  ConvoMessage,
  RecoveryProposal,
  KpiItem,
  FailItem,
  PolicyItem,
} from '../types';

// ── Goal conversation ─────────────────────────────────────────
export const GOAL_CONVO: ConvoMessage[] = [
  { id: 0, who: 'ai', text: '안녕하세요! 지금 머릿속에 있는 목표들을 다 꺼내볼게요.\n\n요즘 가장 신경 쓰이는 게 뭔가요? 시험이든, 해야 할 일이든 편하게 말해주세요.' },
  { id: 1, who: 'user', text: 'SQLD 시험이 8월인데 아직 시작을 못 했어요. 학교 수업도 있고 알고리즘 스터디도 하고 싶은데 시간이 안 나서요.' },
  { id: 2, who: 'ai', text: '세 가지네요 — SQLD, 학교 수업, 알고리즘 스터디.\n\n이 중에서 "이게 안 되면 진짜 곤란해"하는 게 어떤 건가요?' },
  { id: 3, who: 'user', text: 'SQLD요. 8월이 시험일이라 기한이 있어서요.' },
  { id: 4, who: 'ai', text: '그렇죠, 데드라인이 있는 게 다르죠.\n\n학교 수업은 어떤가요? 빠지거나 과제 놓치면 안 되는 상황인가요?' },
  { id: 5, who: 'user', text: '수업은 그냥 유지는 해야죠. 빠지면 안 되고 과제도 내야 해서요.' },
  { id: 6, who: 'ai', text: '알겠어요. 알고리즘 스터디는요? 지금 당장 안 해도 큰일 나진 않는 건가요?' },
  { id: 7, who: 'user', text: '솔직히 지금은 좀 무리인 것 같아요. 나중에 하고 싶은 거긴 한데.' },
  { id: 8, who: 'ai', text: '완벽해요. 정리됐어요 —\n\n집중: SQLD (8월 마감, 집중 필요)\n유지: 학교 수업 (유지만 하면 됨)\n보류: 알고리즘 스터디 (나중에)\n\nSQLD 중심으로 주간 계획을 짜볼게요.' },
];

// ── Initial goals ─────────────────────────────────────────────
export const INIT_GOALS: Goal[] = [
  { id: 'g1', name: 'SQLD 자격증 취득',   deadline: '2026.08.17', status: 'focus',    progress: 34, weeklyH: 8 },
  { id: 'g2', name: '학교 수업 출석·과제', deadline: 'ongoing',    status: 'maintain', progress: 72, weeklyH: 4 },
  { id: 'g3', name: '알고리즘 스터디',     deadline: '2026.09.01', status: 'parked',   progress: 15, weeklyH: 0 },
];

export const GOAL_STATUS_META = {
  focus:   { label: '집중', bg: 'var(--coral-50)',   color: 'var(--coral-700)', border: 'var(--coral-200)' },
  maintain:{ label: '유지', bg: '#EEF1E5',            color: '#5F724D',           border: '#C2CFA5' },
  parked:  { label: '보류', bg: 'var(--sand-100)',   color: 'var(--text-3)',     border: 'var(--sand-300)' },
};

// ── Morning data ──────────────────────────────────────────────
export const MORNING_DATA = {
  date: '2026년 5월 6일 수요일',
  greeting: '좋은 아침이에요, 종민.',
  weekProgress: 43,
  blocks: [
    { id: 'm1', title: 'GROUP BY / HAVING 실습', time: '20:00', dur: '60분', type: '실습', note: '어제 미완료 → 이월됨', carryover: true },
    { id: 'm2', title: '서브쿼리 예제 3문항',     time: '21:10', dur: '30분', type: '기출' },
  ],
  carryMsg: '어제 못 한 GROUP BY 실습이 오늘로 이월됐어요.',
  goalName: 'SQLD 자격증 취득',
};

export const FAIL_REASONS = ['막막함', '피곤함', '일정 충돌', '과대 과제', '회피', '기타'];

// ── Week blocks V2 ────────────────────────────────────────────
export const WEEK_BLOCKS_V2: Block[] = [
  { id: 'b1', day: 0, time: '21:00', title: 'SQL 서브쿼리 심화',           dur: 60,  type: '개념', goal: 'g1', status: 'done' },
  { id: 'b2', day: 1, time: '19:00', title: '전공 수업',                   dur: 120, type: '수업', goal: 'g2', status: 'done', fixed: true },
  { id: 'b3', day: 2, time: '20:00', title: 'GROUP BY/HAVING 실습',        dur: 60,  type: '실습', goal: 'g1', status: 'failed' },
  { id: 'b4', day: 3, time: '19:00', title: '전공 수업',                   dur: 120, type: '수업', goal: 'g2', status: 'done', fixed: true },
  { id: 'b5', day: 3, time: '21:30', title: 'GROUP BY/HAVING 실습 (이월)', dur: 60,  type: '실습', goal: 'g1', status: 'pending', carryover: true },
  { id: 'b6', day: 4, time: '21:00', title: '기출 문제 20선',               dur: 90,  type: '기출', goal: 'g1', status: 'pending' },
  { id: 'b7', day: 5, time: '14:00', title: '윈도우 함수',                  dur: 60,  type: '개념', goal: 'g1', status: 'pending' },
  { id: 'b8', day: 6, time: '15:00', title: '주간 오답 정리',               dur: 45,  type: '복습', goal: 'g1', status: 'pending' },
];

// ── Weekly plan default ───────────────────────────────────────
export const WEEK_PLAN_DEFAULT: Block[] = [
  { id: 'p1', day: 0, time: '21:00', title: 'SQL 서브쿼리 심화',         dur: 60,  goal: 'SQLD' },
  { id: 'p2', day: 1, time: '19:00', title: '전공 수업',                  dur: 120, goal: '학교', fixed: true },
  { id: 'p3', day: 2, time: '20:00', title: 'GROUP BY / HAVING 실습',     dur: 60,  goal: 'SQLD' },
  { id: 'p4', day: 3, time: '19:00', title: '전공 수업',                  dur: 120, goal: '학교', fixed: true },
  { id: 'p5', day: 3, time: '21:30', title: 'JOIN 실습',                  dur: 60,  goal: 'SQLD' },
  { id: 'p6', day: 4, time: '21:00', title: '기출 문제 20선',              dur: 90,  goal: 'SQLD' },
  { id: 'p7', day: 5, time: '14:00', title: '윈도우 함수',                 dur: 60,  goal: 'SQLD' },
  { id: 'p8', day: 6, time: '15:00', title: '주간 오답 정리',              dur: 45,  goal: 'SQLD' },
];

export const GOAL_COLORS: Record<string, { bg: string; bd: string; fg: string }> = {
  SQLD: { bg: 'var(--brand-soft)', bd: 'var(--coral-200)', fg: 'var(--coral-700)' },
  학교:  { bg: '#EEF1E5',          bd: '#C2CFA5',           fg: '#5F724D' },
  알고리즘: { bg: '#EFEBF4',       bd: '#C7BDDB',           fg: '#6E5E9C' },
};

export const DAYS_KO = ['월', '화', '수', '목', '금', '토', '일'];

// ── Recovery data V2 ──────────────────────────────────────────
export const RECOVERY_DATA_V2 = {
  failed: 'GROUP BY / HAVING 실습',
  memory: '막막함 패턴 2회 연속 → Starter Step이 복구 성공률 3배',
  proposals: [
    { id: 'r1', type: 'STARTER STEP', bg: '#E5EFE3', bc: '#b4dfc8', ac: 'var(--success)',  title: '예제 1문항만 풀기',     desc: 'GROUP BY 기본 예제 딱 1개. 5–10분이면 충분해요.', why: '막막함은 시작 장벽이 원인. 최소 단위 시작 시 완료율 88%.', time: '5–10분', conf: 88 },
    { id: 'r2', type: 'DOWNSCOPE',    bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)', title: '오늘은 GROUP BY만', desc: 'HAVING은 다음에. GROUP BY 패턴 2개만 집중해요.', why: '범위가 넓을 때 완료율 낮음. 축소 시 시작률 향상.', time: '20분', conf: 74 },
    { id: 'r3', type: 'RESCHEDULE',   bg: '#FBEEDA', bc: '#F2D29A', ac: 'var(--warning)', title: '내일 저녁으로 이동',    desc: '오늘 에너지가 낮은 날. 목요일 21:00 빈 슬롯으로.', why: '에너지 낮은 날 강행 시 성공률 34%.', time: '—', conf: 61 },
  ] as RecoveryProposal[],
};

// ── Review data ───────────────────────────────────────────────
export const REVIEW_DATA = {
  week: 'W17 (4.27 – 5.3)',
  stats: { start: 71, complete: 57, recovery: 68, hours: 7.5, plan: 10 },
  kpi: [
    { label: '블록 시작률',   val: 71, target: 70, unit: '%', trend: '+4',  ok: true },
    { label: '복구 성공률',   val: 68, target: 50, unit: '%', trend: '+12', ok: true },
    { label: '실패 기록률',   val: 82, target: 70, unit: '%', trend: '+8',  ok: true },
    { label: '예상 시간 오차', val: 18, target: 15, unit: '분', trend: '-6',  ok: false },
  ] as KpiItem[],
  fails: [
    { r: '막막함', n: 3, p: 43 },
    { r: '피곤함', n: 2, p: 29 },
    { r: '일정 충돌', n: 1, p: 14 },
    { r: '기타', n: 1, p: 14 },
  ] as FailItem[],
  policy: [
    { label: '블록 길이',         from: '90분',       to: '60분',         why: '90분 이탈률 높음' },
    { label: '막막함 → Starter', from: 'Reschedule', to: 'Starter Step', why: '복구 성공률 2.3배' },
    { label: '저녁 슬롯 우선',    from: '무작위',      to: '21시 우선',    why: '21시 시작률 88%' },
  ] as PolicyItem[],
};

// ── Review V2 ─────────────────────────────────────────────────
export const REVIEW_V2 = {
  week: 'W17 (4.27 – 5.3)',
  scoreOutOf100: 74,
  stats: { start: 71, complete: 57, recovery: 68, hours: 7.5, plan: 10 },
  kpi: [
    { label: '블록 시작률',     val: 71, target: 70, unit: '%', trend: '+4',  ok: true,  icon: 'play-circle' },
    { label: '완료율',           val: 57, target: 60, unit: '%', trend: '+8',  ok: false, icon: 'check-circle' },
    { label: '복구 성공률',     val: 68, target: 50, unit: '%', trend: '+12', ok: true,  icon: 'arrows-clockwise' },
    { label: '실패 기록률',     val: 82, target: 70, unit: '%', trend: '+8',  ok: true,  icon: 'note-pencil' },
  ] as KpiItem[],
  fails: [
    { r: '막막함',    n: 3, p: 43, color: 'var(--brand)' },
    { r: '피곤함',    n: 2, p: 29, color: 'var(--warning)' },
    { r: '일정 충돌', n: 1, p: 14, color: '#A294C9' },
    { r: '기타',       n: 1, p: 14, color: 'var(--text-3)' },
  ] as FailItem[],
  daily: [
    { d: '월', h: 1.5 }, { d: '화', h: 2.0 }, { d: '수', h: 0.5 },
    { d: '목', h: 1.5 }, { d: '금', h: 1.0 }, { d: '토', h: 0.5 }, { d: '일', h: 0.5 },
  ],
  policy: [
    { label: '블록 길이',          from: '90분',       to: '60분',         why: '90분 이탈률 높음' },
    { label: '막막함 → Starter',   from: 'Reschedule', to: 'Starter Step', why: '복구 성공률 2.3배' },
    { label: '저녁 슬롯 우선',     from: '무작위',     to: '21시 우선',    why: '21시 시작률 88%' },
  ] as PolicyItem[],
};

// ── Merged proposals ──────────────────────────────────────────
export const MERGED_PROPOSALS: RecoveryProposal[] = [
  {
    id: 'p1', type: 'STARTER STEP',
    bg: '#E5EFE3', bc: '#b4dfc8', ac: 'var(--success)',
    title: '작게 다시 — 10분만',
    desc: '가장 작은 단위로 다시 시작해요. 5–10분이면 충분해요.',
    why: '막막함은 시작 장벽이 원인. 최소 단위 시작 시 완료율 88%. if-then 패턴과 정확히 일치해요.',
    time: '5–10분', conf: 88,
  },
  {
    id: 'p2', type: 'DOWNSCOPE',
    bg: 'var(--brand-soft)', bc: 'var(--coral-200)', ac: 'var(--brand)',
    title: '잠깐 휴식 · 15분',
    desc: '산책이나 물 한 잔. 그 다음 다시 시작해요.',
    why: '중간 피로 누적 시 강행보다 짧은 휴식 후 재시작이 완료율 74%.',
    time: '15–20분', conf: 74,
  },
  {
    id: 'p3', type: 'RESCHEDULE',
    bg: '#FBEEDA', bc: '#F2D29A', ac: 'var(--warning)',
    title: '내일로 이월 — 09:00',
    desc: '오늘 에너지가 낮은 날. 내일 아침 슬롯으로 자동 배치해요.',
    why: '에너지 낮은 날 강행 시 성공률 34%. 이월 후 다음 날 시작률은 61%.',
    time: '—', conf: 61,
  },
];

// ── Base tasks ────────────────────────────────────────────────
export const BASE_TASKS: Task[] = [
  { id: 't1', title: 'SQL 서브쿼리 실습',        status: 'done',         time: '오전 9:30', dur: '45분', goal: 'g1' },
  { id: 't2', title: 'GROUP BY / HAVING 실습', status: 'in_progress',   time: '오후 2:00', dur: '60분', goal: 'g1', carryover: false },
  { id: 't3', title: '전공 수업',                status: 'done',         time: '오후 4:00', dur: '120분', goal: 'g2', fixed: true },
  { id: 't4', title: '기출 문제 20선',           status: 'todo',         time: '오후 9:00', dur: '90분', goal: 'g1' },
  { id: 't5', title: '주간 오답 정리',           status: 'partial_done', time: '—',          dur: '45분', goal: 'g1', carryover: true, progress: 67 },
];
