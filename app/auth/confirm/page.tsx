export const dynamic = 'force-dynamic';

/**
 * Magic-link landing page. The email link points here (a plain GET) — it does
 * NOT verify the token, it just renders a "Continue" button that POSTs to
 * /auth/verify. Verification happens on that POST, so email prefetch/scanners
 * (which GET links but never submit forms) can't burn the one-time token before
 * the real user clicks. A plain HTML form (not a client action) is used so the
 * submit is a full-page navigation and the session cookie is set reliably.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const sp = await searchParams;
  const token_hash = sp.token_hash ?? '';
  const type = sp.type ?? '';
  const valid = Boolean(token_hash && type);

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1 className="auth-title">OT Committee</h1>
        <p className="auth-sub">Confirm your sign-in</p>

        {valid ? (
          <form method="POST" action="/auth/verify" className="auth-form">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <button type="submit" className="auth-btn">
              Continue to the board →
            </button>
            <p className="auth-foot">
              This quick step keeps your one-time login link safe from automated
              email scanners.
            </p>
          </form>
        ) : (
          <div className="auth-alert">
            This login link is invalid or incomplete. Request a new one from the
            login page.
          </div>
        )}
      </div>
    </div>
  );
}
