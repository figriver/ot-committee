'use client';

import { refusalMessage } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import { correctValue, addNote } from '@/app/stats/history/actions';
import { saveAdjustment } from '@/app/stats/actions';
import type { CardEntry } from '@/lib/dashboard';
import type { SubjectType } from '@/lib/history';

// Contextual entry on a My Stats card: update THIS stat's current-week value and
// add a dated note — right on the card whose graph they annotate. No new data
// model: these call the same actions the Enter page and history page use, so the
// lock, effective-holder authz, and adjustable base+manual handling are all
// enforced server-side exactly once.
//
//   plain stat / hours : correctValue(subject, id, currentWeek, value)
//   adjustable stat    : saveAdjustment(id, currentWeek, manual, names, note)
//   note (any)         : addNote(subject, id, date, body, showOnGraph) → marker

type Panel = null | 'update' | 'note';

export function CardControls({
  subjectType,
  subjectId,
  title,
  entry,
}: {
  subjectType: SubjectType;
  subjectId: string;
  title: string;
  entry: CardEntry;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const readOnly = entry.locked;

  return (
    <div className="cc-wrap">
      <div className="cc-bar">
        <button
          type="button"
          className={`cc-tab${panel === 'update' ? ' cc-tab-on' : ''}`}
          aria-expanded={panel === 'update'}
          onClick={() => setPanel(panel === 'update' ? null : 'update')}
        >
          ✎ Update this week
        </button>
        <button
          type="button"
          className={`cc-tab${panel === 'note' ? ' cc-tab-on' : ''}`}
          aria-expanded={panel === 'note'}
          onClick={() => setPanel(panel === 'note' ? null : 'note')}
        >
          ＋ Add note
        </button>
      </div>

      {panel === 'update' &&
        (readOnly ? (
          <p className="cc-locked">
            This week is closed — correct it from the stat’s History page.
          </p>
        ) : entry.isAdjustable ? (
          <AdjustableUpdate subjectId={subjectId} entry={entry} onDone={() => setPanel(null)} />
        ) : (
          <PlainUpdate
            subjectType={subjectType}
            subjectId={subjectId}
            entry={entry}
            onDone={() => setPanel(null)}
          />
        ))}

      {panel === 'note' && (
        <NoteForm
          subjectType={subjectType}
          subjectId={subjectId}
          title={title}
          today={entry.currentWeek}
          onDone={() => setPanel(null)}
        />
      )}
    </div>
  );
}

// ---- plain stat / hours: a single number for the current week ---------------
function PlainUpdate({
  subjectType,
  subjectId,
  entry,
  onDone,
}: {
  subjectType: SubjectType;
  subjectId: string;
  entry: CardEntry;
  onDone: () => void;
}) {
  const [val, setVal] = useState(entry.currentValue ?? '');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const refused = refusalMessage(
          await correctValue(subjectType, subjectId, entry.currentWeek, val),
        );
        if (refused) {
          setError(refused);
          return;
        }
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <div className="cc-panel">
      <label className="cc-field">
        This week’s value <span className="cc-hint">(blank clears it)</span>
        <input
          type="number"
          step="any"
          inputMode="decimal"
          className="cc-input"
          value={val}
          onChange={(e) => {
            setVal(e.target.value);
            setSaved(false);
          }}
          placeholder="value"
        />
      </label>
      {error && <div className="cc-err">{error}</div>}
      <div className="cc-actions">
        <button type="button" className="cc-save" onClick={save} disabled={pending}>
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
        <button type="button" className="cc-cancel" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

// ---- adjustable stat: base (read-only) + manual (+ names) + note ------------
function AdjustableUpdate({
  subjectId,
  entry,
  onDone,
}: {
  subjectId: string;
  entry: CardEntry;
  onDone: () => void;
}) {
  const isNamed = entry.baseKind === 'active_members';
  const [amount, setAmount] = useState(isNamed ? '' : entry.manual ? String(entry.manual) : '');
  const [names, setNames] = useState(entry.names.join('\n'));
  const [note, setNote] = useState(isNamed ? '' : entry.note);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const manualNow = isNamed
    ? new Set(
        names
          .split(/[\n,]+/)
          .map((n) => n.trim().toLowerCase())
          .filter(Boolean),
      ).size
    : Number(amount.trim() || '0') || 0;
  const canSave = !pending && (isNamed || amount.trim() === '' || note.trim() !== '');

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const refused = refusalMessage(
          await saveAdjustment(subjectId, entry.currentWeek, amount, names, note),
        );
        if (refused) {
          setError(refused);
          return;
        }
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <div className="cc-panel">
      <div className="cc-adjline">
        <span>
          Base <strong>{entry.baseKind === 'none' ? '—' : fmt(entry.base)}</strong>
        </span>
        <span>
          + Manual <strong>{fmt(manualNow)}</strong>
        </span>
        <span>
          = <strong className="cc-total">{fmt(entry.base + manualNow)}</strong>
        </span>
      </div>
      {isNamed ? (
        <label className="cc-field">
          Named active people not in the system{' '}
          <span className="cc-hint">(one per line)</span>
          <textarea
            className="cc-textarea"
            rows={2}
            value={names}
            onChange={(e) => {
              setNames(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      ) : (
        <>
          <label className="cc-field">
            Manual{' '}
            <span className="cc-hint">
              {entry.baseKind === 'hours_sum' ? '(unassigned hours)' : '(targets done)'}
            </span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className="cc-input"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="cc-field">
            Note <span className="cc-hint">(required)</span>
            <textarea
              className="cc-textarea"
              rows={2}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
            />
          </label>
        </>
      )}
      {error && <div className="cc-err">{error}</div>}
      <div className="cc-actions">
        <button type="button" className="cc-save" onClick={save} disabled={!canSave}>
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
        <button type="button" className="cc-cancel" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

// ---- dated note → renders as a graph marker (2b/2c) -------------------------
function NoteForm({
  subjectType,
  subjectId,
  title,
  today,
  onDone,
}: {
  subjectType: SubjectType;
  subjectId: string;
  title: string;
  today: string;
  onDone: () => void;
}) {
  const [date, setDate] = useState(today);
  const [body, setBody] = useState('');
  const [onGraph, setOnGraph] = useState(true);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const refused = refusalMessage(
          await addNote(subjectType, subjectId, date, body, onGraph),
        );
        if (refused) {
          setError(refused);
          return;
        }
        setSaved(true);
        setBody('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <div className="cc-panel">
      <p className="cc-notehead">
        Note on <strong>{title}</strong>
        {onGraph ? ' — shows as a marker on this graph' : ''}
      </p>
      <div className="cc-noterow">
        <label className="cc-field cc-field-date">
          Date
          <input
            type="date"
            className="cc-input"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setSaved(false);
            }}
          />
        </label>
        <label className="cc-check">
          <input
            type="checkbox"
            checked={onGraph}
            onChange={(e) => setOnGraph(e.target.checked)}
          />
          Show on graph
        </label>
      </div>
      <label className="cc-field">
        Note
        <textarea
          className="cc-textarea"
          rows={2}
          value={body}
          placeholder="What happened this week?"
          onChange={(e) => {
            setBody(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      {error && <div className="cc-err">{error}</div>}
      <div className="cc-actions">
        <button
          type="button"
          className="cc-save"
          onClick={save}
          disabled={pending || body.trim() === ''}
        >
          {pending ? 'Saving…' : saved ? 'Added ✓' : 'Add note'}
        </button>
        <button type="button" className="cc-cancel" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100);
}
