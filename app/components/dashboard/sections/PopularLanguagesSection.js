"use client";

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_LANGUAGES } from '../data/popularCategoriesData';

function PopularLanguagesSection() {
  const router = useRouter();
  const scrollRef = useRef(null);

  const scroll = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      scrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <section id="popular-languages" className="space-y-3 dashboard-section-contain">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold tracking-wide text-white">
            Popular Languages
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/languages')}
            className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight size={14} />
          </button>

          <div className="hidden sm:flex items-center gap-2">
            <button
              type="button"
              onClick={() => scroll('left')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
              title="Scroll left"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => scroll('right')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
              title="Scroll right"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Slider */}
      <div
        ref={scrollRef}
        className="flex items-start gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar py-1 scroll-smooth select-none"
      >
        {POPULAR_LANGUAGES.map((lang) => (
          <div
            key={lang.id}
            onClick={() => router.push(`/results?lang=${encodeURIComponent(lang.id)}`)}
            className={`relative flex-none w-52 sm:w-60 md:w-64 h-24 sm:h-28 rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br ${lang.bgGradient} transition-all duration-300 hover:scale-[1.02] hover:border-white/25 cursor-pointer shadow-md group`}
          >
            {/* Ambient Glow */}
            <div className={`absolute -right-4 -bottom-4 w-28 h-28 rounded-full blur-2xl opacity-70 group-hover:opacity-100 transition-opacity pointer-events-none ${lang.glowColor || 'bg-white/10'}`} />

            {/* Subject-Matched Script Watermark Artwork */}
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none select-none flex items-center justify-center">
              <span
                className={`text-5xl sm:text-6xl font-black tracking-tighter opacity-25 group-hover:opacity-40 group-hover:scale-110 transition-all duration-300 ${lang.accentColor || 'text-white'}`}
              >
                {lang.glyph || lang.name.slice(0, 2)}
              </span>
            </div>

            {/* Left Content */}
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
    </section>
  );
}

export default React.memo(PopularLanguagesSection);
