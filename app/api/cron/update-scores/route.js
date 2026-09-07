import { NextResponse } from 'next/server';
import { recomputeScores } from '@/lib/recompute-scores';

export const dynamic = 'force-dynamic';
// Kept modest on purpose: the Hobby plan caps function duration well below
// the 300s this used to ask for, and the runner has its own internal time
// budget so it returns a report instead of being killed mid-write.
export const maxDuration = 60;

export async function GET(request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const report = await recomputeScores();
    // Logged as a single line so it is greppable in whatever log retention
    // the plan happens to allow.
    console.log('[update-scores]', JSON.stringify(report));
    return NextResponse.json(report);
  } catch (error) {
    console.error('Update scores cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
