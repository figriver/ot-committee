import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDivisionByNumber, getExecTier, getMembersLite } from '@/lib/data';
import { DivisionDetail } from '@/components/board-client';

export const dynamic = 'force-dynamic';

export default async function DivisionPage({
  params,
}: {
  params: Promise<{ division: string }>;
}) {
  const { division: divisionParam } = await params;
  const divisionNumber = Number(divisionParam);
  if (!Number.isInteger(divisionNumber)) notFound();

  let division;
  let exec;
  let members;
  try {
    [division, exec, members] = await Promise.all([
      getDivisionByNumber(divisionNumber),
      getExecTier(),
      getMembersLite(),
    ]);
  } catch (e) {
    return (
      <div className="wrap">
        <div className="ob-topbar">
          <Link href="/board" className="ob-back">
            ← Board
          </Link>
        </div>
        <p style={{ color: 'var(--danger)' }}>
          Could not load this division: {(e as Error).message}
        </p>
      </div>
    );
  }
  if (!division) notFound();

  // The senior box above this division = the executive it is assigned to report to.
  const seniorExec =
    exec.execs.find((e) => e.id === division.head_exec_post_id) ?? null;

  return (
    <DivisionDetail
      division={division}
      seniorExec={seniorExec}
      seniorRole="Reports to"
      members={members}
    />
  );
}
