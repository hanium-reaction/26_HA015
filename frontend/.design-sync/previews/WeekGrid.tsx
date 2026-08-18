import { WeekGrid } from 're-action-web';

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 520,
  width: 390,
  background: 'var(--surface-ground)',
  border: '1px solid var(--sand-200)',
  borderRadius: 12,
  overflow: 'hidden',
};

const study = { bg: '#E4EDF6', bd: '#B8D0E8', fg: '#31506E' };
const project = { bg: '#FBEEDA', bd: '#F2D29A', fg: '#7A5411' };
const done = { bg: '#E5EFE3', bd: '#B4DFC8', fg: 'var(--success-ink)' };
const failed = { bg: '#FAE2D8', bd: 'var(--coral-200)', fg: 'var(--danger-ink)' };
const fixed = { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };

const WEEK = [
  { id: '1', col: 2, startMin: 9 * 60, durMin: 90, title: '토익 LC 파트3', subLabel: '09:00·90분', glyph: '✓ ', colors: done },
  { id: '2', col: 2, startMin: 14 * 60, durMin: 60, title: '알고리즘 2문제 풀기', subLabel: '14:00·60분', colors: study },
  { id: '3', col: 2, startMin: 11 * 60, durMin: 120, title: '정보처리기사 실기', subLabel: '11:00·120분', glyph: '✗ ', colors: failed },
  { id: '4', col: 3, startMin: 13 * 60, durMin: 90, title: '캡스톤 발표자료', subLabel: '13:00·90분', colors: project },
  { id: '5', col: 4, startMin: 15 * 60, durMin: 60, title: '전공 수업', subLabel: '15:00·60분', colors: fixed, fixed: true },
  { id: '6', col: 0, startMin: 10 * 60, durMin: 60, title: '토익 RC', subLabel: '10:00·60분', colors: study },
  { id: '7', col: 5, startMin: 11 * 60, durMin: 60, title: '독서', subLabel: '11:00·60분', colors: study },
];

// 기본값 — 모바일에서 실제로 쓰는 모양. 3칸만 보여주고 열을 넓게 쓴다.
export const ThreeDay = () => (
  <div style={shell}>
    <WeekGrid
      blocks={WEEK}
      visibleCols={[2, 3, 4]}
      dayNumbers={[27, 28, 29, 30, 31, 1, 2]}
      todayCol={2}
      nowMin={15 * 60 + 30}
      startHour={8}
      endHour={20}
      colWidth={108}
      hourPx={64}
      timeWidth={34}
    />
  </div>
);

// 한 주 전체 조망. 열이 좁아 제목이 접히므로 "훑어보기" 용도다.
export const SevenDay = () => (
  <div style={shell}>
    <WeekGrid
      blocks={WEEK}
      dayNumbers={[27, 28, 29, 30, 31, 1, 2]}
      todayCol={2}
      nowMin={15 * 60 + 30}
      startHour={9}
      endHour={19}
    />
  </div>
);

// 확정 전 초안을 앞에, 이전 계획을 뒤에 흐리게 — 온보딩 계획 확인 화면의 모양.
export const WithDraftBackdrop = () => (
  <div style={shell}>
    <WeekGrid
      blocks={[
        { id: 'd1', col: 1, startMin: 10 * 60, durMin: 60, title: '토익 LC', subLabel: '10:00·60분', colors: study },
        { id: 'd2', col: 3, startMin: 14 * 60, durMin: 90, title: '실기 대비', subLabel: '14:00·90분', colors: study },
      ]}
      backdrop={[
        { id: 'o1', col: 1, startMin: 11 * 60, durMin: 90, title: '지난 계획', colors: fixed, muted: true },
        { id: 'o2', col: 4, startMin: 13 * 60, durMin: 60, title: '지난 계획', colors: fixed, muted: true },
      ]}
      dayNumbers={[3, 4, 5, 6, 7, 8, 9]}
      startHour={9}
      endHour={17}
    />
  </div>
);

export const Loading = () => (
  <div style={shell}>
    <WeekGrid blocks={[]} dayNumbers={[27, 28, 29, 30, 31, 1, 2]} todayCol={2} startHour={13} endHour={22} loading />
  </div>
);
