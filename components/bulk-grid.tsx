'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveBulkStat } from '@/app/stats/bulk/actions';
import type { BulkRow } from '@/lib/bulk';

// Editable grid: rows = stats, columns = recent weeks. Plain stats have editable
// cells; adjustable stats show their computed total read-only and link to their
// card (so the required note is never bypassed). Each cell commits on blur
// through saveBulkStat → correctValue: blank = NR (row deleted), "0" = real zero,
// locked past week = admin override recorded via updated_by.

export type WeekMeta = {
  week: string;
  label: string;
  isCurrent: boolean;
  locked: boolean;
  isOverride: boolean;
};

type CellStatus = 'idle' | 'saving' | 'saved' | 'error';

const cellKey = (statId: string, week: string) => `${statId}|${week}`;

function fmt(v: number | null): string {
  if (v == null) return '';
  return Number.isInteger(v) ? String(v) : String(v);
}

export function BulkGrid({ rows, weeks }: { rows: BulkRow[]; weeks: WeekMeta[] }) {
  // draft = what's in the box; saved = last server-confirmed text. Divergence on
  // blur triggers a save; an error reverts draft back to saved.
  const initial: Record<string, string> = {};
  for (const r of rows) for (const w of weeks) initial[cellKey(r.statId, w.week)] = fmt(r.values[w.week]);

  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [saved, setSaved] = useState<Record<string, string>>(initial);
  const [status, setStatus] = useState<Record<string, CellStatus>>({});
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const setCell = (key: string, val: string) => setDraft((d) => ({ ...d, [key]: val }));
  const setStat = (key: string, s: CellStatus) => setStatus((m) => ({ ...m, [key]: s }));

  const commit = (statId: string, week: string) => {
    const key = cellKey(statId, week);
    const next = (draft[key] ?? '').trim();
    if (next === (saved[key] ?? '')) return; // unchanged
    setStat(key, 'saving');
    startTransition(async () => {
      const res = await saveBulkStat(statId, week, next);
      if (res.ok) {
        setSaved((m) => ({ ...m, [key]: next }));
        setDraft((d) => ({ ...d, [key]: next }));
        setStat(key, 'saved');
        setTimeout(() => setStat(key, 'idle'), 1400);
      } else {
        setDraft((d) => ({ ...d, [key]: saved[key] ?? '' })); // revert
        setErrorMsg((m) => ({ ...m, [key]: res.error ?? 'Save failed.' }));
        setStat(key, 'error');
      }
    });
  };

  return (
    <div className="bulk-scroll">
      <table className="bulk-table">
        <thead>
          <tr>
            <th className="bulk-th-stat">Stat</th>
            {weeks.map((w) => (
              <th key={w.week} className={`bulk-th-week${w.isCurrent ? ' bulk-th-current' : ''}`}>
                <span className="bulk-th-date">{w.label}</span>
                {w.isCurrent ? (
                  <span className="bulk-th-tag bulk-th-tag-current">current</span>
                ) : w.locked ? (
                  <span className="bulk-th-tag bulk-th-tag-locked">override</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.statId} className={r.isAdjustable ? 'bulk-row-adj' : undefined}>
              <th className="bulk-td-stat" scope="row">
                <span className="bulk-statname">{r.name}</span>
                <span className="bulk-statctx">{r.context}</span>
              </th>
              {weeks.map((w) => {
                const key = cellKey(r.statId, w.week);
                if (r.isAdjustable) {
                  const v = r.values[w.week];
                  return (
                    <td key={w.week} className="bulk-cell bulk-cell-adj">
                      <span className="bulk-adjval">{v == null ? '—' : fmt(v)}</span>
                    </td>
                  );
                }
                const st = status[key] ?? 'idle';
                return (
                  <td key={w.week} className={`bulk-cell bulk-cell-${st}`}>
                    <input
                      className="bulk-input"
                      inputMode="decimal"
                      value={draft[key] ?? ''}
                      placeholder="NR"
                      aria-label={`${r.name}, week ending ${w.label}`}
                      title={st === 'error' ? errorMsg[key] : undefined}
                      onChange={(e) => setCell(key, e.target.value)}
                      onBlur={() => commit(r.statId, w.week)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="bulk-adjnote">
        <span className="bulk-adjkey" aria-hidden="true" /> Adjustable stats show their computed
        total and are edited on their{' '}
        <Link href="/dashboard" className="bulk-adjlink">
          card
        </Link>{' '}
        (base + a manual amount with a required note).
      </p>
    </div>
  );
}
