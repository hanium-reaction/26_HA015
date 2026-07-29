# Re:Action 디자인 시스템 — 사용 규약

한국어 모바일 앱(계획 실행·회복 코치)의 컴포넌트 라이브러리입니다. 화면 문구는 한국어가 기본입니다.

## 스타일 방식 — 클래스가 아니라 CSS 변수 + 인라인 스타일

**유틸리티 클래스 체계가 없습니다.** Tailwind도, CSS Modules도, BEM도 쓰지 않습니다.
컴포넌트는 자기 스타일을 인라인으로 들고 있고, 색·간격·타이포는 전부 `styles.css`가 정의한
CSS 커스텀 프로퍼티를 참조합니다. **직접 레이아웃을 짤 때도 같은 방식을 쓰세요** — 클래스 이름을
지어내면 아무 스타일도 안 붙습니다.

```jsx
// ✅ 이 시스템의 방식
<div style={{ background: 'var(--surface-raised)', border: '1px solid var(--sand-200)',
              borderRadius: 14, padding: 12, color: 'var(--text-1)' }}>

// ❌ 클래스는 정의된 게 없다
<div className="card p-3 bg-surface">
```

## 토큰 (전부 `styles.css`에 정의됨 — 아래는 실재 확인된 이름)

| 용도 | 토큰 |
|---|---|
| 배경 | `--surface-ground` (크림 바탕), `--surface-raised` (카드) |
| 텍스트 | `--text-1` (본문 강), `--text-2` (본문 중), `--text-3` (보조) |
| 브랜드 | `--brand` (면·아이콘 전용), `--brand-ink` (코랄 **글씨**), `--brand-surface` (흰 글씨를 얹는 **버튼 면**), `--brand-soft` (연한 배경) |
| 경계·면 | `--sand-100`, `--sand-200` (기본 보더), `--sand-300` |
| 의미색 | 면 `--success`/`--warning`/`--danger`, 글씨 `--success-ink`/`--warning-ink`/`--danger-ink`, 옅은 배경 `-soft` |
| 타이포 | `--font-display` (제목), `--font-mono` (숫자·라벨) |
| 기타 | `--shadow-lg`, `--ctrl-lg` (기본 컨트롤 높이) |

**대비 — 면과 글씨를 같은 토큰으로 쓰지 마세요.**

토큰 이름이 규칙입니다. `-ink` 는 글씨, 기본값은 면, `-soft` 는 옅은 배경.

| 쓰는 자리 | 토큰 | 대비(크림 배경) |
|---|---|---|
| 코랄 글씨 | `--brand-ink` | 5.74:1 |
| 흰 글씨를 얹는 버튼 면 | `--brand-surface` | 흰 글씨 6.04:1 |
| 아이콘·진행 바·현재 표시 | `--brand` | 2.98:1 (비텍스트) |
| 상태 글씨 | `--success-ink` 4.95 / `--warning-ink` 4.82 / `--danger-ink` 5.22 | |

`--brand`(코랄-500)에 **글씨를 얹지 마세요** — 크림 위 텍스트로 2.98:1, 흰 글씨를
얹으면 3.14:1 로 둘 다 WCAG 미달입니다. 이건 팔레트 문제가 아니라 **명도 단계 선택**
문제라, 코랄은 그대로 두고 진한 단계(coral-700)를 쓰면 해결됩니다.

본문 텍스트 사다리는 전부 4.5:1 이상입니다 — `--text-1` 16.56 / `--text-2` 7.12 /
`--text-3` 5.44 / `--text-4` 4.52.

## 색 사용 원칙

강조색은 **화면당 1~2곳**(주 CTA + 추천/현재 표시)에만 씁니다. 배지·보더·라벨에 코랄을
흩뿌리면 위계가 무너집니다. 나머지 위계는 **굵기·크기·여백**으로 만듭니다.

## 설정 — 별도 Provider가 필요 없습니다

루트 래퍼나 ThemeProvider가 없습니다. `styles.css`만 로드되면 모든 컴포넌트가 제대로 렌더됩니다.
`WeeklySwitch`만 내부적으로 앱 네비게이션 컨텍스트를 읽지만, 기본값이 있어 단독으로도 동작합니다
(실제 화면 전환은 앱 안에서만 일어납니다).

## AI 초안 규약 (이 제품의 핵심)

AI가 만든 것은 **항상 초안으로 표시**하고 사용자가 승인해야 확정됩니다. `AiDraftCard`가 그 규약을
시각화합니다 — **점선 테두리 = 초안**, 실선 = 확정. AI 출력을 카드에 담을 땐 이 컴포넌트를 쓰세요.

```jsx
<AiDraftCard isDraft aiSource="llm" acceptLabel="이대로 시작"
             onAccept={...} onEdit={...} onReject={...}>
  <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text-1)' }}>
    <b>이번 주 계획이 준비됐어요</b>
    <div style={{ marginTop: 6, color: 'var(--text-2)' }}>토익 900점 · 주 3회 · 회당 60분</div>
  </div>
</AiDraftCard>
```

`aiSource="rule"`로 주면 LLM 실패 시의 룰 기반 폴백 시각으로 바뀝니다.

## 문구 톤 — "Be on your side, not on your case"

실패를 비난하지 않습니다. **'실패'·'못했'·'왜 안' 같은 심판 어휘를 쓰지 마세요** —
`AiDraftCard`는 금지어를 감지하면 자동으로 룰 기반 시각으로 강등시킵니다.

- ❌ "또 실패했네요" / "왜 안 하셨나요"
- ✅ "오늘은 절반쯤 왔어요" / "끝까지 가지 못해도 괜찮아요. 다시 시작할 방법이 있어요"

상태 표현은 앱 전체에서 **완료 / 일부만 / 잘 안됨**으로 통일합니다.

## 화면별로 뭘 쓰나

앱의 실제 화면은 아래 조합이다. 새 화면을 그릴 땐 이걸 그대로 재사용한다.

| 화면 | 주역 | 함께 쓰는 것 |
|---|---|---|
| 오늘 실행 | `HeroTaskCard` + `TaskRow` | `ProgressSheet`(일부만 기록), `EmptyState` |
| 주간 계획 | `WeekGrid` | `BlockEditSheet`, `Toast`, `WeeklySwitch` |
| 온보딩 계획 확인 | `WeekGrid` (+`backdrop` 으로 기존 계획) | `AiDraftCard`, `SetupProgress` |
| 회복 제안 | `RecoveryOptionCard` | `ErrorBanner`, `EmptyState` |
| 인박스 | `InboxItemCard` + `InboxAction` | `ResourceViewerSheet`, `SkeletonBlock` |
| 목표 관리 | `GoalCard` + `IconAction` | `TextField`, `ReButton`, `AiDraftCard` |
| 주간 리뷰 | `ScoreDonut` | `SectionHeader`, `EmptyState` |
| 설정 | `Toggle` | `SectionHeader`, `Toast` |

**시간표는 `WeekGrid` 하나뿐이다.** 온보딩과 메인 캘린더가 같은 걸 쓴다. 좁다고 느끼면
`colWidth`(기본 50) 만 올리면 되고, 그러면 가로 스크롤이 생긴다 — 격자를 목록으로
바꾸지 말 것. 빈 시간이 눈에 보이는 게 이 화면의 존재 이유다.

## 로딩·빈·에러 — 더미로 채우지 않는다

데이터가 없을 때 그럴듯한 가짜를 그리지 않는다. 셋 중 하나를 쓴다.

- 아직 불러오는 중 → `SkeletonBlock`
- 불러왔는데 없음 → `EmptyState` (점선 = 내용 없음)
- 실패 → `ErrorBanner` (사라지면 안 되는 것) / `Toast` (되돌린 사실 통지)

## 진짜 소스

- 토큰 원본: `_ds_bundle.css` (`styles.css`가 `@import`)
- 컴포넌트별 API: 각 `components/general/<Name>/<Name>.d.ts`
- 사용 예시: 각 `<Name>.prompt.md`
