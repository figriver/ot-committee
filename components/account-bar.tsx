import Link from 'next/link';

/**
 * Slim account strip shown above the board: who you are, a Members link for
 * admins, and sign-out. Pure server component (the sign-out is a form POST to
 * the /auth/signout route handler), so no client JS is needed.
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
      <span className="acct-email" title={email}>
        {email}
      </span>
      {isAdmin && (
        <span className="acct-role" title="You can invite members">
          admin
        </span>
      )}
      <span className="acct-spacer" />
      {isAdmin && (
        <Link href="/members" className="acct-link">
          Members
        </Link>
      )}
      <form action="/auth/signout" method="post">
        <button type="submit" className="acct-btn">
          Sign out
        </button>
      </form>
    </div>
  );
}
