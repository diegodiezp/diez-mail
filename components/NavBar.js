'use client';
import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
export default function NavBar() {
  const pathname = usePathname();
  const [followupCount, setFollowupCount] = useState(0);
  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const onLogin = pathname === '/login';

  useEffect(() => {
    if (onLogin) return;
    fetch('/api/followups')
      .then((r) => r.json())
      .then((data) => setFollowupCount(data.count || 0))
      .catch(() => {});
  }, [onLogin]);

  // The login screen has its own layout; the nav only made it wider than the phone
  if (onLogin) return null;

  return (
    <nav className="border-b border-gallery-border bg-gallery-white">
      {/* Phone: name and "New" on one row, the sections on a second row that
          scrolls sideways. From sm up: one row, as before. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2.5">
        <Link
          href="/"
          className="order-1 font-serif italic text-lg sm:text-xl text-gallery-black hover:opacity-70 transition-opacity"
        >
          Diez Mail
        </Link>
        <div className="order-3 sm:order-2 w-full sm:w-auto sm:ml-auto flex items-center gap-4 sm:gap-8 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible">
          <Link
            href="/"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/') && !isActive('/campaigns') && !isActive('/contacts') && !isActive('/mail')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Activity
          </Link>
          <Link
            href="/campaigns"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/campaigns') && !isActive('/campaigns/new')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Campaigns
          </Link>
          <Link
            href="/mail"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/mail')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Mail
          </Link>
          <Link
            href="/contacts"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/contacts')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Contacts
          </Link>
          <Link
            href="/links"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/links')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Links
          </Link>
          <Link
            href="/followups"
            className={`shrink-0 whitespace-nowrap text-xs sm:text-sm transition-colors pb-0.5 flex items-center gap-1.5 ${
              isActive('/followups')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Follow-ups
            {followupCount > 0 && (
              <span className="text-2xs bg-gallery-accent-light text-gallery-accent px-1.5 py-0.5 rounded-full leading-none">
                {followupCount}
              </span>
            )}
          </Link>
        </div>
        <Link
          href="/campaigns/new"
          className={`order-2 sm:order-3 sm:ml-8 shrink-0 whitespace-nowrap btn-primary text-xs sm:text-sm ${
            isActive('/campaigns/new') ? 'opacity-70' : ''
          }`}
        >
          + New<span className="hidden sm:inline">&nbsp;Campaign</span>
        </Link>
      </div>
    </nav>
  );
}
