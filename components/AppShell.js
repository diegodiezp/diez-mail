'use client';

import { usePathname } from 'next/navigation';
import NavBar from '@/components/NavBar';

// Routes rendered without the app chrome (no nav, no page gutters).
const BARE_ROUTES = ['/login'];

export default function AppShell({ children }) {
  const pathname = usePathname();

  if (BARE_ROUTES.includes(pathname)) {
    return children;
  }

  return (
    <div className="min-h-[100dvh]">
      <NavBar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 safe-px safe-pb">
        {children}
      </main>
    </div>
  );
}
