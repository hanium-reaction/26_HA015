import { Wordmark } from 're-action-web';

export const Default = () => <Wordmark />;

export const Sizes = () => (
  <div style={{ display: 'flex', gap: 18, alignItems: 'baseline', flexWrap: 'wrap' }}>
    <Wordmark size={16} />
    <Wordmark size={22} />
    <Wordmark size={32} />
    <Wordmark size={44} />
  </div>
);
