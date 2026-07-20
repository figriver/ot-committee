'use client';

import { useState } from 'react';
import Link from 'next/link';
import { StatGraph, type GraphPoint, type GraphNote } from '@/components/stat-graph';
import type { Scale, Rollup } from '@/lib/series';
import type { GroupSource } from '@/lib/groups';

// Slice 2e — the committee board's interactive shell.
//
// Collapse and focus are LOCAL state, not URL state: at the weekly meeting these
// are operated live while the group is being discussed, and a server round-trip
// per toggle would stall the projector. The time scale stays in the URL (it is
// a server read and shareable); this is only about what is on screen.
//
// The group chips do double duty — jump to a group AND focus it (show it alone),
// which is what "go through them area by area" actually needs.

export type CommitteeCard = {
  statId: string;
  title: string;
  subtitle: string;
  historyHref: string;
  hasData: boolean;
  points: GraphPoint[];
  notes: GraphNote[];
  rollup: Rollup;
  rollupNote: string;
};

export type CommitteeGroup = {
  key: string;
  name: string;
  subtitle: string | null;
  source: GroupSource;
  cards: CommitteeCard[];
};

export function CommitteeBoard({
  groups,
  scale,
}: {
  groups: CommitteeGroup[];
  scale: Scale;
}) {
  const [focus, setFocus] = useState<string | null>(null); // null = show all
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const shown = focus ? groups.filter((g) => g.key === focus) : groups;
  const allCollapsed = groups.every((g) => collapsed.has(g.key));

  return (
    <>
      <div className="cm-chips" role="group" aria-label="Jump to a group">
        <button
          type="button"
          className={`cm-chip${focus === null ? ' cm-chip-on' : ''}`}
          aria-pressed={focus === null}
          onClick={() => setFocus(null)}
        >
          All groups
        </button>
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            className={`cm-chip${focus === g.key ? ' cm-chip-on' : ''}`}
            aria-pressed={focus === g.key}
            onClick={() => {
              // Focusing a group also opens it — focusing something collapsed
              // would otherwise show a single closed header and look broken.
              setFocus(focus === g.key ? null : g.key);
              setCollapsed((prev) => {
                const next = new Set(prev);
                next.delete(g.key);
                return next;
              });
            }}
          >
            {g.name}
            <span className="cm-chipcount">{g.cards.length}</span>
          </button>
        ))}
        <button
          type="button"
          className="cm-chip cm-chip-plain"
          onClick={() =>
            setCollapsed(allCollapsed ? new Set() : new Set(groups.map((g) => g.key)))
          }
        >
          {allCollapsed ? 'Expand all' : 'Collapse all'}
        </button>
      </div>

      {shown.map((g) => {
        const isCollapsed = collapsed.has(g.key);
        return (
          <section key={g.key} className="cm-group" id={g.key} data-group={g.key}>
            <div className="cm-grouphead">
              <button
                type="button"
                className="cm-grouptoggle"
                aria-expanded={!isCollapsed}
                aria-controls={`${g.key}-body`}
                onClick={() => toggle(g.key)}
              >
                <span className={`cm-caret${isCollapsed ? '' : ' cm-caret-open'}`} aria-hidden="true">
                  ▸
                </span>
                <span className="cm-groupname">{g.name}</span>
                <span className="cm-groupcount">
                  {g.cards.length} stat{g.cards.length === 1 ? '' : 's'}
                </span>
                {g.source === 'custom' && <span className="cm-groupbadge">custom</span>}
              </button>
              {g.subtitle && <p className="cm-groupsub">{g.subtitle}</p>}
            </div>

            {!isCollapsed && (
              <div className="cm-grid" id={`${g.key}-body`}>
                {g.cards.map((c) => (
                  <section
                    key={c.statId}
                    className={`db-card${c.hasData ? '' : ' db-card-nodata'}`}
                  >
                    <div className="db-cardhead">
                      <div className="db-cardtitle">
                        <h3>{c.title}</h3>
                        <p className="db-cardsub">{c.subtitle}</p>
                      </div>
                      <Link href={c.historyHref} className="db-histlink">
                        History →
                      </Link>
                    </div>
                    <StatGraph
                      unit={c.title}
                      scale={scale}
                      points={c.points}
                      notes={c.notes}
                      rollup={c.rollup}
                      rollupNote={c.rollupNote}
                      // The rollup rule is changed by the stat's holder from its
                      // own History page; the committee view is read-only.
                      canSetRollup={false}
                      statId={c.statId}
                      basePath="/committee"
                      page={0}
                      showControls={false}
                    />
                  </section>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
