import Link from 'next/link';
import { requireAdmin } from '@/lib/auth';
import { getServiceClient } from '@/lib/supabase/server';
import { AccountBar } from '@/components/account-bar';
import { InviteForm } from './invite-form';
import { setMemberRole, setMemberName } from './actions';
import type { Member } from '@/lib/types';
import { memberDisplayNames } from '@/lib/member-names';

export const dynamic = 'force-dynamic';

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; role?: string; named?: string }>;
}) {
  const admin = await requireAdmin();
  const sp = await searchParams;

  const svc = getServiceClient();
  const { data } = await svc
    .from('members')
    .select('id, name, email, role, status, auth_uid')
    .order('role', { ascending: false }) // admins first
    .order('email', { ascending: true });
  const members = (data ?? []) as (Member & { name: string | null })[];
  // What each member currently DISPLAYS as — shown as the input's placeholder
  // so an admin can see the email fallback they are replacing.
  const boardNames = await memberDisplayNames(members.map((m) => m.id));
  const adminCount = members.filter((m) => m.role === 'admin').length;

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
          Invite by email, and promote members to admin (admins can access
          Settings). Only invited emails can request a login link.
        </p>

        {sp.error === 'last_admin' && (
          <div className="members-err">
            Can’t demote the last admin — promote someone else to admin first, so
            there’s always at least one.
          </div>
        )}
        {sp.error && sp.error !== 'last_admin' && (
          <div className="members-err">Couldn’t change that role. Try again.</div>
        )}
        {sp.named && (
          <div className="members-ok">
            Name saved. It shows on bylines, attributions and the chase list.
          </div>
        )}
        {sp.role && (
          <div className="members-ok">
            Role updated to {sp.role}. It takes effect on their next page load.
          </div>
        )}

        <InviteForm />

        <table className="members-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Change role</th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const isSelf = m.id === admin.id;
              const isLastAdmin = m.role === 'admin' && adminCount <= 1;
              return (
                <tr key={m.id}>
                  <td>
                    <form action={setMemberName} className="m-nameform">
                      <input type="hidden" name="member_id" value={m.id} />
                      <input
                        type="text"
                        name="name"
                        className="m-nameinput"
                        defaultValue={m.name ?? ''}
                        placeholder={boardNames.get(m.id) ?? 'Add a name'}
                        maxLength={120}
                        aria-label={`Display name for ${m.email}`}
                      />
                      <button type="submit" className="m-namebtn">
                        Save
                      </button>
                    </form>
                  </td>
                  <td className="m-email">
                    {m.email}
                    {isSelf && <span className="m-you">you</span>}
                  </td>
                  <td>
                    <span className={`m-role m-role-${m.role}`}>{m.role}</span>
                  </td>
                  <td>
                    <span className={`m-status m-status-${m.status}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    <form action={setMemberRole} className="m-roleform">
                      <input type="hidden" name="member_id" value={m.id} />
                      <input
                        type="hidden"
                        name="role"
                        value={m.role === 'admin' ? 'member' : 'admin'}
                      />
                      {m.role === 'admin' ? (
                        <button
                          type="submit"
                          className="m-rolebtn demote"
                          disabled={isLastAdmin}
                          title={
                            isLastAdmin
                              ? 'Can’t demote the last admin'
                              : 'Demote to member'
                          }
                        >
                          Make member
                        </button>
                      ) : (
                        <button type="submit" className="m-rolebtn promote">
                          Make admin
                        </button>
                      )}
                    </form>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 && (
              <tr>
                <td colSpan={5} className="m-empty">
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
