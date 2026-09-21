'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const LINKS = [
  { href: '/', label: 'Activity' },
  { href: '/campaigns', label: 'Campaigns' },
  { href: '/mail', label: 'Mail' },
  { href: '/contacts', label: 'Contacts' },
  { href: '/links', label: 'Links' },
  { href: '/followups', label: 'Follow-ups' },
];

export default function NavBar() {
  const pathname = usePathname();
  const [followupCount, setFollowupCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = (href) => {
    if (href === '/') {
      return pathname === '/';
    }
    if (href === '/campaigns') {
      return pathname.startsWith('/campaigns') && !pathname.startsWith('/campaigns/new');
    }
    return pathname.startsWith(href);
  };

  useEffect(() => {
    fetch('/api/followups')
      .then((r) => r.json())
      .then((data) => setFollowupCount(data.count || 0))
      .catch(() => {});
  }, []);

  // Close the mobile menu whenever navigation happens
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const countBadge = (href) =>
    href === '/followups' && followupCount > 0 ? (
      <span className="text-2xs bg-gallery-accent-light text-gallery-accent px-1.5 py-0.5 rounded-full leading-none">
        {followupCount}
      </span>
    ) : null;

  return (
    <nav className="border-b border-gallery-border bg-gallery-white sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 safe-px flex items-center justify-between nav-row">
        <Link
          href="/"
          className="font-serif italic text-lg sm:text-xl text-gallery-black hover:opacity-70 transition-opacity"
        >
          Diez Mail
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6 lg:gap-8">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`text-xs lg:text-sm transition-colors pb-0.5 flex items-center gap-1.5 whitespace-nowrap ${
                isActive(l.href)
                  ? 'text-gallery-black font-medium border-b border-gallery-black'
                  : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
              }`}
            >
              {l.label}
              {countBadge(l.href)}
            </Link>
          ))}
          <Link
            href="/campaigns/new"
            className={`btn-primary text-xs lg:text-sm whitespace-nowrap ${
              pathname.startsWith('/campaigns/new') ? 'opacity-70' : ''
            }`}
          >
            + New Campaign
          </Link>
        </div>

        {/* Mobile trigger */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          className="md:hidden -mr-2 p-2 text-gallery-black flex items-center gap-1.5"
        >
          {followupCount > 0 && !menuOpen && (
            <span className="text-2xs bg-gallery-accent-light text-gallery-accent px-1.5 py-0.5 rounded-full leading-none">
              {followupCount}
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            {menuOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="7" x2="21" y2="7" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="17" x2="21" y2="17" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gallery-border bg-gallery-white">
          <div className="px-4 safe-px py-2">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className={`flex items-center gap-2 py-3 border-b border-gallery-border last:border-0 text-sm transition-colors ${
                  isActive(l.href)
                    ? 'text-gallery-black font-medium'
                    : 'text-gallery-mid'
                }`}
              >
                {l.label}
                {countBadge(l.href)}
              </Link>
            ))}
            <Link
              href="/campaigns/new"
              onClick={() => setMenuOpen(false)}
              className="btn-primary w-full justify-center mt-3 mb-2 py-3"
            >
              + New Campaign
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
