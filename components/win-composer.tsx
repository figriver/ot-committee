'use client';

import { useState, useTransition } from 'react';
import { addWin, addUnattributedWin } from '@/app/wins/actions';

// Add a win: free text + area (a post) + date. Used for a member's own win and
// (mode='unattributed', admin) for good news with no member behind it. The area
// options and a default are passed from the server; a member's default is an
// area they hold.

export type AreaOption = { id: string; label: string };

export function WinComposer({
  mode,
  areaOptions,
  defaultAreaId,
  today,
}: {
  mode: 'member' | 'unattributed';
  areaOptions: AreaOption[];
  defaultAreaId: string;
  today: string;
}) {
  const [body, setBody] = useState('');
  const [area, setArea] = useState(defaultAreaId);
  const [date, setDate] = useState(today);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = () =>
    start(async () => {
      setError(null);
      try {
        if (mode === 'unattributed') await addUnattributedWin(body, area, date);
        else await addWin(body, area, date);
        setBody('');
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add the win.');
      }
    });

  return (
    <div className="wc-card">
      <textarea
        className="wc-body"
        rows={2}
        placeholder={
          mode === 'unattributed'
            ? 'Good news to log for the meeting (no member attached)…'
            : 'A win or result this week…'
        }
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          setSaved(false);
        }}
      />
      <div className="wc-row">
        <label className="wc-field">
          Area
          <select
            className="wc-select"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">(no area)</option>
            {areaOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="wc-field wc-field-date">
          Date
          <input
            type="date"
            className="wc-date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <button
          type="button"
          className="wc-btn"
          onClick={save}
          disabled={pending || body.trim() === ''}
        >
          {pending ? 'Adding…' : saved ? 'Added ✓' : mode === 'unattributed' ? 'Add unattributed win' : 'Add win'}
        </button>
      </div>
      {error && <div className="wc-err">{error}</div>}
      {mode === 'unattributed' && (
        <p className="wc-note">Logged with no member — appears in the stream marked “unattributed”.</p>
      )}
    </div>
  );
}
