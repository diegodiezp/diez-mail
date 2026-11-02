import './globals.css';
import NavBar from '@/components/NavBar';
import CommandPalette from '@/components/CommandPalette';

export const metadata = {
  title: 'Diez Mail',
  description: 'Collectors, signals and campaigns for diez gallery',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Diez Mail',
  },
};

// Next 14 ignores viewport/themeColor inside metadata; they live here.
// Pinch zoom stays allowed, in the browser and in the home-screen app.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#ffffff',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" href="/fonts/Replica_Regular.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Diez Mail" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className="bg-gallery-bg text-gallery-black font-sans antialiased">
        <div className="min-h-screen pb-tabbar">
          <NavBar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
            {children}
          </main>
        </div>
        <CommandPalette />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').then((r) => r.update()).catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
