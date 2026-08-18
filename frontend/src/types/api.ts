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

// 핵심 목표 후보 (outcome.coreGoals) — First Plan 의 goal_node 분해 입력이자,
// 목표 분류(S03) 화면이 GET /goals 대신 렌더해야 하는 값(#75. 이 시점엔 아직
// 어떤 목표도 goals 테이블에 저장돼있지 않다 — 저장은 First Plan 승인(S06)때).
export interface GoalCandidate {
  title: string;
  category: string;
  isHeaviest: boolean;
  deadline?: string | null;
  whyNow?: string | null;
  successImage?: string | null;
  tentativeTier: 'focus' | 'maintain' | 'parked';
  confidence: number;
  approachNote?: string | null;
  currentLevel?: string | null;
  frequencyPerWeek?: number | null;
  materialsNote?: string | null;
  preferredTime?: string | null;
  sessionLengthMin?: number | null;
  weeklyHours?: number | null;
}

// 종료 턴(S03 확인 카드용) 요약 — 표현 계층일 뿐, First Plan 시드는 outcome 쪽.
export interface InterviewSummary {
  confirmQuestion: string;
  goalSummary: string;
  headline: string;
  preferenceSummary: string;
  timeSummary: string;
}

// Deep Interview 최종 산출물. coreGoals 외 나머지(availability/identity/preferences 등)는
// 현재 프론트에서 직접 소비하지 않아 타입만 열어둔다.
export interface InterviewOutcome {
  sessionId: string;
  endReason: 'completed' | 'turn_limit' | 'early_user' | 'abandoned';
  ambiguityFinal: number;
  coreGoals: GoalCandidate[];
  unresolvedSlots?: string[];
  [key: string]: unknown;
}

export interface InterviewSession {
  sessionId: string;
  ambiguityScore: number;
  totalTurns: number;
  endReason: InterviewEndReason;
  currentQuestion: InterviewQuestion | null;
  // 종료 턴에만 채워진다(진행 중엔 둘 다 null/undefined) — §4.
  outcome?: InterviewOutcome | null;
  summary?: InterviewSummary | null;
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

// POST /calendar/sync-preview · POST /calendar/events/approve-insert — 백엔드 stub.
export interface CalendarEventPreview {
  title: string;
  start: string; // KST ISO
  end: string; // KST ISO
  conflict: boolean;
}

export interface SyncPreview {
  events: CalendarEventPreview[];
  conflictCount: number;
}

export interface ApproveInsertResult {
  insertedCount: number;
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

// GET /notifications/vapid-public-key — publicKey=null 이면 서버에 VAPID 미설정,
// FE 는 구독을 만들지 말아야 한다.
export interface VapidPublicKeyResponse {
  publicKey: string | null;
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
  // 승격 대상 구분(#122) — 'action'(할 일로) / 'goal'(목표로). 없으면 goal 로 간주.
  promotedTo?: 'goal' | 'action' | null;
  // 시스템이 넣은 추천 자료 항목 구분(#163, backend#171). 필드가 없으면 사용자 캡처로
  // 간주하므로 BE 미배포 상태에서도 기존 동작 그대로다(안전한 no-op).
  // ⚠️ BE 배포 후 `npm run gen:api` 로 실제 계약과 대조할 것.
  source?: 'user' | 'system' | null;
  resourceSlug?: string | null;
}

export interface InboxCreateRequest {
  rawText: string;
}

// GET /inbox/resources/{slug} (#163, backend#171). 미존재 slug 는 404.
export interface InboxResource {
  slug: string;
  title: string;
  markdown: string;
  // 자료가 제안하는 '한 걸음' 목록(backend#202). 읽고 끝나지 않게 실행으로 잇는 출구.
  steps: string[];
}

// POST /inbox/{inboxId}/adopt-step — 자료의 걸음 하나를 오늘 할 일로 채택.
export interface InboxAdoptStepRequest {
  stepIndex: number;
}
export interface InboxAdoptedStep {
  actionId: string;
  title: string;
  targetDate: string; // YYYY-MM-DD
  resourceSlug: string;
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

// PATCH /habits/{habitId} — 제목·빈도만 부분 수정.
export interface HabitUpdateRequest {
  title?: string | null;
  frequencyPerWeek?: number | null;
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

// GET /today/agenda 의 brief. 스펙 이름은 MorningBrief 다.
// 예전 수기 타입은 DailyBrief{date,greeting,bigRock} 이었는데 실제 스키마와 달랐고,
// 화면이 읽던 brief.greeting 은 백엔드가 보내지 않아 늘 fallback 이었다(죽은 배선).
export interface MorningBrief {
  headline: string;
  adjustmentHints: string[];
  // 오늘의 '큰 돌' 액션 id — 있으면 그 카드로 바로 보낼 수 있다.
  bigRockActionId?: string | null;
  // true 면 LLM 이 아니라 룰 기반으로 만든 브리프.
  fallbackUsed?: boolean | null;
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
  // 이 카드를 취소할 수 있는가(BE 파생 필드). 판정 규칙(실행 이력·source·status)은
  // BE 안에만 두고 FE 는 이 값만 본다 — 규칙을 복제하면 조용히 어긋난다.
  cancellable: boolean;
}

// /today/agenda 안의 고정 일정 행. 관리 화면의 FixedSchedule 과 다른 스키마다 —
// 여긴 이미 '오늘 요일에 걸린 것' 만 골라 오므로 daysOfWeek 가 없다.
// (FixedSchedule 로 선언돼 있던 것을 바로잡음 — daysOfWeek 를 읽으면 undefined 였다.)
export interface AgendaFixedSchedule {
  scheduleId: string;
  title: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
}

// /today/agenda 안의 습관 행. 주간 목록의 HabitInstance 와 다른 스키마다 —
// 여긴 title 을 함께 주고 weekStart 는 없다(이미 '오늘' 기준이므로).
// (HabitInstance[] 로 선언돼 있던 것을 바로잡음 — weekStart 는 undefined 였고,
//  정작 백엔드가 주는 title 은 타입에 없어서 쓸 수 없었다.)
export interface AgendaHabit {
  instanceId: string;
  habitId: string;
  title: string;
  targetCount: number;
  doneCount: number;
}

export interface TodayAgenda {
  date: string;
  brief: MorningBrief | null;
  cards: AgendaCard[];
  habits: AgendaHabit[];
  fixedSchedules: AgendaFixedSchedule[];
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

// GET /reflection/pending (#83) — 최근 3일 미체크(in_progress) 실행 row.
// 아직 결과 미정이라 completionStatus 는 null.
export interface ReflectionPendingItem {
  executionId: string;
  actionItemId: string;
  title: string;
  scheduledDate: string; // YYYY-MM-DD (date)
  scheduledTime: string | null;
  completionStatus: CompletionStatus | null;
}

// POST /reflection/batch 항목 — 미체크 실행 1건의 최종 결과 + 선택적 실패 사유.
// failureTags/memo 는 completionStatus 가 failed/partial_done 일 때만 유효(그 외면 422).
// memo 는 서버가 at-rest 암호화한다. failureTags 최대 2개, memo 최대 300자.
export interface ReflectionBatchItem {
  executionId: string;
  completionStatus: CompletionStatus;
  failureTags?: FailureTagCode[]; // 최대 2
  memo?: string | null; // 최대 300자, 서버 암호화
}

// POST /reflection/batch — [모두 완료] 일괄 처리. Idempotency-Key 필수. 상한 50건.
export interface ReflectionBatchRequest {
  items: ReflectionBatchItem[];
}

// POST /reflection/batch 응답 — 일괄 처리 결과 요약.
export interface ReflectionBatchResponse {
  processedCount: number;
  taggedCount: number;
  needsFailureTags: string[]; // 추가 실패태그 입력이 필요한 executionId 목록
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
// 계약 §12 의 3값만 허용된다. 'rejected' 는 요청 값이 아니라 수락되지 않은 형제 카드에
// 서버가 찍는 값이므로 보내면 안 된다. string 이던 시절 'accept'/'reject' 를 보내
// 전건 422 로 거절되던 버그(#164)가 있어 유니온으로 잠근다.
export type RecoveryDecision = 'accepted' | 'edited' | 'skipped';

export interface RecoveryDecisionRequest {
  executionId: string;
  decision: RecoveryDecision;
  acceptedAttemptId?: string | null;
  editedActionText?: string | null; // decision='edited' 일 때 1~300자
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

// POST /plans/replan — 주간 forward 재계획 미리보기(Draft, S16). 위 실행 단위
// replan(§S20, /replan/{executionId})과 별개 기능이라 이름 앞에 Weekly 를 붙인다
// (백엔드도 같은 이유로 응답 스키마명을 WeeklyReplanApproveResponse 로 분리했다).
export interface WeeklyReplanBlockPreview {
  actionId: string;
  title: string;
  category: string;
  start: string; // KST ISO
  end: string; // KST ISO
  replacesBlockId?: string | null;
}

export interface WeeklyReplanResponse {
  planId: string;
  windowStart: string;
  horizon: string | null;
  blocks: WeeklyReplanBlockPreview[];
  generatedAt: string; // KST ISO
  aiSource?: 'llm' | 'rule';
  isDraft?: boolean;
  warnings?: string[];
}

// POST /plans/replan/{planId}/approve
export interface WeeklyReplanApproveResponse {
  planId: string;
  cancelledBlocks: number;
  createdBlocks: number;
  skippedBlocks: number;
  activatedAt: string; // KST ISO
  isDraft?: boolean; // 항상 false
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

// #milestones Phase 2 — 사용자가 확인·편집하는 마일스톤 초안 한 개.
export interface MilestoneDraft {
  title: string;
  summary?: string;
}

// 계획 분량(밀도) 프리셋 — 재생성 시 사용자가 조절. light≈주3 / standard≈주5 / intense≈주8 세션.
// 값은 스펙의 density 유니온과 동일하다. 이름을 붙여 호출부가 읽기 쉽게 한다.
export type PlanDensity = 'light' | 'standard' | 'intense';

// POST /plans/generate 요청 본문 (모두 선택 — 서버가 인터뷰 결과로 보완).
export interface FirstPlanGenerateRequest {
  interviewSessionId?: string | null;
  targetDate?: string | null; // YYYY-MM-DD
  outcome?: Record<string, unknown> | null; // InterviewOutcome (보통 서버 파생)
  density?: PlanDensity; // 생략 시 서버 기본값 'standard'
  scope?: 'week' | 'horizon'; // 기본 horizon
  // 사용자가 확정한 마일스톤 (있으면 분해가 branch 로 고정, Stage B)
  milestones?: MilestoneDraft[] | null;
}

// POST /plans/milestones 응답 — First Plan 생성 전 마일스톤 확인 단계(Stage A).
export interface MilestoneListResponse {
  milestones: MilestoneDraft[];
  aiSource?: 'llm' | 'rule';
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
  // 연결된 목표(goal_<uuid> | null) — api-contract v1.17. 있으면 목표 카테고리 기준으로
  // 색/라벨을 매기고, null(inbox/habit/fixed 등)이면 category 로 fallback(#109).
  goalId?: string | null;
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
  category?: string | null; // 목표 카테고리(GOAL_CATEGORY_OPTIONS 값). 미지원값은 서버가 'other' 로 정규화.
  title?: string | null;
}
export interface BlockEditResponse {
  blockId: string;
  startAt: string;
  endAt: string | null;
  blockStatus?: string;
  category?: string | null;
  title?: string | null;
  goalId?: string | null;
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
// 페널티 근거 — 한 주의 달성/목표. 스펙에 weekStart 는 없다(주 식별은 배열 순서).
// 예전엔 weekStart: string 이 필수로 선언돼 있었다 — 읽었다면 undefined 였다.
export interface HabitWeekStat {
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

// ── 지속형 프로필 메모리 (GET/PATCH /settings/profile) — #A-1·A-2 ──
export type EnergyCycle = 'morning' | 'afternoon' | 'evening' | 'night' | 'varies';
export type RecoveryTone = 'gentle' | 'normal' | 'encouraging';
export type ReminderFrequency = 'minimal' | 'standard' | 'active';

// 스펙 파생 타입(ProfileResponse/ProfileUpdateRequest)이 정본이다.
// 아래 두 이름은 #A-2 계열 화면 코드가 쓰던 것 — 같은 개념이라 별칭으로 남긴다.
export type ProfileSettings = ProfileResponse;
export type ProfileUpdate = ProfileUpdateRequest;


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

// GET·PATCH /settings/profile — 지속형 프로필 메모리(behavioral/interaction/회복 선호).
// 인터뷰가 아직 채우지 않은 항목은 null.
export interface BehavioralProfileView {
  energyCycle: 'morning' | 'afternoon' | 'evening' | 'night' | 'varies';
  attentionSpan: number;
  timeChunkPreference: '10' | '20' | '30' | '60' | '90';
  preferredStartTime?: string | null;
  preferredEndTime?: string | null;
}

export interface InteractionStyleView {
  recoveryTone: 'gentle' | 'normal' | 'encouraging';
  suggestionStyle: 'soft' | 'neutral' | 'firm';
  explanationDepth: 'brief' | 'normal' | 'detailed';
  reminderFrequency: 'minimal' | 'standard' | 'active';
}

export interface ProfileResponse {
  activityStart?: string | null;
  activityEnd?: string | null;
  behavioral: BehavioralProfileView | null;
  interaction: InteractionStyleView | null;
  downscopeUnitMin?: number | null;
  restOk?: boolean | null;
}

// PATCH /settings/profile — 지정 필드만 부분 갱신(미지정은 유지).
export interface ProfileUpdateRequest {
  activityStart?: string | null;
  activityEnd?: string | null;
  energyCycle?: BehavioralProfileView['energyCycle'];
  attentionSpan?: number; // 5~240
  timeChunkPreference?: BehavioralProfileView['timeChunkPreference'];
  recoveryTone?: InteractionStyleView['recoveryTone'];
  suggestionStyle?: InteractionStyleView['suggestionStyle'];
  explanationDepth?: InteractionStyleView['explanationDepth'];
  reminderFrequency?: InteractionStyleView['reminderFrequency'];
  downscopeUnitMin?: number; // 1~120
  restOk?: boolean;
}

// GET /policy-snapshot/current (#83) — 없으면 404, FE 는 카운트-only 폴백 유지.
export interface PolicySnapshotResponse {
  version: number;
  source: string;
  behavioralProfile: Record<string, unknown>;
  executionConstraints: Record<string, unknown>;
  interactionStyle: Record<string, unknown>;
  recoveryPolicy: Record<string, unknown>;
  reasonForUpdate: string | null;
  validFrom: string; // date-time
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
