'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const TYPE_FILTERS = [
  { value: '', label: 'All' },
  { value: 'Collector', label: 'Collectors' },
  { value: 'Advisor', label: 'Advisors' },
  { value: 'Curator', label: 'Curators' },
  { value: 'Institution', label: 'Institutions' },
  { value: 'Press', label: 'Press' },
  { value: 'Gallery', label: 'Galleries' },
];

const SIGNATURE = `Diego Diez\nDirector of diez\n+31 633261845\n+34 648872907\nInstagram`;

// HTML version of the signature with proper line breaks
const SIGNATURE_HTML = SIGNATURE.split('\n').map((line) => `<div>${line}</div>`).join('');

export default function NewCampaignPage() {
  const editorRef = useRef(null);

  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject]           = useState('');
  const [pdfLink, setPdfLink]           = useState('');
  const [includeSig, setIncludeSig]     = useState(true);
  const [body, setBody]                 = useState('');

  // Recipients
  const [allPeople, setAllPeople]         = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [selected, setSelected]           = useState(new Set());
  const [searchQuery, setSearchQuery]     = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Sending state
  const [step, setStep]             = useState('compose'); // compose | confirm | sending | done
  const [sendResult, setSendResult] = useState(null);
  const [sendProgress, setSendProgress] = useState('');

  // Fetch contacts
  useEffect(() => {
    setLoadingPeople(true);
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    fetch(`/api/contacts?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        setAllPeople(data.people || []);
        setLoadingPeople(false);
      })
      .catch(() => setLoadingPeople(false));
  }, [typeFilter]);

  // Filter by search
  useEffect(() => {
    if (!searchQuery) { setFilteredPeople(allPeople); return; }
    const q = searchQuery.toLowerCase();
    setFilteredPeople(
      allPeople.filter((p) =>
        p.name?.toLowerCase().includes(q) ||
        p.surname?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q)
      )
    );
  }, [searchQuery, allPeople]);

  const toggleSelect = useCallback((email) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  }, []);

  const selectAll  = () => setSelected(new Set(filteredPeople.map((p) => p.email)));
  const selectNone = () => setSelected(new Set());

  const canSend = subject && selected.size > 0;
  const recipientList = allPeople.filter((p) => selected.has(p.email));

  // Rich text toolbar
  const fmt = (cmd, val) => {
    document.execCommand(cmd, false, val);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
    editorRef.current?.focus();
  };

  const insertMergeTag = (tag) => {
    editorRef.current?.focus();
    document.execCommand('insertText', false, tag);
    if (editorRef.current) {
      setBody(editorRef.current.innerHTML);
    }
  };

  // Sending
  const handleSend = async () => {
    setStep('sending');
    setSendProgress(`Sending to ${selected.size} recipient${selected.size > 1 ? 's' : ''}…`);

    const sigBlock = includeSig ? `<br/><br/>${SIGNATURE_HTML}` : '';
    const fullBody = body + sigBlock;

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: campaignName || subject,
          subject,
          bodyTemplate: fullBody,
          recipients: recipientList,
          pdfLink: pdfLink || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setSendResult({ success: true, sent: data.sent, failed: data.failed, campaignId: data.campaignId });
        setStep('done');
      } else {
        setSendResult({ success: false, error: data.error });
        setStep('confirm');
      }
    } catch (err) {
      setSendResult({ success: false, error: err.message });
      setStep('confirm');
    }
  };

  // ── Done ─────────────────────────────────────────────────────────────────
  if (step === 'done' && sendResult?.success) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="border border-gallery-border bg-gallery-white p-14 text-center max-w-sm w-full">
          <div className="font-serif italic text-3xl text-gallery-success mb-3">Campaign Sent</div>
          <p className="text-sm text-gallery-mid mb-1">
            <strong className="text-gallery-black tabular-nums">{sendResult.sent}</strong> emails sent successfully
          </p>
          {sendResult.failed > 0 && (
            <p className="text-sm text-red-600 mb-1">{sendResult.failed} failed</p>
          )}
          <p className="text-2xs text-gallery-light mt-1 mb-8">{campaignName || subject}</p>
          <div className="flex gap-3 justify-center">
            <a href={`/campaigns/${sendResult.campaignId}`} className="btn-primary">View Campaign</a>
            <a href="/campaigns/new" className="btn-secondary">New Campaign</a>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (step === 'confirm' || step === 'sending') {
    const isSending = step === 'sending';
    return (
      <div>
        <button
          onClick={() => { if (!isSending) setStep('compose'); }}
          className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors mb-4 inline-block"
        >
          ← Back to compose
        </button>
        <h1 className="font-serif italic text-3xl mb-8">Confirm &amp; Send</h1>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div className="stat-card">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Campaign</div>
              <div className="text-base font-medium">{campaignName || <span className="text-gallery-light italic">Untitled</span>}</div>
            </div>
            <div className="stat-card">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Subject</div>
              <div className="text-base font-medium">{subject}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="stat-card">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Recipients</div>
                <div className="text-2xl font-medium tabular-nums">{selected.size}</div>
              </div>
              <div className="stat-card">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">PDF Link</div>
                <div className="text-sm font-medium">{pdfLink ? 'Attached' : <span className="text-gallery-light">None</span>}</div>
              </div>
            </div>
            {sendResult && !sendResult.success && (
              <div className="border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                Error: {sendResult.error}
              </div>
            )}
            <button
              onClick={handleSend}
              disabled={isSending}
              className="btn-primary w-full justify-center py-3 text-base disabled:opacity-40"
            >
              {isSending ? sendProgress : `Send to ${selected.size} recipient${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
          <div>
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-3">
              Recipients ({recipientList.length})
            </div>
            <div className="border border-gallery-border bg-gallery-white max-h-[60vh] overflow-y-auto">
              {recipientList.map((p, i) => (
                <div key={p.email} className="flex items-center justify-between px-4 py-2.5 border-b border-gallery-border last:border-0">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name} {p.surname}</div>
                    <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                  </div>
                  {p.type && <span className="badge bg-gallery-accent-light text-gallery-accent flex-shrink-0">{p.type}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Compose — Arternal-style ──────────────────────────────────────────────
  return (
    <div
      className="flex"
      style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', margin: '-24px -24px 0' }}
    >
      {/* ── LEFT: Contacts panel ──────────────────────────────────────────── */}
      <div
        className="flex flex-col border-r border-gallery-border bg-gallery-white flex-shrink-0"
        style={{ width: 240 }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-gallery-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">Contacts</span>
            <span className="text-2xs text-gallery-accent font-medium tabular-nums">{selected.size} selected</span>
          </div>
          <input
            type="text"
            className="input-field text-xs py-1.5"
            placeholder="Search…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Type filters */}
        <div className="px-3 py-2 border-b border-gallery-border flex flex-wrap gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={`text-2xs px-2 py-0.5 transition-colors ${
                typeFilter === f.value
                  ? 'bg-gallery-black text-white'
                  : 'border border-gallery-border text-gallery-mid hover:text-gallery-black'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Select all / none */}
        <div className="px-4 py-1.5 border-b border-gallery-border flex gap-4">
          <button onClick={selectAll} className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors">
            Select all
          </button>
          <button onClick={selectNone} className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors">
            Clear
          </button>
        </div>

        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {loadingPeople ? (
            <div className="p-6 text-center text-2xs text-gallery-light">Loading…</div>
          ) : filteredPeople.length === 0 ? (
            <div className="p-6 text-center text-2xs text-gallery-light">No contacts found</div>
          ) : (
            filteredPeople.map((person) => (
              <label
                key={person.email}
                className={`flex items-center gap-2.5 px-3 py-2.5 border-b border-gallery-border cursor-pointer transition-colors ${
                  selected.has(person.email) ? 'bg-gallery-accent-light' : 'hover:bg-gallery-bg'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(person.email)}
                  onChange={() => toggleSelect(person.email)}
                  className="accent-gallery-accent flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{person.surname}, {person.name}</div>
                  <div className="text-2xs text-gallery-mid truncate">{person.email}</div>
                </div>
                {selected.has(person.email) && (
                  <span className="badge bg-gallery-accent text-white flex-shrink-0" style={{ fontSize: '0.5rem' }}>sent</span>
                )}
              </label>
            ))
          )}
        </div>

        {/* Send All button */}
        <div className="p-3 border-t border-gallery-border">
          <button
            onClick={() => canSend && setStep('confirm')}
            disabled={!canSend}
            className="btn-primary w-full justify-center py-2.5 text-xs disabled:opacity-40"
          >
            {selected.size === 0 ? 'Select contacts' : `Send All (${selected.size})`}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Compose area ───────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gallery-white">

        {/* Campaign name top bar */}
        <div className="flex items-center gap-3 px-6 py-2 border-b border-gallery-border">
          <span className="text-2xs font-medium uppercase tracking-wider text-gallery-mid flex-shrink-0">
            Campaign:
          </span>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            placeholder="e.g. Opening Week — True as Good"
            className="flex-1 text-xs bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
          />
          {pdfLink && (
            <button
              onClick={() => setPdfLink('')}
              className="text-2xs text-gallery-accent bg-gallery-accent-light px-2 py-0.5 flex-shrink-0"
            >
              PDF attached ×
            </button>
          )}
        </div>

        {/* To */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <span className="text-sm text-gallery-mid w-6 flex-shrink-0">To</span>
          <div className={`flex-1 text-sm ${selected.size ? 'text-gallery-black' : 'text-gallery-light italic'}`}>
            {selected.size === 0
              ? 'Select contacts from the panel on the left'
              : selected.size <= 3
                ? recipientList.map((p) => `${p.name} ${p.surname}`).join(', ')
                : `${recipientList.slice(0, 2).map((p) => `${p.name} ${p.surname}`).join(', ')} +${selected.size - 2} more`}
          </div>
          {selected.size > 0 && (
            <span className="text-2xs text-gallery-mid flex-shrink-0">{selected.size} recipients</span>
          )}
        </div>

        {/* Bcc */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <span className="text-sm text-gallery-mid w-6 flex-shrink-0">Bcc</span>
          <input
            placeholder="Add bcc…"
            className="flex-1 text-sm bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
          />
        </div>

        {/* Subject */}
        <div className="flex items-center gap-3 px-6 py-2.5 border-b border-gallery-border">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject line…"
            className="flex-1 text-base font-medium bg-transparent border-none outline-none text-gallery-black placeholder:text-gallery-light"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-6 py-2 border-b border-gallery-border flex-wrap">
          {[
            { label: 'B', cmd: 'bold',      cls: 'font-bold' },
            { label: 'I', cmd: 'italic',    cls: 'italic' },
            { label: 'U', cmd: 'underline', cls: 'underline' },
          ].map((b) => (
            <button
              key={b.cmd}
              onMouseDown={(e) => { e.preventDefault(); fmt(b.cmd); }}
              className={`w-7 h-7 text-xs border border-gallery-border bg-gallery-bg text-gallery-black hover:bg-gallery-border transition-colors ${b.cls}`}
            >
              {b.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {[
            { label: '• List', cmd: 'insertUnorderedList' },
            { label: '1. List', cmd: 'insertOrderedList' },
          ].map((b) => (
            <button
              key={b.cmd}
              onMouseDown={(e) => { e.preventDefault(); fmt(b.cmd); }}
              className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-black hover:bg-gallery-border transition-colors"
            >
              {b.label}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          {['{{first_name}}', '{{surname}}', '{{full_name}}', '{{pdf_link}}'].map((tag) => (
            <button
              key={tag}
              onMouseDown={(e) => { e.preventDefault(); insertMergeTag(tag); }}
              className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-accent-light text-gallery-accent hover:opacity-80 transition-opacity"
            >
              {tag.replace(/\{\{|\}\}/g, '')}
            </button>
          ))}

          <div className="w-px h-5 bg-gallery-border mx-1" />

          <button
            onMouseDown={(e) => {
              e.preventDefault();
              const url = prompt('Google Drive PDF link:');
              if (url) setPdfLink(url);
            }}
            className="h-7 px-2 text-2xs border border-gallery-border bg-gallery-bg text-gallery-mid hover:text-gallery-black transition-colors"
          >
            + Attach PDF
          </button>
        </div>

        {/* Body — contentEditable rich text */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={(e) => setBody(e.currentTarget.innerHTML)}
            onBlur={(e) => setBody(e.currentTarget.innerHTML)}
            className="outline-none text-sm leading-relaxed text-gallery-black min-h-[200px] font-sans"
            style={{ fontFamily: 'DM Sans, sans-serif' }}
          />
        </div>

        {/* Signature */}
        <div className="px-6 border-t border-gallery-border">
          <label className="flex items-center gap-2 py-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeSig}
              onChange={(e) => setIncludeSig(e.target.checked)}
              className="accent-gallery-accent"
            />
            <span className="text-2xs text-gallery-mid">Include signature</span>
          </label>
          {includeSig && (
            <div className="pb-5 text-sm text-gallery-mid leading-relaxed border-t border-gallery-border pt-3">
              {SIGNATURE.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
