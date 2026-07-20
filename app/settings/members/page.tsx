import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { AccountBar } from '@/components/account-bar';
import { InviteForm } from './invite-form';
import type { Member } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const admin = await requireAdmin();

  const svc = getServiceClient();
  const { data } = await svc
    .from('members')
    .select('id, email, role, status, auth_uid')
    .order('role', { ascending: false }) // admins first
    .order('email', { ascending: true });
  const members = (data ?? []) as Member[];

  return (
    <>
      <AccountBar email={admin.email} isAdmin />
      <div className="members-wrap">
        <div className="members-head">
          <h1>Members</h1>
          <Link href="/settings" className="members-back">
            ← Settings
          </Link>
        </div>

        <p className="members-intro">
          Invite by email. Only invited emails can request a login link — a
          non-invited email that tries to log in gets nothing.
        </p>

        <InviteForm />

        <table className="members-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td className="m-email">{m.email}</td>
                <td>
                  <span className={`m-role m-role-${m.role}`}>{m.role}</span>
                </td>
                <td>
                  <span className={`m-status m-status-${m.status}`}>
                    {m.status}
                  </span>
                </td>
              </tr>
            ))}
            {members.length === 0 && (
              <tr>
                <td colSpan={3} className="m-empty">
                  No members yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
