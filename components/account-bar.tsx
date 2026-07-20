import Link from 'next/link';

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
        <Link href="/board" className="acct-link">
          Org Board
        </Link>
        <Link href="/dashboard" className="acct-link">
          My Dashboard
        </Link>
        <Link href="/stats" className="acct-link">
          Stats
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
      <form action="/auth/signout" method="post">
        <button type="submit" className="acct-btn">
          Sign out
        </button>
      </form>
    </div>
  );
}
