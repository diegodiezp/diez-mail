import { NextResponse } from 'next/server';
import { notifyAll } from '@/lib/push';

export const dynamic = 'force-dynamic';

export async function POST() {
  const delivered = await notifyAll({
    title: 'Alerts are on',
    body: 'You will get a notification here when a collector inquires or spends real time in a viewing room.',
    url: '/',
    tag: 'test',
  });
  return NextResponse.json({ delivered });
}
