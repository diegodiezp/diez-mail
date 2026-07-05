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

  useEffect(() => {
    fetch('/api/followups')
      .then((r) => r.json())
      .then((data) => setFollowupCount(data.count || 0))
      .catch(() => {});
  }, []);

  return (
    <nav className="border-b border-gallery-border bg-gallery-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <Link
          href="/"
          className="font-serif italic text-lg sm:text-xl text-gallery-black hover:opacity-70 transition-opacity"
        >
          Diez Mail
        </Link>
        <div className="flex items-center gap-6 sm:gap-8">
          <Link
            href="/"
            className={`text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/') && !isActive('/campaigns') && !isActive('/contacts') && !isActive('/mail')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Activity
          </Link>
          <Link
            href="/campaigns"
            className={`text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/campaigns') && !isActive('/campaigns/new')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Campaigns
          </Link>
          <Link
            href="/mail"
            className={`text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/mail')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Mail
          </Link>
          <Link
            href="/contacts"
            className={`text-xs sm:text-sm transition-colors pb-0.5 ${
              isActive('/contacts')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Contacts
          </Link>
          <Link
            href="/followups"
            className={`text-xs sm:text-sm transition-colors pb-0.5 flex items-center gap-1.5 ${
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
          <Link
            href="/campaigns/new"
            className={`btn-primary text-xs sm:text-sm ${
              isActive('/campaigns/new') ? 'opacity-70' : ''
            }`}
          >
            + New Campaign
          </Link>
        </div>
      </div>
    </nav>
  );
}
