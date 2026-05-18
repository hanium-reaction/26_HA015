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
  | 'weekly-plan'
  | 'coping-style'
  | 'morning-brief'
  | 'today'
  | 'focus'
  | 'recovery'
  | 'recovered'
  | 'evening'
  | 'weekly'
  | 'review';

export type TabId = 'today' | 'weekly' | 'review';

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
