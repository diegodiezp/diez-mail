// lib/merge.js
// Merge tags, shared by the composer (preview, personalize step) and the
// server (lib/tracking.js personalizeBody). Client-safe: no Node imports.
//
//   {{first_name}}            -> Antonia
//   {{first_name|there}}      -> Antonia, or "there" when the name is empty
//   {{surname}} {{full_name}} {{email}} {{city}} {{company}}
//   {{pdf_link}}              -> resolved on the server (tracked link)

export const MERGE_TAGS = [
  { tag: '{{first_name|there}}', label: 'first name' },
  { tag: '{{full_name}}', label: 'full name' },
  { tag: '{{company}}', label: 'company' },
  { tag: '{{city}}', label: 'city' },
  { tag: '{{pdf_link}}', label: 'PDF link' },
];

const FIELD = /\{\{\s*(first_name|surname|full_name|email|city|company)\s*(?:\|([^}]*))?\}\}/g;

export function mergeValues(person = {}) {
  const first = (person.name ?? person['First Name'] ?? '').trim();
  const last = (person.surname ?? person['Last Name'] ?? '').trim();
  return {
    first_name: first,
    surname: last,
    full_name: `${first} ${last}`.trim(),
    email: (person.email ?? person.Email ?? '').trim(),
    city: (person.city ?? person.City ?? '').trim(),
    company: (person.company ?? person.Company ?? '').trim(),
  };
}

// Resolves every tag except {{pdf_link}}
export function resolveMergeTags(template, person) {
  const v = mergeValues(person);
  return String(template || '').replace(FIELD, (_, key, fallback) => v[key] || (fallback || '').trim());
}

// Tags in the template that would resolve to nothing for this person
// (used by the composer's pre-send check)
export function missingFor(template, person) {
  const v = mergeValues(person);
  const missing = new Set();
  String(template || '').replace(FIELD, (_, key, fallback) => {
    if (!v[key] && !(fallback || '').trim()) missing.add(key);
    return '';
  });
  return [...missing];
}

export function pdfAnchor(href, label = 'View PDF') {
  const text = String(label || 'View PDF').replace(/[<>]/g, '');
  return `<a href="${href}" style="color: #1a1a1a; text-decoration: underline;">${text}</a>`;
}
