// lib/scoring.js
// Pure scoring function, no Airtable calls, so it's testable in isolation.
// Used by app/api/cron/update-scores/route.js.

const POINTS = {
  Open: 1,
  Click: 3,
  'Viewing Room Open': 4,
  'Artwork View': 5,
  'Inquire Click': 10,
};

const OPEN_CAP_PER_CAMPAIGN = 5;
const DECAY_AGE_MS = 180 * 24 * 60 * 60 * 1000;
const DECAY_FACTOR = 0.5;

function decayFactor(timestamp, now) {
  const age = now - new Date(timestamp).getTime();
  return age > DECAY_AGE_MS ? DECAY_FACTOR : 1;
}

// events -> Map<email, score>.
// Bounced/Complained zeroes the score outright (suppression itself is set
// separately by the Resend webhook via Do Not Email). Opens are capped per
// campaign before adding to the total; every point value decays to half
// once its event is more than 180 days old.
export function computeScores(events, now = Date.now()) {
  const byEmail = new Map();
  for (const event of events) {
    const email = event['Recipient Email'];
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(event);
  }

  const scores = new Map();

  for (const [email, emailEvents] of byEmail) {
    const hasBounceOrComplaint = emailEvents.some(
      (e) => e['Event Type'] === 'Bounced' || e['Event Type'] === 'Complained'
    );
    if (hasBounceOrComplaint) {
      scores.set(email, 0);
      continue;
    }

    const opensByCampaign = new Map();
    let score = 0;

    for (const event of emailEvents) {
      const type = event['Event Type'];
      const factor = decayFactor(event.Timestamp, now);

      if (type === 'Open') {
        const campaignKey = event['Campaign ID'] || event.Campaign?.[0] || 'unknown';
        const current = opensByCampaign.get(campaignKey) || 0;
        opensByCampaign.set(campaignKey, current + POINTS.Open * factor);
        continue;
      }

      const points = POINTS[type];
      if (points) score += points * factor;
    }

    for (const openTotal of opensByCampaign.values()) {
      score += Math.min(openTotal, OPEN_CAP_PER_CAMPAIGN);
    }

    scores.set(email, Math.round(score * 100) / 100);
  }

  return scores;
}
