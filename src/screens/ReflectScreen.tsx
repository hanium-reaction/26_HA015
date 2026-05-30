import React, { useEffect } from 'react';
import { SectionHeader } from '../components/SectionHeader';
import { Card } from '../components/Card';
import { Chip } from '../components/Chip';
import { reflectionApi } from '../lib/api';

export function ReflectScreen() {
  // mock-and-replace: 백엔드 /reflection/* 가 501. 진입 시 pending + failure-tags
  // fetch 시도 (실패는 조용히). 채워지면 응답을 화면에 매핑할 자리.
  useEffect(() => {
    let cancelled = false;
    Promise.all([reflectionApi.pending(), reflectionApi.failureTags()]).then(
      ([pending, tags]) => {
        if (cancelled) return;
        // TODO(backend-#20): pending 카드 list 와 tags 마스터를 화면 state 로
        void pending;
        void tags;
      },
      () => { /* 501 — 더미 그대로 */ },
    );
    return () => { cancelled = true; };
  }, []);

  const heatmap = [
    [1, 2, 1, 3, 2, 1, 0],
    [2, 4, 3, 4, 3, 2, 1],
    [3, 4, 3, 4, 3, 3, 2],
  ];
  const tints = ['var(--sand-100)', '#F2E9EE', '#CFB1C0', '#8E5F73', '#5C3848'];
  const days = ['월', '화', '수', '목', '금', '토', '일'];
  const periods = ['오전', '오후', '밤'];

  return (
    <div style={{ padding: '12px 20px 110px', background: 'var(--surface-ground)', minHeight: '100%' }}>
      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>Week 20 · Reflect</div>
      <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 4 }}>이번 주 <span style={{ color: 'var(--brand)' }} className="tnum">7번</span> 회복했어요.</h1>
      <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 24 }}>밤 시간대 회복이 가장 빠르네요.</p>

      <Card style={{ padding: 18, marginBottom: 16 }}>
        <SectionHeader>Recovery Heatmap</SectionHeader>
        <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', gap: 4 }}>
          <div />
          {days.map((d) => (
            <div key={d} style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{d}</div>
          ))}
          {periods.map((p, i) => (
            <React.Fragment key={p}>
              <div style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'right', alignSelf: 'center' }}>{p}</div>
              {heatmap[i].map((v, j) => (
                <div key={j} style={{ height: 28, borderRadius: 6, background: tints[v] }} />
              ))}
            </React.Fragment>
          ))}
        </div>
      </Card>

      <SectionHeader>AI Insight Cards</SectionHeader>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <Card style={{ padding: 16 }}>
          <Chip tone="sage" style={{ marginBottom: 8 }}>강점</Chip>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>밤 9–11시 회복률이 가장 높아요</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>이 시간대를 회복 루틴 기본 슬롯으로 추천해요.</p>
        </Card>
        <Card style={{ padding: 16 }}>
          <Chip tone="amber" style={{ marginBottom: 8 }}>주의</Chip>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>화요일 오후, 자주 멈췄어요</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>피곤함이 3번 누적됐어요. 사이즈를 절반으로 줄여볼까요?</p>
        </Card>
        <Card style={{ padding: 16 }}>
          <Chip tone="coral" style={{ marginBottom: 8 }}>다음 주</Chip>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>새 "만약-그땐" 제안</div>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}><span style={{ fontFamily: 'var(--font-display)', color: 'var(--coral-600)' }}>만약</span> 화요일 오후 3시라면, <span style={{ fontFamily: 'var(--font-display)', color: 'var(--coral-600)' }}>그땐</span> 15분 산책부터 한다.</p>
        </Card>
      </div>
    </div>
  );
}
