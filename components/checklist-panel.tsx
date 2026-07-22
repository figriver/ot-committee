'use client';

import { useState, useTransition } from 'react';
import { formatShortDate } from '@/lib/calendar';
import type { ChecklistItem, ChecklistItemInput, ChecklistProgress } from '@/lib/checklist';

// THE CHECKLIST UI for the reusable primitive (CHECKLIST.md) — deliberately
// parent-agnostic. It knows nothing about events: it takes items, a progress
// summary, the viewer's rights, and four bound server actions. A Slice 4 project
// screen renders the same component with its own bound actions.
//
// Each row is one person's piece of work: who has it, when it's due, whether
// it's done, and — once ticked — who ticked it and when.

export type ChecklistActions = {
  add: (input: ChecklistItemInput) => Promise<void>;
  toggle: (itemId: string, done: boolean) => Promise<void>;
  remove: (itemId: string) => Promise<void>;
};

export type AssigneeOption = { id: string; label: string };

export function ChecklistPanel({
  items,
  progress,
  canManage,
  assignees,
  actions,
  addLabel = 'Add item',
  emptyHint,
}: {
  items: ChecklistItem[];
  progress: ChecklistProgress;
  canManage: boolean;
  assignees: AssigneeOption[];
  actions: ChecklistActions;
  addLabel?: string;
  emptyHint?: string;
}) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');

  const run = (id: string | null, fn: () => Promise<void>) =>
    start(async () => {
      setBusy(id);
      setError(null);
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That didn’t save.');
      } finally {
        setBusy(null);
      }
    });

  const add = () =>
    run(null, async () => {
      await actions.add({ title, assigneeId: assignee || null, dueDate: due || null });
      setTitle('');
      setDue('');
      // The assignee stays put: a list is usually built person by person.
    });

  return (
    <section className="cl-card">
      <div className="cl-head">
        <h2 className="cl-title">Checklist</h2>
        <div className="cl-progress">
          {progress.total === 0 ? (
            <span className="cl-nodone">nothing yet</span>
          ) : (
            <>
              <span className="cl-count">
                {progress.done} of {progress.total} done
              </span>
              <span className="cl-bar" aria-hidden="true">
                <span className="cl-barfill" style={{ width: `${progress.percent}%` }} />
              </span>
              {progress.overdue > 0 && <span className="cl-overdue">{progress.overdue} overdue</span>}
            </>
          )}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="cl-empty">
          {emptyHint ?? 'No items yet — add what has to get done and who has each piece.'}
        </p>
      ) : (
        <ul className="cl-list">
          {items.map((i) => (
            <li key={i.id} className={rowClass(i)}>
              <button
                type="button"
                className="cl-check"
                role="checkbox"
                aria-checked={i.isDone}
                aria-label={i.isDone ? `Mark “${i.title}” not done` : `Mark “${i.title}” done`}
                disabled={!i.canMarkDone || (pending && busy === i.id)}
                title={
                  i.canMarkDone
                    ? i.isDone
                      ? 'Mark not done'
                      : 'Mark done'
                    : 'Only the person this is assigned to can mark it done'
                }
                onClick={() => run(i.id, () => actions.toggle(i.id, !i.isDone))}
              >
                {i.isDone ? '✓' : ''}
              </button>

              <div className="cl-body">
                <span className="cl-itemtitle">{i.title}</span>
                {i.description && <span className="cl-desc">{i.description}</span>}
                <span className="cl-meta">
                  {i.assigneeName ? (
                    <span className={i.isMine ? 'cl-who cl-mine' : 'cl-who'}>
                      {i.isMine ? `${i.assigneeName} (you)` : i.assigneeName}
                    </span>
                  ) : (
                    <span className="cl-unassigned">Unassigned</span>
                  )}
                  {i.dueDate && !i.isDone && (
                    <span className={i.isOverdue ? 'cl-due cl-dueover' : 'cl-due'}>
                      {i.isOverdue ? 'overdue ' : 'due '}
                      {formatShortDate(i.dueDate)}
                    </span>
                  )}
                  {i.isDone && (
                    <span className="cl-donemeta">
                      done{i.doneByName ? ` by ${i.doneByName}` : ''}
                      {i.doneAt ? ` · ${formatStamp(i.doneAt)}` : ''}
                    </span>
                  )}
                </span>
              </div>

              {canManage && (
                <button
                  type="button"
                  className="cl-del"
                  title="Remove item"
                  aria-label={`Remove “${i.title}”`}
                  disabled={pending && busy === i.id}
                  onClick={() => run(i.id, () => actions.remove(i.id))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="cl-add">
          <input
            className="cl-addtitle"
            placeholder="What has to get done…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) add();
            }}
          />
          <select
            className="cl-addwho"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Assign to"
          >
            <option value="">Unassigned</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="cl-adddue"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            aria-label="Due date"
          />
          <button
            type="button"
            className="cl-addbtn"
            disabled={pending || title.trim() === ''}
            onClick={add}
          >
            {pending && busy === null ? 'Adding…' : addLabel}
          </button>
        </div>
      )}

      {error && <div className="cl-err">{error}</div>}
    </section>
  );
}

function rowClass(i: ChecklistItem): string {
  return ['cl-row', i.isDone ? 'cl-done' : '', i.isOverdue ? 'cl-rowover' : '', i.isMine ? 'cl-rowmine' : '']
    .filter(Boolean)
    .join(' ');
}

function formatStamp(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
