import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { AccountBar } from '@/components/account-bar';

export const dynamic = 'force-dynamic';

// Admin-only configuration hub. requireAdmin() blocks non-admins server-side,
// so hitting /settings (or its children) directly without admin is rejected.
export default async function SettingsPage() {
  const admin = await requireAdmin();

  const items = [
    {
      href: '/settings/members',
      title: 'Members',
      desc: 'Invite people and manage who can access the board.',
    },
    {
      href: '/settings/stats',
      title: 'Manage Stats',
      desc: 'Create and manage the named production stats on each post.',
    },
    {
      href: '/settings/collection',
      title: 'Collection',
      desc: 'See who has reported for a week and chase up the ones who have not.',
    },
  ];

  return (
    <>
      <AccountBar email={admin.email} isAdmin />
      <div className="set-wrap">
        <div className="set-head">
          <h1>Settings</h1>
          <Link href="/board" className="set-back">
            ← Board
          </Link>
        </div>
        <p className="set-intro">Admin configuration for the OT Committee board.</p>

        <div className="set-grid">
          {items.map((it) => (
            <Link key={it.href} href={it.href} className="set-card">
              <span className="set-card-title">{it.title}</span>
              <span className="set-card-desc">{it.desc}</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
