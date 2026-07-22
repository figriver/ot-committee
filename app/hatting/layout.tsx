import { requireMember } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';

export const dynamic = 'force-dynamic';

/**
 * Gate for the whole Hatting area. requireMember() redirects to /login unless
 * the request is from a logged-in, allowlisted member. Reading is open to every
 * member; the WRITE actions re-check for admin themselves.
 *
 * The sub-nav is rendered per page rather than here, because each page owns
 * which tab is current.
 */
export default async function HattingLayout({ children }: { children: React.ReactNode }) {
  const member = await requireMember();
  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      {children}
    </>
  );
}
