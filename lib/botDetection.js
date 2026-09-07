// lib/botDetection.js
// Filters automated noise out of Email Events before it reaches engagement
// scoring (lib/scoring.js). Two independent problems, two independent checks:
//
//  1. Security scanners and mail-provider proxies (Gmail's own image proxy,
//     Yahoo's proxy, corporate gateways like Proofpoint/Mimecast/Barracuda,
//     Microsoft Defender Safe Links) fetch the tracking pixel and follow
//     links automatically, often within seconds of Sent, before any human
//     has seen the email. Most of these announce themselves in the User
//     Agent.
//
//  2. Some clients fire the *same* pixel or link twice within a few
//     seconds — retries, prefetch-then-real-load, etc. Same human, same
//     action, just double-logged. This isn't provider-specific, so it's
//     caught by timing (same Tracking ID + Event Type close together)
//     rather than by User Agent.
//
// Neither check is exhaustive, and Apple's Mail Privacy Protection in
// particular doesn't announce itself in the User Agent at all, so it will
// slip past check 1 — but any duplicate it causes still gets caught by
// check 2. Extend BOT_UA_PATTERNS as you spot new scanners in the
// "User Agent" column of Email Events.

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
  /bot|crawler|spider/i, // generic catch-all, kept last on purpose
];

export function isBotUA(userAgent = '') {
  return BOT_UA_PATTERNS.some((re) => re.test(userAgent));
}

// Duplicates rarely land more than a few seconds apart; 15s gives headroom
// without risking collapsing two genuinely separate human actions.
const DEDUPE_WINDOW_MS = 15 * 1000;

// Drops bot-UA events outright, then collapses same "Tracking ID + Event
// Type" duplicates that land within DEDUPE_WINDOW_MS of the nearest kept
// event in their group. Returns the cleaned list plus counts, so callers
// can log what was removed instead of it silently vanishing.
export function filterBotNoise(events) {
  let botDropped = 0;
  const afterUA = events.filter((event) => {
    if (isBotUA(event['User Agent'])) {
      botDropped++;
      return false;
    }
    return true;
  });

  const groups = new Map(); // "trackingId|type" -> events[]
  for (const event of afterUA) {
    const key = `${event['Tracking ID'] || event['Recipient Email']}|${event['Event Type']}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }

  let dedupeDropped = 0;
  const kept = [];
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

  return { events: kept, botDropped, dedupeDropped };
}
