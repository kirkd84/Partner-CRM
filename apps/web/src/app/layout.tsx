import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { tenant } from '@partnerradar/config';
import { Providers } from '@/components/Providers';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const t = tenant();
export const metadata: Metadata = {
  title: `${t.brandName} — prospecting CRM`,
  description: `Prospecting CRM for ${t.legalName}. Activated partners flow to Storm Cloud.`,
  // iOS PWA chrome — apple-mobile-web-app-capable + status-bar style
  // make the standalone install render fullscreen with a translucent
  // status bar instead of Safari's URL bar.
  appleWebApp: {
    capable: true,
    title: t.brandName,
    statusBarStyle: 'black-translucent',
  },
  applicationName: t.brandName,
  formatDetection: {
    telephone: false, // prevent iOS auto-linkifying phone numbers in lists
  },
};

// Viewport metadata moved out of `metadata` per Next 15 deprecation —
// theme-color paints the Android URL bar; viewport-fit=cover lets us
// extend backgrounds to the iPhone notch.
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  // userScalable left as the default (true) so reps can still pinch-zoom
  // on data-dense tables.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
