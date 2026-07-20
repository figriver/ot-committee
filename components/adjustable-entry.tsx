'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveAdjustment } from '@/app/stats/actions';
import type { AdjustableEntry } from '@/lib/reporting';

// The going-forward manual-adjustment entry for one adjustable stat + week.
//
// The base is computed by the system (read-only); the member enters the MANUAL
// part and a note (required). Total = base + manual, shown live.
//
//   hours_sum / none : a manual amount (number) + a note.
//   active_members   : the NAMES of active people not in the system (one per
//                      line); the manual = the count of distinct names, and the
//                      names ARE the required naming (so no one is double-counted
//                      and it can be reconciled later).
//
// A closed week is read-only unless the viewer is an admin (override), matching
// the rest of the app; the server enforces both the lock and the note.

export function AdjustableEntryCard({
  entry,
  weekEnding,
  locked,
  isAdmin,
}: {
  entry: AdjustableEntry;
  weekEnding: string;
  locked: boolean;
  isAdmin: boolean;
}) {
  const isNamed = entry.baseKind === 'active_members';
  const [amount, setAmount] = useState(entry.hasManual && !isNamed ? String(entry.manual) : '');
  const [names, setNames] = useState(entry.names.join('\n'));
  const [note, setNote] = useState(
    // For named stats the note is auto-composed from the names on save, so we
    // don't prefill the folded "named: …" note back into the box.
    isNamed ? '' : entry.note,
  );
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const readOnly = locked && !isAdmin;

  // Live total from what is on screen.
  const manualNow = isNamed
    ? new Set(
        names
          .split(/[\n,]+/)
          .map((n) => n.trim().toLowerCase())
          .filter(Boolean),
      ).size
    : Number(amount.trim() || '0') || 0;
  const total = entry.base + manualNow;

  const noteRequired = !isNamed; // named stats derive their note from the names
  const canSave =
    !readOnly &&
    !pending &&
    (isNamed ? true : amount.trim() === '' || note.trim() !== '');

  const onSave = () =>
    start(async () => {
      setError(null);
      try {
        await saveAdjustment(entry.statId, weekEnding, amount, names, note);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    });

  return (
    <section className="adj-card">
      <div className="adj-head">
        <div>
          <h3 className="adj-name">{entry.name}</h3>
          <p className="adj-sub">{entry.baseLabel}</p>
        </div>
        <Link href={entry.historyHref} className="adj-hist">
          History →
        </Link>
      </div>

      <div className="adj-breakdown">
        <div className="adj-part">
          <span className="adj-label">Base</span>
          <span className="adj-num">{entry.baseKind === 'none' ? '—' : fmt(entry.base)}</span>
          <span className="adj-hint">system-computed</span>
        </div>
        <span className="adj-op">+</span>
        <div className="adj-part">
          <span className="adj-label">Manual</span>
          <span className="adj-num">{fmt(manualNow)}</span>
          <span className="adj-hint">{isNamed ? 'named people' : 'you enter'}</span>
        </div>
        <span className="adj-op">=</span>
        <div className="adj-part adj-total">
          <span className="adj-label">Total</span>
          <span className="adj-num">{fmt(total)}</span>
        </div>
      </div>

      {isNamed ? (
        <label className="adj-field">
          Named active members not in the system{' '}
          <span className="adj-req">(one per line — these are the required naming)</span>
          <textarea
            className="adj-textarea"
            rows={3}
            placeholder={'e.g.\nJane Public\nJohn Guest'}
            value={names}
            onChange={(e) => {
              setNames(e.target.value);
              setSaved(false);
            }}
            readOnly={readOnly}
          />
        </label>
      ) : (
        <>
          <label className="adj-field">
            Manual amount{' '}
            <span className="adj-req">
              {entry.baseKind === 'hours_sum' ? '(unassigned / non-member hours)' : '(targets done)'}
            </span>
            <input
              type="number"
              step="any"
              inputMode="decimal"
              className="adj-input"
              placeholder="e.g. 12"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setSaved(false);
              }}
              readOnly={readOnly}
            />
          </label>
          <label className="adj-field">
            Note <span className="adj-req">(required — why this adjustment)</span>
            <textarea
              className="adj-textarea"
              rows={2}
              placeholder="e.g. 12 hours logged by two non-member volunteers at the event"
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setSaved(false);
              }}
              readOnly={readOnly}
            />
          </label>
        </>
      )}

      {error && <div className="adj-err">{error}</div>}

      {readOnly ? (
        <p className="adj-locked">This week is closed — ask an admin to correct it.</p>
      ) : (
        <div className="adj-actions">
          <button type="button" className="adj-btn" onClick={onSave} disabled={!canSave}>
            {pending ? 'Saving…' : saved ? 'Saved ✓' : locked ? 'Override & save' : 'Save adjustment'}
          </button>
          {noteRequired && amount.trim() !== '' && note.trim() === '' && (
            <span className="adj-needsnote">A note is required.</span>
          )}
        </div>
      )}
    </section>
  );
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100);
}
