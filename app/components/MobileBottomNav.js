"use client";

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Film, Tv, Bookmark, CalendarDays } from 'lucide-react';

const NAV_ITEMS = [
  { label: 'Home', href: '/', icon: Home, match: (p) => p === '/' },
  { label: 'Movies', href: '/movies', icon: Film, match: (p) => p.startsWith('/movies') },
  { label: 'Animes', href: '/animes', icon: Tv, match: (p) => p.startsWith('/animes') || p.startsWith('/anime') },
  { label: 'Watchlist', href: '/watchlist', icon: Bookmark, match: (p) => p.startsWith('/watchlist') },
  { label: 'Schedule', href: '/schedule', icon: CalendarDays, match: (p) => p.startsWith('/schedule') },
];

export default function MobileBottomNav() {
  const pathname = usePathname() || '/';

  // Hide on immersive full-screen player/reader routes
  if (
    pathname.startsWith('/player') ||
    pathname.startsWith('/reader') ||
    pathname.startsWith('/audio-player')
  ) {
    return null;
  }

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)] border-t border-white/15 bg-black/45 backdrop-blur-2xl backdrop-saturate-150 shadow-[0_-8px_32px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.18)]"
      style={{
        background:
          'linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 45%, rgba(10,10,14,0.72) 100%), rgba(8, 8, 12, 0.55)',
      }}
    >
      <div className="grid grid-cols-5 h-[52px] max-w-lg mx-auto">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.match(pathname);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isActive ? 'text-white' : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Icon
                size={18}
                strokeWidth={isActive ? 2.4 : 1.8}
                className={isActive ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.45)]' : 'text-gray-400'}
              />
              <span
                className={`text-[9.5px] leading-none tracking-tight ${
                  isActive ? 'font-bold text-white' : 'font-medium text-gray-400'
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
