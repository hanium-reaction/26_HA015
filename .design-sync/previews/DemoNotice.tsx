import { DemoNotice } from 're-action-web';

export const Basic = () => (
  <div style={{ maxWidth: 360 }}>
    <DemoNotice>
      주간 계획을 서버에서 불러오지 못했어요. 우측 하단 + 버튼으로 직접 추가해 주세요.
    </DemoNotice>
  </div>
);

export const Dismissible = () => (
  <div style={{ maxWidth: 360 }}>
    <DemoNotice storageKey="preview-demo">
      에너지 기록은 아직 임시 저장돼요. 실행별 회고는 실제로 저장됩니다.
    </DemoNotice>
  </div>
);
