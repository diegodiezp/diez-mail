'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';

export default function NavBar() {
  const pathname = usePathname();

  const isActive = (href) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

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
              isActive('/') && !isActive('/campaigns') && !isActive('/contacts')
                ? 'text-gallery-black font-medium border-b border-gallery-black'
                : 'text-gallery-mid hover:text-gallery-black border-b border-transparent'
            }`}
          >
            Campaigns
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
