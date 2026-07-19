import { requireMember } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';

export const dynamic = 'force-dynamic';

/**
 * Gate for the whole board. requireMember() redirects to /login unless the
 * request is from a logged-in, allowlisted member. Middleware already blocks
 * anonymous requests; this also blocks a valid session whose email isn't on
 * the allowlist.
 */
export default async function BoardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const member = await requireMember();
  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      {children}
    </>
  );
}
