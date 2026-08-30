// Re:Action shared TypeScript types

export type TaskStatus =
  | 'todo'
  | 'in_progress'
  | 'done'
  | 'partial_done'
  | 'recovery_pending'
  | 'failed';

export type GoalStatus = 'focus' | 'maintain' | 'parked';

export type BlockStatus = 'pending' | 'done' | 'failed';

export type CopingStyle = 'smaller' | 'rest' | 'retry' | 'skip';

export type ScreenId =
  | 'intro'
  | 'goal-intake'
  | 'goal-classify'
  | 'setup'
  | 'milestone-confirm'
  | 'materials-search'
  | 'weekly-plan'
  | 'today'
  | 'focus'
  | 'recovery'
  | 'recovered'
  | 'evening'
  | 'weekly'
  | 'inbox'
  | 'review'
  | 'goals'
  // 궁극적 목표 만다라트(#220) — S29 인터뷰 / S30 초안 승인 / S31 상시 뷰.
  | 'ultimate-interview'
  | 'mandala-draft'
  | 'mandala'
  | 'settings'
  | 'my-info';

export type TabId = 'today' | 'weekly' | 'inbox' | 'review';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  time?: string;
  // 주간 계획에서 보완된 카드의 실제 시작 시각. 미래 일정의 실행 버튼 잠금에 사용한다.
  scheduledAt?: string;
  dur?: string;
  goal?: string;
  carryover?: boolean;
  fixed?: boolean;
  progress?: number;
  failReason?: string;
  tag?: { tone: ChipTone; label: string };
  // 액션 상세(S11) — 백엔드 AgendaCard 의 whyNow/firstStep. 있으면 "자세히"로 노출.
  whyNow?: string;
  firstStep?: string;
  // 백엔드 AgendaCard.priority — 작을수록 중요(1이 최우선). 히어로 카드 선정 기준.
  priority?: number;
  // 취소 가능 여부(백엔드 판정). 취소 UI 노출에만 쓴다.
  cancellable?: boolean;
}

export interface Goal {
  id: string;
  name: string;
  deadline: string;
  status: GoalStatus;
  progress: number;
  weeklyH: number;
}

export interface Block {
  id: string;
  day: number;
  // 블록의 실제 날짜(YYYY-MM-DD). 다중 주 계획에서 주 슬라이스·정확한 날짜 칸 매핑에 쓴다(#119).
  // 없으면 day(요일)만으로 현재 표시 주에 배치.
  dateStr?: string;
  time: string;
  title: string;
  dur: number;
  type?: string;
  goal?: string;
  // 연결된 목표 id(goal_<uuid>) — 있으면 목표 카테고리 기준으로 색/라벨(#109).
  goalId?: string;
  status?: BlockStatus | 'pending';
  fixed?: boolean;
  carryover?: boolean;
  note?: string;
}

export interface ConvoMessage {
  id: number;
  who: 'ai' | 'user';
  text: string;
  quickReplies?: string[];
}

export interface KpiItem {
  label: string;
  val: number;
  target: number;
  unit: string;
  trend: string;
  ok: boolean;
  icon?: string;
}

export interface FailItem {
  r: string;
  n: number;
  p: number;
  color?: string;
}

export interface PolicyItem {
  label: string;
  from: string;
  to: string;
  why: string;
}

export interface RecoveryProposal {
  id: string;
  type: string;
  bg: string;
  bc: string;
  ac: string;
  title: string;
  desc: string;
  // 이 제안을 고른 이유. 백엔드 코드를 한국어로 못 푸는 경우엔 비운다 —
  // 영문 enum 을 화면에 흘리느니 [왜?] 버튼을 아예 안 보여주는 쪽이 낫다.
  why?: string;
  // "20분~" 같은 시점·소요 요약. 백엔드가 안 주면 비운다 — '—' 를 넣으면 버그처럼 보인다.
  time?: string;
  conf: number;
  // if-then 카드용 trigger(감지된 패턴). 있으면 "만약 [trigger] 이면, [desc]" 로 표시.
  trigger?: string;
}

export type ChipTone =
  | 'neutral'
  | 'coral'
  | 'success'
  | 'warning'
  | 'plum'
  | 'sage'
  | 'sky'
  | 'amber';

export type ButtonVariant = 'primary' | 'ghost' | 'text' | 'pill' | 'coral';
export type ButtonSize = 'sm' | 'md' | 'lg';
