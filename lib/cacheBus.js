// lib/cacheBus.js
// A version counter bumped whenever this instance writes Email Events, so
// in-memory event caches (lib/events.js) know to refetch. Kept in its own
// module so lib/airtable.js and lib/events.js don't import each other.
let version = 0;
export function bumpEventsVersion() {
  version += 1;
}
export function eventsVersion() {
  return version;
}
