import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from './components/Navbar';
import { ThemeProvider } from './components/ThemeProvider';

export const metadata: Metadata = {
  title: 'Realtime SynthID Remover | AI Watermark Remover & Metadata Stripper',
  description:
    '100% Free, Private local AI watermark remover. Strip EXIF, XMP, C2PA Content Credentials metadata, inpaint visible marks, and disrupt Google SynthID frequency signals.',
  keywords: [
    'AI watermark remover',
    'SynthID Remover',
    'C2PA Content Credentials',
    'Gemini watermark remover',
    'EXIF stripper',
  ],
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
    apple: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="scroll-smooth">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600&family=Geist:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="flex min-h-screen flex-col bg-white text-black dark:bg-black dark:text-white selection:bg-black selection:text-white dark:selection:bg-white dark:selection:text-black">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Navbar />
          <main className="flex-1">{children}</main>

          <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 py-10 text-xs text-neutral-500 dark:text-neutral-400">
            <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-xs border border-black bg-black dark:border-white dark:bg-white" />
                <span className="font-sans font-semibold text-black dark:text-white">SynthID Remover</span>
                <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">· 100% Free Local Engine</span>
              </div>
              <p className="text-center sm:text-right">
                Use responsibly on media you own or have permission to modify.
              </p>
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
