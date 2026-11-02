// lib/alerts.js
// What deserves a push notification, and how it reads. Called from the
// public tracking routes; always awaited with a hard time bound inside
// notifyAll, never allowed to throw into the request.

import { getPersonByEmail } from './airtable';
import { notifyAll } from './push';

async function nameFor(email) {
  try {
    const p = await getPersonByEmail(email);
    const name = `${p?.['First Name'] || ''} ${p?.['Last Name'] || ''}`.trim();
    return { name: name || email, id: p?.id || null };
  } catch {
    return { name: email, id: null };
  }
}

export async function alertInquiry({ email, artworkTitle, channel = 'Inquire' }) {
  const { name, id } = await nameFor(email);
  const what = artworkTitle ? `“${artworkTitle}”` : 'a work';
  return notifyAll({
    title: channel === 'WhatsApp' ? `${name} opened WhatsApp` : `${name} inquired`,
    body: channel === 'WhatsApp' ? `About ${what}, from the viewing room.` : `About ${what}. Reply while it's warm.`,
    url: id ? `/contacts/${id}` : '/',
    tag: `inq-${email}`,
  });
}

export async function alertLongVisit({ email, seconds }) {
  const { name, id } = await nameFor(email);
  const minutes = Math.max(1, Math.round(seconds / 60));
  return notifyAll({
    title: `${name} is in the viewing room`,
    body: `${minutes} min of active viewing so far.`,
    url: id ? `/contacts/${id}` : '/',
    tag: `visit-${email}`,
  });
}

export async function alertBoothLead({ name, email, room }) {
  return notifyAll({
    title: 'New booth lead',
    body: `${name || email}${room ? ` · ${room}` : ''}`,
    url: '/fair',
    tag: `lead-${email}`,
  });
}
