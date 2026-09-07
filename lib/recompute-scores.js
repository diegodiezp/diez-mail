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

import { getEventsForCampaign, getPeople, TABLES, base } from '@/lib/airtable';
import { computeScores } from '@/lib/scoring';

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
    [events, people] = await Promise.all([getEventsForCampaign(null), getPeople()]);
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
    const email = String(person.Email).trim();
    const rawScore = scores.get(email) || scores.get(person.Email) || 0;
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
