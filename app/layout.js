import './globals.css';
import { DM_Sans } from 'next/font/google';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Diez Mail',
  description: 'Email campaigns for Diez Gallery',
  manifest: '/manifest.json',
  themeColor: '#1a1a1a',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Diez Mail',
  },
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={dmSans.className}>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1a1a1a" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Diez Mail" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-gallery-bg text-gallery-black font-sans antialiased">
        <div className="min-h-screen">
          <nav className="border-b border-gallery-border bg-gallery-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
              <a href="/" className="font-serif text-lg sm:text-xl tracking-wide text-gallery-black">
                Diez Mail
              </a>
              <div className="flex gap-4 sm:gap-8 text-xs sm:text-sm">
                <a href="/" className="text-gallery-mid hover:text-gallery-black transition-colors">
                  Campaigns
                </a>
                <a href="/campaigns/new" className="text-gallery-mid hover:text-gallery-black transition-colors">
                  New
                </a>
                <a href="/contacts" className="text-gallery-mid hover:text-gallery-black transition-colors">
                  Contacts
                </a>
              </div>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">{children}</main>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
