import { NextResponse } from 'next/server';
import { getEventsForCampaign, getPeople, updateRecords, TABLES } from '@/lib/airtable';
import { computeScores } from '@/lib/scoring';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  // Verify Vercel cron secret, same guard as the send-scheduled cron
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [events, people] = await Promise.all([
      getEventsForCampaign(null),
      getPeople(),
    ]);

    const scores = computeScores(events);
    const now = new Date().toISOString();

    // Only write records whose score actually changed, to stay well under
    // Airtable's rate limit on large contact lists.
    const updates = [];
    for (const person of people) {
      if (!person.Email) continue;
      const newScore = scores.get(person.Email) || 0;
      const currentScore = person['Engagement Score'] || 0;
      if (newScore !== currentScore) {
        updates.push({
          id: person.id,
          fields: { 'Engagement Score': newScore, 'Score Updated': now },
        });
      }
    }

    if (updates.length > 0) {
      await updateRecords(TABLES.people, updates);
    }

    return NextResponse.json({ ok: true, updated: updates.length, total: people.length });
  } catch (error) {
    console.error('Update scores cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
