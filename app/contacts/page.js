'use client';

import { useState, useEffect } from 'react';

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
  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState(null);
  const [contactEvents, setContactEvents] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((data) => {
        setPeople(data.people || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = searchQuery
    ? people.filter(
        (p) =>
          p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.surname?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.email?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : people;

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

  return (
    <div>
      <h1 className="font-serif italic text-3xl mb-2">Contacts</h1>
      <p className="text-sm text-gallery-mid mb-6">{people.length} people across Contacts and Clients</p>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
        {/* Left: list */}
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
                {filtered.slice(0, 100).map((p) => (
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
                          {p.name || p.surname ? `${p.name} ${p.surname}`.trim() : p.email}
                        </div>
                        {(p.name || p.surname) && (
                          <div className="text-2xs text-gallery-mid truncate">{p.email}</div>
                        )}
                      </div>
                      {p.type && (
                        <span className="badge-client flex-shrink-0">{p.type}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {filtered.length > 100 && (
              <div className="px-4 py-3 text-2xs text-gallery-light text-center border-t border-gallery-border">
                Showing 100 of {filtered.length}. Use search to narrow down.
              </div>
            )}
          </div>
        </div>

        {/* Right: timeline */}
        <div className="lg:col-span-2">
          <div className="sticky top-8">
            {selectedContact ? (
              <div className="border border-gallery-border bg-gallery-white">
                <div className="px-5 py-4 border-b border-gallery-border">
                  <div className="font-medium text-lg">
                    {selectedContact.name} {selectedContact.surname}
                  </div>
                  <div className="text-sm text-gallery-mid">{selectedContact.email}</div>
                  {selectedContact.city && (
                    <div className="text-2xs text-gallery-light mt-1">
                      {selectedContact.city}{selectedContact.country ? `, ${selectedContact.country}` : ''}
                    </div>
                  )}
                  {selectedContact.phone && (
                    <div className="text-2xs text-gallery-light">{selectedContact.phone}</div>
                  )}
                  <div className="flex gap-2 mt-2">
                    {selectedContact.type && (
                      <span className="badge-client">{selectedContact.type}</span>
                    )}
                    {selectedContact.status && (
                      <span className={`badge ${
                        selectedContact.status === 'Hot' ? 'bg-red-50 text-red-700' :
                        selectedContact.status === 'Warm' ? 'bg-orange-50 text-orange-700' :
                        'bg-gray-100 text-gallery-mid'
                      }`}>{selectedContact.status}</span>
                    )}
                  </div>
                </div>

                <div className="px-5 py-3 border-b border-gallery-border">
                  <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                    Email Activity Timeline
                  </div>
                </div>

                <div className="max-h-[50vh] overflow-y-auto">
                  {loadingEvents ? (
                    <div className="p-6 text-center text-sm text-gallery-light">Loading...</div>
                  ) : contactEvents.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gallery-light">
                      No email activity recorded yet.
                    </div>
                  ) : (
                    <div className="divide-y divide-gallery-border">
                      {contactEvents.map((event, i) => (
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
                          <div className="flex-1">
                            <div className="text-sm">
                              <span className="font-medium">{event['Event Type']}</span>
                              {event.Device && (
                                <span className="text-gallery-mid ml-1.5">on {event.Device}</span>
                              )}
                            </div>
                            <div className="text-2xs text-gallery-light mt-0.5">
                              {formatDate(event.Timestamp)}
                            </div>
                          </div>
                        </div>
                      ))}
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
