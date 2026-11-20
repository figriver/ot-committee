import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentMember } from '@/lib/auth';
import { buildUplineReport } from '@/lib/upline-report';
import { reportDocx } from '@/lib/report-docx';
import { isWeekEnding, resolveWeekEnding } from '@/lib/week';

export const dynamic = 'force-dynamic';

/**
 * The .docx the operator attaches to the upline email.
 *
 * A route handler rather than a server action: this returns a FILE, and the
 * browser's own download is the right delivery. Admin-only, checked here —
 * a URL is guessable in a way a hidden button is not.
 */
export async function GET(request: NextRequest) {
  const member = await getCurrentMember();
  if (!member) return NextResponse.redirect(new URL('/login', request.url));
  if (member.role !== 'admin') {
    return new NextResponse('Only an admin can download the upline report.', { status: 403 });
  }

  const raw = request.nextUrl.searchParams.get('week') ?? undefined;
  const weekEnding = isWeekEnding(raw ?? '') ? raw! : await resolveWeekEnding(raw);

  const report = await buildUplineReport(weekEnding);
  const buffer = await reportDocx(report);

  const slug = report.orgName.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${slug}-stats-${weekEnding}.docx"`,
      'Cache-Control': 'no-store',
    },
  });
}
