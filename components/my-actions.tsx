import Link from 'next/link';
import { formatShortDate } from '@/lib/calendar';
import type { MyChecklistItem } from '@/lib/checklist';

// "Assigned to you" — the viewer's open checklist items ACROSS every parent
// type. It reads the primitive, not events: today every row happens to belong to
// an event, and when Slice 4 lands, project and order items appear here with no
// change to this component (each row already carries its own parent noun, name
// and link).
//
// Silent when there's nothing outstanding — an empty nag box is noise.

export function MyActions({ items }: { items: MyChecklistItem[] }) {
  if (items.length === 0) return null;

  return (
    <section className="ma-card">
      <div className="ma-head">
        <h2 className="ma-title">Assigned to you</h2>
        <span className="ma-count">{items.length} open</span>
      </div>
      <ul className="ma-list">
        {items.map((i) => (
          <li key={i.id} className={i.isOverdue ? 'ma-row ma-over' : 'ma-row'}>
            <Link href={i.parentHref} className="ma-link">
              <span className="ma-item">{i.title}</span>
              <span className="ma-parent">
                {i.parentNoun}: {i.parentName}
              </span>
            </Link>
            {i.dueDate && (
              <span className="ma-due">
                {i.isOverdue ? 'overdue ' : 'due '}
                {formatShortDate(i.dueDate)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
