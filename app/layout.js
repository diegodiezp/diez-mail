import './globals.css';
import { DM_Sans } from 'next/font/google';
import NavBar from '@/components/NavBar';

const dmSans = DM_Sans({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata = {
  title: 'Diez Mail',
  description: 'Email campaigns for Diez Gallery',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Diez Mail',
  },
};

// Next 14 ignores viewport and themeColor declared inside `metadata` (it logs
// "Unsupported metadata viewport is configured..." at build time and emits no
// tag at all). The app therefore shipped with NO viewport meta, so phones fell
// back to a ~980px canvas and rendered every page zoomed out. They have to live
// in their own export.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#1a1a1a',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={dmSans.className}>
      <head>
        {/* Everything else (manifest, theme-color, apple-mobile-web-app-*) is
            emitted by the metadata and viewport exports above. */}
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-gallery-bg text-gallery-black font-sans antialiased">
        <div className="min-h-screen">
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>
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
