// 백엔드(reaction-backend) 호출용 fetch 래퍼.
// 응답·에러·인증·Idempotency 규약은 docs/api-contract.md v0.7 의 §1 을 따른다.

import type {
  ActionItem,
  AnonymizeRequest,
  ApiErrorPayload,
  ApiGoal,
  AuthSession,
  CalendarConnection,
  CheckInRequest,
  CheckInResponse,
  ConsentRecord,
  ConsentUpdateRequest,
  ExecutionEvent,
  ExecutionStartResponse,
  FailureTagMaster,
  FailureTagRequest,
  FailureTagResponse,
  FirstPlanApproveResponse,
  FirstPlanGenerateRequest,
  FirstPlanResponse,
  FixedSchedule,
  FixedScheduleCreateRequest,
  FreeBusy,
  GoalCreateRequest,
  GoalDecomposition,
  GoalsByTier,
  GoalUpdateRequest,
  Habit,
  HabitCreateRequest,
  HabitInstance,
  InboxCreateRequest,
  InboxItem,
  InboxUpdateRequest,
  InterviewSession,
  NotificationSettings,
  NotificationSettingsUpdateRequest,
  OnboardingStatus,
  BlockEditRequest,
  BlockEditResponse,
  PushSubscribeRequest,
  RecoveryDecisionRequest,
  RecoveryDecisionResponse,
  RecoveryGenerateRequest,
  RecoveryProposalsResponse,
  ReflectionBatchRequest,
  ReflectionPendingItem,
  ReplanApproveResponse,
  ReplanDiff,
  SlotAnswerRequest,
  SlotCatalogEntry,
  TimePolicy,
  TodayAgenda,
  ToneModeUpdateRequest,
  UserProfile,
  UserSettings,
  HabitPenaltyAcceptResponse,
  HabitPenaltyListResponse,
  WeeklyGenerateRequest,
  WeeklyPlanResponse,
  WeeklyReviewResponse,
} from '../types/api';

// 기본값 `/api` = same-origin 프록시 경로 (dev=vite proxy, prod=vercel.json rewrite → 백엔드).
// http 백엔드를 HTTPS 페이지에서 직접 부르면 Mixed Content 로 차단되므로 프록시를 기본으로 한다.
const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
const TOKEN_KEY = 'reaction.accessToken';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  idempotencyKey?: string;
  // 토큰이 없어도 호출. /auth/google 같은 인증 진입점.
  anonymous?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, anonymous = false } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!anonymous) {
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  // 204 No Content
  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let payload: ApiErrorPayload | null = null;
    try {
      payload = (await res.json()) as ApiErrorPayload;
    } catch {
      /* 응답이 JSON이 아닌 경우 fallthrough */
    }
    throw new ApiError(
      payload?.code ?? 'COMMON_HTTP_ERROR',
      payload?.message ?? `HTTP ${res.status}`,
      res.status,
      payload?.field,
    );
  }

  return (await res.json()) as T;
}

// ── Auth ──────────────────────────────────────────────────────
export const authApi = {
  loginWithGoogle: (idToken: string) =>
    request<AuthSession>('/auth/google', {
      method: 'POST',
      body: { idToken },
      anonymous: true,
    }),

  me: () => request<UserProfile>('/auth/me'),

  refresh: (refreshToken: string) =>
    request<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      anonymous: true,
    }),

  logout: (refreshToken: string) =>
    request<void>('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
    }),
};

// ── Onboarding ────────────────────────────────────────────────
export const onboardingApi = {
  status: () => request<OnboardingStatus>('/onboarding/status'),
};

// ── Interview (S02) ───────────────────────────────────────────
export const interviewApi = {
  start: () =>
    request<InterviewSession>('/interview/sessions', {
      method: 'POST',
      body: {},
    }),

  get: (sessionId: string) =>
    request<InterviewSession>(`/interview/sessions/${sessionId}`),

  submitAnswer: (sessionId: string, payload: SlotAnswerRequest) =>
    request<InterviewSession>(`/interview/sessions/${sessionId}/answers`, {
      method: 'POST',
      body: payload,
    }),

  nextQuestion: (sessionId: string) =>
    request<InterviewSession>(`/interview/sessions/${sessionId}/next-question`, {
      method: 'POST',
      body: {},
    }),

  finish: (sessionId: string) =>
    request<InterviewSession>(`/interview/sessions/${sessionId}/finish`, {
      method: 'POST',
      body: {},
    }),

  slotCatalog: () => request<SlotCatalogEntry[]>('/interview/slot-catalog'),
};

// ── Goals (S03·S26) ───────────────────────────────────────────
export const goalsApi = {
  list: () => request<GoalsByTier>('/goals'),

  create: (body: GoalCreateRequest) =>
    request<ApiGoal>('/goals', { method: 'POST', body }),

  update: (goalId: string, body: GoalUpdateRequest) =>
    request<ApiGoal>(`/goals/${goalId}`, { method: 'PATCH', body }),

  // Focus/Maintain → Parked 전환. Parked 는 tier 한도가 없어 전용 엔드포인트 사용.
  park: (goalId: string) =>
    request<ApiGoal>(`/goals/${goalId}/park`, { method: 'POST', body: {} }),

  remove: (goalId: string) =>
    request<void>(`/goals/${goalId}`, { method: 'DELETE' }),

  decompose: (goalId: string) =>
    request<GoalDecomposition>(`/goals/${goalId}/decompose`, { method: 'POST', body: {} }),
};

// ── Time Policies (S07) ───────────────────────────────────────
export const timePoliciesApi = {
  list: () => request<TimePolicy[]>('/time-policies'),

  prefillFromInterview: () =>
    request<TimePolicy[]>('/time-policies/prefill-from-interview', {
      method: 'POST',
      body: {},
    }),
};

// ── Fixed Schedules (S05) ─────────────────────────────────────
export const fixedSchedulesApi = {
  list: () => request<FixedSchedule[]>('/fixed-schedules'),

  create: (body: FixedScheduleCreateRequest) =>
    request<FixedSchedule>('/fixed-schedules', { method: 'POST', body }),

  remove: (scheduleId: string) =>
    request<void>(`/fixed-schedules/${scheduleId}`, { method: 'DELETE' }),
};

// ── Calendar (S04) ────────────────────────────────────────────
export const calendarApi = {
  connect: (code: string) =>
    request<CalendarConnection>('/calendar/connect', {
      method: 'POST',
      body: { code },
    }),

  disconnect: () =>
    request<void>('/calendar/connect', { method: 'DELETE' }),

  freebusy: (from: string, to: string) =>
    request<FreeBusy>(`/calendar/freebusy?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
};

// ── Inbox (S24·S25) ───────────────────────────────────────────
export const inboxApi = {
  list: (status?: string) =>
    request<InboxItem[]>(status ? `/inbox?status=${encodeURIComponent(status)}` : '/inbox'),

  create: (body: InboxCreateRequest) =>
    request<InboxItem>('/inbox', { method: 'POST', body }),

  update: (inboxId: string, body: InboxUpdateRequest) =>
    request<InboxItem>(`/inbox/${inboxId}`, { method: 'PATCH', body }),

  // Inbox → Goal (tier=maintain, 한도 초과 시 422 GOAL_TIER_LIMIT_EXCEEDED)
  convertToGoal: (inboxId: string) =>
    request<InboxItem>(`/inbox/${inboxId}/convert-to-goal`, { method: 'POST', body: {} }),

  // Inbox → ActionItem(source=inbox)
  convertToAction: (inboxId: string) =>
    request<InboxItem>(`/inbox/${inboxId}/convert-to-action`, { method: 'POST', body: {} }),

  // soft delete (status=archived, 204 No Content)
  archive: (inboxId: string) =>
    request<void>(`/inbox/${inboxId}/archive`, { method: 'POST', body: {} }),
};

// ── Habits (S27) ──────────────────────────────────────────────
export const habitsApi = {
  list: () => request<Habit[]>('/habits'),

  create: (body: HabitCreateRequest) =>
    request<Habit>('/habits', { method: 'POST', body }),

  remove: (habitId: string) =>
    request<void>(`/habits/${habitId}`, { method: 'DELETE' }),

  instancesForWeek: (weekStart: string) =>
    request<HabitInstance[]>(`/habit-instances?weekStart=${encodeURIComponent(weekStart)}`),

  check: (instanceId: string) =>
    request<HabitInstance>(`/habit-instances/${instanceId}/check`, {
      method: 'POST',
      body: {},
    }),
};

// ── Today / Execution (S10-S13) ───────────────────────────────
// start·check-ins 는 백엔드 #13 구현됨. agenda/action 상세·pause/resume 은 미구현.
export const todayApi = {
  agenda: () => request<TodayAgenda>('/today/agenda'),

  getAction: (actionItemId: string) =>
    request<ActionItem>(`/today/actions/${actionItemId}`),

  start: (actionItemId: string) =>
    request<ExecutionStartResponse>(`/today/actions/${actionItemId}/start`, {
      method: 'POST',
      body: {},
    }),

  pause: (executionId: string) =>
    request<ExecutionEvent>(`/today/focus/${executionId}/pause`, {
      method: 'POST',
      body: {},
    }),

  resume: (executionId: string) =>
    request<ExecutionEvent>(`/today/focus/${executionId}/resume`, {
      method: 'POST',
      body: {},
    }),

  checkIn: (body: CheckInRequest, idempotencyKey?: string) =>
    request<CheckInResponse>('/today/check-ins', {
      method: 'POST',
      body,
      idempotencyKey,
    }),
};

// ── Plans (S06·S14·S15·S16) — generate/get/approve 는 백엔드 #18 구현됨 ──
export const plansApi = {
  generate: (body: FirstPlanGenerateRequest = {}) =>
    request<FirstPlanResponse>('/plans/generate', { method: 'POST', body }),

  get: (planId: string) => request<FirstPlanResponse>(`/plans/${planId}`),

  approve: (planId: string) =>
    request<FirstPlanApproveResponse>(`/plans/${planId}/approve`, { method: 'POST', body: {} }),

  // 주간 보기/블록 수정 — 백엔드 #21 구현됨.
  weekly: (weekStart: string) =>
    request<WeeklyPlanResponse>(`/plans/weekly?weekStart=${encodeURIComponent(weekStart)}`),

  updateBlock: (planId: string, blockId: string, body: BlockEditRequest) =>
    request<BlockEditResponse>(`/plans/${planId}/blocks/${blockId}`, {
      method: 'PATCH',
      body,
    }),
};

// ── Reviews (S21·S22) — 백엔드 #21 구현됨 ─────────────────────
export const reviewsApi = {
  weekly: (weekStart: string) =>
    request<WeeklyReviewResponse>(`/reviews/weekly?weekStart=${encodeURIComponent(weekStart)}`),

  regenerate: (weekStart: string) =>
    request<WeeklyReviewResponse>('/reviews/weekly/generate', {
      method: 'POST',
      body: { weekStart } satisfies WeeklyGenerateRequest,
    }),

  // 습관 패널티 후보 목록 (#21)
  habitPenalty: () => request<HabitPenaltyListResponse>('/reviews/habit-penalty'),

  acceptHabitPenalty: (habitId: string, idempotencyKey: string) =>
    request<HabitPenaltyAcceptResponse>(`/reviews/habit-penalty/${habitId}/accept`, {
      method: 'POST',
      body: {},
      idempotencyKey,
    }),
};

// ── Reflection (S17·S18) — failure-tags 는 백엔드 #17 구현됨 ────
export const reflectionApi = {
  // /reflection/pending·batch 는 아직 백엔드 미구현(추정 contract).
  pending: () => request<ReflectionPendingItem[]>('/reflection/pending'),

  batch: (body: ReflectionBatchRequest, idempotencyKey: string) =>
    request<void>('/reflection/batch', { method: 'POST', body, idempotencyKey }),

  // 실패 태그 마스터 카탈로그 (#17)
  failureTags: () => request<FailureTagMaster[]>('/reflection/failure-tags'),

  tagExecution: (executionId: string, body: FailureTagRequest) =>
    request<FailureTagResponse>(`/reflection/failure-tags/${executionId}`, {
      method: 'POST',
      body,
    }),
};

// ── Recovery / Replan (S19·S20) — recovery 는 백엔드 #20 구현됨 ──
export const recoveryApi = {
  generateProposals: (executionId: string) =>
    request<RecoveryProposalsResponse>('/recovery/proposals/generate', {
      method: 'POST',
      body: { executionId } satisfies RecoveryGenerateRequest,
    }),

  decide: (body: RecoveryDecisionRequest, idempotencyKey: string) =>
    request<RecoveryDecisionResponse>('/recovery/decisions', {
      method: 'POST',
      body,
      idempotencyKey,
    }),
};

export const replanApi = {
  // GET /replan/{executionId} — before/after diff 프리뷰 (백엔드 #20-B 구현됨).
  diff: (executionId: string) => request<ReplanDiff>(`/replan/${executionId}`),

  approve: (executionId: string, idempotencyKey: string) =>
    request<ReplanApproveResponse>(`/replan/${executionId}/approve`, {
      method: 'POST',
      body: {},
      idempotencyKey,
    }),
};

// ── Notifications (S08·S25) ───────────────────────────────────
export const notificationsApi = {
  getSettings: () => request<NotificationSettings>('/notifications/settings'),

  updateSettings: (body: NotificationSettingsUpdateRequest) =>
    request<NotificationSettings>('/notifications/settings', { method: 'PATCH', body }),

  subscribe: (body: PushSubscribeRequest) =>
    request<void>('/notifications/subscribe', { method: 'POST', body }),

  unsubscribe: () =>
    request<void>('/notifications/subscribe', { method: 'DELETE' }),
};

// ── Settings / Privacy (S23·S28) — 백엔드 501 ─────────────────
export const settingsApi = {
  get: () => request<UserSettings>('/settings'),

  updateToneMode: (body: ToneModeUpdateRequest) =>
    request<UserSettings>('/settings/tone-mode', { method: 'PATCH', body }),

  anonymize: (body: AnonymizeRequest) =>
    request<void>('/settings/anonymize', { method: 'POST', body }),
};

export const privacyApi = {
  consents: () => request<ConsentRecord[]>('/privacy/consent'),

  updateConsent: (body: ConsentUpdateRequest) =>
    request<ConsentRecord>('/privacy/consent', { method: 'POST', body }),
};
