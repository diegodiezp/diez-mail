import { NextResponse } from 'next/server';
import { getPeople, getPeopleByRole } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const search = searchParams.get('q')?.toLowerCase();

    let people;

    if (type) {
      people = await getPeopleByRole(type);
    } else {
      people = await getPeople();
    }

    // Normalize field names for the frontend
    people = people
      .filter((p) => p.Email)
      .map((p) => ({
        id: p.id,
        name: p['First Name'] || '',
        surname: p['Last Name'] || '',
        fullName: `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim(),
        email: p.Email,
        phone: p.Phone || '',
        city: p.City || '',
        company: p.Company || '',
        type: Array.isArray(p.Type) ? p.Type[0] || '' : p.Type || '',
        notes: p.Notes || '',
        doNotEmail: !!p['Do Not Email'],
      }));

    // Search filter
    if (search) {
      people = people.filter(
        (p) =>
          p.name?.toLowerCase().includes(search) ||
          p.surname?.toLowerCase().includes(search) ||
          p.email?.toLowerCase().includes(search) ||
          p.company?.toLowerCase().includes(search)
      );
    }

    return NextResponse.json({ people, total: people.length });
  } catch (error) {
    console.error('Contacts API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
