import { NextResponse } from 'next/server';
import { logEmailEvent, updatePerson, getPerson } from '@/lib/airtable';
import { invalidatePeople } from '@/lib/model';

export const dynamic = 'force-dynamic';

function noteDate() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Actions from the Today screen.
//   done    {email, campaignId}                 -> logs "Followed Up"
//   snooze  {email, campaignId, personId, days, label}
//           -> logs "Followed Up" AND sets the person's Next Action to
//              "Follow up: <label>" on today + days, so it comes back on
//              Today as a dated action instead of being forgotten
//   dueDone {personId}                          -> clears Next Action and
//              keeps a line in Notes so there's a record it was done
export async function POST(request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === 'done' || action === 'snooze') {
      const { email, campaignId } = body;
      if (!email || !campaignId) {
        return NextResponse.json({ error: 'email and campaignId are required' }, { status: 400 });
      }
      await logEmailEvent({
        'Event ID': `fup-${campaignId}-${Date.now()}`,
        'Recipient Email': email,
        Campaign: [campaignId],
        'Campaign ID': campaignId,
        'Event Type': 'Followed Up',
        Timestamp: new Date().toISOString(),
      });

      if (action === 'snooze' && body.personId) {
        const days = Math.min(Math.max(parseInt(body.days, 10) || 3, 1), 60);
        const date = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
        const label = String(body.label || 'campaign').slice(0, 120);
        await updatePerson(body.personId, {
          'Next Action': `Follow up: ${label}`,
          'Next Action Date': date,
        });
        invalidatePeople();
        return NextResponse.json({ ok: true, date });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'dueDone') {
      const { personId } = body;
      if (!personId) return NextResponse.json({ error: 'personId is required' }, { status: 400 });
      const person = await getPerson(personId);
      const doneLine = `[${noteDate()}] Done: ${person['Next Action'] || 'next action'}`;
      const notes = person.Notes ? `${doneLine}\n\n${person.Notes}` : doneLine;
      await updatePerson(personId, { 'Next Action': '', 'Next Action Date': null, Notes: notes });
      invalidatePeople();
      return NextResponse.json({ ok: true });
    }

    if (action === 'dueSnooze') {
      const { personId } = body;
      const days = Math.min(Math.max(parseInt(body.days, 10) || 3, 1), 60);
      const date = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
      await updatePerson(personId, { 'Next Action Date': date });
      invalidatePeople();
      return NextResponse.json({ ok: true, date });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('Today action error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
