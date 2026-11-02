import { NextResponse } from 'next/server';
import { getInterestIndex } from '@/lib/interest';
import { getPeopleIndex } from '@/lib/model';

export const dynamic = 'force-dynamic';

// Works -> the people who looked at them (and who inquired). The question
// this answers: "a new work by X came in / this one is still available,
// who do I write to first?"
export async function GET() {
  try {
    const [index, { byEmail }] = await Promise.all([getInterestIndex(), getPeopleIndex()]);
    const works = index.works.map((w) => ({
      ...w,
      viewers: w.viewers.map((v) => {
        const p = byEmail.get(v.email);
        return {
          ...v,
          personId: p?.id || null,
          name: p?._name || v.email,
          company: p?.Company || '',
          pipeline: p?.Pipeline || '',
          doNotEmail: !!p?.['Do Not Email'],
        };
      }),
    }));
    return NextResponse.json({ works, artists: index.artists });
  } catch (error) {
    console.error('Works API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
