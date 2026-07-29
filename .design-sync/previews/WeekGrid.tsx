import { WeekGrid } from 're-action-web';

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: 560,
  width: 390,
  background: 'var(--surface-ground)',
  border: '1px solid var(--sand-200)',
  borderRadius: 12,
  overflow: 'hidden',
};

const study = { bg: '#E4EDF6', bd: '#B8D0E8', fg: '#3A5C7D' };
const health = { bg: '#E5EFE3', bd: '#B4DFC8', fg: 'var(--success)' };
const done = { bg: '#E5EFE3', bd: '#B4DFC8', fg: 'var(--success)' };
const failed = { bg: '#FAE2D8', bd: 'var(--coral-200)', fg: 'var(--danger)' };
const fixed = { bg: 'var(--sand-100)', bd: 'var(--sand-300)', fg: 'var(--text-3)' };

const WEEK = [
  { id: '1', col: 0, startMin: 9 * 60, durMin: 90, title: '토익 LC 파트3', subLabel: '09:00·90분', glyph: '✓ ', colors: done },
  { id: '2', col: 0, startMin: 14 * 60, durMin: 60, title: '알고리즘 2문제', subLabel: '14:00·60분', colors: study },
  { id: '3', col: 1, startMin: 10 * 60, durMin: 120, title: '정보처리기사 실기', subLabel: '10:00·120분', glyph: '✗ ', colors: failed },
  { id: '4', col: 2, startMin: 11 * 60, durMin: 90, title: '전공 수업', subLabel: '11:00·90분', colors: fixed, fixed: true },
  { id: '5', col: 2, startMin: 19 * 60, durMin: 60, title: '헬스', subLabel: '19:00·60분', colors: health },
  { id: '6', col: 3, startMin: 9 * 60, durMin: 45, title: '토익 RC 파트5', subLabel: '09:00·45분', colors: study },
  { id: '7', col: 4, startMin: 13 * 60, durMin: 90, title: '포트폴리오 정리', subLabel: '13:00·90분', colors: study },
];

export const ThisWeek = () => (
  <div style={shell}>
    <WeekGrid
      blocks={WEEK}
      dayNumbers={[27, 28, 29, 30, 31, 1, 2]}
      todayCol={2}
      nowMin={15 * 60 + 30}
      startHour={8}
      endHour={22}
    />
  </div>
);

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
      startHour={8}
      endHour={20}
    />
  </div>
);

export const Wider = () => (
  <div style={{ ...shell, width: 480 }}>
    <WeekGrid
      blocks={WEEK}
      dayNumbers={[27, 28, 29, 30, 31, 1, 2]}
      todayCol={2}
      nowMin={15 * 60 + 30}
      startHour={8}
      endHour={20}
      colWidth={62}
      hourPx={64}
      timeWidth={34}
    />
  </div>
);

export const Loading = () => (
  <div style={shell}>
    <WeekGrid blocks={[]} dayNumbers={[27, 28, 29, 30, 31, 1, 2]} todayCol={2} startHour={12} endHour={22} loading />
  </div>
);
