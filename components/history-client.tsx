'use client';

import { refusalMessage, type ActionResult } from '@/lib/action-result';
import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  correctValue,
  addNote,
  updateNote,
  deleteNote,
  setNoteShowOnGraph,
} from '@/app/stats/history/actions';
import type { SubjectType } from '@/lib/history';
import type { Scale, Rollup } from '@/lib/series';
import type { Range } from '@/lib/range';
import { StatGraph, type GraphPoint, type GraphNote } from '@/components/stat-graph';

// The value history of one subject (a stat, or a member's hours) as a table:
// one row per reporting week, newest first, each value correctable in place.
// Dates arrive pre-formatted from the server so client and server render the
// same string (a locale format computed in the browser would break hydration).

export type RowView = {
  weekEnding: string; // ISO — what we write back
  label: string; // pre-formatted for display
  value: string | null; // null = not reported
  updatedBy: string | null;
  locked: boolean; // the week closed — read-only except to an admin (override)
};

export type NoteView = {
  id: string;
  noteDate: string;
  dateLabel: string;
  body: string;
  showOnGraph: boolean;
  createdByName: string | null;
  isMine: boolean;
};

type Props = {
  subjectType: SubjectType;
  subjectId: string;
  tab: 'values' | 'notes';
  basePath: string; // e.g. /stats/history/stat/<id>
  page: number;
  hasNewer: boolean;
  hasOlder: boolean;
  unit: string;
  canEdit: boolean;
  isAdmin: boolean;
  today: string; // ISO, server-computed (default date for a new note)
  rows: RowView[];
  notes: NoteView[];
  // graph (2c) — same entries as the table, over a longer window
  scale: Scale;
  seriesPoints: GraphPoint[];
  graphNotes: GraphNote[];
  rollup: Rollup;
  rollupNote: string;
  canSetRollup: boolean;
  lockLabel: string; // e.g. "Wednesday 11:59 PM (America/Chicago)"
  // graph range window (Piece 3)
  range: Range;
  windowFrom: string;
  windowTo: string;
  latestWeek: string;
};

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export function HistoryClient(props: Props) {
  const { tab, basePath, page, scale } = props;
  // Keep the reader's place: switching tabs preserves both the page and the
  // graph's time scale.
  const keep = `${page ? `&page=${page}` : ''}${scale !== 'weekly' ? `&scale=${scale}` : ''}`;
  const tabHref = (t: 'values' | 'notes') => `${basePath}?tab=${t}${keep}`;

  return (
    <>
      <div className="sh-tabs" role="tablist">
        <Link
          href={tabHref('values')}
          className={`sh-tab${tab === 'values' ? ' sh-tab-on' : ''}`}
          role="tab"
          aria-selected={tab === 'values'}
        >
          Values
        </Link>
        <Link
          href={tabHref('notes')}
          className={`sh-tab${tab === 'notes' ? ' sh-tab-on' : ''}`}
          role="tab"
          aria-selected={tab === 'notes'}
        >
          Notes{props.notes.length > 0 ? ` (${props.notes.length})` : ''}
        </Link>
      </div>

      {tab === 'values' ? <ValuesTab {...props} /> : <NotesTab {...props} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

function ValuesTab({
  subjectType,
  subjectId,
  rows,
  unit,
  canEdit,
  basePath,
  page,
  hasNewer,
  hasOlder,
  tab,
  scale,
  seriesPoints,
  graphNotes,
  rollup,
  rollupNote,
  canSetRollup,
  isAdmin,
  lockLabel,
  range,
  windowFrom,
  windowTo,
  latestWeek,
}: Props) {
  const [editingWeek, setEditingWeek] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pageHref = (p: number) =>
    `${basePath}?tab=${tab}${p ? `&page=${p}` : ''}${scale !== 'weekly' ? `&scale=${scale}` : ''}`;

  return (
    <>
      <StatGraph
        unit={unit}
        scale={scale}
        points={seriesPoints}
        notes={graphNotes}
        rollup={rollup}
        rollupNote={rollupNote}
        canSetRollup={canSetRollup}
        statId={subjectId}
        basePath={basePath}
        page={page}
        range={range}
        windowFrom={windowFrom}
        windowTo={windowTo}
        latestWeek={latestWeek}
      />

      {!canEdit && (
        <p className="sh-note-readonly">
          You can view this history, but only the member who holds this post
          {subjectType === 'hours' ? ' (or the member themselves)' : ''} — or an
          admin — can correct it.
        </p>
      )}
      <p className="sh-locknote">
        Weeks close {lockLabel}. A closed week is read-only
        {isAdmin ? ' — as an admin you can still override a locked week, and it records you as the editor.' : '.'}
      </p>
      {error && <div className="sh-err">{error}</div>}

      <table className="sh-table">
        <thead>
          <tr>
            <th>Period Ending</th>
            <th>{unit}</th>
            <th>Updated By</th>
            <th className="sh-th-action">
              <span className="sh-sr">Edit</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <ValueRow
              key={r.weekEnding}
              row={r}
              unit={unit}
              canEdit={canEdit}
              isAdmin={isAdmin}
              editing={editingWeek === r.weekEnding}
              onEdit={() => {
                setError(null);
                setEditingWeek(r.weekEnding);
              }}
              onDone={() => setEditingWeek(null)}
              onError={setError}
              subjectType={subjectType}
              subjectId={subjectId}
            />
          ))}
        </tbody>
      </table>

      <div className="sh-pager">
        {hasNewer ? (
          <Link href={pageHref(page - 1)} className="sh-pagebtn">
            ‹ Newer
          </Link>
        ) : (
          <span className="sh-pagebtn sh-pagebtn-off">‹ Newer</span>
        )}
        <span className="sh-pagelabel">
          {page === 0 ? 'Most recent weeks' : `${page} page${page > 1 ? 's' : ''} back`}
        </span>
        {hasOlder ? (
          <Link href={pageHref(page + 1)} className="sh-pagebtn">
            Older ›
          </Link>
        ) : (
          <span className="sh-pagebtn sh-pagebtn-off">Older ›</span>
        )}
      </div>
    </>
  );
}

function ValueRow({
  row,
  unit,
  canEdit,
  isAdmin,
  editing,
  onEdit,
  onDone,
  onError,
  subjectType,
  subjectId,
}: {
  row: RowView;
  unit: string;
  canEdit: boolean;
  isAdmin: boolean;
  editing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onError: (m: string | null) => void;
  subjectType: SubjectType;
  subjectId: string;
}) {
  const [val, setVal] = useState(row.value ?? '');
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setVal(row.value ?? ''), [row.value]);
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    if (val.trim() === (row.value ?? '')) {
      onDone();
      return;
    }
    start(async () => {
      try {
        const refused = refusalMessage(
          await correctValue(subjectType, subjectId, row.weekEnding, val),
        );
        if (refused) {
          setVal(row.value ?? '');
          onError(refused);
          onDone();
          return;
        }
        onError(null);
        onDone();
      } catch (e) {
        setVal(row.value ?? '');
        onError(messageOf(e));
        onDone();
      }
    });
  };
  const cancel = () => {
    setVal(row.value ?? '');
    onDone();
  };

  return (
    <tr className={row.value == null ? 'sh-tr sh-tr-nr' : 'sh-tr'}>
      <td data-label="Period Ending" className="sh-td-week">
        {row.label}
      </td>
      <td data-label={unit} className="sh-td-value">
        {editing ? (
          <input
            ref={inputRef}
            className="sh-input"
            type="number"
            step="any"
            inputMode="decimal"
            value={val}
            disabled={pending}
            aria-label={`${unit} for week ending ${row.label}`}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              }
            }}
            onBlur={commit}
          />
        ) : row.value == null ? (
          <span className="sh-nr" title="Not reported">
            NR
          </span>
        ) : (
          <span className="sh-value">{row.value}</span>
        )}
      </td>
      <td data-label="Updated By" className="sh-td-by">
        {row.updatedBy ?? <span className="sh-dash">—</span>}
      </td>
      <td className="sh-td-action">
        {editing ? (
          <span className="sh-rowbtns">
            <button
              type="button"
              className="sh-linkbtn"
              disabled={pending}
              // onBlur commits; onMouseDown fires first so the click always lands
              onMouseDown={(e) => e.preventDefault()}
              onClick={commit}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="sh-linkbtn sh-linkbtn-quiet"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancel}
            >
              Cancel
            </button>
          </span>
        ) : row.locked && !(canEdit && isAdmin) ? (
          // Closed week, no override right: say WHY there is no control here.
          <span className="sh-lockchip" title="This week is closed">
            Locked
          </span>
        ) : canEdit ? (
          <button
            type="button"
            className={`sh-linkbtn${row.locked ? ' sh-override' : ''}`}
            onClick={onEdit}
            aria-label={
              row.locked
                ? `Override locked week ending ${row.label}`
                : `Correct week ending ${row.label}`
            }
            title={row.locked ? 'This week is closed — editing it is an admin override' : undefined}
          >
            {row.locked ? 'Override' : row.value == null ? 'Fill in' : 'Correct'}
          </button>
        ) : null}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

function NotesTab({ subjectType, subjectId, notes, canEdit, isAdmin, today }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [body, setBody] = useState('');
  const [onGraph, setOnGraph] = useState(false);
  const [pending, start] = useTransition();

  const submit = () => {
    start(async () => {
      try {
        const refused = refusalMessage(
          await addNote(subjectType, subjectId, date, body, onGraph),
        );
        if (refused) {
          setError(refused);
          return;
        }
        setBody('');
        setOnGraph(false);
        setDate(today);
        setError(null);
      } catch (e) {
        setError(messageOf(e));
      }
    });
  };

  return (
    <>
      {error && <div className="sh-err">{error}</div>}

      {canEdit && (
        <div className="sh-noteform">
          <div className="sh-noteform-row">
            <label className="sh-flabel" htmlFor="note_date">
              Date
            </label>
            <input
              id="note_date"
              className="sh-input sh-input-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <label className="sh-flabel" htmlFor="note_body">
            Note
          </label>
          <textarea
            id="note_body"
            className="sh-textarea"
            rows={3}
            placeholder="What happened this week?"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <label className="sh-check">
            <input
              type="checkbox"
              checked={onGraph}
              onChange={(e) => setOnGraph(e.target.checked)}
            />
            Show on graph
          </label>
          <button
            type="button"
            className="sh-btn"
            onClick={submit}
            disabled={pending || body.trim() === ''}
          >
            {pending ? 'Adding…' : 'Add note'}
          </button>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="sh-empty">
          No notes yet.{canEdit ? ' Add one above to mark what happened on a date.' : ''}
        </p>
      ) : (
        <ul className="sh-notes">
          {notes.map((n) => (
            <NoteItem
              key={n.id}
              note={n}
              canManage={n.isMine || isAdmin}
              onError={setError}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function NoteItem({
  note,
  canManage,
  onError,
}: {
  note: NoteView;
  canManage: boolean;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState(note.noteDate);
  const [body, setBody] = useState(note.body);
  // The checkbox flips optimistically: a fully server-controlled checkbox sits
  // frozen until the action + revalidate round-trips, which reads as broken.
  const [onGraph, setOnGraph] = useState(note.showOnGraph);
  const [pending, start] = useTransition();

  useEffect(() => {
    setDate(note.noteDate);
    setBody(note.body);
  }, [note.noteDate, note.body]);
  useEffect(() => setOnGraph(note.showOnGraph), [note.showOnGraph]);

  const toggleGraph = (next: boolean) => {
    setOnGraph(next);
    start(async () => {
      try {
        const refused = refusalMessage(await setNoteShowOnGraph(note.id, next));
        if (refused) {
          setOnGraph(!next); // roll back the optimistic flip
          onError(refused);
          return;
        }
        onError(null);
      } catch (e) {
        setOnGraph(!next); // roll back the optimistic flip
        onError(messageOf(e));
      }
    });
  };

  const run = (fn: () => Promise<ActionResult | void>) =>
    start(async () => {
      try {
        const refused = refusalMessage(await fn());
        if (refused) {
          onError(refused);
          return; // stay in edit mode with the text intact
        }
        onError(null);
        setEditing(false);
      } catch (e) {
        onError(messageOf(e));
      }
    });

  return (
    <li className="sh-noteitem">
      {editing ? (
        <>
          <input
            className="sh-input sh-input-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <textarea
            className="sh-textarea"
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="sh-rowbtns">
            <button
              type="button"
              className="sh-linkbtn"
              disabled={pending}
              onClick={() => run(() => updateNote(note.id, date, body))}
            >
              {pending ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              className="sh-linkbtn sh-linkbtn-quiet"
              disabled={pending}
              onClick={() => {
                setDate(note.noteDate);
                setBody(note.body);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="sh-notehead">
            <span className="sh-notedate">{note.dateLabel}</span>
            {note.createdByName && (
              <span className="sh-noteby">{note.createdByName}</span>
            )}
          </div>
          <p className="sh-notebody">{note.body}</p>
          <div className="sh-notefoot">
            <label className={`sh-check${canManage ? '' : ' sh-check-off'}`}>
              <input
                type="checkbox"
                checked={onGraph}
                disabled={!canManage}
                onChange={(e) => toggleGraph(e.target.checked)}
              />
              Show on graph
            </label>
            {canManage && (
              <span className="sh-rowbtns">
                <button
                  type="button"
                  className="sh-linkbtn"
                  disabled={pending}
                  onClick={() => setEditing(true)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="sh-linkbtn sh-linkbtn-danger"
                  disabled={pending}
                  onClick={() => run(() => deleteNote(note.id))}
                >
                  Delete
                </button>
              </span>
            )}
          </div>
        </>
      )}
    </li>
  );
}
