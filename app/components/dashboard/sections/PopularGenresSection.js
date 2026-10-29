"use client";

import React, { useRef } from 'react';
import { ChevronLeft, ChevronRight, Compass } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_GENRES } from '../data/popularCategoriesData';

export default function PopularGenresSection() {
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
    <section id="popular-genres" className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-extrabold tracking-wide text-white">
            Popular Genres
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/genres')}
            className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight size={14} />
          </button>

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

      {/* Horizontal Slider */}
      <div
        ref={scrollRef}
        className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-1 scroll-smooth select-none"
      >
        {POPULAR_GENRES.slice(0, 12).map((genre) => (
          <div
            key={genre.id}
            onClick={() => router.push(`/results?genre=${encodeURIComponent(genre.name)}`)}
            className={`relative flex-none w-56 sm:w-64 md:w-72 h-24 sm:h-28 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br ${genre.bgGradient} transition-all duration-300 hover:scale-[1.02] hover:brightness-110 cursor-pointer shadow-md group`}
          >
            {/* Thematic Background Image with Duotone Overlay */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img
                src={genre.image}
                alt={genre.name}
                className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent`} />
            </div>

            {/* Bottom Left Title */}
            <div className="relative z-10 flex flex-col justify-end h-full p-3 sm:p-4">
              <span className="text-base sm:text-lg font-bold text-white tracking-wide drop-shadow-md">
                {genre.name}
              </span>
            </div>
          </div>
        ))}

        {POPULAR_GENRES.length > 12 && (
          <div
            onClick={() => router.push('/genres')}
            className="flex-none w-44 sm:w-52 h-24 sm:h-28 glass-card rounded-lg overflow-hidden group cursor-pointer flex flex-col items-center justify-center p-3 text-center transition shadow-md hover:shadow-xl bg-purple-950/20 hover:bg-purple-950/30 border border-purple-500/20 self-start"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center mb-1 group-hover:scale-110 transition-transform">
              <Compass size={18} />
            </div>
            <span className="text-xs sm:text-sm font-bold text-white block">See All</span>
            <span className="text-[10px] text-purple-300/80 font-mono mt-0.5 block">{POPULAR_GENRES.length} total</span>
            <span className="mt-1 px-2 py-0.5 rounded-md bg-purple-500 text-white text-[9px] font-extrabold flex items-center gap-1 group-hover:bg-purple-400 transition">
              View All <ChevronRight size={10} />
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
