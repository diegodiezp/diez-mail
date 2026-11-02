'use client';
// 2.0 navigation: four sections. Desktop gets one top bar; phones get a slim
// top bar (name, search, new campaign) plus a tab bar at the bottom, within
// thumb reach, the way native apps do it.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './ui';

const SECTIONS = [
  { href: '/', label: 'Today', icon: 'today', match: (p) => p === '/' || p.startsWith('/fair') },
  { href: '/contacts', label: 'People', icon: 'people', match: (p) => p.startsWith('/contacts') || p.startsWith('/works') || p.startsWith('/links') },
  { href: '/campaigns', label: 'Campaigns', icon: 'campaigns', match: (p) => p.startsWith('/campaigns') && !p.startsWith('/campaigns/new') },
  { href: '/mail', label: 'Mail', icon: 'mail', match: (p) => p.startsWith('/mail') },
];

export function openPalette() {
  window.dispatchEvent(new Event('diez:palette'));
}

export default function NavBar() {
  const pathname = usePathname();
  const [todayCount, setTodayCount] = useState(0);
  const onLogin = pathname === '/login';

  useEffect(() => {
    if (onLogin) return;
    let alive = true;
    const load = () =>
      fetch('/api/today?summary=1')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (alive && d) setTodayCount(d.count || 0); })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    window.addEventListener('diez:today-changed', load);
    return () => { alive = false; clearInterval(id); window.removeEventListener('diez:today-changed', load); };
  }, [onLogin]);

  if (onLogin) return null;

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-gallery-border bg-gallery-white/95 backdrop-blur supports-[backdrop-filter]:bg-gallery-white/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center gap-6">
          <Link href="/" className="text-[17px] tracking-tight text-gallery-black hover:opacity-70 transition-opacity shrink-0">
            diez <span className="text-gallery-light">mail</span>
          </Link>

          <nav className="hidden sm:flex items-center gap-1 ml-2" aria-label="Sections">
            {SECTIONS.map((s) => {
              const active = s.match(pathname);
              return (
                <Link
                  key={s.href}
                  href={s.href}
                  className={`relative px-3 py-1.5 text-sm transition-colors ${
                    active ? 'text-gallery-black' : 'text-gallery-mid hover:text-gallery-black'
                  }`}
                >
                  {s.label}
                  {s.href === '/' && todayCount > 0 && (
                    <span className="ml-1.5 text-2xs num text-gallery-accent">{todayCount}</span>
                  )}
                  {active && <span className="absolute left-3 right-3 -bottom-[13px] h-px bg-gallery-black" />}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={openPalette}
              className="flex items-center gap-2 h-9 px-2.5 sm:px-3 border border-gallery-border text-gallery-mid hover:text-gallery-black hover:border-gallery-black transition-colors"
              aria-label="Search"
            >
              <Icon name="search" size={16} />
              <span className="hidden md:inline text-xs">Search</span>
              <kbd className="hidden md:inline text-2xs text-gallery-light border border-gallery-border px-1">⌘K</kbd>
            </button>
            <Link
              href="/campaigns/new"
              className="btn-primary h-9 px-3"
              aria-label="New campaign"
            >
              <Icon name="plus" size={16} />
              <span className="hidden sm:inline">New campaign</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Phone tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 inset-x-0 z-40 border-t border-gallery-border bg-gallery-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Sections"
      >
        <div className="grid grid-cols-4">
          {SECTIONS.map((s) => {
            const active = s.match(pathname);
            return (
              <Link
                key={s.href}
                href={s.href}
                className={`relative flex flex-col items-center justify-center gap-1 h-[60px] text-[11px] ${
                  active ? 'text-gallery-black' : 'text-gallery-light'
                }`}
              >
                <Icon name={s.icon} size={22} />
                {s.label}
                {s.href === '/' && todayCount > 0 && (
                  <span className="absolute top-2 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-gallery-accent text-white text-[10px] leading-[18px] text-center num">
                    {todayCount > 99 ? '99+' : todayCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
