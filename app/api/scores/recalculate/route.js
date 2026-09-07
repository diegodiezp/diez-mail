import { NextResponse } from 'next/server';
import { recomputeScores } from '@/lib/recompute-scores';

export const dynamic = 'force-dynamic';

// Manual trigger for engagement scoring. Sits behind the normal app login
// (the middleware guards everything that isn't explicitly public), so no
// separate secret is needed. Returns the full report rather than a bare ok,
// because the whole point is being able to see what happened.
export async function POST() {
  try {
    const report = await recomputeScores();
    return NextResponse.json(report, { status: report.ok ? 200 : 207 });
  } catch (error) {
    console.error('Manual score recalculation error:', error);
    return NextResponse.json(
      { ok: false, stage: 'unhandled', message: error.message },
      { status: 500 }
    );
  }
}
