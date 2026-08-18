import type { Task } from '../types';
import { TaskRow } from './TaskRow';

interface TimelineItem {
  task: Task;
  time?: string;
  dur?: string;
  goalLabel?: string;
  goalColor?: { bg: string; bd: string; fg: string };
}

interface TodayTimelineProps {
  items: TimelineItem[];
  onSelect: (id: string) => void;
  onFailedRecover: (id: string, reason: string) => void;
  onPartialRecover: () => void;
}

function statusColor(task: Task): string {
  if (task.status === 'done') return 'var(--success)';
  if (task.status === 'failed') return 'var(--danger)';
  if (task.status === 'in_progress' || task.status === 'partial_done' || task.status === 'recovery_pending') return 'var(--brand)';
  return 'var(--sand-300)';
}

/** 홈 C안의 시간축 목록. 카드 묶음보다 오늘이 어떤 순서로 흐르는지를 먼저 읽게 한다. */
export function TodayTimeline({ items, onSelect, onFailedRecover, onPartialRecover }: TodayTimelineProps) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="today-timeline-title">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <h2 id="today-timeline-title" style={{ margin: 0, fontSize: 14, fontWeight: 750, color: 'var(--text-1)' }}>오늘의 타임라인</h2>
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>시간순</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.map(({ task, time, dur, goalLabel, goalColor }, index) => {
          const shownTime = time ?? task.time;
          const last = index === items.length - 1;
          return (
            <div key={task.id} style={{ display: 'grid', gridTemplateColumns: '46px 18px minmax(0, 1fr)', alignItems: 'stretch' }}>
              <span className="tnum" style={{ paddingTop: 12, paddingRight: 8, textAlign: 'right', fontSize: 11, fontWeight: 650, color: shownTime ? 'var(--text-2)' : 'var(--text-4)' }}>
                {shownTime || '미정'}
              </span>
              <span aria-hidden style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
                {!last && <span style={{ position: 'absolute', top: 19, bottom: -1, width: 1, background: 'var(--sand-200)' }} />}
                <span style={{ zIndex: 1, width: 9, height: 9, marginTop: 15, borderRadius: 9999, background: statusColor(task), boxShadow: '0 0 0 3px var(--surface-ground)' }} />
              </span>
              <div style={{ minWidth: 0, paddingBottom: last ? 0 : 2 }}>
                <TaskRow task={task} time={shownTime} dur={dur} goalLabel={goalLabel} goalColor={goalColor} hideTime
                  onSelect={() => onSelect(task.id)}
                  onFailedRecover={() => onFailedRecover(task.id, task.failReason || '')}
                  onPartialRecover={onPartialRecover}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
