import type { Metadata } from 'next';
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
