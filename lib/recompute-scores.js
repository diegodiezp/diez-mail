// lib/recompute-scores.js
// Shared runner for engagement scoring, used by both the nightly cron
// (app/api/cron/update-scores) and the manual trigger
// (app/api/scores/recalculate).
//
// Why this exists: the cron writes on a plan with one hour of log retention,
// so when it failed it failed invisibly. Everything here is built to report
// back instead: per-batch error isolation, a step trace, and timings. If a
// batch fails, the batches around it still land, and the report says which
// one broke and why.

import { getPeople, getCampaigns, TABLES, base, normEmail } from '@/lib/airtable';
import { getScoringEvents } from '@/lib/events';
import { computeScores } from '@/lib/scoring';
import { filterBotNoise } from '@/lib/botDetection';

const BATCH_SIZE = 10;

// Safety margin so we return a real report instead of being killed mid-write
// by the platform's function timeout. Whatever is left is picked up on the
// next run, since only changed scores are written.
const DEFAULT_BUDGET_MS = 45_000;

export async function recomputeScores({ budgetMs = DEFAULT_BUDGET_MS } = {}) {
  const startedAt = Date.now();
  const trace = [];
  const errors = [];

  const elapsed = () => Date.now() - startedAt;
  const step = (name, extra = {}) => trace.push({ step: name, at: elapsed(), ...extra });

  let events;
  let people;
  try {
    // 2.0: time-windowed, field-trimmed fetch with no record cap (lib/events.js).
    // 1.x read only the newest 5,000 events, so older engagement silently
    // fell out of every score once the table grew past that.
    [events, people] = await Promise.all([getScoringEvents(), getPeople()]);
  } catch (error) {
    return {
      ok: false,
      stage: 'fetch',
      message: `Could not read from Airtable: ${error.message}`,
      durationMs: elapsed(),
      trace,
    };
  }
  step('fetched', { events: events.length, people: people.length });

  const scores = computeScores(events);
  step('scored', { scoredEmails: scores.size });

  // "Score Updated" is a date field with no time component, so it rejects a
  // full ISO timestamp. Send date-only.
  const today = new Date().toISOString().slice(0, 10);
  const updates = [];
  let skippedNoEmail = 0;

  for (const person of people) {
    if (!person.Email) {
      skippedNoEmail++;
      continue;
    }
    // Emails with stray whitespace never match their events, so trim before
    // looking the score up. The stored value is left alone; that's a separate
    // cleanup.
    const rawScore = scores.get(normEmail(person.Email)) || 0;
    // The Airtable field is configured to one decimal; match it so the stored
    // value and the displayed value never disagree.
    const newScore = Math.round(rawScore * 10) / 10;
    const currentScore = person['Engagement Score'] || 0;
    if (newScore !== currentScore) {
      updates.push({
        id: person.id,
        fields: { 'Engagement Score': newScore, 'Score Updated': today },
      });
    }
  }
  step('diffed', { toUpdate: updates.length, skippedNoEmail });

  let updated = 0;
  let failed = 0;
  let timedOut = false;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    if (elapsed() > budgetMs) {
      timedOut = true;
      break;
    }

    const batch = updates.slice(i, i + BATCH_SIZE);
    try {
      await base(TABLES.people).update(
        batch.map(({ id, fields }) => ({ id, fields }))
      );
      updated += batch.length;
    } catch (error) {
      // Isolate the failure: record it and keep going, so one bad record
      // cannot cost us the whole run the way it used to.
      failed += batch.length;
      if (errors.length < 5) {
        errors.push({
          batchStart: i,
          recordIds: batch.map((b) => b.id),
          message: error.message,
        });
      }
    }
  }

  step('written', { updated, failed, timedOut });

  // ── Campaign stats (human, bot-filtered) ─────────────────────────────────
  // The Unique Opens / Total Opens / Unique Clicks fields on Campaigns were
  // never kept up to date in 1.x. Writing the bot-filtered numbers here lets
  // the campaigns list read them straight from the record.
  let campaignsUpdated = 0;
  if (!timedOut && elapsed() < budgetMs) {
    try {
      campaignsUpdated = await writeCampaignStats(events, budgetMs, elapsed);
      step('campaign-stats', { campaignsUpdated });
    } catch (error) {
      errors.push({ batchStart: -1, recordIds: [], message: `campaign stats: ${error.message}` });
    }
  }

  const remaining = updates.length - updated - failed;

  return {
    ok: failed === 0 && !timedOut,
    stage: 'done',
    events: events.length,
    people: people.length,
    toUpdate: updates.length,
    updated,
    failed,
    remaining,
    timedOut,
    skippedNoEmail,
    campaignsUpdated,
    errors,
    durationMs: elapsed(),
    trace,
    message: buildMessage({ updated, failed, remaining, timedOut, errors }),
  };
}

function buildMessage({ updated, failed, remaining, timedOut, errors }) {
  if (timedOut) {
    return `Wrote ${updated} scores before running out of time. ${remaining} left, which the next run will pick up.`;
  }
  if (failed > 0) {
    return `Wrote ${updated} scores. ${failed} failed: ${errors[0]?.message || 'unknown error'}`;
  }
  if (updated === 0) {
    return 'Every score was already up to date. Nothing to write.';
  }
  return `Updated ${updated} contact scores.`;
}

// Per campaign: distinct recipients who opened, total opens, distinct
// recipients who clicked. Only campaigns whose numbers changed are written.
async function writeCampaignStats(events, budgetMs, elapsed) {
  const { events: clean } = filterBotNoise(events);
  const stats = new Map();
  for (const e of clean) {
    const cid = e['Campaign ID'] || e.Campaign?.[0];
    const email = normEmail(e['Recipient Email']);
    if (!cid || !email) continue;
    if (!stats.has(cid)) stats.set(cid, { openers: new Set(), opens: 0, clickers: new Set() });
    const s = stats.get(cid);
    if (e['Event Type'] === 'Open') { s.openers.add(email); s.opens++; }
    if (e['Event Type'] === 'Click') s.clickers.add(email);
  }
  const campaigns = await getCampaigns();
  const updates = [];
  for (const c of campaigns) {
    const s = stats.get(c.id);
    if (!s) continue;
    const fields = {
      'Unique Opens': s.openers.size,
      'Total Opens': s.opens,
      'Unique Clicks': s.clickers.size,
    };
    if (
      fields['Unique Opens'] !== (c['Unique Opens'] || 0) ||
      fields['Total Opens'] !== (c['Total Opens'] || 0) ||
      fields['Unique Clicks'] !== (c['Unique Clicks'] || 0)
    ) {
      updates.push({ id: c.id, fields });
    }
  }
  let written = 0;
  for (let i = 0; i < updates.length; i += 10) {
    if (elapsed() > budgetMs) break;
    const batch = updates.slice(i, i + 10);
    await base(TABLES.campaigns).update(batch);
    written += batch.length;
  }
  return written;
}
