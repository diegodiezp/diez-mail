'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';

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

export default function ContactsPage() {
  const [people, setPeople]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [campaigns, setCampaigns]         = useState([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactEvents, setContactEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Fetch contacts + campaigns in parallel
  useEffect(() => {
    Promise.all([
      fetch('/api/contacts').then((r) => r.json()),
      fetch('/api/campaigns').then((r) => r.json()),
    ])
      .then(([contactData, campaignData]) => {
        setPeople(contactData.people || []);
        setCampaigns(campaignData.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Campaign lookup map: Airtable record ID → campaign name
  const campaignMap = useMemo(() => {
    const map = {};
    for (const c of campaigns) map[c.id] = c.Name || 'Campaign';
    return map;
  }, [campaigns]);

  // Summary stats derived from people list
  const stats = useMemo(() => {
    if (!people.length) return null;
    const typeCounts = {};
    for (const p of people) {
      const t = p.type || 'Other';
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
    const topTypes = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    return { total: people.length, topTypes };
  }, [people]);

  const filtered = searchQuery
    ? people.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.surname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : people;
  
  useEffect(() => {
    setVisibleCount(100);
  }, [searchQuery]);

  const openTimeline = async (person) => {
    setSelectedContact(person);
    setLoadingEvents(true);
    try {
      const res = await fetch(`/api/contacts/events?email=${encodeURIComponent(person.email)}`);
      const data = await res.json();
      setContactEvents(data.events || []);
    } catch {
      setContactEvents([]);
    }
    setLoadingEvents(false);
  };

  // Resolve campaign name from an event's Campaign field (array of record IDs)
  function getCampaignName(event) {
    const ids = event.Campaign;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return null;
    return campaignMap[ids[0]] || null;
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <h1 className="font-serif italic text-3xl mb-2">Contacts</h1>
      <p className="text-sm text-gallery-mid mb-6">
        {people.length} people across Contacts and Clients
      </p>

      {/* ── Summary stats ──────────────────────────────────────────────────── */}
      {!loading && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="stat-card">
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">
              Total
            </div>
            <div className="text-2xl font-medium tabular-nums">{stats.total}</div>
          </div>
          {stats.topTypes.map(([type, count]) => (
            <div key={type} className="stat-card">
              <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">
                {type}
              </div>
              <div className="text-2xl font-medium tabular-nums">{count}</div>
              <div className="text-2xs text-gallery-light mt-0.5">
                {Math.round((count / stats.total) * 100)}% of list
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* ── Left: list ─────────────────────────────────────────────────── */}
        <div className="lg:col-span-3">
          <input
            type="text"
            className="input-field mb-4"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

                   <div className="border border-gallery-border bg-gallery-white">
            {loading ? (
              <div className="p-6 text-center text-sm text-gallery-light">Loading...</div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-center text-sm text-gallery-light">No contacts found</div>
            ) : (
              <div>
                {filtered.slice(0, visibleCount).map((p) => (
                  <div
                    key={p.email}
                    className={`px-4 py-3 border-b border-gallery-border last:border-0 cursor-pointer transition-colors ${
                      selectedContact?.email === p.email
                        ? 'bg-gallery-accent-light'
                        : 'hover:bg-gallery-bg'
                    }`}
                    onClick={() => openTimeline(p)}
                  >
                                     <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.name || p.surname
                            ? `${p.name} ${p.surname}`.trim()
                            : p.email}
                        </div>
                        {(p.name || p.surname) && (
                          <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                        )}
                        {p.city && (
                          <div className="text-2xs text-gallery-light truncate">{p.city}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {p.doNotEmail && (
                          <span className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gallery-light" title="Marked Do Not Email">
                            Do not email
                          </span>
                        )}
                        {p.type && (
                          <span className="badge-client">{p.type}</span>
                        )}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}

            {filtered.length > visibleCount && (
              <div className="px-4 py-3 border-t border-gallery-border text-center">
                <button
                  type="button"
                  className="text-2xs font-medium uppercase tracking-wider text-gallery-mid hover:text-gallery-black transition-colors"
                  onClick={() => setVisibleCount((count) => count + 100)}
                >
                  Load more contacts
                </button>
                <div className="mt-1 text-2xs text-gallery-light">
                  Showing {Math.min(visibleCount, filtered.length)} of {filtered.length}
                </div>
              </div>
            )}
           
          </div>
        </div>

        {/* ── Right: timeline ────────────────────────────────────────────── */}
        <div className="lg:col-span-2">
          <div className="sticky top-8">
            {selectedContact ? (
              <div className="border border-gallery-border bg-gallery-white">
                {/* Contact header */}
                <div className="px-5 py-4 border-b border-gallery-border">
                  <div className="font-medium text-lg leading-tight">
                    {selectedContact.name} {selectedContact.surname}
                  </div>
                  <div className="text-sm text-gallery-mid mt-0.5">
                    {selectedContact.email}
                  </div>
                  {(selectedContact.city || selectedContact.country) && (
                    <div className="text-2xs text-gallery-light mt-1">
                      {[selectedContact.city, selectedContact.country]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div className="text-2xs text-gallery-light">
                      {selectedContact.phone}
                    </div>
                  )}
                  {selectedContact.company && (
                    <div className="text-2xs text-gallery-light">
                      {selectedContact.company}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 mt-2 flex-wrap">
                    <div className="flex gap-2 flex-wrap">
                      {selectedContact.doNotEmail && (
                        <span className="text-2xs px-1.5 py-0.5 bg-gray-100 text-gallery-light">
                          Do not email
                        </span>
                      )}
                      {selectedContact.type && (
                        <span className="badge-client">{selectedContact.type}</span>
                      )}
                      {selectedContact.status && (
                        <span
                          className={`badge ${
                            selectedContact.status === 'Hot'
                              ? 'bg-red-50 text-red-700'
                              : selectedContact.status === 'Warm'
                                ? 'bg-orange-50 text-orange-700'
                                : 'bg-gray-100 text-gallery-mid'
                          }`}
                        >
                          {selectedContact.status}
                        </span>
                      )}
                    </div>
                    {selectedContact.id && (
                      <Link
                        href={`/contacts/${selectedContact.id}`}
                        className="text-2xs text-gallery-accent hover:text-gallery-black transition-colors flex items-center gap-1"
                      >
                        View profile
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                        </svg>
                      </Link>
                    )}
                  </div>
                </div>

                {/* Timeline header */}
                <div className="px-5 py-3 border-b border-gallery-border bg-gallery-bg">
                  <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                    Email Activity Timeline
                  </div>
                </div>

                {/* Timeline events */}
                <div className="max-h-[50vh] overflow-y-auto">
                  {loadingEvents ? (
                    <div className="p-6 text-center text-sm text-gallery-light">
                      Loading...
                    </div>
                  ) : contactEvents.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="font-serif italic text-gallery-mid text-sm">
                        No activity yet
                      </p>
                      <p className="text-2xs text-gallery-light mt-1">
                        No emails recorded for this contact.
                      </p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gallery-border">
                      {contactEvents.map((event, i) => {
                        const campaignName = getCampaignName(event);
                        return (
                          <div key={i} className="px-5 py-3 flex items-start gap-3">
                            <div
                              className="w-2 h-2 mt-1.5 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor:
                                  event['Event Type'] === 'Open'
                                    ? '#3a7d44'
                                    : event['Event Type'] === 'Sent'
                                      ? '#4a90d9'
                                      : '#d44',
                              }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm">
                                <span className="font-medium">{event['Event Type']}</span>
                                {event.Device && (
                                  <span className="text-gallery-mid ml-1.5">
                                    on {event.Device}
                                  </span>
                                )}
                              </div>
                              {/* ← NEW: campaign name */}
                              {campaignName && (
                                <div className="text-2xs text-gallery-accent mt-0.5 truncate">
                                  {campaignName}
                                </div>
                              )}
                              <div className="text-2xs text-gallery-light mt-0.5">
                                {formatDate(event.Timestamp)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="border border-dashed border-gallery-border p-10 text-center">
                <p className="font-serif italic text-gallery-mid">Select a contact</p>
                <p className="text-2xs text-gallery-light mt-1">
                  Click on a contact to view their email activity timeline
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
