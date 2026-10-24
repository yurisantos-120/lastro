import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeInitializer } from '@/components/theme-initializer';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  other: {
    google: 'notranslate',
  },
  title: 'Lastro',
  description: 'Sistema de gestão de informações operacionais.',
  openGraph: {
    title: 'Lastro',
    description: 'Informação certa. Resposta rápida.',
    images: ['/og.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lastro',
    description: 'Informação certa. Resposta rápida.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      translate="no"
      className="notranslate"
      suppressHydrationWarning
    >
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeInitializer /><AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
