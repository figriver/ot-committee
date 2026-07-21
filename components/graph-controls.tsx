'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { type Range, DEFAULT_RANGE, RANGE_PRESETS, RANGE_LABELS } from '@/lib/range';

// Compact dropdowns for the SET-AND-FORGET graph controls (Scale, Range, Group
// by). These were segmented button groups; three of them in a row was a wall of
// pills that wrapped badly on a phone. A dropdown carries its current value in
// the same space as one pill.
//
// What stays visible: the division group CHIPS on the committee board. Those are
// navigation — tapped constantly to move area by area at the meeting — so they
// are deliberately NOT collapsed into a dropdown.
//
// Navigation model is unchanged: every control still writes the URL (shareable,
// server-read). The server pages compute the hrefs, so the URL rules (omit a
// param at its default, preserve the other axes) live in one place per page.

export type ControlOption = { value: string; label: string; href: string };

/** A labelled dropdown that navigates to the chosen option's href. */
export function ControlSelect({
  label,
  value,
  options,
}: {
  label: string;
  value: string;
  options: ControlOption[];
}) {
  const router = useRouter();
  return (
    <label className="ctl">
      <span className="ctl-label">{label}</span>
      <select
        className="ctl-select"
        value={value}
        aria-label={label}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value);
          if (next) router.push(next.href);
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * The Range dropdown: the presets plus a "Custom…" option that reveals From/To
 * inputs on their own row. Rendered as a fragment so the custom row becomes a
 * sibling of the dropdown and wraps onto its own line inside the control row.
 *
 * `params` are the OTHER query params to preserve, already reduced to their
 * non-default form by the page — so the URLs this builds match the ones the
 * page's own href helper builds.
 */
export function RangeSelect({
  value,
  basePath,
  params,
  from,
  to,
  latestWeek,
}: {
  value: Range;
  basePath: string;
  params?: Record<string, string | undefined>;
  from?: string;
  to?: string;
  latestWeek?: string;
}) {
  const router = useRouter();
  const [customOpen, setCustomOpen] = useState(value === 'custom');
  const [cFrom, setCFrom] = useState(from ?? '');
  const [cTo, setCTo] = useState(to ?? '');

  const hrefFor = (r: Range, f?: string, t?: string) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params ?? {})) if (v) sp.set(k, v);
    if (r !== DEFAULT_RANGE) sp.set('range', r);
    if (r === 'custom') {
      if (f) sp.set('from', f);
      if (t) sp.set('to', t);
    }
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const applyCustom = (f: string, t: string) => {
    setCFrom(f);
    setCTo(t);
    // Navigate only with a complete, ordered range; the server clamps "to" to the
    // current week regardless, so the future can never be requested.
    if (f && t && f <= t) router.push(hrefFor('custom', f, t));
  };

  return (
    <>
      <label className="ctl">
        <span className="ctl-label">Range</span>
        <select
          className="ctl-select"
          value={value}
          aria-label="Date range"
          onChange={(e) => {
            const next = e.target.value as Range;
            if (next === 'custom') {
              // Opening the picker is not itself a navigation — a custom window
              // needs both ends before it means anything.
              setCustomOpen(true);
              if (cFrom && cTo && cFrom <= cTo) router.push(hrefFor('custom', cFrom, cTo));
              return;
            }
            setCustomOpen(false);
            router.push(hrefFor(next));
          }}
        >
          {RANGE_PRESETS.map((r) => (
            <option key={r} value={r}>
              {RANGE_LABELS[r]}
            </option>
          ))}
          <option value="custom">{RANGE_LABELS.custom}…</option>
        </select>
      </label>

      {(customOpen || value === 'custom') && (
        <div className="ctl-customrow">
          <label className="ctl-customlbl">
            From
            <input
              type="date"
              className="ctl-customdate"
              value={cFrom}
              max={cTo || latestWeek}
              onChange={(e) => applyCustom(e.target.value, cTo)}
            />
          </label>
          <label className="ctl-customlbl">
            To
            <input
              type="date"
              className="ctl-customdate"
              value={cTo}
              max={latestWeek}
              onChange={(e) => applyCustom(cFrom, e.target.value)}
            />
          </label>
          <span className="ctl-customhint">no future dates</span>
        </div>
      )}
    </>
  );
}
