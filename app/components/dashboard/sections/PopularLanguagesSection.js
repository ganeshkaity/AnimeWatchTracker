"use client";

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Globe } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_LANGUAGES } from '../data/popularCategoriesData';

export default function PopularLanguagesSection() {
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
    <section id="popular-languages" className="space-y-3">
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
        className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1 scroll-smooth select-none"
      >
        {POPULAR_LANGUAGES.map((lang) => (
          <div
            key={lang.id}
            onClick={() => router.push(`/results?lang=${encodeURIComponent(lang.id)}`)}
            className={`relative flex-none w-56 sm:w-64 md:w-72 h-24 sm:h-28 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-r ${lang.bgGradient} transition-all duration-300 hover:scale-[1.02] hover:brightness-110 cursor-pointer shadow-md group`}
          >
            {/* Actor / Character Portrait Blend */}
            <div className="absolute right-0 top-0 bottom-0 w-1/2 overflow-hidden pointer-events-none">
              <img
                src={lang.image}
                alt={lang.name}
                className="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 filter contrast-105"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0a0f1d] via-black/40 to-transparent" />
            </div>

            {/* Left Content */}
            <div className="relative z-10 flex flex-col justify-center h-full p-3 sm:p-4 max-w-[58%]">
              {lang.native ? (
                <>
                  <span className="text-xl sm:text-2xl font-bold text-white tracking-wide leading-tight">
                    {lang.native}
                  </span>
                  <span className="text-xs text-gray-300 font-medium mt-1">
                    {lang.name}
                  </span>
                </>
              ) : (
                <span className="text-xl sm:text-2xl font-bold text-white tracking-wide">
                  {lang.name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
