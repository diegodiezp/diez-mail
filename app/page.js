'use client';

import { useState, useEffect } from 'react';

export default function HomePage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="font-serif italic text-3xl mb-1">Campaigns</h1>
          <p className="text-sm text-gallery-mid">
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
          </p>
        </div>
        <a href="/campaigns/new" className="btn-primary">
          New Campaign
        </a>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gallery-light text-sm">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gallery-border">
          <p className="font-serif italic text-xl text-gallery-mid mb-2">No campaigns yet</p>
          <p className="text-sm text-gallery-light mb-6">
            Create your first campaign to start sending personalized emails.
          </p>
          <a href="/campaigns/new" className="btn-primary">
            Create Campaign
          </a>
        </div>
      ) : (
        <div className="border border-gallery-border bg-gallery-white">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="px-4 sm:px-5 py-4 border-b border-gallery-border last:border-0 hover:bg-gallery-bg transition-colors cursor-pointer"
              onClick={() => (window.location.href = `/campaigns/${c.id}`)}
            >
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="font-medium text-sm truncate">{c.Name}</div>
                <span
                  className={`flex-shrink-0 ${
                    c.Status === 'Sent'
                      ? 'badge-sent'
                      : c.Status === 'Sending'
                        ? 'badge bg-yellow-50 text-yellow-700'
                        : c.Status === 'Partial'
                          ? 'badge bg-orange-50 text-orange-700'
                          : 'badge bg-gray-50 text-gallery-mid'
                  }`}
                >
                  {c.Status || 'Draft'}
                </span>
              </div>
              {c.Subject && c.Subject !== c.Name && (
                <div className="text-2xs text-gallery-mid mb-2">{c.Subject}</div>
              )}
              <div className="flex gap-4 text-2xs text-gallery-mid">
                <span>Sent: <strong className="text-gallery-black">{c._sent || c['Sent Count'] || 0}</strong></span>
                <span>Opens: <strong className="text-gallery-black">{c._opens || 0}</strong></span>
                <span>Rate: <strong className="text-gallery-black">{c._openRate && c._openRate > 0 ? `${c._openRate}%` : '-'}</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
