import type { Metadata, Viewport } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { DBProvider } from '@/components/DBProvider';

export const metadata: Metadata = {
  title: 'LEVEL UP // SYSTEM',
  description: 'Solo Leveling IRL – Daily Protocol System',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'LEVEL UP',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0e17',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icon-192.svg" />
      </head>
      <body className="min-h-screen pb-20">
        <DBProvider>
          {children}
        </DBProvider>
        <BottomNav />
      </body>
    </html>
  );
}
