// lib/signature.js
// The one place the email signature lives. Used by the campaign composer,
// the Mail page (compose + reply) and the booth-QR lead email. Edit here and
// every outgoing email picks it up.
//
// No server-only imports: this file is safe to use from client components.

export const SIGNATURE_LINES = [
  { text: 'Diego Diez' },
  { text: 'Director of ', link: { label: 'diez', href: 'https://diez.gallery' } },
  { text: '+31 633261845' },
  { text: '+34 648872907' },
  { link: { label: 'Instagram', href: 'https://instagram.com/diez.gallery' } },
];

const LINK_STYLE = 'color:#1a1a1a;text-decoration:underline;';

// Plain text, one line per row (used in previews)
export const SIGNATURE_TEXT = SIGNATURE_LINES
  .map((l) => `${l.text || ''}${l.link ? l.link.label : ''}`)
  .join('\n');

// HTML sent in real emails
export const SIGNATURE_HTML = SIGNATURE_LINES
  .map((l) => {
    const link = l.link ? `<a href="${l.link.href}" style="${LINK_STYLE}">${l.link.label}</a>` : '';
    return `<div>${l.text || ''}${link}</div>`;
  })
  .join('');

// Block appended after a body: two line breaks, then the signature
export function signatureBlock(include = true) {
  return include ? `<br/><br/>${SIGNATURE_HTML}` : '';
}
