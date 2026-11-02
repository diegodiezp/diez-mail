import { NextResponse } from 'next/server';
import { fetchAll, base, TABLES } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

// Saved recipient filters for the composer (table "Segments").
export async function GET() {
  try {
    const rows = await fetchAll(TABLES.segments, { maxRecords: 500, sort: [{ field: 'Name', direction: 'asc' }] });
    const segments = rows.map((r) => {
      let filters = {};
      try { filters = JSON.parse(r.Filters || '{}'); } catch { /* keep empty */ }
      return { id: r.id, name: r.Name || 'Untitled', filters };
    });
    return NextResponse.json({ segments });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name, filters } = await request.json();
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    const rec = await base(TABLES.segments).create({ Name: name.trim().slice(0, 120), Filters: JSON.stringify(filters || {}) });
    return NextResponse.json({ segment: { id: rec.id, name: rec.fields.Name, filters } });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { id } = await request.json();
    if (!/^rec[A-Za-z0-9]{14}$/.test(id || '')) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    await base(TABLES.segments).destroy(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
