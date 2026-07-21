import Link from 'next/link';

// Sub-nav for the three Wins views (mirrors the Stats sub-nav). Preserves the
// active filters in the query string so switching views keeps your range/area.

export type WinsTab = 'together' | 'area' | 'member';

const TABS: { key: WinsTab; label: string; view: string; hint: string }[] = [
  { key: 'together', label: 'Together', view: 'together', hint: 'Whole stream' },
  { key: 'area', label: 'By Area', view: 'area', hint: 'Grouped for the meeting' },
  { key: 'member', label: 'By Member', view: 'member', hint: 'One person' },
];

export function WinsSubNav({ active, query }: { active: WinsTab; query?: string }) {
  const qs = query ? `&${query}` : '';
  return (
    <nav className="subnav" aria-label="Wins views">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={`/wins?view=${t.view}${qs}`}
          className={`subnav-item${t.key === active ? ' subnav-on' : ''}`}
          aria-current={t.key === active ? 'page' : undefined}
        >
          <span className="subnav-label">{t.label}</span>
          <span className="subnav-hint">{t.hint}</span>
        </Link>
      ))}
    </nav>
  );
}
