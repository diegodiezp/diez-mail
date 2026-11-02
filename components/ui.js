'use client';
// Shared building blocks for 2.0 screens.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { initials, stepDot } from '@/lib/format';

export function PageHeader({ title, sub, actions, eyebrow }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {sub && <p className="page-sub">{sub}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// Route tabs: [{ href, label, count }]
export function Tabs({ items }) {
  const pathname = usePathname();
  return (
    <div className="flex items-center gap-5 border-b border-gallery-border mb-5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
      {items.map((t) => {
        const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`shrink-0 py-2.5 -mb-px text-sm border-b transition-colors ${
              active ? 'border-gallery-black text-gallery-black' : 'border-transparent text-gallery-mid hover:text-gallery-black'
            }`}
          >
            {t.label}
            {t.count > 0 && <span className="ml-1.5 text-2xs text-gallery-light num">{t.count}</span>}
          </Link>
        );
      })}
    </div>
  );
}

// In-page segmented control: value/onChange with [{ value, label, count }]
export function Segmented({ value, onChange, options }) {
  return (
    <div className="inline-flex border border-gallery-border bg-gallery-white">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs transition-colors border-r border-gallery-border last:border-0 ${
            value === o.value ? 'bg-gallery-black text-white' : 'text-gallery-mid hover:text-gallery-black'
          }`}
        >
          {o.label}
          {o.count > 0 && <span className={`ml-1.5 num ${value === o.value ? 'text-white/70' : 'text-gallery-light'}`}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Avatar({ name, size = 36, className = '' }) {
  return (
    <div
      className={`flex items-center justify-center bg-gallery-bg border border-gallery-border text-gallery-mid flex-shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

export function Dot({ step = 1, className = '' }) {
  return <span className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${stepDot(step)} ${className}`} />;
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="text-center py-14 px-6">
      <p className="text-base text-gallery-black mb-1">{title}</p>
      {children && <p className="text-sm text-gallery-mid max-w-sm mx-auto">{children}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function SkeletonRows({ rows = 6, avatar = true }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="row">
          {avatar && <div className="skeleton h-9 w-9" />}
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
            <div className="skeleton h-2.5" style={{ width: `${30 + ((i * 23) % 30)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="stat-card space-y-3">
          <div className="skeleton h-2.5 w-1/2" />
          <div className="skeleton h-6 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }) {
  return (
    <div className="stat-card">
      <div className="eyebrow mb-1.5">{label}</div>
      <div className="text-2xl num leading-none">{value}</div>
      {hint && <div className="text-2xs text-gallery-light mt-1.5">{hint}</div>}
    </div>
  );
}

// Artwork thumbnail served by the viewing rooms (rooms.diez.gallery/api/image)
export function ArtworkThumb({ id, title, size = 56, className = '' }) {
  if (!id) {
    return <div className={`bg-gallery-bg border border-gallery-border flex-shrink-0 ${className}`} style={{ width: size, height: size }} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://rooms.diez.gallery/api/image?id=${encodeURIComponent(id)}&size=${size > 64 ? 'large' : 'large'}`}
      alt={title || ''}
      loading="lazy"
      className={`object-cover bg-gallery-bg border border-gallery-border flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Icon({ name, size = 18, className = '' }) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
    strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', className, 'aria-hidden': true,
  };
  switch (name) {
    case 'today': return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'people': return <svg {...p}><circle cx="9" cy="8.5" r="3.5" /><path d="M2.5 19.5c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" /><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M18 14.8c1.8.7 3 2.3 3.5 4.7" /></svg>;
    case 'campaigns': return <svg {...p}><path d="M3.5 6.5h17v11h-17z" /><path d="m3.5 7 8.5 6 8.5-6" /></svg>;
    case 'mail': return <svg {...p}><path d="M4 5.5h16v13H4z" /><path d="M4 14h4.5l1.5 2h4l1.5-2H20" /></svg>;
    case 'search': return <svg {...p}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /></svg>;
    case 'plus': return <svg {...p}><path d="M12 5v14M5 12h14" /></svg>;
    case 'check': return <svg {...p}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>;
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>;
    case 'reply': return <svg {...p}><path d="M9.5 7 4.5 12l5 5" /><path d="M4.5 12h9a6 6 0 0 1 6 6v.5" /></svg>;
    case 'bell': return <svg {...p}><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5h-15z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
    case 'arrow': return <svg {...p}><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
    case 'back': return <svg {...p}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
    case 'x': return <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>;
    case 'grid': return <svg {...p}><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" /></svg>;
    case 'fair': return <svg {...p}><path d="M4 20V9l8-5 8 5v11" /><path d="M9 20v-6h6v6" /></svg>;
    case 'link': return <svg {...p}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" /></svg>;
    case 'eye': return <svg {...p}><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></svg>;
    case 'phone': return <svg {...p}><rect x="7" y="2.5" width="10" height="19" rx="1.5" /><path d="M11 18.5h2" /></svg>;
    case 'desktop': return <svg {...p}><rect x="3" y="4.5" width="18" height="12" /><path d="M9 20.5h6M12 16.5v4" /></svg>;
    case 'copy': return <svg {...p}><rect x="8.5" y="8.5" width="11" height="11" /><path d="M15.5 8.5v-4h-11v11h4" /></svg>;
    case 'more': return <svg {...p}><circle cx="5.5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="18.5" cy="12" r="1" fill="currentColor" /></svg>;
    default: return null;
  }
}

export function BackLink({ href, children }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 text-xs text-gallery-mid hover:text-gallery-black transition-colors mb-5">
      <Icon name="back" size={14} />
      {children}
    </Link>
  );
}
