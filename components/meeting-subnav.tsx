import Link from 'next/link';

// Sub-nav for the Meeting area — the top-level "Meeting" holds both the weekly
// meeting surface and the wins/minutes deep-dives, so it doesn't need its own
// top-nav item beyond "Meeting" (keeps the top nav at 4 and off the mobile
// wrap risk). Mirrors the Stats sub-nav.

export type MeetingTab = 'week' | 'wins' | 'minutes' | 'enter';

const TABS: { key: MeetingTab; label: string; href: string; hint: string }[] = [
  { key: 'week', label: 'This Week', href: '/meeting', hint: 'Wins + minutes' },
  { key: 'wins', label: 'Wins', href: '/wins', hint: 'The whole stream' },
  { key: 'minutes', label: 'Minutes', href: '/minutes', hint: 'Past meetings' },
  { key: 'enter', label: 'Enter', href: '/meeting/enter', hint: 'Add wins & minutes' },
];

export function MeetingSubNav({ active }: { active: MeetingTab }) {
  return (
    <nav className="subnav" aria-label="Meeting sections">
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
