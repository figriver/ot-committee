import Link from 'next/link';

// Sub-nav for the Hatting area. Hatting is one job — "who is hatted on what" —
// with two halves: the hat of a POST (what you do) and the hats every member
// carries whatever they hold. Mirrors the Stats and Meeting sub-navs.

export type HattingTab = 'posts' | 'general';

const TABS: { key: HattingTab; label: string; href: string; hint: string }[] = [
  { key: 'posts', label: 'Post Hats', href: '/hatting', hint: 'Every post’s write-up' },
  { key: 'general', label: 'General Hats', href: '/hatting/general', hint: 'Every member reads' },
];

export function HattingSubNav({ active }: { active: HattingTab }) {
  return (
    <nav className="subnav" aria-label="Hatting sections">
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
