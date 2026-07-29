import { BlockEditSheet } from 're-action-web';

const noop = () => {};
// 시트는 position:absolute; inset:0 이라 위치 기준 컨테이너가 필요하다.
const stage: React.CSSProperties = { position: 'relative', width: 360, height: 560, overflow: 'hidden', borderRadius: 14, border: '1px solid var(--sand-200)' };

const block = { id: 'b1', day: 2, time: '21:00', dur: 60, title: 'GROUP BY / HAVING 실습', goal: 'study' };

export const EditBlock = () => (
  <div style={stage}>
    <BlockEditSheet
      block={block}
      existingCategories={['study', 'health', 'project']}
      durations={[30, 45, 60, 90, 120]}
      minuteStep={15}
      onSave={noop}
      onDelete={noop}
      onClose={noop}
    />
  </div>
);
