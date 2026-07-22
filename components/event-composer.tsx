'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createEvent } from '@/app/events/actions';
import { EVENT_TYPES } from '@/lib/event-types';

// Create an event (admin). Collapsed until asked for, so the calendar stays the
// screen. The area defaults to the Div 4 OT Events post, resolved on the server.

export type Option = { id: string; label: string };

export function EventComposer({
  memberOptions,
  areaOptions,
  defaultAreaId,
  today,
}: {
  memberOptions: Option[];
  areaOptions: Option[];
  defaultAreaId: string;
  today: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('fundraiser');
  const [date, setDate] = useState(today);
  const [owner, setOwner] = useState('');
  const [area, setArea] = useState(defaultAreaId);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button type="button" className="evc-open" onClick={() => setOpen(true)}>
        + New event
      </button>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const id = await createEvent({
          name,
          type,
          eventDate: date,
          ownerId: owner,
          areaPostId: area,
          notes,
        });
        router.push(`/events/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not create the event.');
      }
    });

  return (
    <div className="evc-card">
      <div className="evc-cardhead">
        <h2 className="evc-title">New event</h2>
        <button type="button" className="evc-cancel" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="evc-rows">
        <label className="evc-field evc-wide">
          Name
          <input
            className="evc-input"
            value={name}
            placeholder="e.g. Spring fundraiser dinner"
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="evc-field">
          Type
          <select className="evc-input" value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className="evc-field">
          Date
          <input
            type="date"
            className="evc-input"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <label className="evc-field">
          I/C (owner)
          <select className="evc-input" value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Unassigned</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="evc-field evc-wide">
          Board area
          <select className="evc-input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">(no area)</option>
            {areaOptions.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="evc-field evc-wide">
          Notes <span className="evc-opt">optional</span>
          <textarea
            className="evc-textarea"
            rows={2}
            value={notes}
            placeholder="Anything the team should know…"
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
      </div>

      {error && <div className="evc-err">{error}</div>}

      <div className="evc-actions">
        <button
          type="button"
          className="evc-save"
          disabled={pending || name.trim() === ''}
          onClick={save}
        >
          {pending ? 'Creating…' : 'Create event'}
        </button>
        <span className="evc-hint">You’ll land on the event to build its checklist.</span>
      </div>
    </div>
  );
}
