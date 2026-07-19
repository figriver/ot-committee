import Link from 'next/link';
import { getDivisions } from '@/lib/data';
import { textOn } from '@/lib/color';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  let divisions;
  let errorMsg: string | null = null;
  try {
    divisions = await getDivisions();
  } catch (e) {
    errorMsg = (e as Error).message;
  }

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>OT Committee Org Board</h1>
        <span className="crumb">Slice 1a · click a division to open it</span>
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--danger)' }}>
          Could not load the board: {errorMsg}
          <br />
          <span className="crumb">
            If the tables don’t exist yet, run the migrations in the Supabase SQL
            editor first.
          </span>
        </p>
      )}

      {!errorMsg && divisions && divisions.length === 0 && (
        <p>
          No board data yet. Run <code>0001_init_schema.sql</code> then{' '}
          <code>0002_seed.sql</code> in the Supabase SQL editor.
        </p>
      )}

      {!errorMsg && divisions && divisions.length > 0 && (
        <div className="card-grid">
          {divisions.map((d) => {
            const color = d.color ?? '#e5e7eb';
            return (
              <Link key={d.id} href={`/board/${d.number}`} className="div-card">
                <div
                  className="flash"
                  style={{ background: color, color: textOn(color) }}
                >
                  <span className="num">Div {d.number}</span>
                  <span>{d.name}</span>
                </div>
                <div className="body">
                  <div className="vfp-label">VFP</div>
                  <div className="vfp-text">
                    {d.vfp ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
