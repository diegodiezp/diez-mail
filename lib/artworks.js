// lib/artworks.js
// Artwork details (title, artist, year, status, price) for the record IDs
// that viewing-room events carry in "Artwork ID".
//
// Read through the viewing rooms' public, whitelisted proxy
// (rooms.diez.gallery/api/airtable), so this app's Airtable token still
// never touches the inventory base. Images are loaded by the browser from
// rooms.diez.gallery/api/image?id=... (see components/ui.js ArtworkThumb).

const ROOMS = 'https://rooms.diez.gallery/api/airtable';
const ARTWORKS = 'tblK8xDtKmakHWt6k';
const ARTISTS = 'tbl3fHryX8bPSYMyN';
const TTL = 15 * 60 * 1000;

const cache = new Map(); // id -> { ts, value }
const artistCache = new Map();

const isRecId = (id) => /^rec[A-Za-z0-9]{14}$/.test(String(id || ''));

async function proxyFetch(table, ids) {
  const formula = `OR(${ids.map((id) => `RECORD_ID()="${id}"`).join(',')})`;
  const url = `${ROOMS}?path=${table}&filterByFormula=${encodeURIComponent(formula)}&maxRecords=${ids.length}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`rooms proxy ${res.status}`);
  const data = await res.json();
  return data.records || [];
}

async function resolveArtists(ids) {
  const missing = [...new Set(ids)].filter((id) => isRecId(id) && !artistCache.has(id));
  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    try {
      const rows = await proxyFetch(ARTISTS, chunk);
      for (const r of rows) artistCache.set(r.id, r.fields?.Name || '');
    } catch (err) {
      console.error('[artworks] artists lookup failed:', err.message);
    }
  }
}

// ids -> Map<id, { id, title, artist, year, status, price }>
export async function getArtworks(ids) {
  const wanted = [...new Set((ids || []).filter(isRecId))];
  const now = Date.now();
  const missing = wanted.filter((id) => !cache.has(id) || now - cache.get(id).ts > TTL);

  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50);
    try {
      const rows = await proxyFetch(ARTWORKS, chunk);
      const artistIds = rows.flatMap((r) => r.fields?.['Artist name'] || []);
      await resolveArtists(artistIds);
      for (const r of rows) {
        const f = r.fields || {};
        const artistId = (f['Artist name'] || [])[0];
        cache.set(r.id, {
          ts: now,
          value: {
            id: r.id,
            title: f.Title || 'Untitled',
            artist: artistId ? artistCache.get(artistId) || '' : '',
            year: f['Year (display)'] || f.Year || '',
            status: f.Status || '',
            price: typeof f['Price €'] === 'number' ? f['Price €'] : null,
          },
        });
      }
      // Remember misses too, so a deleted artwork isn't refetched every time
      for (const id of chunk) if (!cache.has(id)) cache.set(id, { ts: now, value: null });
    } catch (err) {
      console.error('[artworks] lookup failed:', err.message);
    }
  }

  const out = new Map();
  for (const id of wanted) {
    const v = cache.get(id)?.value;
    if (v) out.set(id, v);
  }
  return out;
}

export function formatPrice(n) {
  if (typeof n !== 'number') return '';
  return `€${n.toLocaleString('en-GB')}`;
}
