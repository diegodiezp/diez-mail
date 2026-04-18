'use client';

import { useState, useEffect, useCallback } from 'react';

export default function NewCampaignPage() {
  // Form state
  const [campaignName, setCampaignName]   = useState('');
  const [subject, setSubject]             = useState('');
  const [pdfLink, setPdfLink]             = useState('');
  const [bodyTemplate, setBodyTemplate]   = useState(
    `Dear {{first_name}},\n\n\n\nWarm regards,\nDiego Diez\nDirector of <a href="https://diez.gallery">diez</a>\n
    <a href="https://www.instagram.com/diez.gallery/">Instagram</a>
    \n+31 633261845\n+34 648872907`
  );

  // Recipients
  const [allPeople, setAllPeople]         = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [selected, setSelected]           = useState(new Set());
  const [searchQuery, setSearchQuery]     = useState('');
  const [typeFilter, setTypeFilter]       = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Sending state
  const [step, setStep]                   = useState('compose'); // 'compose' | 'confirm' | 'sending' | 'done'
  const [sendResult, setSendResult]       = useState(null);
  const [sendProgress, setSendProgress]   = useState('');

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
      allPeople.filter(
        (p) =>
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
      if (next.has(email)) next.delete(email); else next.add(email);
      return next;
    });
  }, []);

  const selectAll  = () => setSelected(new Set(filteredPeople.map((p) => p.email)));
  const selectNone = () => setSelected(new Set());

  const canSend = subject && bodyTemplate && selected.size > 0;

  const handleConfirm = () => {
    if (!canSend) return;
    setStep('confirm');
  };

  const handleSend = async () => {
    setStep('sending');
    setSendProgress(`Sending to ${selected.size} recipient${selected.size > 1 ? 's' : ''}…`);

    const recipients = allPeople.filter((p) => selected.has(p.email));

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName: campaignName || subject,
          subject,
          bodyTemplate,
          recipients,
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

  const insertTag = (tag) => {
    const textarea = document.getElementById('body-editor');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end   = textarea.selectionEnd;
    setBodyTemplate(bodyTemplate.slice(0, start) + tag + bodyTemplate.slice(end));
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  // ── Done screen ───────────────────────────────────────────────────────────
  if (step === 'done' && sendResult?.success) {
    return (
      <div className="max-w-lg mx-auto py-20">
        <div className="border border-gallery-border bg-gallery-white p-10 text-center">
          <div className="font-serif italic text-3xl mb-3 text-gallery-success">
            Campaign Sent
          </div>
          <p className="text-sm text-gallery-mid mb-1">
            <strong className="text-gallery-black tabular-nums">{sendResult.sent}</strong>{' '}
            email{sendResult.sent !== 1 ? 's' : ''} sent successfully
          </p>
          {sendResult.failed > 0 && (
            <p className="text-sm text-red-600 mb-1">{sendResult.failed} failed</p>
          )}
          <p className="text-2xs text-gallery-light mt-1 mb-8">
            {campaignName || subject}
          </p>
          <div className="flex gap-3 justify-center">
            <a href={`/campaigns/${sendResult.campaignId}`} className="btn-primary">
              View Campaign
            </a>
            <a href="/campaigns/new" className="btn-secondary">
              New Campaign
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Confirm screen ────────────────────────────────────────────────────────
  if (step === 'confirm' || step === 'sending') {
    const recipientList = allPeople.filter((p) => selected.has(p.email));
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
          {/* Summary */}
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

          {/* Recipient preview */}
          <div>
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-3">
              Recipients ({recipientList.length})
            </div>
            <div className="border border-gallery-border bg-gallery-white max-h-[60vh] overflow-y-auto">
              {recipientList.map((p, i) => (
                <div
                  key={p.email}
                  className="flex items-center gap-3 px-4 py-2.5 border-b border-gallery-border last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {p.name} {p.surname}
                    </div>
                    <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                  </div>
                  {p.type && (
                    <span className="badge bg-gallery-accent-light text-gallery-accent flex-shrink-0">
                      {p.type}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Compose screen ────────────────────────────────────────────────────────
  return (
    <div>
      <h1 className="font-serif italic text-3xl mb-8">New Campaign</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Compose */}
        <div className="lg:col-span-3 space-y-5">
          <div>
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Campaign Name <span className="normal-case text-gallery-light">(internal)</span>
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. True as Good - Opening Week"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Subject Line
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="e.g. Alex Margo Arden at Diez Gallery"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              PDF Link <span className="normal-case text-gallery-light">(Google Drive)</span>
            </label>
            <input
              type="url"
              className="input-field"
              placeholder="https://drive.google.com/file/d/..."
              value={pdfLink}
              onChange={(e) => setPdfLink(e.target.value)}
            />
            <p className="text-2xs text-gallery-light mt-1">
              Paste a Google Drive share link. Use {'{{pdf_link}}'} in the body to insert it.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                Email Body
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {['{{first_name}}', '{{surname}}', '{{full_name}}', '{{pdf_link}}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    className="text-2xs px-2 py-0.5 border border-gallery-border text-gallery-mid hover:text-gallery-black hover:border-gallery-black transition-colors"
                  >
                    {tag.replace(/\{\{|\}\}/g, '')}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              id="body-editor"
              className="input-field font-serif text-base leading-relaxed auto-resize"
              style={{ minHeight: '280px' }}
              value={bodyTemplate}
              onChange={(e) => setBodyTemplate(e.target.value)}
            />
            <p className="text-2xs text-gallery-light mt-1">
              Use {'{{first_name}}'}, {'{{surname}}'}, {'{{full_name}}'} for personalisation. HTML supported.
            </p>
          </div>

          {/* Preview */}
          <div>
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Preview
            </label>
            <div
              className="border border-gallery-border bg-gallery-white p-6 font-serif text-base leading-relaxed"
              dangerouslySetInnerHTML={{
                __html: bodyTemplate
                  .replace(/\{\{first_name\}\}/g, '<span class="bg-yellow-100 px-0.5">Antonia</span>')
                  .replace(/\{\{surname\}\}/g, '<span class="bg-yellow-100 px-0.5">Jansen</span>')
                  .replace(/\{\{full_name\}\}/g, '<span class="bg-yellow-100 px-0.5">Antonia Jansen</span>')
                  .replace(/\{\{email\}\}/g, '<span class="bg-yellow-100 px-0.5">antonia@example.com</span>')
                  .replace(/\{\{city\}\}/g, '<span class="bg-yellow-100 px-0.5">Amsterdam</span>')
                  .replace(
                    /\{\{pdf_link\}\}/g,
                    pdfLink
                      ? `<a href="#" class="text-blue-700 underline" onclick="return false">${pdfLink.length > 50 ? pdfLink.slice(0, 50) + '...' : pdfLink}</a>`
                      : '<span class="bg-red-100 px-0.5 text-red-600">No PDF link set</span>'
                  )
                  .replace(/\n/g, '<br/>'),
              }}
            />
          </div>
        </div>

        {/* Right: Recipients */}
        <div className="lg:col-span-2">
          <div className="sticky top-8">
            <div className="flex items-center justify-between mb-3">
              <label className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                Recipients
              </label>
              <span className="text-2xs text-gallery-accent font-medium tabular-nums">
                {selected.size} selected
              </span>
            </div>

            {/* Type filter */}
            <div className="flex gap-1 mb-2 flex-wrap">
              {[
                { value: '', label: 'All' },
                { value: 'Collector', label: 'Collectors' },
                { value: 'Advisor', label: 'Advisors' },
                { value: 'Curator', label: 'Curators' },
                { value: 'Institution', label: 'Institutions' },
                { value: 'Press', label: 'Press' },
                { value: 'Gallery', label: 'Galleries' },
              ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={`text-2xs px-3 py-1 transition-colors ${
                    typeFilter === f.value
                      ? 'bg-gallery-black text-white'
                      : 'bg-gallery-white border border-gallery-border text-gallery-mid hover:text-gallery-black'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              className="input-field mb-2"
              placeholder="Search contacts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            {/* Bulk actions */}
            <div className="flex gap-3 mb-2 text-2xs">
              <button
                onClick={selectAll}
                className="text-gallery-mid hover:text-gallery-black transition-colors"
              >
                Select all ({filteredPeople.length})
              </button>
              <button
                onClick={selectNone}
                className="text-gallery-mid hover:text-gallery-black transition-colors"
              >
                Clear
              </button>
            </div>

            {/* Contact list */}
            <div className="border border-gallery-border bg-gallery-white max-h-[60vh] overflow-y-auto">
              {loadingPeople ? (
                <div className="p-6 text-center text-sm text-gallery-light">Loading contacts...</div>
              ) : filteredPeople.length === 0 ? (
                <div className="p-6 text-center text-sm text-gallery-light">No contacts found</div>
              ) : (
                filteredPeople.map((person) => (
                  <label
                    key={person.email}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-gallery-border last:border-0 cursor-pointer transition-colors ${
                      selected.has(person.email) ? 'bg-gallery-accent-light' : 'hover:bg-gallery-bg'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(person.email)}
                      onChange={() => toggleSelect(person.email)}
                      className="accent-gallery-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {person.name} {person.surname}
                      </div>
                      <div className="text-2xs text-gallery-mid truncate">{person.email}</div>
                    </div>
                    {person.type && (
                      <span className="badge bg-gallery-accent-light text-gallery-accent flex-shrink-0">
                        {person.type}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            {/* Review & send button */}
            <button
              onClick={handleConfirm}
              disabled={!canSend}
              className="btn-primary w-full mt-4 justify-center py-3 text-base disabled:opacity-40"
            >
              {selected.size === 0
                ? 'Select recipients to continue'
                : `Review & send to ${selected.size} recipient${selected.size !== 1 ? 's' : ''} →`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
