// lib/botDetection.js
// Filters automated noise out of Email Events before it reaches engagement
// scoring (lib/scoring.js), the campaign stats (app/api/campaigns) and the
// follow-up queue (app/api/followups). Three independent checks:
//
//  1. User Agent. Security scanners and mail-provider proxies (Gmail's image
//     proxy, Yahoo's proxy, Proofpoint/Mimecast/Barracuda, Microsoft
//     Defender Safe Links) fetch the pixel and follow links automatically.
//     Some announce themselves in the User Agent; scripted fetchers
//     (python-requests, curl, headless Chrome) and the fake IE11 that some
//     gateways send are caught here too.
//
//  2. Time since Sent. Many corporate scanners (seen on The Art Newspaper,
//     Frieze and ArtReview in Oct 2026: Azure IPs, ordinary Chrome UAs)
//     open the email and click every link within seconds of delivery, before
//     any human has seen it. Anything that lands less than SCANNER_WINDOW_MS
//     after the Sent event of the same Tracking ID is dropped. A real person
//     opening within the first minute loses at most one Open, which is
//     cheap compared with every scanned inbox looking like a hot lead.
//
//  3. Duplicates. Some clients fire the same pixel or link twice within a
//     few seconds (retries, prefetch-then-real-load). Same Tracking ID +
//     Event Type close together is collapsed to one.
//
// Apple Mail Privacy Protection doesn't announce itself in the User Agent,
// so it slips past check 1, but check 2 catches its delivery-time prefetch
// and check 3 its duplicates. Extend BOT_UA_PATTERNS as you spot new
// scanners in the "User Agent" column of Email Events.

const BOT_UA_PATTERNS = [
  /GoogleImageProxy/i, // Gmail's own image proxy, prefetches the open pixel
  /YahooMailProxy/i, // Yahoo does the same for images and links
  /Proofpoint/i,
  /Mimecast/i,
  /Barracuda/i,
  /Symantec/i,
  /MessageLabs/i,
  /Microsoft-ATP/i, // Defender for Office 365 Safe Attachments
  /SafeLinks/i, // Defender for Office 365 Safe Links
  /python-requests|python-urllib|aiohttp|Go-http-client|okhttp|curl\/|Wget\//i, // scripted fetchers
  /HeadlessChrome|PhantomJS|Puppeteer|Playwright/i, // headless browsers
  /Trident\/7\.0/i, // IE11: nobody reads mail in it in 2026, gateways still fake it
  /bot|crawler|spider|scanner/i, // generic catch-all, kept last on purpose
];

export function isBotUA(userAgent = '') {
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

// Sent events are logged in batches of 10 (lib/resend.js), so a Sent
// timestamp can be up to ~15s later than the real delivery. That is why the
// window is measured from Sent and also covers events that appear to land
// *before* their Sent event.
const SCANNER_WINDOW_MS = 60 * 1000;

// Delivery and bookkeeping events are never noise; everything else is
// engagement and goes through the checks.
const NEVER_FILTERED = new Set([
  'Sent', 'Failed', 'Bounced', 'Complained', 'Followed Up', 'Room Heartbeat',
]);

// Duplicates rarely land more than a few seconds apart; 15s gives headroom
// without risking collapsing two genuinely separate human actions.
const DEDUPE_WINDOW_MS = 15 * 1000;

// Returns the cleaned list plus counts, so callers can log what was removed
// instead of it silently vanishing.
export function filterBotNoise(events) {
  // Tracking ID -> time of its Sent event
  const sentAt = new Map();
  for (const event of events) {
    if (event['Event Type'] === 'Sent' && event['Tracking ID'] && event.Timestamp) {
      sentAt.set(event['Tracking ID'], new Date(event.Timestamp).getTime());
    }
  }

  let botDropped = 0;
  let scannerDropped = 0;
  const afterChecks = events.filter((event) => {
    if (NEVER_FILTERED.has(event['Event Type'])) return true;
    if (isBotUA(event['User Agent'])) {
      botDropped++;
      return false;
    }
    const sent = sentAt.get(event['Tracking ID']);
    if (sent !== undefined && event.Timestamp) {
      const gap = new Date(event.Timestamp).getTime() - sent;
      if (gap < SCANNER_WINDOW_MS) {
        scannerDropped++;
        return false;
      }
    }
    return true;
  });

  const groups = new Map(); // "trackingId|type" -> events[]
  const kept = [];
  for (const event of afterChecks) {
    if (NEVER_FILTERED.has(event['Event Type'])) {
      kept.push(event);
      continue;
    }
    const key = `${event['Tracking ID'] || event['Recipient Email']}|${event['Event Type']}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  let dedupeDropped = 0;
  for (const group of groups.values()) {
    group.sort((a, b) => new Date(a.Timestamp) - new Date(b.Timestamp));
    let anchor = null;
    for (const event of group) {
      const anchorGapMs = anchor ? new Date(event.Timestamp) - new Date(anchor.Timestamp) : Infinity;
      if (anchorGapMs > DEDUPE_WINDOW_MS) {
        kept.push(event);
        anchor = event;
      } else {
        dedupeDropped++;
      }
    }
  }

  // Callers sort by Timestamp themselves where order matters, but keep the
  // newest-first order the rest of the app expects from Airtable.
  kept.sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return { events: kept, botDropped, scannerDropped, dedupeDropped };
}
