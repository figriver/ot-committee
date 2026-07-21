import Link from 'next/link';
import { requireMember } from '@/lib/auth';
import type { Member } from '@/lib/types';
import { loadHierarchy } from '@/lib/hierarchy';
import { getPostsForPicker } from '@/lib/stats';
import { listWins, winsByArea, membersWithWins, type WinFilters } from '@/lib/wins';
import { asGrain } from '@/lib/area';
import { isWeekEnding } from '@/lib/week';
import { AccountBar } from '@/components/account-bar';
import { WinsSubNav, type WinsTab } from '@/components/wins-subnav';
import { WinsFilterBar, WinRow } from '@/components/wins-client';
import { WinComposer } from '@/components/win-composer';

export const dynamic = 'force-dynamic';

// The Wins / Results feed. Everyone sees all wins; a member adds their own here
// and on the Enter surface; an admin can log an unattributed win. Three views —
// Together (default), By Area (the meeting projection), By Member — share one
// filter bar (range / area / who) driven through the URL.

type SP = { view?: string; from?: string; to?: string; area?: string; member?: string };

function tabOf(v: string | undefined): WinsTab {
  return v === 'area' ? 'area' : v === 'member' ? 'member' : 'together';
}

export default async function WinsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const member = await requireMember();
  const sp = await searchParams;
  const view = tabOf(sp.view);

  const filters: WinFilters = {
    from: sp.from && isWeekEnding(sp.from) ? sp.from : undefined,
    to: sp.to && isWeekEnding(sp.to) ? sp.to : undefined,
    areaPostId: sp.area || undefined,
    memberId: sp.member || undefined,
  };
  // By Member with no member chosen defaults to the viewer.
  if (view === 'member' && !filters.memberId) filters.memberId = member.id;

  const [h, pickerPosts, memberOpts] = await Promise.all([
    loadHierarchy(),
    getPostsForPicker(),
    membersWithWins(),
  ]);
  const areaOptions = pickerPosts.map((p) => ({ id: p.id, label: p.label }));

  // A member's default win area: a post they hold, else none.
  const held = h.postsHeldBy(member.id);
  const defaultAreaId = held[0] ?? '';
  const today = new Date().toISOString().slice(0, 10);

  const carry = new URLSearchParams();
  if (filters.from) carry.set('from', filters.from);
  if (filters.to) carry.set('to', filters.to);
  if (filters.areaPostId) carry.set('area', filters.areaPostId);
  if (sp.member) carry.set('member', sp.member);

  return (
    <>
      <AccountBar email={member.email} isAdmin={member.role === 'admin'} />
      <WinsSubNav active={view} query={carry.toString()} />
      <div className="wins-wrap">
        <div className="wins-head">
          <div>
            <h1>Wins &amp; Results</h1>
            <p className="wins-sub">
              The committee’s good news — dated, tagged to an area, shared with everyone.
            </p>
          </div>
          <Link href="/stats" className="wins-enterlink">
            Report &amp; add wins →
          </Link>
        </div>

        {/* add a win (your own) — quick entry right on the feed */}
        <section className="wins-add">
          <h2 className="wins-addh">Add a win</h2>
          <WinComposer mode="member" areaOptions={areaOptions} defaultAreaId={defaultAreaId} today={today} />
        </section>

        {/* admin: unattributed entry for the meeting */}
        {member.role === 'admin' && (
          <section className="wins-add wins-add-admin">
            <h2 className="wins-addh">Add unattributed win (admin)</h2>
            <WinComposer mode="unattributed" areaOptions={areaOptions} defaultAreaId="" today={today} />
          </section>
        )}

        <WinsFilterBar
          view={view}
          from={filters.from ?? ''}
          to={filters.to ?? ''}
          areaPostId={filters.areaPostId ?? ''}
          memberId={sp.member ?? ''}
          opts={{ areas: areaOptions, members: memberOpts }}
        />

        {view === 'area' ? (
          <ByArea member={member} filters={filters} grain={asGrain(undefined)} />
        ) : view === 'member' ? (
          <ByMember member={member} filters={filters} memberOpts={memberOpts} chosen={filters.memberId!} />
        ) : (
          <Together member={member} filters={filters} />
        )}
      </div>
    </>
  );
}

async function Together({ member, filters }: { member: Member; filters: WinFilters }) {
  const wins = await listWins(member.id, filters);
  return (
    <section>
      <p className="wins-count">{wins.length} win{wins.length === 1 ? '' : 's'}</p>
      {wins.length === 0 ? (
        <p className="wins-empty">No wins match. Add one above, or widen the filters.</p>
      ) : (
        <ul className="win-list">
          {wins.map((w) => (
            <WinRow key={w.id} win={w} canDelete={w.isMine || member.role === 'admin'} />
          ))}
        </ul>
      )}
    </section>
  );
}

async function ByArea({ member, filters, grain }: { member: Member; filters: WinFilters; grain: 'division' | 'department' }) {
  const groups = await winsByArea(member.id, grain, filters);
  if (groups.length === 0) return <p className="wins-empty">No wins match. Add one above, or widen the filters.</p>;
  return (
    <>
      {groups.map((g) => (
        <section key={g.key} className="wins-area">
          <div className="wins-areahead">
            <h2>{g.name}</h2>
            <span className="wins-areacount">{g.wins.length}</span>
          </div>
          <ul className="win-list">
            {g.wins.map((w) => (
              <WinRow key={w.id} win={w} canDelete={w.isMine || member.role === 'admin'} showArea={false} />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

async function ByMember({
  member,
  filters,
  memberOpts,
  chosen,
}: {
  member: Member;
  filters: WinFilters;
  memberOpts: { id: string; name: string }[];
  chosen: string;
}) {
  const wins = await listWins(member.id, filters);
  const who =
    chosen === member.id
      ? 'You'
      : memberOpts.find((m) => m.id === chosen)?.name ?? 'This member';
  return (
    <section>
      <p className="wins-count">
        {who} — {wins.length} win{wins.length === 1 ? '' : 's'}
      </p>
      {wins.length === 0 ? (
        <p className="wins-empty">No wins for {who.toLowerCase()} in this range.</p>
      ) : (
        <ul className="win-list">
          {wins.map((w) => (
            <WinRow key={w.id} win={w} canDelete={w.isMine || member.role === 'admin'} showMember={false} />
          ))}
        </ul>
      )}
    </section>
  );
}
