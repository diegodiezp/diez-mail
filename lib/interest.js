// lib/interest.js
// Who is interested in what. Built from every artwork-level event ever
// logged (Artwork View, Lightbox Open, Inquire Click, WhatsApp Click),
// enriched with inventory details. Powers:
//   - the Works screen (artwork -> people who looked, newest/strongest first)
//   - "Looks at: <artist>" on the people list
//   - the "interested in artist" filter in the composer's segments

import { normEmail } from './airtable';
import { getEventsOfTypes, ARTWORK_TYPES } from './events';
import { getArtworks } from './artworks';
import { filterBotNoise } from './botDetection';

let cache = { ts: 0, promise: null };
const TTL = 5 * 60 * 1000;

const WEIGHT = { 'Artwork View': 1, 'Lightbox Open': 2, 'Inquire Click': 6, 'WhatsApp Click': 6 };

export async function getInterestIndex() {
  if (cache.promise && Date.now() - cache.ts < TTL) return cache.promise;
  const promise = build().catch((err) => {
    cache = { ts: 0, promise: null };
    throw err;
  });
  cache = { ts: Date.now(), promise };
  return promise;
}

async function build() {
  const raw = await getEventsOfTypes(ARTWORK_TYPES, {
    fields: ['Event Type', 'Recipient Email', 'Timestamp', 'Artwork ID', 'Artwork Title', 'Tracking ID', 'User Agent', 'Event ID', 'Campaign ID'],
  });
  const { events } = filterBotNoise(raw);

  const works = new Map(); // key -> { id, title, viewers: Map(email -> {...}) }
  for (const e of events) {
    const key = e['Artwork ID'] || e['Artwork Title'];
    const email = normEmail(e['Recipient Email']);
    if (!key || !email) continue;
    if (!works.has(key)) works.set(key, { id: e['Artwork ID'] || null, title: e['Artwork Title'] || '', viewers: new Map(), last: e.Timestamp });
    const w = works.get(key);
    if (e.Timestamp > w.last) w.last = e.Timestamp;
    if (!w.viewers.has(email)) w.viewers.set(email, { email, views: 0, inquired: false, weight: 0, last: e.Timestamp });
    const v = w.viewers.get(email);
    if (e['Event Type'] === 'Inquire Click' || e['Event Type'] === 'WhatsApp Click') v.inquired = true;
    else v.views++;
    v.weight += WEIGHT[e['Event Type']] || 1;
    if (e.Timestamp > v.last) v.last = e.Timestamp;
  }

  const details = await getArtworks([...works.values()].map((w) => w.id).filter(Boolean));

  const byEmail = new Map(); // email -> { artists: Map(name -> weight), works: [] }
  const list = [];
  for (const w of works.values()) {
    const d = w.id ? details.get(w.id) : null;
    const item = {
      id: w.id,
      title: d?.title || w.title || 'Untitled',
      artist: d?.artist || '',
      year: d?.year || '',
      status: d?.status || '',
      price: d?.price ?? null,
      last: w.last,
      viewers: [...w.viewers.values()].sort((a, b) => (b.inquired - a.inquired) || (b.weight - a.weight)),
    };
    item.inquiries = item.viewers.filter((v) => v.inquired).length;
    item.weight = item.viewers.reduce((s, v) => s + v.weight, 0);
    list.push(item);

    for (const v of item.viewers) {
      if (!byEmail.has(v.email)) byEmail.set(v.email, { artists: new Map(), works: [] });
      const p = byEmail.get(v.email);
      p.works.push(item.id || item.title);
      if (item.artist) p.artists.set(item.artist, (p.artists.get(item.artist) || 0) + v.weight);
    }
  }

  list.sort((a, b) => (b.inquiries - a.inquiries) || (b.weight - a.weight));
  const artists = [...new Set(list.map((w) => w.artist).filter(Boolean))].sort();

  return { works: list, byEmail, artists };
}

// Top artists for one email, strongest first
export function topArtistsFor(index, email, n = 3) {
  const p = index.byEmail.get(normEmail(email));
  if (!p) return [];
  return [...p.artists.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([name]) => name);
}
