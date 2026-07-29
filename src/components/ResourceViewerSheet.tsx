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

export function ResourceViewerSheet({ title, markdown, error, onClose }: ResourceViewerSheetProps) {
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
