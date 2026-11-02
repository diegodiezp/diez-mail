import { NextResponse } from 'next/server';
import { normEmail, base, TABLES } from '@/lib/airtable';
import { getPeopleIndex, invalidatePeople } from '@/lib/model';
import { getEventsOfTypes } from '@/lib/events';

export const dynamic = 'force-dynamic';

const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

// Data hygiene: the contact problems that cost you (bounces, "Hello ,"
// emails, duplicates that get the same campaign twice).
export async function GET() {
  try {
    const [{ people }, bounces] = await Promise.all([
      getPeopleIndex(),
      getEventsOfTypes(['Bounced', 'Complained'], { fields: ['Event Type', 'Recipient Email', 'Timestamp'] }).catch(() => []),
    ]);

    const slim = (p, extra = {}) => ({ id: p.id, name: p._name, email: p.Email || '', company: p.Company || '', ...extra });
    const noName = [];
    const noEmail = [];
    const badEmail = [];
    const messyEmail = [];
    const noType = [];
    const test = [];
    const byEmail = new Map();

    for (const p of people) {
      const raw = p.Email || '';
      const em = normEmail(raw);
      if (!(p['First Name'] || '').trim()) noName.push(slim(p));
      if (!raw.trim()) noEmail.push(slim(p));
      else if (!EMAIL_RE.test(raw.trim())) badEmail.push(slim(p));
      else if (raw !== raw.trim().toLowerCase()) messyEmail.push(slim(p, { fixed: em }));
      if (p._types.length === 0) noType.push(slim(p));
      if (p._types.includes('Prueba')) test.push(slim(p));
      if (em) {
        if (!byEmail.has(em)) byEmail.set(em, []);
        byEmail.get(em).push(slim(p));
      }
    }
    const duplicates = [...byEmail.entries()].filter(([, list]) => list.length > 1).map(([email, list]) => ({ email, people: list }));

    const bounced = new Map();
    for (const e of bounces) {
      const em = normEmail(e['Recipient Email']);
      if (em) bounced.set(em, e['Event Type']);
    }
    const bouncedNotSuppressed = people
      .filter((p) => bounced.has(normEmail(p.Email)) && !p['Do Not Email'])
      .map((p) => slim(p, { reason: bounced.get(normEmail(p.Email)) }));

    return NextResponse.json({
      total: people.length,
      groups: [
        { key: 'bounced', title: 'Bounced or complained, still emailable', hint: 'They will bounce again and hurt deliverability.', fix: 'suppress', items: bouncedNotSuppressed },
        { key: 'duplicates', title: 'Same email on several records', hint: 'They receive every campaign twice. Merge them in Airtable.', items: duplicates },
        { key: 'noName', title: 'No first name', hint: 'Campaigns greet them with "Hello ,". Add a name or use a fallback.', items: noName },
        { key: 'messyEmail', title: 'Email with spaces or capitals', hint: 'Works, but causes mismatches. One click tidies them.', fix: 'tidy', items: messyEmail },
        { key: 'badEmail', title: 'Email that looks invalid', hint: 'Will fail to send.', items: badEmail },
        { key: 'noEmail', title: 'No email', hint: 'Can only be reached by phone or in person.', items: noEmail },
        { key: 'noType', title: 'No type', hint: 'Invisible to type filters in the composer.', items: noType },
        { key: 'test', title: 'Test records (Prueba)', hint: 'Safe to delete in Airtable once you are done testing.', items: test },
      ],
    });
  } catch (error) {
    console.error('Hygiene API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Bulk fixes: { fix: 'tidy' } lowercases/trims emails; { fix: 'suppress', ids } sets Do Not Email
export async function POST(request) {
  try {
    const { fix, ids } = await request.json();
    const { people } = await getPeopleIndex();
    let updates = [];
    if (fix === 'tidy') {
      updates = people
        .filter((p) => p.Email && p.Email !== p.Email.trim().toLowerCase() && EMAIL_RE.test(p.Email.trim()))
        .map((p) => ({ id: p.id, fields: { Email: p.Email.trim().toLowerCase() } }));
    } else if (fix === 'suppress' && Array.isArray(ids)) {
      const allowed = new Set(people.map((p) => p.id));
      updates = ids.filter((id) => allowed.has(id)).map((id) => ({ id, fields: { 'Do Not Email': true } }));
    } else {
      return NextResponse.json({ error: 'Unknown fix' }, { status: 400 });
    }
    for (let i = 0; i < updates.length; i += 10) {
      await base(TABLES.people).update(updates.slice(i, i + 10));
    }
    invalidatePeople();
    return NextResponse.json({ ok: true, updated: updates.length });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
