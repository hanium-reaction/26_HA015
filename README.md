# Re:Action — 계획 실행 복구 코치 (Frontend)

> 청년 대학생을 위한 AI 실행 회복 코치. 계획이 무너진 다음이 진짜 시작이라는 전제에서 출발한, React + TypeScript PWA 프론트엔드.

한이음 프로젝트 **re:action** 의 웹 클라이언트입니다.
목표를 세우는 것보다 **무너진 계획을 다시 세우는 것**이 어렵다는 문제의식에서, 실패를 기록하고
그 자리에서 회복안을 제안받아 다시 실행으로 돌아오는 흐름을 하나의 앱으로 구현했습니다.

백엔드(`hanium-reaction/reaction-backend`)의 OpenAPI 스키마를 **정본으로 삼아 타입을 자동 생성**하고,
CI에서 프론트 API 호출과 스펙의 어긋남을 서버 없이 검증하는 계약 기반 개발 방식을 적용했습니다.

---

## ✨ 주요 기능

### 온보딩 — 대화로 목표를 꺼내고, 첫 주 계획까지
- **AI 인터뷰**(`/interview/sessions`) — slot catalog 기반 질문을 이어가며 목표·가용시간·회복 성향을 수집합니다.
- **목표 분류** — 수집된 목표를 `집중`(최대 3개) / `유지`(최대 5개) / `보류` 티어로 정리합니다.
- **마무리 확인** — 캘린더 연동·고정 일정·보호 시간대(time policy)·알림 설정을 "AI가 추론한 값을 사용자가 확인"하는 한 화면으로 통합했습니다.
- **첫 주간 계획 생성**(`/plans/generate` → `/plans/{id}/approve`) — 인터뷰 세션을 근거로 초안을 만들고 승인 후 확정합니다.

> 백엔드는 온보딩을 8개 state로 관리하지만, 클라이언트는 의미상 인접한 단계를 묶어 **5단계로 축소**했습니다
> (`CALENDAR`＋`MANUAL_SCHEDULE`＋`POLICIES`＋`NOTIFICATIONS` → `setup` 한 화면).

### 매일 — 오늘의 실행
- **모닝 브리프 / 오늘의 실행**(`/today/agenda`) — 오늘 해야 할 액션을 카드로 제시하고, 카드마다 `왜 지금인지`·`첫 단계`를 함께 보여줍니다.
- **집중 모드**(`/today/actions/{id}/start`, `focus/{id}/pause|resume`) — 실행 시작·일시정지·재개를 서버 이벤트로 기록합니다.
- **저녁 체크인**(`/today/check-ins`) — 완료/부분완료/실패를 기록합니다.

### 회복 — 이 프로젝트의 핵심
- **실패 사유 태깅**(`/reflection/failure-tags`) — 실패를 서버 카탈로그 기반 태그로 남깁니다.
- **회복안 제안**(`/recovery/proposals/generate` → `/recovery/decisions`) — 더 작게 / 쉬기 / 다시 시도 / 건너뛰기 중 선택합니다.
- **리플랜**(`/replan/{executionId}` → `/approve`) — 밀린 실행을 반영해 남은 계획을 다시 짭니다.

### 주간
- **주간 캘린더**(`/plans/weekly`) — 블록 단위 편집(`/plans/{planId}/blocks/{blockId}`)을 지원합니다.
- **주간 리뷰**(`/reviews/weekly`) — 한 주를 회고하고 다음 주 계획으로 이어집니다. 습관 미이행 페널티(`/reviews/habit-penalty`)도 함께 처리합니다.
- **일괄 회고**(`/reflection/batch`, `/reflection/pending`) — 밀린 회고를 한 번에 저장합니다.

### 그 외
- **Life Inbox**(`/inbox`) — 떠오른 생각을 적어두고 나중에 목표 또는 액션으로 승격(`convert-to-goal` / `convert-to-action`)합니다.
- **습관 관리**(`/habits`, `/habit-instances`) — 주 단위 습관 체크.
- **PWA + Web Push** — 홈 화면 설치(iOS 설치 안내 카드 포함), service worker 기반 푸시 알림 수신.
- **프라이버시**(`/privacy/consent`, `/settings/anonymize`) — 동의 관리 및 익명화 요청.

---

## 🛠 기술 스택

| 구분 | 사용 기술 |
|---|---|
| **Core** | React 18.3, TypeScript 5.5 |
| **Build** | Vite 5.3 (`@vitejs/plugin-react`) |
| **Routing** | React Router 7.15 |
| **Styling** | Tailwind CSS 3.4, PostCSS, autoprefixer, CSS Custom Properties 디자인 토큰 |
| **Icons / Font** | `@phosphor-icons/react`, Pretendard, Newsreader |
| **PWA** | Web App Manifest, Service Worker, Web Push (VAPID) |
| **API 계약** | `openapi-typescript` v7 자동 타입 생성 + 자체 계약 체커 |
| **CI/CD** | GitHub Actions (Node 22), Vercel |

---

## 🏗 아키텍처

### 화면 전환 — URL 라우팅이 아닌 상태 머신

React Router는 `/` 단일 라우트만 두고, 실제 화면 전환은 `AppShell` 이 관리하는
`ScreenId` 상태로 처리합니다. 진입 화면은 **백엔드가 준 `onboardingState` 가 결정**합니다
(`NavigationContext.STATE_TO_SCREEN`) — 디바이스 로컬 플래그가 아니라 계정 상태가 진실 소스라
어느 기기에서 로그인해도 진행 단계가 이어집니다.

```
src/App.tsx  ──  "/"  ──▶  AppShell
                              │  matchMedia('(min-width: 1024px)')
                              ├─▶ DesktopSidebar   (데스크탑 트리)
                              └─▶ ReActionMerged   (모바일 트리)
```

> 두 레이아웃을 동시에 마운트하고 `display:none` 으로 가리면 안 보이는 트리의 `useEffect` 까지
> 실행되어 모든 GET이 2배로 나가는 문제가 있었습니다. `matchMedia` 로 **실제 뷰포트에 맞는 트리 하나만** 마운트합니다.

`ScreenId` 는 16개(`intro`, `goal-intake`, `goal-classify`, `setup`, `weekly-plan`, `morning-brief`,
`today`, `focus`, `recovery`, `recovered`, `evening`, `weekly`, `inbox`, `review`, `goals`, `settings`),
하단 탭(`TabId`)은 `today` / `weekly` / `inbox` / `review` 4개입니다.

### API 호출 — same-origin 프록시 고정

브라우저가 HTTPS 페이지에서 http 백엔드를 직접 부르면 **Mixed Content로 차단**됩니다.
그래서 프론트는 항상 same-origin `/api/*` 를 호출하고, 중계는 환경이 담당합니다.

```
브라우저 ──▶ /api/*  ──┬── (dev)  vite.config.ts server.proxy
                       └── (prod) vercel.json rewrites
                                        │
                                        ▼
                            reaction-backend (staging)
```

`src/lib/api.ts` 의 `request()` 래퍼가 공통 규약을 담당합니다.

- **인증** — `localStorage['reaction.accessToken']` 을 `Authorization: Bearer` 로 첨부
- **멱등성** — 필요 호출에 `Idempotency-Key` 헤더 부착
- **401 자가치유** — 인증 호출이 401이면 stub 재로그인 후 **1회만** 재시도(무한 루프 방지). `VITE_ALLOW_STUB_LOGIN=false` 면 비활성
- **에러 한국어 매핑** — `AUTH_TOKEN_EXPIRED` 같은 원시 코드는 콘솔에만 남기고, 화면에는 상황별 한국어 문구를 보여줍니다

API 래퍼는 도메인별 18개 네임스페이스(`authApi`, `interviewApi`, `goalsApi`, `todayApi`,
`plansApi`, `recoveryApi`, `replanApi`, `reviewsApi`, `reflectionApi`, `inboxApi`, `habitsApi`,
`calendarApi`, `timePoliciesApi`, `fixedSchedulesApi`, `notificationsApi`, `settingsApi`,
`onboardingApi`, `privacyApi`)로 나뉩니다.

### 백엔드 계약 동기화

```
reaction-backend (OpenAPI)
        │  .github/workflows/sync-api.yml  (매일 03:00 KST · 수동 · backend push 알림)
        ▼
   openapi.json  ──▶  npm run gen:api  ──▶  src/types/openapi.d.ts  (자동 생성, 직접 수정 금지)
        │
        └─────────▶  npm run check:api  ──▶  api.ts 호출 vs 스펙 대조
```

`scripts/check-api-contract.mjs` 는 서버 없이 `src/lib/api.ts` 의 호출(메서드+경로)을 `openapi.json` 과 대조해
`OK` / `WARN`(스펙에 없음) / `GONE`(경로는 있는데 메서드 불일치) / `NEW`(래퍼 미구현)로 분류하고,
`GONE` 이 하나라도 있으면 **exit 1** 로 실패합니다.

---

## 🚀 시작하기

### 요구 사항
Node.js 22 (CI 기준)

### 설치

```bash
npm ci
```

### 환경 변수

`.env.example` 을 복사해 `.env` 를 만듭니다. **모두 선택 항목**이며, 미설정 시 아래 기본값으로 동작합니다.

```bash
cp .env.example .env
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | 백엔드 base URL. 기본값은 same-origin 프록시 경로입니다. 로컬 백엔드를 직접 붙이려면 `http://localhost:8000`. |
| `VITE_VAPID_PUBLIC_KEY` | 시연용 더미 키 | Web Push VAPID 공개키. 실제 발송하려면 백엔드와 **동일한 키쌍**의 공개키가 필요합니다. |
| `VITE_ALLOW_STUB_LOGIN` | `true`(미설정 시 허용) | dev/demo 전용 stub 로그인 허용 여부. **prod 배포에서는 `false`** 로 두어 가짜 id token 자동 발급을 막습니다. |

### 실행

```bash
npm run dev        # 개발 서버 (vite, /api → 백엔드 프록시)
npm run build      # tsc 타입체크 + 프로덕션 빌드
npm run preview    # 빌드 결과 미리보기
npm run gen:api    # openapi.json → src/types/openapi.d.ts 재생성
npm run check:api  # API 계약 검증 (--strict 시 WARN도 실패 처리)
```

### 개발용 쿼리 파라미터

| 파라미터 | 동작 |
|---|---|
| `?force=<screenId>` | 온보딩 상태와 무관하게 특정 화면으로 진입 (예: `?force=goal-intake`) |
| `?demo=stub` | 발표용 시드 데모 계정으로 로그인 |
| `?login=1` | 자동 stub 로그인을 건너뛰고 로그인 화면 표시 |

> 기본 stub 로그인은 브라우저마다 `demo:<deviceId>` 전용 계정을 씁니다.
> 여러 테스터가 같은 데모 계정을 공유해 인터뷰 세션과 advisory lock이 충돌하던 문제를 막기 위한 설계입니다.

---

## 📁 구조

```
├── .github/workflows/
│   ├── ci.yml                  # PR·main push 시 npm ci && npm run build
│   └── sync-api.yml            # 백엔드 OpenAPI → 프론트 타입 자동 동기화 PR
├── public/
│   ├── manifest.webmanifest    # PWA 매니페스트
│   ├── sw.js                   # service worker (push / notificationclick)
│   └── icon*.png, icon.svg     # 앱 아이콘 (maskable 포함)
├── scripts/
│   └── check-api-contract.mjs  # 서버 없이 API 계약 검증
├── src/
│   ├── app/
│   │   ├── AppShell.tsx        # 부팅·인증·화면 상태 머신·데스크탑/모바일 분기
│   │   ├── ReActionMerged.tsx  # 모바일 트리 (화면 라우팅 + 상단 네비)
│   │   └── DesktopSidebar.tsx  # 데스크탑 트리
│   ├── screens/                # 화면 컴포넌트 17개 (온보딩·오늘·집중·회복·주간·설정·로그인 등)
│   ├── components/             # 공용 UI 14개 — ReButton, Card, Chip, TabBar, TimeDial, BlockEditSheet 등
│   ├── contexts/
│   │   ├── NavigationContext.tsx  # 화면/탭 상태 + STATE_TO_SCREEN 매핑
│   │   └── ToastContext.tsx
│   ├── lib/
│   │   ├── api.ts              # fetch 래퍼 + 도메인별 API 네임스페이스
│   │   ├── push.ts             # Web Push 구독/해제
│   │   └── dates.ts
│   ├── types/
│   │   ├── openapi.d.ts        # 백엔드 OpenAPI 자동 생성 (직접 수정 금지)
│   │   ├── api.ts              # 수기 API 타입
│   │   └── index.ts            # ScreenId / TabId 등 공용 타입
│   └── index.css               # 디자인 토큰(sand·coral 팔레트) + Tailwind
├── openapi.json                # 백엔드 스키마 스냅샷 (계약 검증 기준)
├── vite.config.ts              # dev 프록시 (/api → 백엔드)
└── vercel.json                 # prod rewrite (/api/:path* → 백엔드)
```

---

## 👤 기여도 & 개발 환경

| 항목 | 내용 |
|---|---|
| **기여 비율** | **90.9%** (주 개발자) |
| **커밋** | 130 / 143 (본인 / 전체 사람 커밋) |
| **참여 인원** | 3명 |
| **AI 코딩 도구** | Claude Code |

<sub>기여 비율은 커밋 author 이메일 기준 집계이며 봇·자동화 커밋은 제외했습니다.</sub>
