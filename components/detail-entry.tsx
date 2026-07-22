'use client';

import { useEffect, useState, useTransition } from 'react';
import { saveEntryWithDetail } from '@/app/stats/detail-actions';
import { specFor, type DetailLineInput, type DetailSpec } from '@/lib/stat-details';
import { refusalMessage } from '@/lib/action-result';

// A stat that owes the report a detail table: its value AND its rows, saved
// together by one action.
//
// `heading` overrides only the LABEL. The member's own hours and the
// committee-wide computed "Hours" are two different stats that would otherwise
// both read "Hours" on this screen; the personal card is titled "My Hours"
// while the stat itself stays "Hours" — it maps to line 9 of the upline report
// and carries the imported history. Stats with no detail_kind stay on the plain weekly
// form — this card only appears where the report demands more than a number.
//
// For a counting stat (Service Starts = 2 means two named starts) the rows FOLLOW
// the value: type 2 and two rows appear. For the rest, rows are added by hand.

const MAX_ROWS = 40; // a typing accident should not render a thousand inputs

function blank(spec: DetailSpec): DetailLineInput {
  return Object.fromEntries(spec.fields.map((f) => [f.key, '']));
}

export function DetailEntryCard({
  subjectType,
  statId,
  statName,
  detailKind,
  weekEnding,
  initialValue,
  initialLines,
  memberId,
  mode = 'report',
  readOnly = false,
  heading,
}: {
  subjectType: 'stat' | 'hours';
  statId: string | null;
  statName: string;
  detailKind: string;
  weekEnding: string;
  initialValue: string;
  initialLines: DetailLineInput[];
  memberId?: string;
  mode?: 'report' | 'correction';
  readOnly?: boolean;
  heading?: string;
}) {
  const spec = specFor(detailKind);
  const [value, setValue] = useState(initialValue);
  const [lines, setLines] = useState<DetailLineInput[]>(
    initialLines.length ? initialLines : spec ? [blank(spec)] : [],
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  // A counting stat's rows are dictated by its value: 3 starts, 3 rows. Typed
  // rows are never dropped silently — only blank ones are trimmed.
  useEffect(() => {
    if (!spec?.countsRows) return;
    const want = Number(value.trim());
    if (!Number.isInteger(want) || want < 0 || want > MAX_ROWS) return;
    setLines((cur) => {
      if (cur.length === want) return cur;
      if (cur.length < want) return [...cur, ...Array.from({ length: want - cur.length }, () => blank(spec))];
      const kept = cur.slice(0, want);
      const dropped = cur.slice(want);
      const anyTyped = dropped.some((l) => Object.values(l).some((v) => v.trim() !== ''));
      return anyTyped ? cur : kept;
    });
  }, [value, spec]);

  if (!spec) return null;

  const setField = (i: number, key: string, v: string) =>
    setLines((cur) => cur.map((l, n) => (n === i ? { ...l, [key]: v } : l)));

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const refused = refusalMessage(
        await saveEntryWithDetail({
          subjectType,
          statId,
          statName,
          weekEnding,
          value,
          lines,
          memberId,
          mode,
        }),
      );
      if (refused) {
        setError(refused);
        return;
      }
      setSaved(true);
    });

  return (
    <section className="de-card">
      <div className="de-head">
        <span className="de-name">{heading ?? statName}</span>
        <span className="de-req">{spec.required ? 'detail required' : 'detail optional'}</span>
      </div>
      <p className="de-hint">{spec.hint}</p>

      <label className="de-valuefield">
        <span className="de-vlabel">{subjectType === 'hours' ? 'Hours this week' : 'Value'}</span>
        <input
          type="number"
          step="any"
          className="de-value"
          value={value}
          disabled={readOnly || pending}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
      </label>

      <div className="de-rows">
        {lines.map((line, i) => (
          <div className="de-row" key={i}>
            <span className="de-rownum" aria-hidden="true">
              {i + 1}
            </span>
            {spec.fields.map((f) => (
              <label className="de-field" key={f.key}>
                <span className="de-flabel">
                  {f.label}
                  {f.required && <span className="de-star"> *</span>}
                </span>
                <input
                  type={f.type === 'number' ? 'number' : 'text'}
                  step={f.type === 'number' ? 'any' : undefined}
                  className="de-input"
                  value={line[f.key] ?? ''}
                  placeholder={f.placeholder}
                  disabled={readOnly || pending}
                  onChange={(e) => {
                    setField(i, f.key, e.target.value);
                    setSaved(false);
                  }}
                />
              </label>
            ))}
            {!readOnly && !spec.countsRows && lines.length > 1 && (
              <button
                type="button"
                className="de-drop"
                aria-label={`Remove ${spec.noun} ${i + 1}`}
                disabled={pending}
                onClick={() => setLines((cur) => cur.filter((_, n) => n !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && !spec.countsRows && lines.length < MAX_ROWS && (
        <button
          type="button"
          className="de-add"
          disabled={pending}
          onClick={() => setLines((cur) => [...cur, blank(spec)])}
        >
          + Add another {spec.noun}
        </button>
      )}
      {!readOnly && spec.countsRows && (
        <p className="de-countnote">
          The number of {spec.nounPlural ?? `${spec.noun}s`} follows the value — change it above
          to add or remove rows.
        </p>
      )}

      {error && <div className="de-err">{error}</div>}

      {!readOnly && (
        <div className="de-actions">
          <button type="button" className="de-save" onClick={save} disabled={pending}>
            {pending ? 'Saving…' : `Save ${heading ?? statName}`}
          </button>
          {saved && !pending && <span className="de-ok">Saved.</span>}
        </div>
      )}
    </section>
  );
}
