'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ShieldCheck, History, Moon, Sun, Github, LayoutDashboard } from 'lucide-react';
import { useTheme } from 'next-themes';

export const Navbar: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    const currentPath = window.location.pathname.replace(/\/$/, '');
    const homePath = basePath.replace(/\/$/, '');

    if (currentPath === homePath || currentPath === '' || currentPath === '/') {
      e.preventDefault();
      const el = document.getElementById(targetId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.pushState(null, '', `${basePath}/#${targetId}`);
      }
    }
  };

  return (
    <header className="sticky top-0 z-50 h-16 w-full border-b border-neutral-200 bg-white/80 dark:border-neutral-800 dark:bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Left Section: Brand & Nav Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="group flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <div className="relative flex h-5 w-5 items-center justify-center rounded border border-black bg-white dark:border-white dark:bg-black transition-transform duration-300 group-hover:scale-105">
              <span className="h-2 w-2 rounded-xs bg-black dark:bg-white" />
            </div>
            <span className="font-sans text-base font-semibold tracking-tight text-black dark:text-white">
              SynthID Remover
            </span>
            <div className="hidden items-center gap-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-neutral-100 dark:bg-neutral-900 px-2.5 py-0.5 font-mono text-[10px] font-medium tracking-tight text-neutral-700 dark:text-neutral-300 uppercase sm:flex">
              <ShieldCheck className="h-3 w-3 text-black dark:text-white" />
              <span>100% Private & Local</span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-6 font-sans text-xs font-medium tracking-wide text-neutral-500 dark:text-neutral-400 md:flex">
            <a
              href={`${basePath}/#workspace`}
              onClick={(e) => handleNavClick(e, 'workspace')}
              className="transition-colors hover:text-black dark:hover:text-white cursor-pointer"
            >
              Workspace
            </a>
            <a
              href={`${basePath}/#how-it-works`}
              onClick={(e) => handleNavClick(e, 'how-it-works')}
              className="transition-colors hover:text-black dark:hover:text-white cursor-pointer"
            >
              How It Works
            </a>
            <a
              href={`${basePath}/#capabilities`}
              onClick={(e) => handleNavClick(e, 'capabilities')}
              className="transition-colors hover:text-black dark:hover:text-white cursor-pointer"
            >
              Capabilities
            </a>
            <Link href="/dashboard" className="flex items-center gap-1.5 transition-colors hover:text-black dark:hover:text-white">
              <History className="h-3.5 w-3.5" />
              History
            </Link>
          </nav>
        </div>

        {/* Right Status Badge & Actions */}
        <div className="flex items-center gap-2.5">

          <a
            href="https://github.com/satiricalguru/synthid-remover"
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 transition-all hover:border-black hover:bg-black hover:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-black cursor-pointer"
            aria-label="GitHub Repository"
            title="GitHub Repository"
          >
            <Github className="h-4 w-4" />
          </a>

          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 transition-all hover:border-black hover:bg-black hover:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-black"
            aria-label="Toggle Theme"
          >
            {mounted ? (
              theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
            ) : (
              <div className="h-4 w-4" />
            )}
          </button>

          <Link
            href="/dashboard"
            className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-neutral-700 dark:text-neutral-300 transition-all hover:border-black hover:bg-black hover:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-black"
            aria-label="Dashboard"
            title="Dashboard"
          >
            <LayoutDashboard className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
};
