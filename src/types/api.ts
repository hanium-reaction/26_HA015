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
  // 카탈로그 고정 보기(chip/select 유효 선택지). 자유서술 슬롯이면 빈 배열.
  options: string[];
  // LLM 이 슬롯 맥락에 맞춰 추천한 답변 카드 — 고정 보기 없는 자유서술 슬롯에서 탭/참고용.
  suggestedAnswers?: string[];
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

export interface GoalUpdateRequest {
  title?: string;
  deadline?: string | null; // YYYY-MM-DD
  priorityLevel?: number;
  goalTier?: GoalTier;
}

export interface GoalCreateRequest {
  title: string;
  category: string;
  goalTier: GoalTier;
  priorityLevel: number; // 1~5
  deadline?: string | null; // YYYY-MM-DD
  estimatedMinutes?: number | null;
}

export interface GoalNode {
  nodeId: string;
  parentId: string | null;
  title: string;
  depth: number;
}

export interface GoalDecomposition {
  goalId: string;
  rootNodeId: string;
  nodes: GoalNode[];
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

// PATCH /fixed-schedules/{id} — 부분 수정.
export interface FixedScheduleUpdateRequest {
  title?: string | null;
  daysOfWeek?: DayOfWeek[] | null;
  startTime?: string | null;
  endTime?: string | null;
}

// POST /time-policies — 정책 생성.
export interface TimePolicyCreateRequest {
  policyType: PolicyType | string;
  payload: Record<string, unknown>;
}

// PATCH /time-policies/{id} — payload 또는 isActive 부분 수정.
export interface TimePolicyUpdateRequest {
  payload?: Record<string, unknown> | null;
  isActive?: boolean | null;
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
// start·check-ins 는 백엔드 #13 으로 구현됨. agenda/action 상세·pause/resume 은
// 아직 contract 추정(미구현) 이며 백엔드가 채워질 때 조정.

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

// GET /today/agenda 의 카드 1건 (백엔드 AgendaCard 스키마와 정렬).
// 주의: scheduledTime/durationMinutes 같은 필드는 없다 — estimatedMinutes 만 있다.
export interface AgendaCard {
  actionId: string;
  title: string;
  category: string;
  status: string;
  priority: number;
  estimatedMinutes: number;
  source: string;
  whyNow: string | null;
  firstStep: string | null;
}

export interface TodayAgenda {
  date: string;
  brief: DailyBrief | null;
  cards: AgendaCard[];
  habits: HabitInstance[];
  fixedSchedules: FixedSchedule[];
}

export type CompletionStatus = 'done' | 'partial_done' | 'failed' | 'over_done';

// /today/focus/{executionId}/pause·resume 는 아직 contract 추정(미구현).
export interface ExecutionEvent {
  executionId: string;
  actionItemId: string;
  startedAt: string; // KST ISO
  endedAt: string | null;
  status: CompletionStatus | 'started' | string;
}

// POST /today/actions/{actionId}/start (#13)
export interface ExecutionStartResponse {
  executionId: string;
  actionId: string;
  actualStartAt: string; // KST ISO
  completionStatus: CompletionStatus | string;
}

// POST /today/check-ins (#13) — actualDuration 은 백엔드가 계산(actualDurationMinutes).
export interface CheckInRequest {
  executionId: string;
  completionStatus: CompletionStatus;
  userRating?: number | null; // 1~5
  userFeedback?: string | null;
}

export interface CheckInResponse {
  executionId: string;
  actionId: string;
  completionStatus: CompletionStatus | string;
  actualDurationMinutes: number | null;
  needsFailureTags: boolean; // partial_done/failed 면 실패 태그 입력 유도
}

// ── Reflection (S17·S18) — failure-tags 는 백엔드 #17 구현됨 ───
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

// GET /reflection/failure-tags (#17) — 마스터 카탈로그
export interface FailureTagMaster {
  tagCode: FailureTagCode | string;
  labelKo: string;
  description: string | null;
  sortOrder: number;
}

// POST /reflection/failure-tags/{executionId} (#17)
export interface FailureTagRequest {
  tagCodes: (FailureTagCode | string)[];
  memo?: string | null; // 클라이언트 암호화 메모(선택)
}

export interface FailureTagResponse {
  executionId: string;
  tagCodes: string[];
  hasMemo: boolean;
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

// ── Recovery / Replan (S19·S20) ───────────────────────────────
// POST /recovery/proposals/generate (#20)
export interface RecoveryGenerateRequest {
  executionId: string;
}

export interface RecoveryCard {
  attemptId: string;
  optionGroup: string; // DOWNSCOPE / RESCHEDULE / CARRY_OVER / PARK 등
  strategyType: string;
  labelKo: string;
  suggestedActionText: string;
  minRecoveryUnitMinutes: number;
  allowRestMode: boolean;
  triggerTag: string | null;
}

export interface RecoveryProposalsResponse {
  executionId: string;
  cards: RecoveryCard[];
  aiSource?: string;
  isDraft?: boolean;
}

// POST /recovery/decisions (#20)
export interface RecoveryDecisionRequest {
  executionId: string;
  decision: string; // accept / reject / skip 등
  acceptedAttemptId?: string | null;
  decisionReason?: string | null;
}

export interface RecoveryDecisionResponse {
  executionId: string;
  acceptedAttemptId: string | null;
  rejectedAttemptIds: string[];
  skippedAttemptIds: string[];
  resultingActionItemId: string | null;
  isDraft?: boolean;
}

// GET /replan/{executionId} — S20 before/after diff (Draft Layer, 백엔드 #20-B 구현됨).
// diff 의 한 면. start_at/end_at 은 KST(+09:00). before = 원본 실패 카드의 계획 시각,
// after = 회복 카드의 제안 시각(원본 시간대를 회복 target_date 로 이동).
export interface ReplanBlock {
  actionItemId: string;
  title: string;
  targetDate: string; // date (YYYY-MM-DD)
  startAt: string; // date-time
  endAt: string; // date-time
  estimatedMinutes: number;
}

export interface ReplanDiff {
  executionId: string;
  optionGroup: 'DOWNSCOPE' | 'RESCHEDULE' | 'CARRY_OVER' | 'PARK';
  before: ReplanBlock;
  after: ReplanBlock;
  // 아래 셋은 스키마 default 가 있어 응답에 항상 포함되지만 안전하게 optional.
  aiSource?: 'llm' | 'rule';
  alreadyApproved?: boolean;
  isDraft?: boolean;
}

// POST /replan/{executionId}/approve — 최종 적용 (Idempotency-Key 필수).
// 회복 ActionItem 을 scheduled_block(source=recovery) 으로 배치. 멱등.
export interface ReplanApproveResponse {
  executionId: string;
  scheduledBlockId: string;
  actionItemId: string;
  startAt: string; // date-time
  endAt: string; // date-time
  isDraft?: boolean;
}

// ── Plans (S16) — 주간 보기/블록 수정은 아직 contract 추정(미구현) ──
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

// ── First Plan (S06·S14·S15) — 백엔드 #18 구현됨 ───────────────
// GET /plans/{planId} · POST /plans/generate 가 반환하는 첫 계획 초안.
export interface GoalNodeDraft {
  nodeId: string;
  parentId: string | null;
  nodeType: string;
  title: string;
  isLeaf: boolean;
  orderIndex: number;
}

export interface ActionItemDraft {
  nodeId: string;
  title: string;
  category: string;
  estimatedMinutes: number;
  firstStep: string;
}

export interface ScheduledBlockPreview {
  origin: string; // goal / habit / fixed 등
  originId: string | null;
  title: string;
  category: string;
  start: string; // KST ISO
  end: string; // KST ISO
}

export interface PolicyViolation {
  nodeId: string;
  reason: string;
}

export interface FirstPlanResponse {
  planId: string;
  targetDate: string; // YYYY-MM-DD
  horizon: string | null;
  generatedAt: string; // KST ISO
  goalNodes: GoalNodeDraft[];
  actionItems: ActionItemDraft[];
  blocks: ScheduledBlockPreview[];
  policyViolations?: PolicyViolation[];
  warnings?: string[];
  aiSource?: string;
  isDraft?: boolean;
}

// POST /plans/generate 요청 본문 (모두 선택 — 서버가 인터뷰 결과로 보완).
export interface FirstPlanGenerateRequest {
  interviewSessionId?: string | null;
  targetDate?: string | null; // YYYY-MM-DD
  outcome?: Record<string, unknown> | null; // InterviewOutcome (보통 서버 파생)
}

// POST /plans/{planId}/approve
export interface FirstPlanApproveResponse {
  planId: string;
  activatedAt: string; // KST ISO
  activatedGoals: number;
  activatedGoalNodes: number;
  activatedActionItems: number;
  activatedBlocks: number;
  isDraft?: boolean;
}

// GET /plans/weekly (#21 구현됨) — 실제 contract.
export interface WeeklyBlock {
  blockId: string;
  actionId: string;
  title: string;
  category: string;
  source: string; // goal / habit / fixed 등
  startAt: string; // KST ISO
  endAt: string;   // KST ISO
  blockStatus: string; // pending / done / failed 등
}
export interface WeeklyPlanDay {
  date: string;    // YYYY-MM-DD
  weekday: string; // mon..sun
  blocks?: WeeklyBlock[];
}
export interface WeeklyPlanResponse {
  planId: string;
  weekStart: string;
  weekEnd: string;
  days: WeeklyPlanDay[];
}

// PATCH /plans/{planId}/blocks/{blockId} (#21)
export interface BlockEditRequest {
  startAt: string; // KST ISO
  endAt?: string | null;
}
export interface BlockEditResponse {
  blockId: string;
  startAt: string;
  endAt: string | null;
  blockStatus?: string;
}

// ── Reviews (S21·S22) — GET /reviews/weekly (#21 구현됨) ───────
export interface WeeklyReviewResponse {
  weekStart: string;
  weekEnd: string;
  generatedAt: string;
  oneLiner?: string | null;
  adherenceRate?: number | null;
  resilienceRate?: number | null;
  restartSuccessRate?: number | null;
  consistencyDays?: number | null;
  averageRecoveryMinutes?: number | null;
  avgDelayMinutes?: number | null;
  repeatedFailureCount?: number | null;
  categorySuccessRate?: Record<string, number> | null;
  peakWindow?: string | null;
  drainWindow?: string | null;
  policyUpdateCandidates?: unknown[] | null;
}
export interface WeeklyGenerateRequest {
  weekStart?: string;
}
export interface HabitWeekStat {
  weekStart: string;
  doneCount: number;
  targetCount: number;
}
export interface HabitPenaltyCandidate {
  habitId: string;
  title: string;
  currentFrequency: number;
  suggestedFrequency: number;
  message: string;
  recentWeeks?: HabitWeekStat[];
}
export interface HabitPenaltyListResponse {
  candidates?: HabitPenaltyCandidate[];
}
export interface HabitPenaltyAcceptResponse {
  habitId: string;
  newFrequency?: number;
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
