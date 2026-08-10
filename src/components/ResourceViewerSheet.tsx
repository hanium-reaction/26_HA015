import { X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// 추천 자료 마크다운 뷰어(#163). 바텀시트는 BlockEditSheet 과 같은 형태를 쓴다.
//
// 보안: rehype-raw 를 쓰지 않는다 — 본문의 raw HTML 은 렌더하지 않고 텍스트로 남겨
// XSS 를 원천 차단한다(marked + innerHTML 방식도 같은 이유로 채택하지 않음).
// 링크는 새 창 + noopener 로 연다.
//
// 타이포그래피는 앱 CSS 변수(--text-1 / --sand-200 / --font-display)로 맞춘다.

interface ResourceViewerSheetProps {
  title: string;
  markdown: string | null; // null = 아직 로딩 중
  error?: string | null;
  onClose: () => void;
  /**
   * 자료가 제안하는 '한 걸음' 목록. 읽고 끝나지 않게 실행으로 잇는 출구다.
   * 비어 있으면 섹션 자체를 그리지 않는다.
   */
  steps?: string[];
  /** 걸음을 고르면 호출. 성공/실패 처리는 호출한 쪽이 한다. */
  onAdoptStep?: (stepIndex: number) => void;
  /** 채택 진행 중인 걸음 인덱스. 그 항목만 비활성·문구 변경. */
  adoptingIndex?: number | null;
  /**
   * 걸음별로 오늘 몇 개 담았는지. BE 는 중복을 막지 않는다(같은 걸음을 두 번 하려는 게
   * 정당할 수 있어서) — 막는 대신 몇 개 담겼는지와 다시 누르면 어떻게 되는지를 알린다.
   */
  adoptedCounts?: Record<number, number>;
}

// 코드·표처럼 넓은 요소는 자기 컨테이너에서만 가로 스크롤 — 본문(모바일)이 가로로 밀리지 않게.
const scrollX: React.CSSProperties = { overflowX: 'auto', maxWidth: '100%' };

// 첫 줄이 헤더와 같은 제목의 H1 이면 제거(중복 표시 방지). 다르면 그대로 둔다.
function stripLeadingTitle(md: string, title: string): string {
  const m = md.match(/^\s*#\s+(.+?)\s*(?:\n|$)/);
  if (!m) return md;
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return norm(m[1]) === norm(title) ? md.slice(m[0].length) : md;
}

export function ResourceViewerSheet({
  title,
  markdown,
  error,
  onClose,
  steps = [],
  onAdoptStep,
  adoptingIndex = null,
  adoptedCounts = {},
}: ResourceViewerSheetProps) {
  const bodyMd = markdown === null ? null : stripLeadingTitle(markdown, title);
  return (
    <div
      onClick={onClose}
      style={{ position: 'absolute', inset: 0, background: 'rgba(26,23,20,.45)', zIndex: 60, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ background: 'var(--surface-raised)', width: '100%', borderRadius: '24px 24px 0 0', padding: '12px 20px 36px', boxShadow: 'var(--shadow-xl)', maxHeight: '82%', overflowY: 'auto' }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 9999, background: 'var(--sand-300)', margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-0.01em', fontFamily: 'var(--font-display)' }}>{title}</h3>
          <button
            onClick={onClose}
            aria-label="닫기"
            style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 9999, border: 'none', background: 'var(--sand-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >
            <X size={12} color="var(--text-2)" />
          </button>
        </div>

        {/* 자료 마크다운은 보통 문서 제목 H1 으로 시작한다. 시트 헤더에 이미 같은 제목이
            있으므로 첫 줄이 그 H1 이면 중복 표시를 피해 본문에서 덜어낸다. */}
        {error ? (
          <div role="alert" style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--coral-50)', border: '1px solid var(--coral-200)', fontSize: 13, color: 'var(--danger-ink)', lineHeight: 1.6 }}>
            {error}
          </div>
        ) : bodyMd === null ? (
          <ResourceSkeleton />
        ) : (
          <div style={{ fontSize: 14, lineHeight: 1.75, color: 'var(--text-1)' }}>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => <h1 style={{ fontSize: 20, fontWeight: 800, margin: '18px 0 8px', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>{children}</h1>,
                h2: ({ children }) => <h2 style={{ fontSize: 17, fontWeight: 700, margin: '18px 0 8px', fontFamily: 'var(--font-display)' }}>{children}</h2>,
                h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 700, margin: '14px 0 6px' }}>{children}</h3>,
                p: ({ children }) => <p style={{ margin: '0 0 12px' }}>{children}</p>,
                ul: ({ children }) => <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ul>,
                ol: ({ children }) => <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ol>,
                li: ({ children }) => <li style={{ margin: '0 0 5px' }}>{children}</li>,
                strong: ({ children }) => <strong style={{ fontWeight: 700, color: 'var(--text-1)' }}>{children}</strong>,
                blockquote: ({ children }) => (
                  <blockquote style={{ margin: '0 0 12px', padding: '8px 14px', borderLeft: '3px solid var(--sand-300)', background: 'var(--sand-50)', color: 'var(--text-2)', borderRadius: '0 8px 8px 0' }}>{children}</blockquote>
                ),
                hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--sand-200)', margin: '18px 0' }} />,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand-ink)', textDecoration: 'underline', wordBreak: 'break-all' }}>{children}</a>
                ),
                code: ({ children, className }) => {
                  // 인라인 코드는 pill, 블록 코드는 pre 안에서 스크롤(아래 pre 참고).
                  const isBlock = typeof className === 'string' && className.startsWith('language-');
                  if (isBlock) return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5 }}>{children}</code>;
                  return <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12.5, background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 5, padding: '1px 5px' }}>{children}</code>;
                },
                pre: ({ children }) => (
                  <pre style={{ ...scrollX, margin: '0 0 12px', padding: '12px 14px', background: 'var(--sand-100)', border: '1px solid var(--sand-200)', borderRadius: 10, lineHeight: 1.6 }}>{children}</pre>
                ),
                table: ({ children }) => (
                  <div style={{ ...scrollX, margin: '0 0 12px' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: '100%' }}>{children}</table>
                  </div>
                ),
                th: ({ children }) => <th style={{ textAlign: 'left', fontWeight: 700, padding: '7px 10px', borderBottom: '2px solid var(--sand-200)', whiteSpace: 'nowrap' }}>{children}</th>,
                td: ({ children }) => <td style={{ padding: '7px 10px', borderBottom: '1px solid var(--sand-200)', verticalAlign: 'top' }}>{children}</td>,
                img: ({ src, alt }) => (
                  <img src={typeof src === 'string' ? src : undefined} alt={alt ?? ''} style={{ maxWidth: '100%', height: 'auto', borderRadius: 10, margin: '0 0 12px' }} />
                ),
              }}
            >
              {bodyMd}
            </ReactMarkdown>
          </div>
        )}

        {/* 자료의 '한 걸음' — 읽고 끝나는 걸 막는 출구.
            본문을 다 읽은 자리에 두어야 "그래서 뭘 하지" 에 바로 답이 된다.
            로딩 중이거나 에러면 그리지 않는다(고를 것이 없으므로). */}
        {!error && bodyMd !== null && steps.length > 0 && onAdoptStep && (
          <div style={{ marginTop: 22, paddingTop: 18, borderTop: '1px solid var(--sand-200)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)', marginBottom: 4 }}>
              이 중 하나 해볼까요?
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              고르면 오늘 할 일로 담아둘게요. 자료는 그대로 남아 있어요.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {steps.map((step, i) => {
                const busy = adoptingIndex === i;
                const count = adoptedCounts[i] ?? 0;
                const done = count > 0;
                // 다른 걸음을 채택하는 중엔 전부 잠근다 — 연타로 카드가 여러 개 생기는 걸 막는다.
                const locked = adoptingIndex !== null && !busy;
                return (
                  <button
                    key={i}
                    onClick={() => onAdoptStep(i)}
                    disabled={busy || locked}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: 12,
                      border: `1px solid ${done ? 'var(--coral-200)' : 'var(--sand-200)'}`,
                      background: done ? 'var(--brand-soft)' : 'var(--surface-raised)',
                      cursor: busy || locked ? 'default' : 'pointer',
                      opacity: locked ? 0.5 : 1,
                      fontFamily: 'inherit',
                      textAlign: 'left',
                      transition: 'opacity 140ms',
                    }}
                  >
                    <span
                      className="tnum"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 9999,
                        flexShrink: 0,
                        marginTop: 1,
                        background: done ? 'var(--brand-surface)' : 'var(--sand-100)',
                        color: done ? '#FFFCF6' : 'var(--text-3)',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {done ? '✓' : i + 1}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-1)', fontWeight: 500 }}>
                        {step}
                      </span>
                      {(busy || done) && (
                        <span style={{ display: 'block', marginTop: 3, fontSize: 11, color: 'var(--brand-ink)', fontWeight: 600 }}>
                          {busy
                            ? '담는 중…'
                            : count > 1
                              ? `오늘 할 일에 ${count}개 담았어요`
                              : '오늘 할 일에 담았어요'}
                        </span>
                      )}
                      {/* 다시 누르면 하나 더 생긴다 — 체크만 두면 '끝났다' 로 읽혀
                          무심코 눌렀을 때 조용히 중복이 생긴다(#191). */}
                      {done && !busy && (
                        <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: 'var(--text-3)' }}>
                          다시 누르면 하나 더 담아요
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceSkeleton(): ReactNode {
  const bar = (w: string, h = 13): React.CSSProperties => ({
    width: w, height: h, borderRadius: 6, background: 'var(--sand-100)', border: '1px solid var(--sand-200)',
  });
  return (
    <div aria-hidden style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 0 8px' }}>
      <div style={bar('55%', 18)} />
      <div style={bar('100%')} />
      <div style={bar('92%')} />
      <div style={bar('78%')} />
      <div style={{ height: 6 }} />
      <div style={bar('45%', 16)} />
      <div style={bar('96%')} />
      <div style={bar('88%')} />
    </div>
  );
}
