import type { Metadata, Viewport } from 'next';
import { Rajdhani, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';
import { DBProvider } from '@/components/DBProvider';

const rajdhani = Rajdhani({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

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
    <html lang="en" className={`${rajdhani.variable} ${jetbrainsMono.variable}`}>
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
