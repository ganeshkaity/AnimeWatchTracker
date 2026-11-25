"use client";

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_LANGUAGES } from '../components/dashboard/data/popularCategoriesData';

export default function LanguagesPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white px-4 sm:px-6 lg:px-12 py-8 sm:py-12 pb-24 md:pb-12">
      {/* Top Bar with Back Button */}
      <div className="max-w-7xl mx-auto relative mb-8 sm:mb-12">
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white text-center tracking-tight">
          Popular Languages
        </h1>
      </div>

      {/* Grid of Language Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {POPULAR_LANGUAGES.map((lang) => (
          <div
            key={lang.id}
            onClick={() => router.push(`/results?lang=${encodeURIComponent(lang.id)}`)}
            className={`relative h-24 sm:h-28 rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br ${lang.bgGradient} transition-all duration-300 hover:scale-[1.02] hover:border-white/25 cursor-pointer shadow-lg group`}
          >
            <div className={`absolute -right-4 -bottom-4 w-24 h-24 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none ${lang.glowColor || 'bg-white/10'}`} />

            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center">
              <span
                className={`text-5xl font-black tracking-tighter opacity-25 group-hover:opacity-40 group-hover:scale-110 transition-all duration-300 ${lang.accentColor || 'text-white'}`}
              >
                {lang.glyph || lang.name.slice(0, 2)}
              </span>
            </div>

            <div className="relative z-10 flex flex-col justify-center h-full p-3.5 sm:p-4 max-w-[70%]">
              {lang.native ? (
                <>
                  <span className="text-lg sm:text-xl font-extrabold text-white tracking-wide leading-tight">
                    {lang.native}
                  </span>
                  <span className="text-xs text-gray-200 font-semibold mt-0.5">
                    {lang.name}
                  </span>
                </>
              ) : (
                <span className="text-lg sm:text-xl font-extrabold text-white tracking-wide">
                  {lang.name}
                </span>
              )}
              {lang.region && (
                <span className="text-[10px] text-gray-400 font-medium mt-1 truncate">
                  {lang.region}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
