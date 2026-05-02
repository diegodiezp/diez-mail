import { NextResponse } from 'next/server';
import { getTemplate, deleteTemplate } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const template = await getTemplate(params.id);
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await deleteTemplate(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
