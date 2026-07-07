import type {
  Task,
  Goal,
  ConvoMessage,
  RecoveryProposal,
  KpiItem,
  FailItem,
  PolicyItem,
} from '../types';

// ── Goal conversation ─────────────────────────────────────────
export const GOAL_CONVO: ConvoMessage[] = [
  {
    id: 0, who: 'ai',
    text: '안녕하세요! 지금 머릿속에 있는 목표들을 다 꺼내볼게요.\n\n요즘 가장 신경 쓰이는 게 뭔가요? 시험이든, 해야 할 일이든 편하게 말해주세요.',
    quickReplies: [
      '토익 시험이 12월인데 아직 준비를 못 했어요',
      '취업 준비를 해야 하는데 뭐부터 해야 할지 막막해요',
      '운동 습관을 다시 잡고 싶은데 계속 미뤄요',
      '학점 관리가 걱정인데 공부에 집중이 안 돼요',
    ],
  },
  { id: 1, who: 'user', text: '토익 시험이 12월인데 아직 준비를 못 했어요. 학교 수업도 있고 헬스장도 다시 다니고 싶은데 시간이 안 나서요.' },
  {
    id: 2, who: 'ai',
    text: '세 가지네요 — 토익, 학교 수업, 헬스장.\n\n이 중에서 "이게 안 되면 진짜 곤란해"하는 게 어떤 건가요?',
    quickReplies: [
      '토익이요. 12월이 시험일이라 기한이 있어서요',
      '학교 과제가 제일 급해요, 학점이 중요해서요',
      '취업 준비가 더 급한 것 같아요',
      '사실 다 중요한데 뭐가 먼저인지 모르겠어요',
    ],
  },
  { id: 3, who: 'user', text: '토익이요. 12월이 시험일이라 기한이 있어서요.' },
  {
    id: 4, who: 'ai',
    text: '그렇죠, 데드라인이 있는 게 다르죠.\n\n학교 수업은 어떤가요? 빠지거나 과제 놓치면 안 되는 상황인가요?',
    quickReplies: [
      '유지만 하면 돼요. 빠지면 안 되고 과제도 내야 해요',
      '학점이 중요해서 열심히 챙겨야 해요',
      '온라인이라 어느 정도 유연하게 조율돼요',
      '수업은 이미 잘 따라가고 있어서 걱정 없어요',
    ],
  },
  { id: 5, who: 'user', text: '수업은 그냥 유지는 해야죠. 빠지면 안 되고 과제도 내야 해서요.' },
  {
    id: 6, who: 'ai',
    text: '알겠어요. 헬스장은요? 지금 당장 안 가도 큰일 나진 않는 건가요?',
    quickReplies: [
      '솔직히 지금은 좀 무리인 것 같아요, 나중에 하고 싶어요',
      '꼭 하고 싶은데 시간이 없어서 고민이에요',
      '일단 보류하고 토익 끝나면 다시 할게요',
      '가볍게라도 병행할 수 있을 것 같아요',
    ],
  },
  { id: 7, who: 'user', text: '솔직히 지금은 좀 무리인 것 같아요. 나중에 하고 싶은 거긴 한데.' },
  { id: 8, who: 'ai', text: '완벽해요. 정리됐어요 —\n\n집중: 토익 (12월 마감, 집중 필요)\n유지: 학교 수업 (유지만 하면 됨)\n보류: 헬스장 (나중에)\n\n토익 중심으로 주간 계획을 짜볼게요.' },
];

// ── Initial goals ─────────────────────────────────────────────
export const INIT_GOALS: Goal[] = [
  { id: 'g1', name: '토익 700+ 달성',      deadline: '2026.12.07', status: 'focus',    progress: 12, weeklyH: 8 },
  { id: 'g2', name: '학교 수업 출석·과제', deadline: 'ongoing',    status: 'maintain', progress: 72, weeklyH: 4 },
  { id: 'g3', name: '헬스장 운동 루틴',    deadline: '—',          status: 'parked',   progress: 0,  weeklyH: 0 },
];

export const GOAL_STATUS_META = {
  focus:   { label: '집중', bg: 'var(--coral-50)',   color: 'var(--coral-700)', border: 'var(--coral-200)' },
  maintain:{ label: '유지', bg: '#EEF1E5',            color: '#5F724D',           border: '#C2CFA5' },
  parked:  { label: '보류', bg: 'var(--sand-100)',   color: 'var(--text-3)',     border: 'var(--sand-300)' },
};

// ── Morning data ──────────────────────────────────────────────
// 백엔드 /today/agenda 가 채워질 때 자동 교체될 데모 데이터. 더미 시나리오는
// 백엔드 mock 의 goals (캡스톤·토익) 과 카테고리를 맞춰 일관성 유지.
export const MORNING_DATA = {
  // date / greeting 은 화면에서 user.name + new Date() 로 동적 생성. 여기 값은 fallback.
  date: '',
  greeting: '',
  weekProgress: 43,
  blocks: [
    { id: 'm1', title: '캡스톤 자료조사', time: '20:00', dur: '60분', type: '리서치', note: '어제 미완료 → 이월됨', carryover: true },
    { id: 'm2', title: '토익 LC 30문항', time: '21:10', dur: '30분', type: '기출' },
  ],
  carryMsg: '어제 못 한 캡스톤 자료조사가 오늘로 이월됐어요.',
  goalName: '캡스톤 프로젝트',
};

export const FAIL_REASONS = ['막막함', '피곤함', '일정 충돌', '과대 과제', '회피', '기타'];

// ── Goal color palette ────────────────────────────────────────
// 실제 목표 카테고리명은 사용자마다 자유 문자열이라 이름을 미리 알 수 없다(#85).
// 이름 해시로 팔레트 인덱스를 정해 같은 카테고리는 항상 같은 색을, 처음 보는
// 카테고리도 곧장 구분되는 색을 받게 한다 — 하드코딩된 이름 맵(SQLD/학교/알고리즘)
// 은 실 카테고리와 하나도 안 맞으면 전부 같은 기본색으로 뭉개져 보이는 문제가 있었다.
const GOAL_PALETTE: { bg: string; bd: string; fg: string }[] = [
  { bg: 'var(--brand-soft)', bd: 'var(--coral-200)', fg: 'var(--coral-700)' },
  { bg: '#EEF1E5', bd: '#C2CFA5', fg: '#5F724D' },
  { bg: '#EFEBF4', bd: '#C7BDDB', fg: '#6E5E9C' },
  { bg: '#FBEEDA', bd: '#F2D29A', fg: '#8A6420' },
  { bg: '#E5EFE3', bd: '#b4dfc8', fg: '#3D6B4F' },
  { bg: '#E8F0F7', bd: '#B8D4E8', fg: '#3D6480' },
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function goalColor(name: string | null | undefined): { bg: string; bd: string; fg: string } {
  if (!name) return GOAL_PALETTE[0];
  return GOAL_PALETTE[hashStr(name) % GOAL_PALETTE.length];
}

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
  { id: 't1', title: '토익 LC 30문항',           status: 'done',         time: '오전 9:30', dur: '45분', goal: 'g1' },
  { id: 't2', title: '캡스톤 자료조사',          status: 'in_progress',   time: '오후 2:00', dur: '60분', goal: 'g1', carryover: false },
  { id: 't3', title: '전공 수업',                status: 'done',         time: '오후 4:00', dur: '120분', goal: 'g2', fixed: true },
  { id: 't4', title: '토익 RC 모의고사 1회',      status: 'todo',         time: '오후 9:00', dur: '90분', goal: 'g1' },
  { id: 't5', title: '캡스톤 발표자료 초안',      status: 'partial_done', time: '—',          dur: '45분', goal: 'g1', carryover: true, progress: 67 },
];
