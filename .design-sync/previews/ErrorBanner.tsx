import { ErrorBanner, ReButton } from 're-action-web';

const noop = () => {};
const wrap: React.CSSProperties = { maxWidth: 344, display: 'flex', flexDirection: 'column', gap: 10 };

export const Plain = () => (
  <div style={wrap}>
    <ErrorBanner>회복 계획을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.</ErrorBanner>
    <ErrorBanner>이 시간대는 야간 차단 정책이 있어요.</ErrorBanner>
  </div>
);

export const WithAction = () => (
  <div style={wrap}>
    <ErrorBanner
      action={
        <div style={{ alignSelf: 'flex-start' }}>
          <ReButton variant="ghost" size="sm" onClick={noop}>다음 단계로 넘어가기</ReButton>
        </div>
      }
    >
      인터뷰를 이어갈 수 없어요.
    </ErrorBanner>
  </div>
);
