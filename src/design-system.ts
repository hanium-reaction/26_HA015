// Re:Action 디자인 시스템 배럴 — claude.ai/design 동기화(/design-sync)의 진입점.
//
// 앱은 이 파일을 쓰지 않는다. 화면들은 각 컴포넌트를 직접 import 한다.
// 이 배럴이 존재하는 이유는 디자인 시스템으로서 "무엇이 공개 컴포넌트인가"를
// 한 곳에 명시하기 위함이다(동기화 대상 = 여기 열거된 것).
//
// 여기 있는 건 전부 실제 화면이 렌더하는 것들이다. 앱이 안 쓰는 컴포넌트는
// 넣지 않는다 — 디자인 툴에서 조립한 화면이 코드에 없는 부품을 쓰면
// 그 디자인은 그대로 구현될 수 없기 때문.
//
// 디자인 토큰은 src/index.css 의 CSS 변수(--sand-*, --coral-* 등)에 있고,
// 컴포넌트는 그 변수를 참조하므로 스타일시트 없이는 렌더되지 않는다.

// ── 화면 주역 ────────────────────────────────────────────────
export { WeekGrid } from './components/WeekGrid';
export { HeroTaskCard } from './components/HeroTaskCard';
export { TaskRow } from './components/TaskRow';
export { RecoveryOptionCard } from './components/RecoveryOptionCard';
export { InboxItemCard, InboxAction } from './components/InboxItemCard';
export { GoalCard } from './components/GoalCard';
export { ScoreDonut } from './components/ScoreDonut';
export { AiDraftCard } from './components/AiDraftCard';

// ── 시트·오버레이 ────────────────────────────────────────────
export { BlockEditSheet } from './components/BlockEditSheet';
export { ProgressSheet } from './components/ProgressSheet';
export { ResourceViewerSheet } from './components/ResourceViewerSheet';

// ── 상태 표현 ────────────────────────────────────────────────
export { EmptyState } from './components/EmptyState';
export { ErrorBanner } from './components/ErrorBanner';
export { SkeletonBlock } from './components/SkeletonBlock';
export { Toast } from './components/Toast';
export { DemoNotice } from './components/DemoNotice';

// ── 입력·컨트롤 ──────────────────────────────────────────────
export { ReButton } from './components/ReButton';
export { TextField } from './components/TextField';
export { Toggle } from './components/Toggle';
export { IconAction } from './components/IconAction';
export { TimeDial } from './components/TimeDial';
export { Segmented } from './components/Segmented';
export { Chip } from './components/Chip';

// ── 구조·네비게이션 ──────────────────────────────────────────
export { Card } from './components/Card';
export { SectionHeader } from './components/SectionHeader';
export { MergedTabBar as TabBar } from './components/TabBar';
export { WeeklySwitch } from './components/WeeklySwitch';
export { SetupProgress } from './components/SetupProgress';
export { Wordmark } from './components/Wordmark';
export { IosInstallCard } from './components/IosInstallCard';
