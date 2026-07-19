import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDivisionByNumber, getExecTier } from '@/lib/data';
import { sideForDivision, EXEC_SIDES } from '@/lib/board-config';
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
  try {
    [division, exec] = await Promise.all([
      getDivisionByNumber(divisionNumber),
      getExecTier(),
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

  // The senior exec box above this division = the Exec Sec whose side covers it.
  const side = sideForDivision(divisionNumber);
  const seniorExec = exec.execSecs.find((s) => s.side === side) ?? null;
  const seniorRole = `${EXEC_SIDES[side].label} Executive Secretary`;

  return (
    <DivisionDetail division={division} seniorExec={seniorExec} seniorRole={seniorRole} />
  );
}
