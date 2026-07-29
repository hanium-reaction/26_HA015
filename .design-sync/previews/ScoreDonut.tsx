import { ScoreDonut } from 're-action-web';

const row: React.CSSProperties = { display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' };

export const Scores = () => (
  <div style={row}>
    <ScoreDonut score={92} />
    <ScoreDonut score={72} />
    <ScoreDonut score={31} />
  </div>
);

export const Sizes = () => (
  <div style={row}>
    <ScoreDonut score={72} size={72} stroke={8} />
    <ScoreDonut score={72} size={120} stroke={12} />
    <ScoreDonut score={72} size={160} stroke={16} />
  </div>
);
