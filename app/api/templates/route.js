import { NextResponse } from 'next/server';
import { getTemplates, createTemplate } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const templates = await getTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { name, subject, body } = await request.json();
    if (!name || !body) {
      return NextResponse.json({ error: 'Name and body are required' }, { status: 400 });
    }
    const template = await createTemplate({ Name: name, Subject: subject || '', Body: body });
    return NextResponse.json({ template });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
