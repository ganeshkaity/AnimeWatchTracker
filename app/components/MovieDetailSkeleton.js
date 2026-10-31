"use client";

import React from 'react';
import { ChevronLeft } from 'lucide-react';

export default function MovieDetailSkeleton({ onBack }) {
  return (
    <div
      aria-hidden="true"
      className="min-h-screen bg-[#07090f] text-white flex flex-col relative pb-20 overflow-x-hidden animate-pulse select-none"
    >
      {/* ── Ambient Backdrop Placeholder Layer ── */}
      <div className="fixed top-0 inset-x-0 h-[460px] sm:h-[540px] pointer-events-none overflow-hidden z-0 bg-gradient-to-b from-white/[0.04] via-[#07090f]/70 to-[#07090f]">
        <div className="absolute inset-0 bg-gradient-to-t from-[#07090f] via-[#07090f]/80 to-transparent" />
      </div>

      {/* ── Top Navigation Header ── */}
      <header className="relative z-30 h-14 md:h-16 px-4 md:px-8 flex items-center justify-between bg-transparent">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-200 hover:text-white text-xs font-semibold backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          <ChevronLeft size={16} />
          <span>Movies</span>
        </button>

        {/* Right Action Placeholders */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="h-8 w-20 rounded-xl bg-white/10 border border-white/5" />
          <div className="h-8 w-32 rounded-xl bg-white/10 border border-white/5" />
          <div className="h-8 w-9 rounded-xl bg-white/10 border border-white/5" />
        </div>
        <div className="flex sm:hidden items-center gap-2">
          <div className="h-8 w-8 rounded-xl bg-white/10 border border-white/5" />
        </div>
      </header>

      {/* ── Hero Content (Poster + Movie Details) ── */}
      <div className="relative z-10 max-w-6xl w-full mx-auto px-4 md:px-6 pt-2 pb-8 sm:pb-10 border-b border-white/5">
        <div className="flex flex-col sm:flex-row gap-6 md:gap-8 items-start">
          {/* Movie Poster Column */}
          <div className="hidden sm:flex flex-col gap-3 shrink-0 w-44 sm:w-52 md:w-60">
            {/* Poster Card */}
            <div className="w-full aspect-[2/3] rounded-2xl sm:rounded-3xl overflow-hidden bg-white/[0.06] border border-white/10 shadow-2xl relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-white/[0.08]" />
              {/* Fake Rating Badge */}
              <div className="absolute top-2.5 left-2.5 h-6 w-14 rounded-lg bg-white/10 border border-white/10" />
              <div className="absolute top-2.5 right-2.5 h-4 w-10 rounded-md bg-amber-500/20" />
            </div>

            {/* Ratings Block Skeleton */}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
              <div className="flex items-center justify-between">
                <div className="h-4 w-24 rounded bg-white/10" />
                <div className="h-4 w-12 rounded bg-white/10" />
              </div>
              <div className="flex gap-2">
                <div className="h-6 flex-1 rounded-lg bg-white/10" />
                <div className="h-6 flex-1 rounded-lg bg-white/10" />
              </div>
            </div>
          </div>

          {/* Details Column */}
          <div className="flex-1 space-y-4 w-full">
            {/* Badges / Chips Row */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <div className="h-4 w-14 rounded bg-amber-400/20" />
              <div className="h-4 w-16 rounded bg-white/10" />
              <div className="h-4 w-20 rounded bg-white/10" />
              <div className="h-4 w-16 rounded bg-white/10" />
            </div>

            {/* Logo / Title Area */}
            <div className="space-y-2 py-1">
              <div className="h-9 sm:h-12 w-4/5 max-w-md rounded-2xl bg-white/15" />
              <div className="h-4 w-1/2 max-w-xs rounded bg-white/5" />
            </div>

            {/* Genres Pills */}
            <div className="flex flex-wrap gap-2 pt-1">
              <div className="h-6 w-20 rounded-lg bg-white/10" />
              <div className="h-6 w-24 rounded-lg bg-white/10" />
              <div className="h-6 w-16 rounded-lg bg-white/10" />
            </div>

            {/* Play Button Area */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <div className="h-11 sm:h-12 w-44 sm:w-52 rounded-2xl bg-gradient-to-r from-amber-500/25 to-rose-600/25 border border-amber-500/30" />
              <div className="h-11 sm:h-12 w-32 rounded-2xl bg-white/10 border border-white/10" />
            </div>

            {/* Watch Status Card Placeholder */}
            <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 space-y-2.5">
              <div className="flex justify-between items-center">
                <div className="h-3.5 w-24 rounded bg-white/10" />
                <div className="h-3.5 w-16 rounded bg-white/10" />
              </div>
              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-1/3 bg-amber-500/40 rounded-full" />
              </div>
            </div>

            {/* Storyline / Overview Placeholder */}
            <div className="space-y-2 pt-2">
              <div className="h-4 w-28 rounded bg-white/15" />
              <div className="h-3.5 w-full rounded bg-white/10" />
              <div className="h-3.5 w-11/12 rounded bg-white/10" />
              <div className="h-3.5 w-4/5 rounded bg-white/10" />
              <div className="h-3.5 w-2/3 rounded bg-white/10" />
            </div>
          </div>
        </div>
      </div>

      {/* ── Subsections Placeholders ── */}
      <div className="max-w-6xl w-full mx-auto px-4 md:px-6 pt-8 space-y-10">
        {/* File Path Card Placeholder */}
        <div className="h-16 w-full rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-3 w-32 rounded bg-white/15" />
            <div className="h-3 w-64 rounded bg-white/5" />
          </div>
          <div className="h-8 w-20 rounded-xl bg-white/10" />
        </div>

        {/* Cast Section Placeholder */}
        <div className="space-y-4">
          <div className="h-5 w-32 rounded bg-white/15" />
          <div className="flex gap-3 overflow-hidden">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="w-24 sm:w-28 shrink-0 space-y-2">
                <div className="w-full aspect-[2/3] rounded-2xl bg-white/[0.06] border border-white/5" />
                <div className="h-3 w-20 rounded bg-white/10" />
                <div className="h-2.5 w-14 rounded bg-white/5" />
              </div>
            ))}
          </div>
        </div>

        {/* Videos Section Placeholder */}
        <div className="space-y-4">
          <div className="h-5 w-36 rounded bg-white/15" />
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="aspect-[16/9] rounded-2xl bg-white/[0.06] border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

