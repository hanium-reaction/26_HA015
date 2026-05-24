import React from 'react';
import { PhoneFrame } from '../components/PhoneFrame';
import { Wordmark } from '../components/Wordmark';
import { ReActionMerged } from './ReActionMerged';
import { SystemIntroScreen } from '../screens/SystemIntroScreen';
import { GoalIntakeScreen } from '../screens/GoalIntakeScreen';
import { GoalClassificationScreen } from '../screens/GoalClassificationScreen';
import { WeeklyPlanGenerationScreen } from '../screens/WeeklyPlanGenerationScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';
import { MorningBriefScreen } from '../screens/MorningBriefScreen';
import { ExecutionTodayScreen } from '../screens/TodayScreen';
import { FocusScreen } from '../screens/FocusScreen';
import { MergedRecoveryScreen } from '../screens/RecoveryScreen';
import { RecoveredScreen } from '../screens/RecoveredScreen';
import { EveningCheckInScreen } from '../screens/EveningCheckInScreen';
import { WeeklyCalendarScreenV2 } from '../screens/WeeklyCalendarScreen';
import { ReflectScreen } from '../screens/ReflectScreen';
import { WeeklyReviewScreenV2 } from '../screens/WeeklyReviewScreen';
import { AiDraftCard } from '../components/AiDraftCard';

// ── Safe-area wrapper ──────────────────────────────────────────
function Safe({ scroll = true, children }: { scroll?: boolean; children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute',
      top: 50, left: 0, right: 0, bottom: 0,
      overflow: scroll ? 'auto' : 'hidden',
    }}>
      {children}
    </div>
  );
}

// ── Step badge (journey stage label) ──────────────────────────
function StepBadge({ n, color, label }: { n: string; color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <div style={{ width: 24, height: 24, borderRadius: 9999, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{n}</div>
      <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: '0.04em', textTransform: 'uppercase' as const, fontFamily: 'var(--font-mono)' }}>{label}</span>
    </div>
  );
}

// ── Section divider ────────────────────────────────────────────
function SectionDivider({ label, sub }: { label: string; sub: string }) {
  return (
    <div style={{ width: '100%', maxWidth: 1320, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginTop: 48, paddingTop: 28, borderTop: '1px solid var(--sand-200)' }}>
      <h2 style={{ fontSize: 20, margin: 0, fontWeight: 700, letterSpacing: '-0.01em' }}>{label}</h2>
      <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{sub}</span>
    </div>
  );
}

// ── Single screen card (phone frame + caption) ─────────────────
function ScreenCard({ tag, title, desc, children }: { tag: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <PhoneFrame>
        <div style={{ height: '100%', overflow: 'hidden', position: 'relative' }}>
          {children}
        </div>
      </PhoneFrame>
      <div style={{ textAlign: 'center', maxWidth: 380 }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--brand)' }}>{tag}</div>
        <h3 style={{ fontSize: 16, margin: '4px 0 2px', fontWeight: 700 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>{desc}</p>
      </div>
    </div>
  );
}

// ── Screen grid ────────────────────────────────────────────────
function ScreenGrid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 32, width: '100%', maxWidth: 1320 }}>
      {children}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────
export function MobileKitPage() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 16px 80px', gap: 24, background: 'var(--sand-100)' }}>

      {/* ─── Header ─── */}
      <div style={{ width: '100%', maxWidth: 1320, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 8 }}>
        <Wordmark size={28} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--surface-raised)', border: '1px solid var(--sand-200)', borderRadius: 9999, padding: '6px 14px', fontSize: 13, color: 'var(--text-2)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 9999, background: 'var(--brand)', display: 'inline-block' }} />
          <span><b style={{ color: 'var(--text-1)' }}>★ Merged 프로토타입</b>을 탭해서 전체 플로우를 체험하세요</span>
        </div>
      </div>

      {/* ─── ★ Merged interactive prototype ─── */}
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
          <div style={{ background: 'var(--brand)', color: '#FFFCF6', borderRadius: 9999, padding: '6px 18px', fontSize: 12, fontWeight: 700, letterSpacing: '-0.01em' }}>
            ★ Merged · V1 + V2 통합 플로우
          </div>
          <PhoneFrame>
            <ReActionMerged />
          </PhoneFrame>
          <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 380, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
            인트로 → 목표 파악 → 주간 계획 생성 → 회복 스타일 → 실행 → 회복 카드 → 주간 리뷰까지 전체 플로우
          </p>
        </div>
      </div>

      {/* ─── Screen library ─── */}
      <SectionDivider label="스크린 라이브러리 · 14화면" sub="8-Stage Journey 순서 · 탭해서 인터랙션 확인" />

      {/* ── ① Discover / Onboard ── */}
      <div style={{ width: '100%', maxWidth: 1320 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingTop: 10 }}>
          <StepBadge n="①" color="#7CA6D1" label="Discover · Onboard" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>시스템 소개 → 목표 파악 → 분류 → 주간 계획 생성 → 회복 스타일</span>
        </div>
        <ScreenGrid>
          <ScreenCard tag="Intro · 1 / 3슬라이드" title="System Intro" desc="실행 메모리 · 복구 정책 3-슬라이드 소개 · Pretendard 800">
            <Safe><SystemIntroScreen onDone={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Onboard · Goal Intake" title="목표 파악 AI 채팅" desc="소크라테스식 4턴 대화 · 진행바 · 컨텍스트 chip 축적">
            <Safe scroll={false}><GoalIntakeScreen onDone={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Onboard · Goal Classify" title="목표 분류" desc="Focus / 유지 / 보류 · 인라인 상태 전환 · 진행 바">
            <Safe><GoalClassificationScreen onNext={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Plan · 주간 계획 생성" title="AI 주간 계획" desc="AI 생성 애니메이션 → 7일 타임블록 캘린더 · 탭해서 수정">
            <Safe scroll={false}><WeeklyPlanGenerationScreen onContinue={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Onboard · 코핑 스타일" title="회복 스타일 선택" desc="4택 · 선택 시 brand 하이라이트 · 온보딩 마지막 단계">
            <Safe><OnboardingScreen onNext={() => {}} /></Safe>
          </ScreenCard>
        </ScreenGrid>
      </div>

      {/* ── ② Plan / Execute ── */}
      <div style={{ width: '100%', maxWidth: 1320, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StepBadge n="②" color="#E8A04B" label="Plan · Execute" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>모닝 브리프 → 오늘 실행 → 집중 세션</span>
        </div>
        <ScreenGrid>
          <ScreenCard tag="Daily · 모닝 브리프" title="Morning Brief" desc="이월 알림 + 다크 히어로 카드 + 오늘 블록 목록">
            <Safe><MorningBriefScreen onStart={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 4 · Today" title="오늘 실행" desc="✓/◑/✗ 트래킹 · 회복 배너 · if-then standby · 실행 메모리">
            <Safe scroll={false}><ExecutionTodayScreen onRecovery={() => {}} onEvening={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 4 · Focus Timer" title="집중 세션" desc="280px ring SVG · 경과시간 · 잠깐 멈춤 / 완료 2버튼">
            <Safe>
              <FocusScreen
                task={{ id: 'demo', title: 'GROUP BY / HAVING 실습', status: 'in_progress', goal: 'g1', carryover: false }}
                elapsedMin={18}
                totalMin={60}
                onBack={() => {}}
                onPause={() => {}}
                onComplete={() => {}}
              />
            </Safe>
          </ScreenCard>
        </ScreenGrid>
      </div>

      {/* ── ③ Measure / Recover ── */}
      <div style={{ width: '100%', maxWidth: 1320, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StepBadge n="③" color="#E26D4E" label="Measure · ★ Recover" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>실패 사유 기록 → 복구 제안 → 회복 완료</span>
        </div>
        <ScreenGrid>
          <ScreenCard tag="Stage 5 · Partial Done" title="부분 완료 슬라이더" desc="연속 슬라이더 · 0/25/50/75/100 스냅 · recovery_pending 자동 전이">
            <Safe scroll={false}>
              <div style={{ height: '100%', position: 'relative' }}>
                <ExecutionTodayScreen onRecovery={() => {}} onEvening={() => {}} />
              </div>
            </Safe>
          </ScreenCard>
          <ScreenCard tag="★ Stage 6 · Recovery" title="Recovery Proposal Card" desc="자기자비 헤드 + if-then 매칭 ✓ + 신뢰도% + '왜?' 토글">
            <Safe scroll={false}>
              <MergedRecoveryScreen
                task={{ id: 'demo', title: 'GROUP BY / HAVING 실습', status: 'failed', goal: 'g1', carryover: false }}
                failReason="막막함"
                onAccept={() => {}}
                onDismiss={() => {}}
              />
            </Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 6 · Recovered" title="회복 완료" desc="30일 누적 카운터 +1 · Pretendard 800 '좋아요.' · 스트릭 없음">
            <Safe><RecoveredScreen recoveryCount={38} onDone={() => {}} /></Safe>
          </ScreenCard>
        </ScreenGrid>
      </div>

      {/* ── ⑤ Components · 공통 카드 ── */}
      <SectionDivider label="공통 컴포넌트" sub="베이스라인 §1.4 잠금 결정 — AI 카드는 100% 이 컴포넌트 통과" />
      <div style={{ width: '100%', maxWidth: 1320 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, paddingTop: 10 }}>
          <StepBadge n="C" color="#B85F8E" label="AiDraftCard · Issue #12" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>3 variants · isDraft + aiSource + llmRunId + 3버튼 + 금지어 검수</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 24 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--brand)', marginBottom: 8 }}>aiSource: llm</div>
            <AiDraftCard
              isDraft={true}
              aiSource="llm"
              llmRunId="run_a1b2c3d4e5f6"
              onAccept={() => {}}
              onEdit={() => {}}
              onReject={() => {}}
            >
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
                목표 달성을 위해 화요일/목요일 저녁 60분 블록 2개를 추천드려요. 일요일은 휴식으로 비워두었어요.
              </p>
            </AiDraftCard>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>정상 LLM 응답. 코랄 점선 + Sparkle.</p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--text-3)', marginBottom: 8 }}>aiSource: rule (fallback)</div>
            <AiDraftCard
              isDraft={true}
              aiSource="rule"
              onAccept={() => {}}
              onEdit={() => {}}
              onReject={() => {}}
            >
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
                저녁 시간대 빈 슬롯에 자동 분배했어요. 8 블록 · 총 8h.
              </p>
            </AiDraftCard>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>BE 가 룰 fallback 으로 응답. 모래 점선 + Robot + 안내 풋터.</p>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--danger, #C9573D)', marginBottom: 8 }}>금지어 감지 → rule 강제 전환</div>
            <AiDraftCard
              isDraft={true}
              aiSource="llm"
              llmRunId="run_forbidden"
              onAccept={() => {}}
              onEdit={() => {}}
              onReject={() => {}}
            >
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--text-2)' }}>
                지난주 실패율이 높았어요. 이번 주는 줄여서 다시 시도해봐요.
              </p>
            </AiDraftCard>
            <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '8px 0 0' }}>"실패율" 감지. 자동으로 룰 시각으로 전환 + dev console.error.</p>
          </div>
        </div>
      </div>

      {/* ── ④ Reflect / Sustain ── */}
      <div style={{ width: '100%', maxWidth: 1320, marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <StepBadge n="④" color="#8E5F73" label="Reflect · Sustain" />
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>저녁 체크인 → 주간 캘린더 → 회고 히트맵 → 주간 리뷰</span>
        </div>
        <ScreenGrid>
          <ScreenCard tag="Daily · 저녁 체크인" title="Evening Check-in" desc="에너지 5택 + 내일 이월 미리보기 2단계">
            <Safe><EveningCheckInScreen onDone={() => {}} /></Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 6 · 주간 계획" title="Weekly Calendar (편집 가능)" desc="7일 타임블록 · 탭 → BlockEditSheet · + FAB 추가">
            <Safe scroll={false}><WeeklyCalendarScreenV2 /></Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 7 · Reflect" title="주간 회고 히트맵" desc="Recovery Heatmap 3×7 · AI Insight 3선 · STRENGTH/WATCH/NEXT WEEK">
            <Safe><ReflectScreen /></Safe>
          </ScreenCard>
          <ScreenCard tag="Stage 7 · Weekly Review" title="주간 리뷰" desc="점수 도넛 + 요일별 막대 + KPI 4-카드 + 실패 스택바 + AI 정책">
            <Safe><WeeklyReviewScreenV2 /></Safe>
          </ScreenCard>
        </ScreenGrid>
      </div>

    </div>
  );
}
