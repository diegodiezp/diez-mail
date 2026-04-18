'use client';

// ─────────────────────────────────────────────────────────────────────────────
// CampaignCharts.js
// Pure SVG chart components derived from the existing events[] array returned
// by /api/campaigns?id=xxx. No new backend changes needed.
//
// Exports:
//   computeChartData(events, recipients)  → derives all chart data from raw events
//   OpensOverTime      <OpensOverTime data={chartData.hourlyOpens} />
//   DeviceBreakdown    <DeviceBreakdown data={chartData.devices} />
//   TopLinks           <TopLinks data={chartData.topLinks} />
//   EngagementSummary  <EngagementSummary stats={stats} />
// ─────────────────────────────────────────────────────────────────────────────

// ── Data derivation ───────────────────────────────────────────────────────────

/**
 * Derive all chart-ready data from the raw events + recipients arrays.
 * Call once at the top of the page component, memoize with useMemo.
 */
export function computeChartData(events = [], recipients = []) {
  // ── Opens over time (by hour offset from first Sent event) ──────────────
  const sentEvents = events.filter((e) => e['Event Type'] === 'Sent');
  const openEvents = events.filter((e) => e['Event Type'] === 'Open');
  const clickEvents = events.filter((e) => e['Event Type'] === 'Click');

  const firstSentTs = sentEvents.length
    ? Math.min(...sentEvents.map((e) => new Date(e.Timestamp).getTime()).filter(Boolean))
    : null;

  // Bucket opens into 24 hourly slots
  const hourlyOpens = Array(24).fill(0);
  if (firstSentTs) {
    for (const ev of openEvents) {
      const ts = new Date(ev.Timestamp).getTime();
      if (!ts) continue;
      const diffHr = Math.floor((ts - firstSentTs) / 3600000);
      if (diffHr >= 0 && diffHr < 24) hourlyOpens[diffHr]++;
    }
  }

  // ── Device breakdown (from all Open + Click events) ──────────────────────
  const deviceMap = {};
  for (const ev of [...openEvents, ...clickEvents]) {
    if (!ev.Device) continue;
    // Normalise: iPhone/iPad → Mobile, etc.
    let d = ev.Device;
    if (/iphone|android|mobile/i.test(d)) d = 'Mobile';
    else if (/ipad|tablet/i.test(d)) d = 'Tablet';
    else d = 'Desktop';
    deviceMap[d] = (deviceMap[d] || 0) + 1;
  }
  const deviceTotal = Object.values(deviceMap).reduce((s, v) => s + v, 0) || 1;
  const devices = Object.entries(deviceMap)
    .map(([label, count]) => ({ label, count, pct: Math.round((count / deviceTotal) * 100) }))
    .sort((a, b) => b.count - a.count);

  // ── Top clicked URLs ──────────────────────────────────────────────────────
  const urlMap = {};
  for (const r of recipients) {
    for (const url of r.clickedUrls || []) {
      urlMap[url] = (urlMap[url] || 0) + 1;
    }
  }
  const topLinks = Object.entries(urlMap)
    .map(([url, clicks]) => ({ url, clicks }))
    .sort((a, b) => b.clicks - a.clicks)
    .slice(0, 5);

  // ── Has any data flags ────────────────────────────────────────────────────
  const hasOpensData = openEvents.length > 0;
  const hasClickData = clickEvents.length > 0;
  const hasDeviceData = Object.keys(deviceMap).length > 0;

  return { hourlyOpens, devices, topLinks, hasOpensData, hasClickData, hasDeviceData };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-1">
      {children}
    </p>
  );
}

function SubLabel({ children }) {
  return <p className="text-2xs text-gallery-light mb-4">{children}</p>;
}

function EmptyState({ message = 'No data yet' }) {
  return (
    <div className="flex items-center justify-center h-24 text-gallery-light text-2xs italic">
      {message}
    </div>
  );
}

// ── Opens Over Time ───────────────────────────────────────────────────────────

export function OpensOverTime({ data = [] }) {
  const max = Math.max(...data) || 1;
  const W = 600, H = 100;
  const pad = 4;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - pad - ((v / max) * (H - pad * 2));
    return [x, y];
  });

  const linePts = pts.map((p) => p.join(',')).join(' ');
  const fillPts = [...pts, [W, H], [0, H]].map((p) => p.join(',')).join(' ');
  const hourTicks = [0, 6, 12, 18, 23];
  const hasData = data.some((v) => v > 0);

  return (
    <div className="stat-card">
      <SectionLabel>Opens over time</SectionLabel>
      <SubLabel>First 24 hours after send</SubLabel>
      {!hasData ? (
        <EmptyState message="No open events recorded yet" />
      ) : (
        <svg
          width="100%"
          height={H + 20}
          viewBox={`0 0 ${W} ${H + 20}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id="opensGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c45a3c" stopOpacity="0.12" />
              <stop offset="100%" stopColor="#c45a3c" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={fillPts} fill="url(#opensGrad)" />
          <polyline
            points={linePts}
            fill="none"
            stroke="#c45a3c"
            strokeWidth="1.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {hourTicks.map((i) => (
            <text
              key={i}
              x={(i / 23) * W}
              y={H + 16}
              textAnchor="middle"
              fontSize={9}
              fill="#b0b0b0"
              fontFamily="DM Sans, sans-serif"
            >
              {i}:00
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}

// ── Device Breakdown ──────────────────────────────────────────────────────────

export function DeviceBreakdown({ data = [] }) {
  return (
    <div className="stat-card">
      <SectionLabel>Device breakdown</SectionLabel>
      <SubLabel>From open &amp; click events</SubLabel>
      {data.length === 0 ? (
        <EmptyState message="No device data yet" />
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.label}>
              <div className="flex justify-between text-sm mb-1">
                <span>{d.label}</span>
                <span className="text-gallery-mid">{d.pct}%</span>
              </div>
              <div className="h-0.5 bg-gallery-border">
                <div
                  className="h-full bg-gallery-accent transition-all duration-500"
                  style={{ width: `${d.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Top Links ─────────────────────────────────────────────────────────────────

export function TopLinks({ data = [] }) {
  const maxClicks = data[0]?.clicks || 1;

  // Truncate long URLs for display
  const display = (url) => {
    try {
      const u = new URL(url);
      const path = u.pathname.replace(/\/$/, '') || '/';
      return path.length > 36 ? path.slice(0, 36) + '…' : path;
    } catch {
      return url.length > 40 ? url.slice(0, 40) + '…' : url;
    }
  };

  return (
    <div className="stat-card">
      <SectionLabel>Top links clicked</SectionLabel>
      <SubLabel>Unique clicks per URL</SubLabel>
      {data.length === 0 ? (
        <EmptyState message="No click data recorded yet" />
      ) : (
        <div className="space-y-3">
          {data.map((link, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="text-sm text-gallery-accent flex-1 truncate"
                title={link.url}
              >
                {display(link.url)} →
              </span>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="w-20 h-0.5 bg-gallery-border">
                  <div
                    className="h-full bg-gallery-accent"
                    style={{ width: `${(link.clicks / maxClicks) * 100}%` }}
                  />
                </div>
                <span className="text-2xs text-gallery-mid w-5 text-right tabular-nums">
                  {link.clicks}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Engagement Summary (donut trio) ───────────────────────────────────────────

function Donut({ value, max, color, label }) {
  const r = 26, cx = 32, cy = 32;
  const circ = 2 * Math.PI * r;
  const pct = max > 0 ? value / max : 0;
  const dash = pct * circ;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={64} height={64} viewBox="0 0 64 64">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e0e0e0" strokeWidth={6} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${dash} ${circ - dash}`}
          strokeDashoffset={circ / 4}
          strokeLinecap="butt"
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={500}
          fill="#1a1a1a"
          fontFamily="DM Sans, sans-serif"
        >
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <span className="text-2xs uppercase tracking-wider text-gallery-mid font-medium">
        {label}
      </span>
    </div>
  );
}

export function EngagementSummary({ stats }) {
  const { sent, uniqueOpens, uniqueClicks } = stats;
  return (
    <div className="stat-card">
      <SectionLabel>Engagement breakdown</SectionLabel>
      <SubLabel>Of total recipients sent</SubLabel>
      <div className="flex justify-around pt-1">
        <Donut value={uniqueOpens} max={sent} color="#c45a3c" label="Opened" />
        <Donut value={uniqueClicks} max={sent} color="#3a7d44" label="Clicked" />
        <Donut
          value={sent - uniqueOpens}
          max={sent}
          color="#b0b0b0"
          label="No open"
        />
      </div>
    </div>
  );
}
