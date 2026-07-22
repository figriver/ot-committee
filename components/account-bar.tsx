import Link from 'next/link';
import { ThemeToggle } from '@/components/theme-toggle';

/**
 * Slim top nav shown above every signed-in page.
 *
 * Two audiences:
 *  - Members: Org Board + Stats (their own weekly reporting).
 *  - Admins: additionally Settings (Members + Manage Stats live under it).
 *
 * Settings is admin-only here AND server-enforced on the routes (requireAdmin),
 * so hiding it in nav is just cosmetic. Pure server component (sign-out is a form
 * POST to the /auth/signout route handler) — no client JS.
 */
export function AccountBar({
  email,
  isAdmin,
}: {
  email: string;
  isAdmin: boolean;
}) {
  return (
    <div className="acct-bar">
      <span className="acct-brand">OT Committee</span>
      <nav className="acct-nav">
        {/* "Org" is dropped on a phone: six items fit one 375px row as "Board",
            but not as "Org Board" — and a nav that wraps to a second row for a
            single item reads like a mistake. */}
        <Link href="/board" className="acct-link">
          <span className="acct-wide">Org </span>Board
        </Link>
        {/* One Stats top-level → My Stats (the personal dashboard). The three
            stats surfaces (My Stats / Enter / Committee) switch from the
            sub-nav on each screen, not from here. */}
        <Link href="/dashboard" className="acct-link">
          Stats
        </Link>
        <Link href="/meeting" className="acct-link">
          Meeting
        </Link>
        {/* Hatting: the post-hat index + the general (committee-level) hats.
            Lands on Post Hats; the sub-nav switches between the two. */}
        <Link href="/hatting" className="acct-link">
          Hatting
        </Link>
        {/* Events: the calendar + each event's checklist (the reusable
            assignable-action primitive — CHECKLIST.md). */}
        <Link href="/events" className="acct-link">
          Events
        </Link>
        {isAdmin && (
          <Link href="/settings" className="acct-link">
            Settings
          </Link>
        )}
      </nav>
      <span className="acct-spacer" />
      <span className="acct-email" title={email}>
        {email}
      </span>
      {isAdmin && (
        <span className="acct-role" title="Administrator">
          admin
        </span>
      )}
      <ThemeToggle />
      <form action="/auth/signout" method="post">
        <button type="submit" className="acct-btn">
          Sign out
        </button>
      </form>
    </div>
  );
}
