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

function SignalBadge({ signal }) {
  const styles = {
    'Inquire Click': 'bg-red-50 text-red-700',
    'Artwork View': 'bg-orange-50 text-orange-700',
    Click: 'bg-blue-50 text-blue-700',
    'Multiple Opens': 'bg-teal-50 text-teal-700',
    Open: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`badge ${styles[signal] || 'bg-gray-100 text-gray-600'}`}>
      {signal}
    </span>
  );
}

export default function FollowupsPage() {
  const [followups, setFollowups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState(null);

  const loadFollowups = () => {
    setLoading(true);
    fetch('/api/followups')
      .then((r) => r.json())
      .then((data) => {
        setFollowups(data.followups || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    loadFollowups();
  }, []);

  const markDone = async (item) => {
    setMarkingDone(`${item.email}::${item.campaignId}`);
    try {
      await fetch('/api/followups/mark-done', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: item.email, campaignId: item.campaignId }),
      });
      setFollowups((prev) =>
        prev.filter((f) => !(f.email === item.email && f.campaignId === item.campaignId))
      );
    } finally {
      setMarkingDone(null);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif italic text-3xl mb-1">Follow-ups</h1>
        <p className="text-sm text-gallery-mid">
          {followups.length} contact{followups.length !== 1 ? 's' : ''} showed interest and haven't been followed up
        </p>
      </div>

      {loading ? (
        <div className="text-center py-20 text-gallery-light text-sm">Loading follow-ups...</div>
      ) : followups.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gallery-border">
          <p className="font-serif italic text-xl text-gallery-mid mb-2">All caught up</p>
          <p className="text-sm text-gallery-light">
            No engaged contacts are waiting on a follow-up right now.
          </p>
        </div>
      ) : (
        <div className="border border-gallery-border bg-gallery-white">
          <div className="hidden sm:grid grid-cols-[1fr_1fr_140px_160px_140px] gap-4 px-5 py-2 border-b border-gallery-border bg-gallery-bg">
            {['Contact', 'Campaign', 'Signal', 'Last activity', 'Actions'].map((label) => (
              <div key={label} className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                {label}
              </div>
            ))}
          </div>

          {followups.map((item) => {
            const key = `${item.email}::${item.campaignId}`;
            const isMarking = markingDone === key;
            return (
              <div
                key={key}
                className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_140px_160px_140px] gap-2 sm:gap-4 items-center px-4 sm:px-5 py-4 border-b border-gallery-border last:border-0 hover:bg-gallery-bg transition-colors"
              >
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="text-2xs text-gallery-mid truncate">{item.email}</div>
                </div>

                <div className="text-sm truncate">{item.campaignName}</div>

                <div>
                  <SignalBadge signal={item.signal} />
                </div>

                <div className="text-2xs text-gallery-mid">{formatDate(item.lastActivity)}</div>

                <div className="flex items-center gap-3">
                  <a
                    href={`/contacts/${item.personId}`}
                    className="text-2xs text-gallery-accent hover:text-gallery-black transition-colors"
                  >
                    Contact
                  </a>
                  <a
                    href={`/mail?to=${encodeURIComponent(item.email)}`}
                    className="text-2xs text-gallery-accent hover:text-gallery-black transition-colors"
                  >
                    Compose
                  </a>
                  <button
                    onClick={() => markDone(item)}
                    disabled={isMarking}
                    className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors disabled:opacity-40"
                  >
                    {isMarking ? 'Saving...' : 'Mark done'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
