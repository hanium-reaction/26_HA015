// 백엔드(reaction-backend) 호출용 fetch 래퍼.
// 응답·에러·인증·Idempotency 규약은 docs/api-contract.md v0.7 의 §1 을 따른다.

import { Capacitor } from '@capacitor/core';
import type {
  ActionItem,
  AnonymizeRequest,
  ApiErrorPayload,
  ApiGoal,
  ApproveInsertResult,
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
  FixedScheduleUpdateRequest,
  TimePolicyCreateRequest,
  TimePolicyUpdateRequest,
  FreeBusy,
  GoalCreateRequest,
  GoalDecomposition,
  GoalsByTier,
  GoalUpdateRequest,
  Habit,
  HabitCreateRequest,
  HabitInstance,
  HabitUpdateRequest,
  InboxCreateRequest,
  InboxItem,
  InboxResource,
  InboxUpdateRequest,
  InterviewSession,
  MilestoneListResponse,
  NotificationSettings,
  NotificationSettingsUpdateRequest,
  OnboardingStatus,
  BlockEditRequest,
  BlockEditResponse,
  PolicySnapshotResponse,
  ProfileResponse,
  ProfileUpdateRequest,
  PushSubscribeRequest,
  RecoveryDecisionRequest,
  RecoveryDecisionResponse,
  RecoveryGenerateRequest,
  RecoveryProposalsResponse,
  ReflectionBatchRequest,
  ReflectionBatchResponse,
  ReflectionPendingItem,
  ReplanApproveResponse,
  ReplanDiff,
  SlotAnswerRequest,
  SlotCatalogEntry,
  SyncPreview,
  TimePolicy,
  TodayAgenda,
  ToneModeUpdateRequest,
  UserProfile,
  UserSettings,
  VapidPublicKeyResponse,
  HabitPenaltyAcceptResponse,
  HabitPenaltyListResponse,
  WeeklyGenerateRequest,
  WeeklyPlanResponse,
  WeeklyReplanApproveResponse,
  WeeklyReplanResponse,
  WeeklyReviewResponse,
} from '../types/api';

// 기본값 `/api` = same-origin 프록시 경로 (dev=vite proxy, prod=vercel.json rewrite → 백엔드).
// http 백엔드를 HTTPS 페이지에서 직접 부르면 Mixed Content 로 차단되므로 프록시를 기본으로 한다.
//
// 네이티브(Capacitor) 앱은 capacitor://localhost 로 로드돼 same-origin `/api` 프록시가 없다.
// 그래서 네이티브에선 절대 HTTPS 오리진(Vercel)으로 보내 rewrite(/api→http 백엔드)를 타게 한다.
// 이렇게 하면 앱이 http 백엔드를 직접 부르지 않아 iOS ATS 클리어텍스트 차단도 피한다.
const NATIVE_API_BASE = 'https://reaction-frontend.vercel.app/api';
const isNative =
  typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function'
    ? Capacitor.isNativePlatform()
    : false;
const BASE_URL = (
  isNative ? NATIVE_API_BASE : (import.meta.env.VITE_API_BASE_URL ?? '/api')
).replace(/\/$/, '');
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

// 사용자에게 보여줄 친화 문구 — 백엔드 에러코드를 한국어로 매핑한다. 원시 코드
// (AUTH_INVALID_TOKEN 등)는 개발자용이라 화면에 노출하지 않는다. 매핑에 없는 코드는
// 호출부가 준 상황별 폴백 문구로 보여주고, 원시 코드는 console 에만 남긴다.
const ERROR_MESSAGES: Record<string, string> = {
  // 인증
  AUTH_INVALID_ID_TOKEN: '로그인 정보가 올바르지 않아요. 다시 로그인해 주세요.',
  AUTH_INVALID_TOKEN: '로그인이 만료됐어요. 다시 시도해 주세요.',
  AUTH_TOKEN_EXPIRED: '로그인이 만료됐어요. 다시 로그인해 주세요.',
  // 동시성 / 멱등
  AGENT_CONCURRENT_ACCESS: '지금 처리 중이에요. 잠시 후 다시 시도해 주세요.',
  IDEMPOTENCY_KEY_MISMATCH: '요청이 중복 처리됐어요. 새로고침 후 다시 시도해 주세요.',
  // 목표
  GOAL_TIER_LIMIT_EXCEEDED: '집중은 3개, 유지는 5개까지만 담을 수 있어요.',
  GOAL_FOCUS_LIMIT: '집중 목표는 최대 3개까지예요.',
  GOAL_MAINTAIN_LIMIT: '유지 목표는 최대 5개까지예요.',
  GOAL_NOT_FOUND: '목표를 찾지 못했어요. 새로고침 후 다시 시도해 주세요.',
  // 계획 / 블록 / 정책
  PLAN_BLOCK_CONFLICT: '이 시간에 다른 일정과 겹쳐요.',
  PLAN_INVALID_TIME: '시간이 올바르지 않아요.',
  POLICY_VIOLATION: '설정한 보호 시간대와 겹쳐요.',
  PLAN_DRAFT_EXPIRED: '계획 초안이 만료됐어요. 다시 생성해 주세요.',
  FIXED_SCHEDULE_OVERLAP: '기존 고정 일정과 시간이 겹쳐요.',
  // 인터뷰
  INTERVIEW_SESSION_NOT_FOUND: '인터뷰 세션을 찾지 못했어요. 처음부터 다시 진행해 주세요.',
  // 오늘 / 실행 / 회복 / 회고
  TODAY_ALREADY_CHECKED_IN: '이미 기록된 실행이에요.',
  RECOVERY_ALREADY_DECIDED: '이미 처리된 회복이에요.',
  REFLECT_ALREADY_TAGGED: '이미 사유를 기록했어요.',
  // 인박스
  INBOX_ALREADY_PROMOTED: '이미 목표나 할 일로 옮긴 항목이에요.',
  // 공통
  COMMON_NOT_IMPLEMENTED: '아직 준비 중인 기능이에요.',
  COMMON_VALIDATION_ERROR: '입력값을 확인해 주세요.',
};

const DEFAULT_ERROR_MSG = '문제가 생겼어요. 잠시 후 다시 시도해 주세요.';

/**
 * ApiError(또는 임의 err)를 사용자 친화 문구로 변환한다. 매핑에 있으면 그 문구를,
 * 없으면 호출부의 상황별 `fallback`(예: '목표를 불러오지 못했어요')을 쓴다. 원시 코드는
 * 화면에 노출하지 않고 디버깅용으로 console 에만 남긴다.
 */
export function friendlyError(err: unknown, fallback: string = DEFAULT_ERROR_MSG): string {
  if (err instanceof ApiError) {
    if (typeof console !== 'undefined') console.warn(`[api] ${err.code}: ${err.message}`);
    return ERROR_MESSAGES[err.code] ?? fallback;
  }
  return fallback;
}

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

// 세션을 어떻게 얻었는지. 'real' = 실제 Google 로그인, 'stub' = 데모/개발용.
// 401 자가치유가 실제 사용자를 데모 계정으로 갈아타게 만들면 안 되므로 구분해 둔다.
const AUTH_KIND_KEY = 'reaction.authKind';
export type AuthKind = 'real' | 'stub';

export function setAccessToken(token: string | null, kind?: AuthKind): void {
  if (typeof window === 'undefined') return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
    if (kind) window.localStorage.setItem(AUTH_KIND_KEY, kind);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(AUTH_KIND_KEY);
  }
}

export function getAuthKind(): AuthKind | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(AUTH_KIND_KEY);
  return v === 'real' || v === 'stub' ? v : null;
}

// 세션이 끝났음(되살릴 수 없는 401)을 앱 껍데기에 알린다.
// 예전엔 401 이 각 화면의 개별 에러로만 끝나서, 세션이 만료되면 "데이터가 안 불러와지는"
// 화면만 남고 재로그인 유도가 없었다.
type AuthExpiredHandler = () => void;
let authExpiredHandler: AuthExpiredHandler | null = null;
export function onAuthExpired(handler: AuthExpiredHandler | null): void {
  authExpiredHandler = handler;
}

// stub 자동 로그인을 허용하는가 — AppShell 부트스트랩과 api 레이어 자가치유가
// 같은 판단을 써야 한다. 예전엔 api 레이어가 VITE_ALLOW_STUB_LOGIN 만 봐서,
// `?login=1` 로 로그인 화면을 강제해도 자가치유가 먼저 자동 로그인해 무력화됐다.
export function stubLoginAllowed(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_ALLOW_STUB_LOGIN === 'false') return false;
  return new URLSearchParams(window.location.search).get('login') !== '1';
}

// stub 로그인 idToken — 브라우저별 전용 계정(demo:<deviceId>), `?demo=stub` 이면 시드 계정.
// AppShell 부트스트랩과 동일 규칙. 401 자가치유 재로그인에서 사용.
function stubIdToken(): string {
  if (typeof window === 'undefined') return 'stub';
  let deviceId = window.localStorage.getItem('reaction.deviceId');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    window.localStorage.setItem('reaction.deviceId', deviceId);
  }
  const params = new URLSearchParams(window.location.search);
  if (params.get('demo') === 'stub') return 'stub';
  return `demo:${deviceId}`;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  idempotencyKey?: string;
  // 토큰이 없어도 호출. /auth/google 같은 인증 진입점.
  anonymous?: boolean;
  // 내부용 — 401 자가치유 재로그인 후 1회 재시도 여부(무한루프 방지).
  _retry?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, idempotencyKey, anonymous = false, _retry = false } = opts;
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  // 토큰을 실제로 실어보냈는지 — 아래 401 처리에서 "세션 만료" 와 "애초에 미로그인" 을
  // 구분하는 데 쓴다. 구분하지 않으면 첫 방문자에게도 "로그인이 만료됐어요" 가 뜬다.
  let sentToken = false;
  if (!anonymous) {
    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      sentToken = true;
    }
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
    // 401 자가치유: 인증 필요 호출인데 토큰이 없/만료면 stub 재로그인 후 1회 재시도.
    // (부트스트랩 타이밍/토큰 유실로 "인증 헤더 없음" 401 이 나던 문제 방지)
    // stub 자가치유는 데모/개발 세션에만 적용한다. 실제 Google 로그인 사용자에게
    // 적용하면 만료된 순간 조용히 '데모 계정' 으로 갈아타서, 로그인은 되어 있는데
    // 남의(또는 빈) 데이터가 보이는 상태가 된다.
    if (
      res.status === 401 &&
      !anonymous &&
      !_retry &&
      typeof window !== 'undefined' &&
      getAuthKind() !== 'real' &&
      stubLoginAllowed()
    ) {
      try {
        const session = await request<AuthSession>('/auth/google', {
          method: 'POST',
          body: { idToken: stubIdToken() },
          anonymous: true,
        });
        setAccessToken(session.accessToken, 'stub');
        return await request<T>(path, { ...opts, _retry: true });
      } catch {
        /* 재로그인 실패 — 아래에서 원래 401 을 그대로 던진다 */
      }
    }

    // 여기까지 온 401 은 되살릴 수 없다 — 토큰을 버리고 재로그인으로 보낸다.
    // 토큰을 보내지 않았던 요청(= 애초에 로그인 상태가 아님)은 만료가 아니므로 알리지 않는다.
    if (res.status === 401 && !anonymous && sentToken) {
      setAccessToken(null);
      authExpiredHandler?.();
    }

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

  create: (body: TimePolicyCreateRequest) =>
    request<TimePolicy>('/time-policies', { method: 'POST', body }),

  update: (policyId: string, body: TimePolicyUpdateRequest) =>
    request<TimePolicy>(`/time-policies/${policyId}`, { method: 'PATCH', body }),

  remove: (policyId: string) =>
    request<void>(`/time-policies/${policyId}`, { method: 'DELETE' }),
};

// ── Fixed Schedules (S05) ─────────────────────────────────────
export const fixedSchedulesApi = {
  list: () => request<FixedSchedule[]>('/fixed-schedules'),

  create: (body: FixedScheduleCreateRequest) =>
    request<FixedSchedule>('/fixed-schedules', { method: 'POST', body }),

  update: (scheduleId: string, body: FixedScheduleUpdateRequest) =>
    request<FixedSchedule>(`/fixed-schedules/${scheduleId}`, { method: 'PATCH', body }),

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

  // 백엔드 stub — 계획 → 캘린더 이벤트 미리보기/충돌 체크, 승인 삽입 (#25).
  syncPreview: () => request<SyncPreview>('/calendar/sync-preview', { method: 'POST', body: {} }),

  approveInsert: (idempotencyKey: string) =>
    request<ApproveInsertResult>('/calendar/events/approve-insert', {
      method: 'POST',
      body: {},
      idempotencyKey,
    }),
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

  // 보관 복원 → 활성(captured/classified) 로 되돌림 (#122, backend#125)
  restore: (inboxId: string) =>
    request<InboxItem>(`/inbox/${inboxId}/restore`, { method: 'POST', body: {} }),

  // 추천 자료 본문(마크다운) 조회 (#163, backend#171). 미존재 slug 는 404.
  resource: (slug: string) =>
    request<InboxResource>(`/inbox/resources/${encodeURIComponent(slug)}`),
};

// ── Habits (S27) ──────────────────────────────────────────────
export const habitsApi = {
  list: () => request<Habit[]>('/habits'),

  create: (body: HabitCreateRequest) =>
    request<Habit>('/habits', { method: 'POST', body }),

  update: (habitId: string, body: HabitUpdateRequest) =>
    request<Habit>(`/habits/${habitId}`, { method: 'PATCH', body }),

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
  // Idempotency-Key 동봉 시 같은 키 재요청은 동일 planId 를 돌려준다(재시도 안전, #6).
  generate: (body: FirstPlanGenerateRequest = {}, idempotencyKey?: string) =>
    request<FirstPlanResponse>('/plans/generate', { method: 'POST', body, idempotencyKey }),

  get: (planId: string) => request<FirstPlanResponse>(`/plans/${planId}`),

  approve: (planId: string, idempotencyKey?: string) =>
    request<FirstPlanApproveResponse>(`/plans/${planId}/approve`, { method: 'POST', body: {}, idempotencyKey }),

  // 주간 보기/블록 수정 — 백엔드 #21 구현됨.
  weekly: (weekStart: string) =>
    request<WeeklyPlanResponse>(`/plans/weekly?weekStart=${encodeURIComponent(weekStart)}`),

  updateBlock: (planId: string, blockId: string, body: BlockEditRequest) =>
    request<BlockEditResponse>(`/plans/${planId}/blocks/${blockId}`, {
      method: 'PATCH',
      body,
    }),

  // Stage A(#milestones) — First Plan 생성 전 중간 목표 3~5개 확인/편집.
  milestones: (body: FirstPlanGenerateRequest = {}) =>
    request<MilestoneListResponse>('/plans/milestones', { method: 'POST', body }),

  // 초안 폐기 — "이 계획 말고 다시 인터뷰할래" 경로. 멱등(이미 폐기/만료돼도 204).
  discard: (planId: string) =>
    request<void>(`/plans/${planId}/discard`, { method: 'POST', body: {} }),

  // 주간 forward 재계획(S16) — 다음 주부터 마감까지 미착수 블록을 다시 배치. 항상 Draft.
  generateReplan: () => request<WeeklyReplanResponse>('/plans/replan', { method: 'POST', body: {} }),

  approveReplan: (planId: string, idempotencyKey: string) =>
    request<WeeklyReplanApproveResponse>(`/plans/replan/${planId}/approve`, {
      method: 'POST',
      body: {},
      idempotencyKey,
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

// ── Reflection (S17·S18) — failure-tags(#17)·pending(#83)·batch 모두 백엔드 구현됨 ──
export const reflectionApi = {
  // 최근 3일 미체크(in_progress) 실행 목록 — 저녁 소급 회고 대상 (#83).
  pending: () => request<ReflectionPendingItem[]>('/reflection/pending'),

  // [모두 완료] 일괄 처리. 빈 items 는 no-op(200, processedCount=0), 상한 50건.
  batch: (body: ReflectionBatchRequest, idempotencyKey: string) =>
    request<ReflectionBatchResponse>('/reflection/batch', { method: 'POST', body, idempotencyKey }),

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

  // FE 가 pushManager.subscribe(applicationServerKey) 에 쓸 서버 발급 공개키.
  // publicKey=null 이면 서버 미설정 — 구독을 만들면 안 된다.
  vapidPublicKey: () => request<VapidPublicKeyResponse>('/notifications/vapid-public-key'),
};

// ── Policy Snapshot (#83) ─────────────────────────────────────
export const policySnapshotApi = {
  // 활성 스냅샷 없으면 404 — 호출부가 카운트-only 폴백을 유지한다.
  current: () => request<PolicySnapshotResponse>('/policy-snapshot/current'),
};

// ── Settings / Privacy (S23·S28) — 백엔드 501 ─────────────────
export const settingsApi = {
  get: () => request<UserSettings>('/settings'),

  updateToneMode: (body: ToneModeUpdateRequest) =>
    request<UserSettings>('/settings/tone-mode', { method: 'PATCH', body }),

  anonymize: (body: AnonymizeRequest) =>
    request<void>('/settings/anonymize', { method: 'POST', body }),

  // 지속형 프로필 메모리(에너지/시간·톤/빈도·회복 선호). 인터뷰 미완료 항목은 null.
  getProfile: () => request<ProfileResponse>('/settings/profile'),

  updateProfile: (body: ProfileUpdateRequest) =>
    request<ProfileResponse>('/settings/profile', { method: 'PATCH', body }),
};

export const privacyApi = {
  // 백엔드는 `{consents: [...]}` 로 감싸서 준다. 배열/객체 두 shape 모두 안전하게 언랩.
  // (배열로 기대하고 .find 하던 화면이 객체를 받아 크래시하던 문제 방지)
  consents: () =>
    request<{ consents: ConsentRecord[] } | ConsentRecord[]>('/privacy/consent').then((r) =>
      Array.isArray(r) ? r : r?.consents ?? [],
    ),

  updateConsent: (body: ConsentUpdateRequest) =>
    request<ConsentRecord>('/privacy/consent', { method: 'POST', body }),
};
