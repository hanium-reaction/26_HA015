import { TextField } from 're-action-web';

const wrap: React.CSSProperties = { maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 12 };

export const States = () => (
  <div style={wrap}>
    <TextField label="목표 제목" defaultValue="정보처리기사 필기" />
    <TextField label="마감" placeholder="YYYY-MM-DD" hint="비워두면 마감 없이 관리해요." />
    <TextField label="목표 제목" defaultValue="" error="제목을 한 줄 적어주세요." />
  </div>
);
