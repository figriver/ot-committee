'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateEvent, deleteEvent } from '@/app/events/actions';
import { EVENT_TYPES } from '@/lib/event-types';
import type { Option } from '@/components/event-composer';

// Edit an event's facts, or delete it. Shown only to an admin or the event's
// I/C — and refused server-side for anyone else, so hiding it is cosmetic.
// Deleting takes the checklist with it (DB trigger, migration 0019), which the
// confirm copy says out loud.

export function EventEditor({
  eventId,
  name,
  type,
  eventDate,
  ownerId,
  areaPostId,
  notes,
  memberOptions,
  areaOptions,
}: {
  eventId: string;
  name: string;
  type: string;
  eventDate: string;
  ownerId: string | null;
  areaPostId: string | null;
  notes: string | null;
  memberOptions: Option[];
  areaOptions: Option[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [n, setN] = useState(name);
  const [t, setT] = useState(type);
  const [d, setD] = useState(eventDate);
  const [o, setO] = useState(ownerId ?? '');
  const [ar, setAr] = useState(areaPostId ?? '');
  const [no, setNo] = useState(notes ?? '');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <div className="ee-bar">
        <button type="button" className="ee-open" onClick={() => setOpen(true)}>
          Edit event
        </button>
      </div>
    );
  }

  const save = () =>
    start(async () => {
      setError(null);
      try {
        const result = await updateEvent(eventId, {
          name: n,
          type: t,
          eventDate: d,
          ownerId: o,
          areaPostId: ar,
          notes: no,
        });
        // Check BEFORE closing: a refused edit must keep the form open with
        // what they typed still in it.
        if (!result.ok) {
          setError(result.message);
          return;
        }
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not save the event.');
      }
    });

  const destroy = () =>
    start(async () => {
      setError(null);
      try {
        const result = await deleteEvent(eventId);
        if (!result.ok) {
          setError(result.message);
          return;
        }
        router.push('/events');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not delete the event.');
      }
    });

  return (
    <section className="ee-card">
      <div className="ee-head">
        <h2 className="ee-title">Edit event</h2>
        <button type="button" className="ee-cancel" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>

      <div className="ee-rows">
        <label className="ee-field ee-wide">
          Name
          <input className="ee-input" value={n} onChange={(e) => setN(e.target.value)} />
        </label>
        <label className="ee-field">
          Type
          <select className="ee-input" value={t} onChange={(e) => setT(e.target.value)}>
            {EVENT_TYPES.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ee-field">
          Date
          <input type="date" className="ee-input" value={d} onChange={(e) => setD(e.target.value)} />
        </label>
        <label className="ee-field">
          I/C (owner)
          <select className="ee-input" value={o} onChange={(e) => setO(e.target.value)}>
            <option value="">Unassigned</option>
            {memberOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ee-field ee-wide">
          Board area
          <select className="ee-input" value={ar} onChange={(e) => setAr(e.target.value)}>
            <option value="">(no area)</option>
            {areaOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label className="ee-field ee-wide">
          Notes
          <textarea
            className="ee-textarea"
            rows={3}
            value={no}
            onChange={(e) => setNo(e.target.value)}
          />
        </label>
      </div>

      {error && <div className="ee-err">{error}</div>}

      <div className="ee-actions">
        <button type="button" className="ee-save" disabled={pending || n.trim() === ''} onClick={save}>
          {pending ? 'Saving…' : 'Save changes'}
        </button>
        {confirming ? (
          <span className="ee-confirm">
            Delete this event and its checklist?
            <button type="button" className="ee-yes" disabled={pending} onClick={destroy}>
              Delete
            </button>
            <button type="button" className="ee-no" onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="ee-delete" onClick={() => setConfirming(true)}>
            Delete event
          </button>
        )}
      </div>
    </section>
  );
}
