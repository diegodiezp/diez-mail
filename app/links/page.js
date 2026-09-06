'use client';

import { useState, useEffect, useMemo } from 'react';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function LinksPage() {
  const [people, setPeople] = useState([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPerson, setSelectedPerson] = useState(null);

  const [manualName, setManualName] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const [destinationUrl, setDestinationUrl] = useState('');
  const [label, setLabel] = useState('');

  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const [recentLinks, setRecentLinks] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);

  useEffect(() => {
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((data) => setPeople(data.people || []))
      .catch(() => {})
      .finally(() => setLoadingPeople(false));

    fetch('/api/links')
      .then((r) => r.json())
      .then((data) => setRecentLinks(data.links || []))
      .catch(() => {})
      .finally(() => setLoadingRecent(false));
  }, []);

  const filteredPeople = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return people
      .filter(
        (p) =>
          p.fullName?.toLowerCase().includes(q) ||
          p.email?.toLowerCase().includes(q) ||
          p.company?.toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [people, search]);

  function selectPerson(p) {
    setSelectedPerson(p);
    setSearch(p.fullName || p.email);
    setManualName('');
    setManualEmail('');
  }

  function clearSelection() {
    setSelectedPerson(null);
    setSearch('');
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setError('');
    setResult(null);

    const email = selectedPerson ? selectedPerson.email : manualEmail.trim();
    const name = selectedPerson ? selectedPerson.fullName : manualName.trim();

    if (!email) {
      setError('Missing contact email (pick one from the list or type it manually).');
      return;
    }
    if (!destinationUrl.trim()) {
      setError('Missing destination URL.');
      return;
    }

    setGenerating(true);
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          personId: selectedPerson?.id || null,
          email,
          name,
          destinationUrl: destinationUrl.trim(),
          label: label.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generating link');

      setResult({ ...data, recipientPhone: selectedPerson?.phone || '' });
      setRecentLinks((prev) => [
        {
          code: data.code,
          url: data.url,
          destination: destinationUrl.trim(),
          label: label.trim(),
          recipientEmail: email,
          created: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  function copyUrl(url) {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function whatsappHref(phone, url) {
    const digits = (phone || '').replace(/\D/g, '');
    const text = encodeURIComponent(url);
    return digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`;
  }

  return (
    <div>
      <h1 className="font-serif italic text-3xl mb-2">Manual Links</h1>
      <p className="text-sm text-gallery-mid mb-8">
        Generate a tracked link to share by hand, over WhatsApp or anywhere else.
        Clicks and any activity that follows in the viewing room are logged the
        same way as if they came from an email campaign.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Form */}
        <form onSubmit={handleGenerate} className="border border-gallery-border bg-gallery-white p-6">
          <div className="mb-4 relative">
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Contact
            </label>
            <input
              type="text"
              className="input-field"
              placeholder="Search by name, email or gallery..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setSelectedPerson(null);
              }}
              disabled={loadingPeople}
            />
            {selectedPerson && (
              <div className="mt-1.5 text-xs text-gallery-mid flex items-center gap-2">
                Selected: <span className="text-gallery-black font-medium">{selectedPerson.fullName}</span>
                <button type="button" onClick={clearSelection} className="text-gallery-accent hover:underline">
                  change
                </button>
              </div>
            )}
            {!selectedPerson && filteredPeople.length > 0 && (
              <div className="absolute z-10 mt-1 w-full border border-gallery-border bg-gallery-white shadow-sm max-h-56 overflow-y-auto">
                {filteredPeople.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    onClick={() => selectPerson(p)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gallery-bg transition-colors border-b border-gallery-border last:border-b-0"
                  >
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-2xs text-gallery-mid">
                      {p.email}{p.company ? ` · ${p.company}` : ''}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!selectedPerson && (
            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
                  Name (if not in contacts)
                </label>
                <input
                  type="text"
                  className="input-field"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  className="input-field"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="name@email.com"
                />
              </div>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Destination URL
            </label>
            <input
              type="text"
              className="input-field"
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
              placeholder="https://rooms.diez.gallery/..."
            />
          </div>

          <div className="mb-6">
            <label className="block text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1.5">
              Label (optional)
            </label>
            <input
              type="text"
              className="input-field"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="E.g. Follow-up after Frieze"
            />
          </div>

          {error && <p className="text-xs text-red-600 mb-4">{error}</p>}

          <button type="submit" className="btn-primary" disabled={generating}>
            {generating ? 'Generating...' : 'Generate link'}
          </button>
        </form>

        {/* Result + recent links */}
        <div>
          {result ? (
            <div className="border border-gallery-border bg-gallery-white p-6 mb-6">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-2">
                Link ready
              </div>
              <div className="flex items-center gap-2 mb-4">
                <code className="flex-1 text-sm bg-gallery-bg px-3 py-2 border border-gallery-border break-all">
                  {result.url}
                </code>
                <button type="button" className="btn-secondary text-xs" onClick={() => copyUrl(result.url)}>
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <a
                href={whatsappHref(result.recipientPhone, result.url)}
                target="_blank"
                rel="noreferrer"
                className="btn-primary text-xs"
              >
                Open in WhatsApp
              </a>
            </div>
          ) : (
            <div className="border border-dashed border-gallery-border p-6 mb-6 text-sm text-gallery-mid">
              The generated link will appear here, ready to copy or open straight in WhatsApp.
            </div>
          )}

          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-2">
            Recent manual links
          </div>
          {loadingRecent ? (
            <p className="text-sm text-gallery-mid">Loading...</p>
          ) : recentLinks.length === 0 ? (
            <p className="text-sm text-gallery-mid">No manual links yet.</p>
          ) : (
            <div className="border border-gallery-border bg-gallery-white divide-y divide-gallery-border">
              {recentLinks.slice(0, 12).map((l) => (
                <div key={l.code} className="px-4 py-3 text-sm">
                  <div className="flex justify-between items-start gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{l.recipientEmail}</div>
                      {l.label && <div className="text-2xs text-gallery-accent mt-0.5">{l.label}</div>}
                      <div className="text-2xs text-gallery-mid mt-0.5 truncate">{l.destination}</div>
                    </div>
                    <div className="text-2xs text-gallery-mid whitespace-nowrap">{formatDate(l.created)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
