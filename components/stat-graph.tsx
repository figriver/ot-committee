'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { setStatRollup } from '@/app/stats/history/actions';
import type { Scale, Rollup } from '@/lib/series';

// A single-series line chart, hand-drawn in SVG (no chart lib — this codebase
// carries no UI dependencies).
//
// Encoding:
//  * Each SEGMENT is colored by direction: black when the point is >= the one
//    before it, red when it fell. Direction is also carried by the line's own
//    slope, so color is a redundant channel, never the only one.
//  * A period with no value (NR) BREAKS the line — a segment is drawn only
//    between two adjacent periods that both reported. Isolated points still get
//    a dot, so a stat reported every other week is visible rather than blank.
//  * Notes flagged show-on-graph are vertical red bars at their date, with the
//    note text on hover, tap, or keyboard focus.
//
// The values themselves are never gated behind the tooltip: the Values table on
// the same page is the chart's table-view twin.

export type GraphPoint = {
  key: string;
  label: string;
  axisLabel: string;
  value: number | null;
  start: string;
  end: string;
};
export type GraphNote = { id: string; date: string; dateLabel: string; body: string };

type Props = {
  unit: string;
  scale: Scale;
  points: GraphPoint[];
  notes: GraphNote[];
  rollup: Rollup;
  rollupNote: string;
  canSetRollup: boolean;
  statId: string;
  basePath: string;
  page: number;
};

const RISING = '#111827'; // near-black ink
const FALLING = '#b91c1c'; // --danger
const NOTE = '#b91c1c';
const GRID = '#e5e7eb';
const AXIS_TEXT = '#6b7280';

const PAD = { top: 18, right: 18, bottom: 30, left: 46 };
const H = 250;

/** Axis ticks on clean numbers (0 / 25 / 50), ~4 of them. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const span = max - min || Math.abs(max) || 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  // Round the domain OUTWARD to whole steps. Stopping at the last tick <= max
  // would put the domain top below the highest value, and that point would be
  // drawn above the plot and clipped.
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let t = first; t <= last + step * 1e-6; t += step) out.push(Math.round(t * 1e6) / 1e6);
  return out.length >= 2 ? out : [min, max];
}

function fmt(n: number): string {
  return Number.isInteger(n) ? n.toLocaleString('en-US') : String(Math.round(n * 100) / 100);
}

function daysBetween(a: string, b: string): number {
  return (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000;
}

export function StatGraph({
  unit,
  scale,
  points,
  notes,
  rollup,
  rollupNote,
  canSetRollup,
  statId,
  basePath,
  page,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<
    { kind: 'point'; i: number } | { kind: 'note'; id: string } | null
  >(null);
  const [pending, start] = useTransition();

  // On a phone the plot is wider than the screen. Open it at the RIGHT edge —
  // the newest periods are what a reader wants first; left-anchored, the visible
  // window can be entirely empty history and the chart looks broken.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [scale, points.length]);

  const scaleHref = (s: Scale) =>
    `${basePath}?scale=${s}${page ? `&page=${page}` : ''}`;

  const reported = points.filter((p) => p.value != null) as (GraphPoint & { value: number })[];
  const W = Math.max(600, points.length * 26);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = plotW / Math.max(points.length, 1);
  const xOf = (i: number) => PAD.left + (i + 0.5) * band;

  // --- y domain -------------------------------------------------------------
  let ticks: number[] = [0, 1];
  let yOf = (_v: number) => PAD.top + plotH;
  if (reported.length > 0) {
    let lo = Math.min(...reported.map((p) => p.value));
    let hi = Math.max(...reported.map((p) => p.value));
    // Anchor to zero when the data sits near it; otherwise let the range breathe
    // (ticks are labeled, so a non-zero base is stated, not implied).
    if (lo > 0 && lo < hi * 0.5) lo = 0;
    if (lo === hi) {
      lo = Math.min(0, lo - 1);
      hi = hi + 1;
    }
    ticks = niceTicks(lo, hi);
    const yMin = ticks[0];
    const yMax = ticks[ticks.length - 1];
    yOf = (v: number) => PAD.top + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
  }

  // --- segments: only between ADJACENT reported periods ---------------------
  const segments: { x1: number; y1: number; x2: number; y2: number; rising: boolean }[] = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    if (prev.value == null || cur.value == null) continue; // NR breaks the line
    segments.push({
      x1: xOf(i - 1),
      y1: yOf(prev.value),
      x2: xOf(i),
      y2: yOf(cur.value),
      rising: cur.value >= prev.value,
    });
  }

  // --- note markers: positioned by real date inside their period ------------
  const noteMarks = notes
    .map((n) => {
      const i = points.findIndex((p) => n.date >= p.start && n.date <= p.end);
      if (i < 0) return null;
      const span = daysBetween(points[i].start, points[i].end) + 1;
      const frac = span > 0 ? daysBetween(points[i].start, n.date) / span : 0.5;
      return { note: n, x: PAD.left + (i + Math.min(Math.max(frac, 0), 1)) * band };
    })
    .filter(Boolean) as { note: GraphNote; x: number }[];

  // X labels: every Nth period, plus the newest one always (it is the period the
  // reader cares about most). Any strided tick sitting too close to that final
  // label is dropped, otherwise the two overlap and both become unreadable.
  const xTickStride = Math.ceil(points.length / 8);
  const lastIdx = points.length - 1;
  const labelIdx = new Set<number>();
  for (let i = 0; i < points.length; i += xTickStride) labelIdx.add(i);
  for (const i of [...labelIdx]) {
    if (lastIdx - i < xTickStride * 0.6) labelIdx.delete(i);
  }
  labelIdx.add(lastIdx);
  let lastReportedIdx = -1;
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].value != null) {
      lastReportedIdx = i;
      break;
    }
  }

  // Pointer → nearest period index (the reader aims at a date, not at the line).
  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = svg.getBoundingClientRect();
    const xViewBox = ((e.clientX - box.left) / box.width) * W;
    const i = Math.round((xViewBox - PAD.left) / band - 0.5);
    if (i >= 0 && i < points.length) setHover({ kind: 'point', i });
  };

  const hoveredNote =
    hover?.kind === 'note' ? noteMarks.find((m) => m.note.id === hover.id) : undefined;
  const hoveredPoint = hover?.kind === 'point' ? points[hover.i] : undefined;
  const tipX = hoveredNote ? hoveredNote.x : hover?.kind === 'point' ? xOf(hover.i) : 0;

  return (
    <section className="gr-card">
      <div className="gr-controls">
        <div className="gr-scales" role="group" aria-label="Time scale">
          {(['weekly', 'monthly', 'quarterly'] as Scale[]).map((s) => (
            <Link
              key={s}
              href={scaleHref(s)}
              className={`gr-scale${s === scale ? ' gr-scale-on' : ''}`}
              aria-current={s === scale ? 'true' : undefined}
            >
              {s[0].toUpperCase() + s.slice(1)}
            </Link>
          ))}
        </div>
        {canSetRollup && scale !== 'weekly' && (
          <label className="gr-rollup">
            Roll up by
            <select
              className="gr-select"
              value={rollup}
              disabled={pending}
              onChange={(e) => {
                const next = e.target.value as Rollup;
                start(async () => {
                  await setStatRollup(statId, next);
                });
              }}
            >
              <option value="sum">Sum</option>
              <option value="average">Average</option>
              <option value="last">Last value</option>
            </select>
          </label>
        )}
      </div>

      {reported.length === 0 ? (
        <p className="gr-empty">
          Nothing reported in this window yet — once a few periods have values,
          the line appears here.
        </p>
      ) : (
        <>
          <div className="gr-scroll" ref={scrollRef}>
            <div className="gr-plotwrap">
              <svg
                ref={svgRef}
                className="gr-svg"
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                aria-label={`${unit} over time, ${scale}. ${reported.length} periods reported. The table below lists every value.`}
              >
                {/* gridlines + y ticks — hairline, solid, recessive */}
                {ticks.map((t) => (
                  <g key={t}>
                    <line
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={yOf(t)}
                      y2={yOf(t)}
                      stroke={GRID}
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 8}
                      y={yOf(t) + 3.5}
                      textAnchor="end"
                      fontSize={10.5}
                      fill={AXIS_TEXT}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {fmt(t)}
                    </text>
                  </g>
                ))}

                {/* x-axis labels, thinned so they never collide */}
                {points.map((p, i) =>
                  labelIdx.has(i) ? (
                    <text
                      key={p.key}
                      x={xOf(i)}
                      y={H - 10}
                      textAnchor="middle"
                      fontSize={10.5}
                      fill={AXIS_TEXT}
                    >
                      {p.axisLabel}
                    </text>
                  ) : null,
                )}

                {/* note markers: vertical bar + flag, drawn under the data line */}
                {noteMarks.map(({ note, x }) => (
                  <g key={note.id} className="gr-notebar" data-note-date={note.date}>
                    <line
                      x1={x}
                      x2={x}
                      y1={PAD.top}
                      y2={PAD.top + plotH}
                      stroke={NOTE}
                      strokeWidth={1.5}
                      opacity={hover?.kind === 'note' && hover.id === note.id ? 0.95 : 0.55}
                    />
                    <path
                      d={`M ${x} ${PAD.top - 2} L ${x + 7} ${PAD.top + 2.5} L ${x} ${PAD.top + 7} Z`}
                      fill={NOTE}
                    />
                  </g>
                ))}

                {/* crosshair at the hovered period */}
                {hoveredPoint && (
                  <line
                    x1={tipX}
                    x2={tipX}
                    y1={PAD.top}
                    y2={PAD.top + plotH}
                    stroke={AXIS_TEXT}
                    strokeWidth={1}
                    opacity={0.45}
                  />
                )}

                {/* the line: one 2px segment per adjacent reported pair */}
                {segments.map((s, i) => (
                  <line
                    key={i}
                    className="gr-seg"
                    data-dir={s.rising ? 'up' : 'down'}
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke={s.rising ? RISING : FALLING}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                ))}

                {/* dots — 2px surface ring keeps them legible where marks cross */}
                {points.map((p, i) =>
                  p.value == null ? null : (
                    <circle
                      key={p.key}
                      className="gr-dot"
                      cx={xOf(i)}
                      cy={yOf(p.value)}
                      r={hover?.kind === 'point' && hover.i === i ? 5 : 3.5}
                      fill={RISING}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ),
                )}

                {/* the one direct label: the latest value */}
                {lastReportedIdx >= 0 && points[lastReportedIdx].value != null && (
                  // Sits to the right of the point, but flips to the left near the
                  // edge so it is never clipped by the viewBox.
                  <text
                    x={
                      xOf(lastReportedIdx) > W - PAD.right - 44
                        ? xOf(lastReportedIdx) - 9
                        : xOf(lastReportedIdx) + 9
                    }
                    y={yOf(points[lastReportedIdx].value as number) - 7}
                    textAnchor={
                      xOf(lastReportedIdx) > W - PAD.right - 44 ? 'end' : 'start'
                    }
                    fontSize={11.5}
                    fontWeight={700}
                    fill={RISING}
                  >
                    {fmt(points[lastReportedIdx].value as number)}
                  </text>
                )}

                {/* hit layers: the plot for the crosshair… */}
                <rect
                  x={PAD.left}
                  y={PAD.top}
                  width={plotW}
                  height={plotH}
                  fill="transparent"
                  onPointerMove={onMove}
                  onPointerLeave={() => setHover(null)}
                />
                {/* …and a fat, focusable target per note bar (bigger than the mark) */}
                {noteMarks.map(({ note, x }) => (
                  <rect
                    key={note.id}
                    x={x - 12}
                    y={PAD.top}
                    width={24}
                    height={plotH}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`Note ${note.dateLabel}: ${note.body}`}
                    style={{ cursor: 'pointer', outline: 'none' }}
                    onPointerEnter={() => setHover({ kind: 'note', id: note.id })}
                    onPointerDown={() => setHover({ kind: 'note', id: note.id })}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => setHover({ kind: 'note', id: note.id })}
                    onBlur={() => setHover(null)}
                  />
                ))}
              </svg>

              {hover && (
                <div
                  className={`gr-tip${tipX > W * 0.6 ? ' gr-tip-left' : ''}`}
                  style={{ left: `${(tipX / W) * 100}%` }}
                  role="status"
                >
                  {hoveredNote ? (
                    <>
                      <div className="gr-tip-head">{hoveredNote.note.dateLabel}</div>
                      <div className="gr-tip-body">{hoveredNote.note.body}</div>
                    </>
                  ) : hoveredPoint ? (
                    <>
                      <div className="gr-tip-val">
                        {hoveredPoint.value == null ? 'Not reported' : fmt(hoveredPoint.value)}
                      </div>
                      <div className="gr-tip-head">{hoveredPoint.label}</div>
                    </>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          <div className="gr-legend">
            <span className="gr-key">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="17" y2="4" stroke={RISING} strokeWidth="2" />
              </svg>
              Rising or level
            </span>
            <span className="gr-key">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="17" y2="4" stroke={FALLING} strokeWidth="2" />
              </svg>
              Down from previous
            </span>
            {noteMarks.length > 0 && (
              <span className="gr-key">
                <svg width="18" height="10" aria-hidden="true">
                  <line x1="9" y1="0" x2="9" y2="10" stroke={NOTE} strokeWidth="1.5" opacity="0.7" />
                </svg>
                Note
              </span>
            )}
            <span className="gr-rollnote">{rollupNote}</span>
          </div>
        </>
      )}
    </section>
  );
}
