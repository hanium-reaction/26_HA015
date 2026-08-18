import { Card } from 're-action-web';

const t: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-1)' };
const s: React.CSSProperties = { fontSize: 12, color: 'var(--text-2)', marginTop: 4 };

export const Basic = () => (
  <div style={{ maxWidth: 340 }}>
    <Card>
      <div style={t}>GROUP BY / HAVING 실습</div>
      <div style={s}>21:00 · 60분 · 토익 900</div>
    </Card>
  </div>
);

export const Raised = () => (
  <div style={{ maxWidth: 340 }}>
    <Card raised>
      <div style={t}>이번 주, 잘 했어요</div>
      <div style={s}>준수율 100% · 회복 3회</div>
    </Card>
  </div>
);

export const Clickable = () => (
  <div style={{ maxWidth: 340 }}>
    <Card onClick={() => {}}>
      <div style={t}>캡스톤 발표자료 초안</div>
      <div style={s}>탭하면 상세로 이동해요</div>
    </Card>
  </div>
);

export const Unpadded = () => (
  <div style={{ maxWidth: 340 }}>
    <Card padded={false}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--sand-200)', ...t }}>목표 목록</div>
      <div style={{ padding: '10px 12px', ...s }}>여백 없이 직접 구성할 때</div>
    </Card>
  </div>
);
