// Re:Action 디자인 시스템 배럴 — claude.ai/design 동기화(/design-sync)의 진입점.
//
// 앱은 이 파일을 쓰지 않는다. 화면들은 각 컴포넌트를 직접 import 한다.
// 이 배럴이 존재하는 이유는 디자인 시스템으로서 "무엇이 공개 컴포넌트인가"를
// 한 곳에 명시하기 위함이다(동기화 대상 = 여기 열거된 것).
//
// 디자인 토큰은 src/index.css 의 CSS 변수(--sand-*, --coral-* 등)에 있고,
// 컴포넌트는 그 변수를 참조하므로 스타일시트 없이는 렌더되지 않는다.

export { AiDraftCard } from './components/AiDraftCard';
export { BlockEditSheet } from './components/BlockEditSheet';
export { Card } from './components/Card';
export { Chip } from './components/Chip';
export { DemoNotice } from './components/DemoNotice';
export { IosInstallCard } from './components/IosInstallCard';
export { ReButton } from './components/ReButton';
export { ResourceViewerSheet } from './components/ResourceViewerSheet';
export { SectionHeader } from './components/SectionHeader';
export { Segmented } from './components/Segmented';
export { SetupProgress } from './components/SetupProgress';
export { MergedTabBar as TabBar } from './components/TabBar';
export { TimeDial } from './components/TimeDial';
export { WeeklySwitch } from './components/WeeklySwitch';
export { Wordmark } from './components/Wordmark';
