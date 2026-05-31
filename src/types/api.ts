// 백엔드 응답 타입 (reaction-backend/docs/api-contract.md v0.7 기준).
// 응답은 envelope 없이 도메인 객체를 직접 반환하며 필드는 모두 camelCase.

export type OnboardingState =
  | 'WELCOME'
  | 'ONBOARDING_INTERVIEW'
  | 'ONBOARDING_CONFIRM'
  | 'ONBOARDING_CALENDAR'
  | 'ONBOARDING_MANUAL_SCHEDULE'
  | 'ONBOARDING_POLICIES'
  | 'ONBOARDING_FIRST_PLAN'
  | 'ONBOARDING_NOTIFICATIONS'
  | 'ACTIVE';

export type ToneMode = 'gentle' | 'strict' | 'encouraging';

export interface UserProfile {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  onboardingState: OnboardingState;
  toneMode: ToneMode;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: UserProfile;
}

export interface OnboardingStatus {
  currentState: OnboardingState;
  suggestedNextScreen: string; // e.g. "S01", "S02", ..., "S10"
}

// ── Interview (S02) ────────────────────────────────────────────
export type SlotAnswerType =
  | 'text'
  | 'chip'
  | 'select'
  | 'date_picker'
  | 'time_range';

export interface InterviewQuestion {
  slotKey: string;
  text: string;
  answerType: SlotAnswerType;
  options: string[];
}

export type InterviewEndReason = 'early_user' | 'completed' | null;

export interface InterviewSession {
  sessionId: string;
  ambiguityScore: number;
  totalTurns: number;
  endReason: InterviewEndReason;
  currentQuestion: InterviewQuestion | null;
}

export interface SlotAnswerRequest {
  slotKey: string;
  value: unknown;
  clientTurn: number;
}

export interface SlotCatalogEntry {
  slotKey: string;
  label: string;
  answerType: SlotAnswerType;
  isRequired: boolean;
  category: string;
}

// ── Goals (S03·S26) ───────────────────────────────────────────
export type GoalTier = 'focus' | 'maintain' | 'parked';

export interface ApiGoal {
  goalId: string;
  title: string;
  category: string;
  goalTier: GoalTier;
  priorityLevel: number;
  deadline: string | null; // YYYY-MM-DD
  estimatedMinutes: number | null;
  status: string;
}

export interface GoalsByTier {
  focus: ApiGoal[];
  maintain: ApiGoal[];
  parked: ApiGoal[];
}

// ── Time Policies (S07) ───────────────────────────────────────
export type PolicyType =
  | 'sleep'
  | 'lunch'
  | 'break_min'
  | 'no_touch'
  | 'late_night_block'
  | 'custom';

export interface TimePolicy {
  policyId: string;
  policyType: PolicyType | string;
  // payload 는 policy_type 별로 모양이 다르다 (sleep/lunch: {startTime,endTime},
  // break_min: {minMinutes}, 등).
  payload: Record<string, unknown>;
  isActive: boolean;
}

// ── Fixed Schedules (S05) ─────────────────────────────────────
export type DayOfWeek = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export interface FixedSchedule {
  scheduleId: string;
  title: string;
  daysOfWeek: DayOfWeek[];
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

export interface FixedScheduleCreateRequest {
  title: string;
  daysOfWeek: DayOfWeek[];
  startTime: string;
  endTime: string;
}

// ── Calendar (S04) ─────────────────────────────────────────────
export interface CalendarConnection {
  provider: string;
  connected: boolean;
  scopes: string[];
}

export interface BusyInterval {
  start: string; // KST ISO 8601
  end: string;
}

export interface FreeBusy {
  busy: BusyInterval[];
}

// ── Notifications (S08) ───────────────────────────────────────
export interface NotificationSettings {
  morningBriefTime: string; // HH:MM
  eveningReflectionTime: string;
  preCardEnabled: boolean;
  pushSubscribed: boolean;
}

export interface NotificationSettingsUpdateRequest {
  morningBriefTime?: string;
  eveningReflectionTime?: string;
  preCardEnabled?: boolean;
}

// ── Inbox (S24·S25) ───────────────────────────────────────────
export type InboxStatus = 'captured' | 'classified' | 'archived' | 'promoted';
// 백엔드가 강제하는 6종 enum (#40, schemas/inbox.py)
export type InboxCategory = 'study' | 'project' | 'health' | 'routine' | 'schedule' | 'other';

export interface InboxItem {
  inboxId: string;
  rawText: string;
  aiCategoryGuess: string | null;
  userCategory: string | null;
  status: InboxStatus | string;
  promotedGoalId: string | null;
}

export interface InboxCreateRequest {
  rawText: string;
}

export interface InboxUpdateRequest {
  userCategory?: InboxCategory;
  status?: InboxStatus;
}

// ── Habits (S27) ──────────────────────────────────────────────
export type TimePreference = 'morning' | 'afternoon' | 'evening' | 'anytime';

export interface Habit {
  habitId: string;
  title: string;
  category: string;
  frequencyPerWeek: number;
  minutesPerSession: number;
  timePreference: TimePreference | string;
  priorityLevel: number;
}

export interface HabitInstance {
  instanceId: string;
  habitId: string;
  weekStart: string; // YYYY-MM-DD
  targetCount: number;
  doneCount: number;
}

export interface HabitCreateRequest {
  title: string;
  category: string;
  frequencyPerWeek: number;
  minutesPerSession: number;
  timePreference: TimePreference;
  priorityLevel: number;
}

// ── Today / Execution (S10-S13) ───────────────────────────────
// 백엔드 /today/* 는 현재 501 이라 응답 모양이 contract 에 자세히 못박혀 있지 않다.
// api-contract §10 + DB 설계서를 근거로 합리적 추정. 백엔드가 채워질 때 조정.

export type ActionItemStatus =
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'partial_done'
  | 'failed'
  | 'recovery_pending';

export interface DailyBrief {
  date: string; // YYYY-MM-DD
  greeting: string;
  bigRock: string | null;
  adjustmentHints: string[];
}

export interface ActionItem {
  actionItemId: string;
  title: string;
  goalId: string | null;
  scheduledTime: string | null; // HH:MM
  durationMinutes: number;
  status: ActionItemStatus | string;
  carryover?: boolean;
  failReason?: string | null;
}

export interface TodayAgenda {
  brief: DailyBrief;
  actions: ActionItem[];
  habits: HabitInstance[];
  fixedSchedules: FixedSchedule[];
}

export type CompletionStatus = 'done' | 'partial_done' | 'failed' | 'over_done';

export interface ExecutionEvent {
  executionId: string;
  actionItemId: string;
  startedAt: string; // KST ISO
  endedAt: string | null;
  status: CompletionStatus | 'started' | string;
}

export interface CheckInRequest {
  executionId: string;
  completionStatus: CompletionStatus;
  actualDuration?: number; // minutes
  userFeedback?: string;
}

// ── Reflection (S17·S18) — 백엔드 501. api-contract §11 추정 ───
// 13종 실패 태그 (api-contract §11)
export type FailureTagCode =
  | 'TIME_SHORTAGE'
  | 'LOW_ENERGY'
  | 'HARD_TO_START'
  | 'PRIORITY_SHIFT'
  | 'PLAN_TOO_BIG'
  | 'FATIGUE'
  | 'AMBIGUITY'
  | 'CONFLICT'
  | 'OVERRUN'
  | 'AVOIDANCE'
  | 'DISTRACTION'
  | 'EMERGENCY'
  | 'CONTEXT_LOSS';

export interface FailureTag {
  code: FailureTagCode | string;
  label: string;
  isActive: boolean;
}

export interface ReflectionPendingItem {
  executionId: string;
  actionItemId: string;
  title: string;
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime: string | null;
  completionStatus: CompletionStatus | null;
}

export interface ReflectionBatchRequest {
  items: Array<{
    executionId: string;
    completionStatus: CompletionStatus;
    failureTags?: FailureTagCode[];
    memoEncrypted?: string;
  }>;
}

// ── Recovery / Replan (S19·S20) — 백엔드 501. api-contract §12 추정 ──
export type RecoveryGroup = 'DOWNSCOPE' | 'RESCHEDULE' | 'CARRY_OVER' | 'PARK';

export type RecoveryStrategyCode =
  | 'NANO_STEP'
  | 'DOWNSCOPE_DEFAULT'
  | 'ENVIRONMENT_SHIFT'
  | 'CONTEXT_REWARMING'
  | 'RESCHEDULE_DEFAULT'
  | 'ACTIVE_RECOVERY'
  | 'CARRYOVER_DEFAULT'
  | 'FREEZE_SLOT'
  | 'PARK_DEFAULT';

export interface ApiRecoveryProposal {
  proposalId: string;
  group: RecoveryGroup;
  strategyCode: RecoveryStrategyCode | string;
  title: string;
  description: string;
  why: string;
  estimatedMinutes: number | null;
  confidence: number; // 0~100
}

export interface RecoveryDecisionRequest {
  executionId: string;
  proposalId: string;
}

export interface ReplanDiffBlock {
  blockId: string;
  title: string;
  scheduledTime: string | null;
  durationMinutes: number;
  carryover?: boolean;
}

export interface ReplanDiff {
  executionId: string;
  beforeBlocks: ReplanDiffBlock[];
  afterBlocks: ReplanDiffBlock[];
  summary: string;
}

// ── Plans (S06·S14·S15·S16) — 백엔드 501. api-contract §8 추정 ──
export type WorkloadLevel = 'easy' | 'medium' | 'heavy';

export interface PlanScheduledBlock {
  blockId: string;
  actionItemId: string | null;
  title: string;
  scheduledTime: string; // KST ISO 또는 HH:MM
  durationMinutes: number;
  goalId: string | null;
  fixed?: boolean;
  carryover?: boolean;
}

export interface PlanActionItem {
  actionItemId: string;
  title: string;
  goalId: string | null;
  estimatedMinutes?: number;
}

export interface PlanWeek {
  weekStart: string; // YYYY-MM-DD (월요일)
  workloadLevel: WorkloadLevel;
  warnings: string[];
  actionItems: PlanActionItem[];
  scheduledBlocks: PlanScheduledBlock[];
}

export interface Plan {
  planId: string;
  horizonEnd: string; // YYYY-MM-DD
  weeks: PlanWeek[];
}

export interface WeeklyPlanResponse {
  weekStart: string;
  blocks: PlanScheduledBlock[];
  workloadLevel?: WorkloadLevel;
}

export interface PlanBlockUpdate {
  scheduledTime?: string;
  durationMinutes?: number;
  title?: string;
}

// ── Reviews (S21·S22) — 백엔드 501. api-contract §13 추정 ───────
export interface WeeklyReview {
  weekStart: string; // YYYY-MM-DD
  adherenceRate: number; // 0~100
  consistencyDays: number;
  resilienceRate: number;
  categorySuccessRate: Record<string, number>;
  peakWindow: string | null;  // 예: "21:00-22:00"
  drainWindow: string | null;
  policyUpdateCandidates: string[];
}

// ── Settings / Privacy (S23·S28) — 백엔드 501. api-contract §16 ──
export type Language = 'ko' | 'en' | string;

export interface UserSettings {
  toneMode: ToneMode;
  language: Language;
  timezone: string;
}

export interface ToneModeUpdateRequest {
  toneMode: ToneMode;
}

export interface AnonymizeRequest {
  confirmationToken: string;
}

export type ConsentType = 'marketing' | 'research' | 'analytics' | string;

export interface ConsentRecord {
  type: ConsentType;
  granted: boolean;
  grantedAt: string | null;
}

export interface ConsentUpdateRequest {
  type: ConsentType;
  granted: boolean;
}

// ── Web Push (S08·S25) ────────────────────────────────────────
export interface PushSubscribeRequest {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

// ── 공통 에러 ─────────────────────────────────────────────────
export interface ApiErrorPayload {
  code: string;
  message: string;
  field: string | null;
  // KST ISO 8601 with offset (api-contract §1.5)
  server_time: string;
}
