'use client';

import { refusalMessage } from '@/lib/action-result';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { deleteWin } from '@/app/wins/actions';
import type { Win } from '@/lib/wins';

// The Wins views' client bits: the filter bar (range / area / member, submitted
// via the URL so views + filters are shareable and server-rendered) and the
// per-win row with an owner/admin delete.

export type FilterOpts = {
  areas: { id: string; label: string }[];
  members: { id: string; name: string }[];
};

export function WinsFilterBar({
  view,
  from,
  to,
  areaPostId,
  memberId,
  opts,
}: {
  view: string;
  from: string;
  to: string;
  areaPostId: string;
  memberId: string;
  opts: FilterOpts;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [area, setArea] = useState(areaPostId);
  const [member, setMember] = useState(memberId);

  const apply = () => {
    const q = new URLSearchParams({ view });
    if (f) q.set('from', f);
    if (t) q.set('to', t);
    if (area) q.set('area', area);
    if (member) q.set('member', member);
    router.push(`/wins?${q.toString()}`);
  };
  const clear = () => router.push(`/wins?view=${view}`);
  const hasFilter = f || t || area || (member && view !== 'member');

  return (
    <div className="wf-bar">
      <label className="wf-field">
        From
        <input type="date" className="wf-input" value={f} onChange={(e) => setF(e.target.value)} />
      </label>
      <label className="wf-field">
        To
        <input type="date" className="wf-input" value={t} onChange={(e) => setT(e.target.value)} />
      </label>
      {view !== 'area' && (
        <label className="wf-field">
          Area
          <select className="wf-input" value={area} onChange={(e) => setArea(e.target.value)}>
            <option value="">All areas</option>
            {opts.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {view !== 'member' && (
        <label className="wf-field">
          Who
          <select className="wf-input" value={member} onChange={(e) => setMember(e.target.value)}>
            <option value="">Everyone</option>
            <option value="unattributed">Unattributed</option>
            {opts.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <button type="button" className="wf-apply" onClick={apply}>
        Apply
      </button>
      {hasFilter && (
        <button type="button" className="wf-clear" onClick={clear}>
          Clear
        </button>
      )}
    </div>
  );
}

export function WinRow({
  win,
  canDelete,
  showMember = true,
  showArea = true,
}: {
  win: Win;
  canDelete: boolean;
  showMember?: boolean;
  showArea?: boolean;
}) {
  const [pending, start] = useTransition();
  const [gone, setGone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (gone) return null;

  return (
    <li className="win-row">
      <div className="win-main">
        <p className="win-body">{win.body}</p>
        <div className="win-meta">
          <span className="win-date">{formatDate(win.winDate)}</span>
          {showMember &&
            (win.isUnattributed ? (
              <span className="win-unattr">unattributed</span>
            ) : (
              <span className="win-who">{win.memberName}</span>
            ))}
          {showArea && win.areaPostId && <span className="win-area">{win.divisionLabel}</span>}
        </div>
      </div>
      {canDelete && (
        <button
          type="button"
          className="win-del"
          disabled={pending}
          title="Remove"
          onClick={() =>
            start(async () => {
              // Hide the row only if the server actually removed it — a refusal
              // ("you can only remove your own wins") comes back as a value now,
              // so an unchecked setGone would hide a win that still exists.
              const refused = refusalMessage(await deleteWin(win.id));
              if (refused) {
                setError(refused);
                return;
              }
              setGone(true);
            })
          }
        >
          ✕
        </button>
      )}
      {error && <p className="win-err">{error}</p>}
    </li>
  );
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
