import { SectionHeader } from 're-action-web';

export const Basic = () => (
  <div style={{ maxWidth: 340 }}>
    <SectionHeader>오늘 남은 것</SectionHeader>
  </div>
);

export const WithAction = () => (
  <div style={{ maxWidth: 340 }}>
    <SectionHeader action={<span style={{ fontSize: 12, fontWeight: 700, color: 'var(--brand)' }}>+ 습관 추가</span>}>
      추적 습관 루틴 (3)
    </SectionHeader>
  </div>
);
