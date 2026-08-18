import { Segmented } from 're-action-web';

const noop = () => {};
const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 340 };

export const WeekToggle = () => (
  <div style={wrap}>
    <Segmented
      ariaLabel="계획/리뷰 전환"
      value="plan"
      onChange={noop}
      options={[{ value: 'plan', label: '계획' }, { value: 'review', label: '리뷰' }]}
    />
  </div>
);

export const InboxFilter = () => (
  <div style={wrap}>
    <Segmented
      fluid
      ariaLabel="인박스 상태 필터"
      value="classified"
      onChange={noop}
      options={[
        { value: 'classified', label: '할 일' },
        { value: 'promoted', label: '처리됨' },
        { value: 'archived', label: '보관' },
      ]}
    />
  </div>
);

export const SelectedStates = () => (
  <div style={wrap}>
    <Segmented value="a" onChange={noop} options={[{ value: 'a', label: '첫째 선택됨' }, { value: 'b', label: '둘째' }]} />
    <Segmented value="b" onChange={noop} options={[{ value: 'a', label: '첫째' }, { value: 'b', label: '둘째 선택됨' }]} />
  </div>
);
