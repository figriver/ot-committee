import { getBoardOverview } from '@/lib/data';
import { OverviewBoard } from '@/components/board-client';

export const dynamic = 'force-dynamic';

export default async function BoardPage() {
  let data;
  let errorMsg: string | null = null;
  try {
    data = await getBoardOverview();
  } catch (e) {
    errorMsg = (e as Error).message;
  }

  if (errorMsg) {
    return (
      <div className="wrap">
        <div className="ob-topbar">
          <h1>OT Committee Org Board</h1>
        </div>
        <p style={{ color: 'var(--danger)' }}>Could not load the board: {errorMsg}</p>
      </div>
    );
  }

  if (!data || data.divisions.length === 0) {
    return (
      <div className="wrap">
        <div className="ob-topbar">
          <h1>OT Committee Org Board</h1>
        </div>
        <p>No board data yet. Apply the migrations, then reload.</p>
      </div>
    );
  }

  return <OverviewBoard data={data} />;
}
