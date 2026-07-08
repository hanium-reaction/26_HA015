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
  | 'weekly-plan'
  | 'morning-brief'
  | 'today'
  | 'focus'
  | 'recovery'
  | 'recovered'
  | 'evening'
  | 'weekly'
  | 'inbox'
  | 'review'
  | 'goals'
  | 'settings';

export type TabId = 'today' | 'weekly' | 'inbox' | 'review';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  time?: string;
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
  time: string;
  title: string;
  dur: number;
  type?: string;
  goal?: string;
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
  why: string;
  time: string;
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
