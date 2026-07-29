// onboarding 흐름 공통 진행 표시기. X/N + 라벨 + 바.
// 모든 단계 (goal-intake, goal-classify, setup, weekly-plan) 에서 같이 사용.
export function SetupProgress({ current, total, label }: { current: number; total: number; label: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
      <span style={{ color: 'var(--brand-ink)', fontWeight: 700 }}>{current} / {total}</span>
      <div style={{ flex: 1, height: 3, background: 'var(--sand-200)', borderRadius: 9999, position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: `${(current / total) * 100}%`, background: 'var(--brand)', borderRadius: 9999, transition: 'width 0.4s ease' }} />
      </div>
      <span>{label}</span>
    </div>
  );
}
