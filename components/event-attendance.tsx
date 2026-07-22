'use client';

import { useState, useTransition } from 'react';
import { recordAttendance } from '@/app/events/actions';

// Confirms vs. actual attendance — headcounts, recorded by the I/C or an admin,
// visible to everyone. Blank is not zero: blank means "not recorded yet", and
// clearing a field puts it back to that.
//
// These two numbers plus the event's date and board area are exactly what a
// future "well-attended event = a win" promotion needs (see migration 0019).
// Nothing here creates a win — that stays a deliberate act.

export function EventAttendance({
  eventId,
  confirmed,
  attended,
  canManage,
  recordedBy,
  recordedAt,
}: {
  eventId: string;
  confirmed: number | null;
  attended: number | null;
  canManage: boolean;
  recordedBy: string | null;
  recordedAt: string | null;
}) {
  const [c, setC] = useState(confirmed == null ? '' : String(confirmed));
  const [a, setA] = useState(attended == null ? '' : String(attended));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      try {
        await recordAttendance(eventId, c, a);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save that.');
      }
    });

  const showRate = confirmed != null && confirmed > 0 && attended != null;

  return (
    <section className="ea-card">
      <h2 className="ea-title">Turnout</h2>

      {canManage ? (
        <div className="ea-fields">
          <label className="ea-field">
            Confirms
            <input
              className="ea-input"
              inputMode="numeric"
              placeholder="—"
              value={c}
              onChange={(e) => {
                setC(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="ea-field">
            Attended
            <input
              className="ea-input"
              inputMode="numeric"
              placeholder="—"
              value={a}
              onChange={(e) => {
                setA(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <button type="button" className="ea-save" disabled={pending} onClick={save}>
            {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      ) : (
        <div className="ea-readout">
          <div className="ea-stat">
            <span className="ea-num">{confirmed ?? '—'}</span>
            <span className="ea-lab">confirms</span>
          </div>
          <div className="ea-stat">
            <span className="ea-num">{attended ?? '—'}</span>
            <span className="ea-lab">attended</span>
          </div>
        </div>
      )}

      {showRate && (
        <p className="ea-rate">
          {Math.round((attended! / confirmed!) * 100)}% of confirms showed up.
        </p>
      )}
      {recordedBy && recordedAt && (
        <p className="ea-meta">
          Recorded by {recordedBy} · {new Date(recordedAt).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </p>
      )}
      {!canManage && !recordedBy && (
        <p className="ea-meta">Not recorded yet — the I/C or an admin fills this in.</p>
      )}
      {error && <div className="ea-err">{error}</div>}
    </section>
  );
}
