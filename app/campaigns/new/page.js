'use client';

import { useState, useEffect, useCallback } from 'react';

export default function NewCampaignPage() {
  // Form state
  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [pdfLink, setPdfLink] = useState('');
  const [bodyTemplate, setBodyTemplate] = useState(
    `Dear {{first_name}},\n\n\n\nWarm regards,\nDiego Diez\nDirector of <a href="https://diez.gallery">diez</a>\n+31 633261845\n+34 648872907`

  );

  // Recipients
  const [allPeople, setAllPeople] = useState([]);
  const [filteredPeople, setFilteredPeople] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [loadingPeople, setLoadingPeople] = useState(true);

  // Sending state
  const [sending, setSending] = useState(false);
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
    if (!searchQuery) {
      setFilteredPeople(allPeople);
      return;
    }
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
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }, []);

  const selectAll = () => {
    setSelected(new Set(filteredPeople.map((p) => p.email)));
  };

  const selectNone = () => {
    setSelected(new Set());
  };

  const handleSend = async () => {
    if (!subject || !bodyTemplate || selected.size === 0) return;

    const confirmed = window.confirm(
      `Send "${subject}" to ${selected.size} recipient${selected.size > 1 ? 's' : ''}?`
    );
    if (!confirmed) return;

    setSending(true);
    setSendProgress(`Sending to ${selected.size} recipients...`);

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
        setSendResult({
          success: true,
          sent: data.sent,
          failed: data.failed,
          campaignId: data.campaignId,
        });
      } else {
        setSendResult({ success: false, error: data.error });
      }
    } catch (err) {
      setSendResult({ success: false, error: err.message });
    } finally {
      setSending(false);
      setSendProgress('');
    }
  };

  // Merge tags helper
  const insertTag = (tag) => {
    const textarea = document.getElementById('body-editor');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = bodyTemplate.slice(0, start) + tag + bodyTemplate.slice(end);
    setBodyTemplate(newText);
    // Restore cursor position
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  if (sendResult?.success) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="font-serif italic text-3xl mb-4 text-gallery-success">Campaign Sent</div>
        <p className="text-sm text-gallery-mid mb-2">
          {sendResult.sent} email{sendResult.sent !== 1 ? 's' : ''} sent successfully
          {sendResult.failed > 0 && `, ${sendResult.failed} failed`}
        </p>
        <div className="flex gap-4 justify-center mt-8">
          <a href={`/campaigns/${sendResult.campaignId}`} className="btn-primary">
            View Campaign
          </a>
          <a href="/campaigns/new" className="btn-secondary" onClick={() => {
            setSendResult(null);
            setSelected(new Set());
            setCampaignName('');
            setSubject('');
          }}>
            New Campaign
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-serif italic text-3xl mb-8">New Campaign</h1>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: Compose */}
        <div className="lg:col-span-3 space-y-5">
          <div>
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Campaign Name (internal)
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
              PDF Link (Google Drive)
            </label>
            <input
              type="url"
              className="input-field"
              placeholder="https://drive.google.com/file/d/..."
              value={pdfLink}
              onChange={(e) => setPdfLink(e.target.value)}
            />
            <p className="text-2xs text-gallery-light mt-1">
              Paste a Google Drive share link. Clicks will be tracked per recipient.
              Use {'{{pdf_link}}'} in the body to insert it.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                Email Body
              </label>
              <div className="flex gap-2">
                {['{{first_name}}', '{{surname}}', '{{full_name}}', '{{pdf_link}}'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => insertTag(tag)}
                    className="text-2xs px-2 py-0.5 border border-gallery-border text-gallery-mid
                      hover:text-gallery-black hover:border-gallery-black transition-colors"
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
              Use {'{{first_name}}'}, {'{{surname}}'}, {'{{full_name}}'} for personalization.
              HTML is supported.
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
                  .replace(/\{\{pdf_link\}\}/g, pdfLink
                    ? `<a href="#" class="text-blue-700 underline" onclick="return false">${pdfLink.length > 50 ? pdfLink.slice(0, 50) + '...' : pdfLink}</a>`
                    : '<span class="bg-red-100 px-0.5 text-red-600">No PDF link set</span>')
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
              <button onClick={selectAll} className="text-gallery-mid hover:text-gallery-black transition-colors">
                Select all ({filteredPeople.length})
              </button>
              <button onClick={selectNone} className="text-gallery-mid hover:text-gallery-black transition-colors">
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
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-gallery-border last:border-0
                      cursor-pointer transition-colors ${
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
                      <span className="badge bg-gallery-accent-light text-gallery-accent">
                        {person.type}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            {/* Send button */}
            <button
              onClick={handleSend}
              disabled={sending || selected.size === 0 || !subject || !bodyTemplate}
              className="btn-primary w-full mt-4 justify-center py-3 text-base"
            >
              {sending
                ? sendProgress
                : `Send to ${selected.size} recipient${selected.size !== 1 ? 's' : ''}`}
            </button>

            {sendResult && !sendResult.success && (
              <div className="mt-3 p-3 bg-red-50 text-red-700 text-sm">
                Error: {sendResult.error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
