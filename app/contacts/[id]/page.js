'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

const PIPELINE_STAGES = ['Prospect', 'Warm', 'Interested', 'Negotiating', 'Collector', 'Inactive'];

const PIPELINE_COLORS = {
  Prospect:    'bg-gray-100 text-gray-600',
  Warm:        'bg-yellow-50 text-yellow-700',
  Interested:  'bg-blue-50 text-blue-700',
  Negotiating: 'bg-orange-50 text-orange-700',
  Collector:   'bg-purple-50 text-purple-700',
  Inactive:    'bg-gray-50 text-gray-400',
};

const TYPE_COLORS = {
  Collector:   'bg-purple-50 text-purple-700',
  Advisor:     'bg-blue-50 text-blue-700',
  Curator:     'bg-teal-50 text-teal-700',
  Institution: 'bg-amber-50 text-amber-700',
  Press:       'bg-pink-50 text-pink-700',
  Gallery:     'bg-gray-100 text-gray-700',
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function formatRelative(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`;
  if (diff < 365) return `${Math.floor(diff / 30)} months ago`;
  return `${Math.floor(diff / 365)} years ago`;
}

function TimelineIcon({ type }) {
  if (type === 'sent') return (
    <div className="w-7 h-7 rounded-full bg-gallery-accent flex items-center justify-center flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
      </svg>
    </div>
  );
  if (type === 'open') return (
    <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
      </svg>
    </div>
  );
  if (type === 'email') return (
    <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
      </svg>
    </div>
  );
  return (
    <div className="w-7 h-7 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </div>
  );
}

export default function ContactDetailPage() {
  const { id } = useParams();
  const router = useRouter();

  const [contact, setContact] = useState(null);
  const [emailEvents, setEmailEvents] = useState([]);
  const [gmailThreads, setGmailThreads] = useState([]);
  const [lastContacted, setLastContacted] = useState(null);
  const [loading, setLoading] = useState(true);

  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [pipeline, setPipeline] = useState('');
  const [interests, setInterests] = useState('');
  const [savingFields, setSavingFields] = useState(false);
  const [savedFields, setSavedFields] = useState(false);
  const [doNotEmail, setDoNotEmail] = useState(false);
  const [savingDoNotEmail, setSavingDoNotEmail] = useState(false);

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setContact(data.contact);
        setEmailEvents(data.emailEvents || []);
        setGmailThreads(data.gmailThreads || []);
        setLastContacted(data.lastContacted);
        setPipeline(data.contact?.Pipeline || '');
        setInterests(data.contact?.Interests || '');
        setDoNotEmail(!!data.contact?.['Do Not Email']);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  const addNote = async () => {
    if (!newNote.trim()) return;
    setSavingNote(true);
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const entry = `[${date}] ${newNote.trim()}`;
    const existing = contact.Notes || '';
    const updated = existing ? `${entry}\n\n${existing}` : entry;
    try {
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ Notes: updated }),
      });
      setContact((prev) => ({ ...prev, Notes: updated }));
      setNewNote('');
    } finally {
      setSavingNote(false);
    }
  };

  const toggleDoNotEmail = async () => {
    const next = !doNotEmail;
    setSavingDoNotEmail(true);
    try {
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 'Do Not Email': next }),
      });
      setDoNotEmail(next);
      setContact((prev) => ({ ...prev, 'Do Not Email': next }));
    } finally {
      setSavingDoNotEmail(false);
    }
  };

  const saveFields = async () => {
    setSavingFields(true);
    setSavedFields(false);
    try {
      const fields = {};
      if (pipeline) fields.Pipeline = pipeline;
      if (interests !== undefined) fields.Interests = interests;
      await fetch(`/api/contacts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });
      setContact((prev) => ({ ...prev, ...fields }));
      setSavedFields(true);
      setTimeout(() => setSavedFields(false), 2000);
    } finally {
      setSavingFields(false);
    }
  };

  // Build combined timeline
  const timeline = useMemo(() => {
    const items = [];

    for (const ev of emailEvents) {
      const type = ev['Event Type']?.toLowerCase() === 'open' ? 'open'
        : ev['Event Type']?.toLowerCase() === 'sent' ? 'sent'
        : 'failed';
      items.push({
        type,
        date: ev.Timestamp,
        label: ev['Event Type'] === 'Open' ? 'Opened campaign email'
          : ev['Event Type'] === 'Sent' ? 'Campaign email sent'
          : 'Campaign email failed',
        sub: null,
      });
    }

    for (const t of gmailThreads) {
      const isMe = t.from?.email?.toLowerCase() === 'diego@diez.gallery';
      items.push({
        type: 'email',
        date: t.date,
        label: isMe ? 'You sent an email' : 'Received email',
        sub: t.subject || '(no subject)',
        threadId: t.id,
      });
    }

    return items
      .filter((i) => i.date)
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [emailEvents, gmailThreads]);

  const noteEntries = useMemo(() => {
    if (!contact?.Notes) return [];
    return contact.Notes.split('\n\n').filter((n) => n.trim());
  }, [contact?.Notes]);

  const types = contact
    ? (Array.isArray(contact.Type) ? contact.Type : [contact.Type].filter(Boolean))
    : [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-gallery-light">
        Loading...
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-12 text-sm text-gallery-mid">
        Contact not found.{' '}
        <Link href="/contacts" className="text-gallery-accent underline">Back to contacts</Link>
      </div>
    );
  }

  const fullName = [contact['First Name'], contact['Last Name']].filter(Boolean).join(' ');

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back */}
      <Link
        href="/contacts"
        className="inline-flex items-center gap-1.5 text-2xs text-gallery-mid hover:text-gallery-black transition-colors mb-6"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
        </svg>
        All contacts
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8 pb-6 border-b border-gallery-border">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gallery-bg border border-gallery-border flex items-center justify-center text-xl font-medium text-gallery-mid flex-shrink-0">
            {(contact['First Name']?.[0] || '?').toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-medium text-gallery-black mb-1">{fullName || '—'}</h1>
            <div className="flex items-center gap-2 flex-wrap">
              {types.map((t) => (
                <span key={t} className={`text-2xs px-2 py-0.5 ${TYPE_COLORS[t] || 'bg-gray-50 text-gray-600'}`}>
                  {t}
                </span>
              ))}
              {contact.Company && (
                <span className="text-2xs text-gallery-mid">{contact.Company}</span>
              )}
              {contact.City && (
                <span className="text-2xs text-gallery-light">· {contact.City}</span>
              )}
              {doNotEmail && (
                <span className="text-2xs px-2 py-0.5 bg-gray-100 text-gallery-light">
                  Do not email
                </span>
              )}
            </div>
            <div className="flex items-center gap-4 mt-2">
              {contact.Email && (
                <a href={`mailto:${contact.Email}`} className="text-xs text-gallery-mid hover:text-gallery-black transition-colors">
                  {contact.Email}
                </a>
              )}
              {contact.Phone && (
                <span className="text-xs text-gallery-light">{contact.Phone}</span>
              )}
            </div>
          </div>
        </div>

        {/* Last contacted + pipeline badge */}
        <div className="text-right flex-shrink-0">
          <div className="text-2xs text-gallery-light mb-1">Last contacted</div>
          <div className="text-sm font-medium text-gallery-black">{formatRelative(lastContacted)}</div>
          {lastContacted && (
            <div className="text-2xs text-gallery-light">{formatDate(lastContacted)}</div>
          )}
          {pipeline && (
            <span className={`mt-2 inline-block text-2xs px-2 py-0.5 ${PIPELINE_COLORS[pipeline] || 'bg-gray-50 text-gray-600'}`}>
              {pipeline}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── LEFT: Notes + Pipeline ────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Pipeline */}
          <div className="border border-gallery-border bg-gallery-white p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gallery-mid mb-4">Pipeline</h3>
            <div className="flex flex-wrap gap-2 mb-4">
              {PIPELINE_STAGES.map((s) => (
                <button
                  key={s}
                  onClick={() => setPipeline(s)}
                  className={`text-2xs px-3 py-1.5 border transition-colors ${
                    pipeline === s
                      ? `${PIPELINE_COLORS[s]} border-transparent`
                      : 'border-gallery-border text-gallery-mid hover:text-gallery-black'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            <div className="mb-4">
              <label className="text-2xs text-gallery-light block mb-1">Artwork / artist interests</label>
              <textarea
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                rows={3}
                className="input-field text-xs w-full resize-none"
                placeholder="e.g. Interested in Obra X, looking for sculpture under 10k..."
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={saveFields}
                disabled={savingFields}
                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40"
              >
                {savingFields ? 'Saving...' : 'Save'}
              </button>
              {savedFields && <span className="text-2xs text-gallery-success">Saved</span>}
            </div>
          </div>

          {/* Do Not Email */}
          <div className="border border-gallery-border bg-gallery-white p-5">
            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <div className="text-xs font-medium text-gallery-mid">Do not email</div>
                <div className="text-2xs text-gallery-light mt-0.5">
                  Excludes this contact from all future campaign sends.
                </div>
              </div>
              <input
                type="checkbox"
                checked={doNotEmail}
                onChange={toggleDoNotEmail}
                disabled={savingDoNotEmail}
                className="accent-gallery-mid flex-shrink-0"
              />
            </label>
          </div>

          {/* Notes */}
          <div className="border border-gallery-border bg-gallery-white p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gallery-mid mb-4">Notes</h3>

            <div className="mb-4">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={3}
                className="input-field text-xs w-full resize-none mb-2"
                placeholder="Add a note..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && e.metaKey) addNote();
                }}
              />
              <button
                onClick={addNote}
                disabled={savingNote || !newNote.trim()}
                className="btn-primary text-xs py-1.5 px-4 disabled:opacity-40"
              >
                {savingNote ? 'Saving...' : 'Add note'}
              </button>
            </div>

            {noteEntries.length === 0 ? (
              <p className="text-2xs text-gallery-light">No notes yet.</p>
            ) : (
              <div className="space-y-3">
                {noteEntries.map((note, idx) => {
                  const match = note.match(/^\[(.+?)\]\s*([\s\S]*)$/);
                  const date = match?.[1];
                  const text = match?.[2] || note;
                  return (
                    <div key={idx} className="border-l-2 border-gallery-border pl-3">
                      {date && <div className="text-2xs text-gallery-light mb-0.5">{date}</div>}
                      <div className="text-xs text-gallery-dark whitespace-pre-wrap">{text}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Timeline ───────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <div className="border border-gallery-border bg-gallery-white p-5">
            <h3 className="text-xs font-medium uppercase tracking-wider text-gallery-mid mb-5">
              Timeline · {timeline.length} interaction{timeline.length !== 1 ? 's' : ''}
            </h3>

            {timeline.length === 0 ? (
              <p className="text-sm text-gallery-light">No interactions recorded yet.</p>
            ) : (
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gallery-border" />

                <div className="space-y-5">
                  {timeline.map((item, idx) => (
                    <div key={idx} className="flex gap-4 relative">
                      <TimelineIcon type={item.type} />
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-medium text-gallery-dark">{item.label}</div>
                            {item.sub && (
                              item.threadId ? (
                                <Link
                                  href={`/mail?thread=${item.threadId}`}
                                  className="text-2xs text-gallery-mid hover:text-gallery-accent transition-colors truncate block max-w-xs"
                                >
                                  {item.sub}
                                </Link>
                              ) : (
                                <div className="text-2xs text-gallery-mid truncate max-w-xs">{item.sub}</div>
                              )
                            )}
                          </div>
                          <span className="text-2xs text-gallery-light flex-shrink-0">{formatDate(item.date)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
