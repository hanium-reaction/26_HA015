import { ReButton } from './ReButton';

export interface ReinterviewSheetProps {
  open: boolean;
  onClose: () => void;
  /** 확인을 눌렀을 때. 호출한 화면이 interviewReturnTo 를 자기 자신으로 세팅한 뒤 인터뷰로 보낸다. */
  onConfirm: () => void;
}

/**
 * 다시 인터뷰하기 확인 시트(#216).
 *
 * 진입점이 여러 곳(목표 관리, 주간 계획)이라 문구를 각 화면에 복사해 두면 언젠가 갈라진다.
 * "무슨 일이 일어나는가"를 밝히는 문장이 이 기능의 핵심이라 한 곳에서만 관리한다 —
 * 인터뷰는 처음부터 새로 시작되고 이전 답변은 대체되지만, 이미 만든 목표와 일정은 남는다.
 * (GoalIntakeScreen 은 진입할 때마다 기존 세션을 finish 하고 새로 시작한다.)
 */
export function ReinterviewSheet({ open, onClose, onConfirm }: ReinterviewSheetProps) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="다시 인터뷰하기"
      style={{ position: 'absolute', inset: 0, zIndex: 40, background: 'rgba(28,25,23,.35)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', background: 'var(--surface-raised)', borderRadius: '18px 18px 0 0', padding: '18px 18px max(24px, env(safe-area-inset-bottom, 24px))', display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-1)' }}>목표의 결이 바뀌었나요?</div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
          몇 가지만 다시 묻고 계획을 새로 세울게요. <b>인터뷰는 처음부터 새로 시작</b>되고,
          지금까지의 인터뷰 답변은 새 답변으로 대체돼요. 이미 만들어진 목표와 일정은 그대로 남아요.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <ReButton variant="ghost" size="sm" onClick={onClose}>지금은 그대로</ReButton>
          <div style={{ flex: 1 }}>
            <ReButton variant="primary" size="sm" full onClick={onConfirm}>
              다시 인터뷰하기
            </ReButton>
          </div>
        </div>
      </div>
    </div>
  );
}
