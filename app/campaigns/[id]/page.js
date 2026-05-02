'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import {
  computeChartData,
  OpensOverTime,
  DeviceBreakdown,
  TopLinks,
  EngagementSummary,
} from '@/components/CampaignCharts';

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

function TimeAgo({ date }) {
  if (!date) return <span className="text-gallery-light">-</span>;
  const now = new Date();
  const d = new Date(date);
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  let text;
  if (diffMin < 1) text = 'Just now';
  else if (diffMin < 60) text = `${diffMin}m ago`;
  else if (diffHr < 24) text = `${diffHr}h ago`;
  else if (diffDay < 7) text = `${diffDay}d ago`;
  else text = formatDate(date);

  return <span title={formatDate(date)}>{text}</span>;
}

export default function CampaignDetailPage() {
  const params = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedEmail, setExpandedEmail] = useState(null);
  const [recipientFilter, setRecipientFilter] = useState('all');

  useEffect(() => {
    if (!params.id) return;

    setLoading(true);
    setData(null);

    fetch(`/api/campaigns?id=${params.id}`)
      .then(async (r) => {
        const json = await r.json();
        if (!r.ok) throw new Error(json.error || 'Failed to load campaign');
        return json;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setData(null);
        setLoading(false);
      });
  }, [params.id]);


  const chartData = useMemo(() => {
    if (!data) return null;
    return computeChartData(data.events, data.recipients);
  }, [data]);

  if (loading) {
    return (
      <div className="text-center py-20 text-gallery-light text-sm">
        Loading campaign data...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-20 text-gallery-light text-sm">
        Campaign not found.
      </div>
    );
  }

    const { campaign, stats, recipients, events } = data;

  if (!stats || !recipients || !events) {
    return (
      <div className="text-center py-20 text-gallery-light text-sm">
        Campaign not found.
      </div>
    );
  }


  const getRecipientEvents = (email) =>
    events
      .filter((e) => e['Recipient Email'] === email)
      .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));

  return (
    <div>
      <a
        href="/"
        className="text-2xs text-gallery-mid hover:text-gallery-black transition-colors mb-4 inline-block"
      >
        ← Back to Campaigns
      </a>

      {/* ── Campaign header with real name ───────────────────────────────── */}
      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <h1 className="font-serif italic text-3xl mb-1">
            {campaign?.name || 'Campaign Detail'}
          </h1>
          {campaign?.subject && (
            <p className="text-sm text-gallery-mid">{campaign.subject}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 mt-1">
          <a
            href={`/campaigns/new?followup=${params.id}`}
            className="btn-secondary text-xs py-1.5 px-4"
          >
            Follow-up
          </a>
          {(campaign?.status === 'Sent' || campaign?.status === 'Partial') && (
            <a
              href={`/campaigns/new?campaign=${params.id}`}
              className="btn-secondary text-xs py-1.5 px-4"
            >
              + Add Recipients
            </a>
          )}
          {campaign?.status && (
            <span
              className={`${
                campaign.status === 'Sent'
                  ? 'badge-sent'
                  : campaign.status === 'Sending'
                    ? 'badge bg-yellow-50 text-yellow-700'
                    : campaign.status === 'Partial'
                      ? 'badge bg-orange-50 text-orange-700'
                      : 'badge bg-gray-50 text-gallery-mid'
              }`}
            >
              {campaign.status}
            </span>
          )}
        </div>
      </div>

      {/* ── Stats row ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 mb-8">
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Sent</div>
          <div className="text-2xl font-medium tabular-nums">{stats.sent}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Unique Opens</div>
          <div className="text-2xl font-medium tabular-nums">{stats.uniqueOpens}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Total Opens</div>
          <div className="text-2xl font-medium tabular-nums">{stats.totalOpens}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Open Rate</div>
          <div className="text-2xl font-medium tabular-nums">{stats.openRate}%</div>
        </div>
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">PDF Clicks</div>
          <div className="text-2xl font-medium tabular-nums">{stats.uniqueClicks || 0}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">Click Rate</div>
          <div className="text-2xl font-medium tabular-nums">{stats.clickRate || 0}%</div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────────── */}
      {chartData && (
        <div className="mb-8 space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <OpensOverTime data={chartData.hourlyOpens} />
            </div>
            <div>
              <EngagementSummary stats={stats} />
            </div>
          </div>
          {(chartData.hasDeviceData || chartData.hasClickData) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <DeviceBreakdown data={chartData.devices} />
              <TopLinks data={chartData.topLinks} />
            </div>
          )}
        </div>
      )}

      {/* ── Recipients table ─────────────────────────────────────────────── */}
      <div className="overflow-x-auto border border-gallery-border bg-gallery-white">
        <div className="px-5 py-3 border-b border-gallery-border flex items-center justify-between gap-4">
          <span className="text-2xs font-medium uppercase tracking-wider text-gallery-mid">
            Recipients ({recipients.length})
          </span>
          <div className="flex gap-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'opened', label: 'Opened' },
              { key: 'not-opened', label: 'Not opened' },
              { key: 'clicked', label: 'Clicked' },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setRecipientFilter(f.key)}
                className={`text-2xs px-2.5 py-1 transition-colors ${
                  recipientFilter === f.key
                    ? 'bg-gallery-black text-white'
                    : 'border border-gallery-border text-gallery-mid hover:text-gallery-black'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {recipients
          .filter((r) => {
            if (recipientFilter === 'opened') return r.opens > 0;
            if (recipientFilter === 'not-opened') return r.opens === 0;
            if (recipientFilter === 'clicked') return r.clicks > 0;
            return true;
          })
          .map((r) => (
          <div key={r.email} className="border-b border-gallery-border last:border-0">
            <div
              className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-gallery-bg transition-colors"
              onClick={() => setExpandedEmail(expandedEmail === r.email ? null : r.email)}
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{r.name}</div>
                <div className="text-2xs text-gallery-mid truncate">{r.email}</div>
              </div>

              <div className="flex-shrink-0">
                {r.opens > 0 ? (
                  <span className="badge-open">Opened</span>
                ) : r.sent ? (
                  <span className="badge-sent">Sent</span>
                ) : (
                  <span className="badge-failed">Failed</span>
                )}
              </div>

              <div className="text-right w-12 flex-shrink-0">
                <div className="text-xs sm:text-sm font-medium tabular-nums">{r.opens}</div>
                <div className="text-2xs text-gallery-light">opens</div>
              </div>

              <div className="text-right w-12 flex-shrink-0">
                <div className="text-xs sm:text-sm font-medium tabular-nums">{r.clicks || 0}</div>
                <div className="text-2xs text-gallery-light">clicks</div>
              </div>

              <div className="text-right w-20 text-2xs text-gallery-mid hidden sm:block flex-shrink-0">
                {r.devices.join(', ') || '-'}
              </div>

              <div className="text-right w-24 text-2xs text-gallery-mid hidden sm:block flex-shrink-0">
                <TimeAgo date={r.lastOpen} />
              </div>

              <div className="text-gallery-light text-xs w-4 flex-shrink-0">
                {expandedEmail === r.email ? '−' : '+'}
              </div>
            </div>

            {expandedEmail === r.email && (
              <div className="bg-gallery-bg px-5 py-4 border-t border-gallery-border">
                <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-3">
                  Activity Timeline
                </div>
                <div className="space-y-2">
                  {getRecipientEvents(r.email).map((event, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div
                        className="w-1.5 h-1.5 mt-1.5 rounded-full flex-shrink-0"
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
                            <span className="text-gallery-mid ml-2">on {event.Device}</span>
                          )}
                        </div>
                        {event['Clicked URL'] && (
                          <div className="text-2xs text-gallery-accent mt-0.5 truncate" title={event['Clicked URL']}>
                            {event['Clicked URL']}
                          </div>
                        )}
                        <div className="text-2xs text-gallery-light">
                          {formatDate(event.Timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

