'use client';

import { useState, useEffect, useMemo } from 'react';

function sortCampaigns(campaigns, key, dir) {
  return [...campaigns].sort((a, b) => {
    let av, bv;
    if (key === 'name')      { av = a.Name || ''; bv = b.Name || ''; return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av); }
    if (key === 'sent')      { av = a._sent || 0; bv = b._sent || 0; }
    if (key === 'opens')     { av = a._opens || 0; bv = b._opens || 0; }
    if (key === 'openRate')  { av = parseFloat(a._openRate) || 0; bv = parseFloat(b._openRate) || 0; }
    return dir === 'asc' ? av - bv : bv - av;
  });
}

function SortIcon({ active, dir }) {
  if (!active) return <span className="text-gallery-border ml-1">↕</span>;
  return <span className="text-gallery-black ml-1">{dir === 'asc' ? '↑' : '↓'}</span>;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    fetch('/api/campaigns')
      .then((r) => r.json())
      .then((data) => {
        setCampaigns(data.campaigns || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const summaryStats = useMemo(() => {
    const sent = campaigns.filter((c) => c.Status === 'Sent' && c._sent > 0);
    if (!sent.length) return null;
    const totalSent = sent.reduce((s, c) => s + (c._sent || 0), 0);
    const totalOpens = sent.reduce((s, c) => s + (c._opens || 0), 0);
    const avgRate = (sent.reduce((s, c) => s + parseFloat(c._openRate || 0), 0) / sent.length).toFixed(1);
    const best = sent.reduce((a, b) => parseFloat(a._openRate || 0) >= parseFloat(b._openRate || 0) ? a : b);
    return { totalSent, totalOpens, avgRate, bestName: best.Name, bestRate: best._openRate };
  }, [campaigns]);

  const sorted = useMemo(
    () => sortCampaigns(campaigns, sortKey, sortDir),
    [campaigns, sortKey, sortDir]
  );

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif italic text-3xl mb-1">Campaigns</h1>
        <p className="text-sm text-gallery-mid">
          {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''}
        </p>
      </div>

      {!loading && summaryStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="stat-card">
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Total Sent</div>
            <div className="text-2xl font-medium tabular-nums">{summaryStats.totalSent.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Total Opens</div>
            <div className="text-2xl font-medium tabular-nums">{summaryStats.totalOpens.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Avg. Open Rate</div>
            <div className="text-2xl font-medium tabular-nums">{summaryStats.avgRate}%</div>
          </div>
          <div className="stat-card">
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Best Campaign</div>
            <div className="text-lg font-medium truncate" title={summaryStats.bestName}>{summaryStats.bestRate}%</div>
            <div className="text-2xs text-gallery-mid truncate mt-0.5" title={summaryStats.bestName}>{summaryStats.bestName}</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gallery-light text-sm">Loading campaigns...</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-gallery-border">
          <p className="font-serif italic text-xl text-gallery-mid mb-2">No campaigns yet</p>
          <p className="text-sm text-gallery-light mb-6">
            Create your first campaign to start sending personalized emails.
          </p>
          <a href="/campaigns/new" className="btn-primary">Create Campaign</a>
        </div>
      ) : (
        <div className="border border-gallery-border bg-gallery-white">
          <div className="hidden sm:grid grid-cols-[1fr_80px_80px_80px_80px] gap-4 px-5 py-2 border-b border-gallery-border bg-gallery-bg">
            {[
              { key: 'name',     label: 'Campaign' },
              { key: 'status',   label: 'Status', noSort: true },
              { key: 'sent',     label: 'Sent' },
              { key: 'opens',    label: 'Opens' },
              { key: 'openRate', label: 'Rate' },
            ].map((col) => (
              <button
                key={col.key}
                onClick={() => !col.noSort && handleSort(col.key)}
                className={`text-2xs font-medium uppercase tracking-wider text-gallery-mid text-left flex items-center ${col.noSort ? 'cursor-default' : 'hover:text-gallery-black transition-colors'}`}
              >
                {col.label}
                {!col.noSort && <SortIcon active={sortKey === col.key} dir={sortDir} />}
              </button>
            ))}
          </div>

          {sorted.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-1 sm:grid-cols-[1fr_80px_80px_80px_80px] gap-1 sm:gap-4 items-center px-4 sm:px-5 py-4 border-b border-gallery-border last:border-0 hover:bg-gallery-bg transition-colors cursor-pointer"
              onClick={() => (window.location.href = `/campaigns/${c.id}`)}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 sm:gap-0">
                  <div className="font-medium text-sm truncate">{c.Name}</div>
                  <span className={`sm:hidden flex-shrink-0 ml-auto ${
                    c.Status === 'Sent'     ? 'badge-sent'
                    : c.Status === 'Sending'  ? 'badge bg-yellow-50 text-yellow-700'
                    : c.Status === 'Partial'  ? 'badge bg-orange-50 text-orange-700'
                    : 'badge bg-gray-50 text-gallery-mid'
                  }`}>
                    {c.Status || 'Draft'}
                  </span>
                </div>
                {c.Subject && c.Subject !== c.Name && (
                  <div className="text-2xs text-gallery-mid mt-0.5 truncate">{c.Subject}</div>
                )}
              </div>

              <div className="hidden sm:block">
                <span className={`${
                  c.Status === 'Sent'     ? 'badge-sent'
                  : c.Status === 'Sending'  ? 'badge bg-yellow-50 text-yellow-700'
                  : c.Status === 'Partial'  ? 'badge bg-orange-50 text-orange-700'
                  : 'badge bg-gray-50 text-gallery-mid'
                }`}>
                  {c.Status || 'Draft'}
                </span>
              </div>

              <div className="flex sm:contents gap-4 text-2xs text-gallery-mid sm:text-sm sm:text-gallery-black">
                <span className="sm:hidden">Sent:</span>
                <span className="font-medium text-gallery-black sm:font-medium sm:text-sm tabular-nums">
                  {c._sent || c['Sent Count'] || 0}
                </span>
                <span className="sm:hidden ml-3">Opens:</span>
                <span className="font-medium text-gallery-black sm:font-medium sm:text-sm tabular-nums">
                  {c._opens || 0}
                </span>
                <span className="sm:hidden ml-3">Rate:</span>
                <span className={`font-medium sm:text-sm tabular-nums ${
                  parseFloat(c._openRate) >= 40 ? 'text-gallery-success sm:text-gallery-success'
                  : parseFloat(c._openRate) >= 20 ? 'text-gallery-black'
                  : 'text-gallery-mid'
                }`}>
                  {c._openRate && c._openRate > 0 ? `${c._openRate}%` : '\u2014'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
