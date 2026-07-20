import Link from 'next/link';

// Sub-navigation for the three Stats surfaces, shown on each of them. The
// top-level "Stats" nav item lands on My Stats (/dashboard); these switch
// between the three. History/graph is a DRILL-IN (click a stat), not a tab here.
//
// `active` is the current surface so the right tab is highlighted without any
// client JS (each page passes its own).

export type StatsTab = 'my' | 'enter' | 'committee';

const TABS: { key: StatsTab; label: string; href: string; hint: string }[] = [
  { key: 'my', label: 'My Stats', href: '/dashboard', hint: 'Your graphs' },
  { key: 'enter', label: 'Enter', href: '/stats', hint: 'Weekly report' },
  { key: 'committee', label: 'Committee', href: '/committee', hint: 'Everyone, grouped' },
];

export function StatsSubNav({ active }: { active: StatsTab }) {
  return (
    <nav className="subnav" aria-label="Stats sections">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
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
