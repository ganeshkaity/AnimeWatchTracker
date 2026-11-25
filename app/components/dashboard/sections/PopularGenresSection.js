"use client";

import React, { useRef } from 'react';
import {
  ChevronLeft, ChevronRight, Compass, Flame, Swords, Laugh,
  ShieldAlert, Ghost, Search, Drama, Sparkles, Heart, Rocket,
  Music, Trophy, Clock, Skull, Wand2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_GENRES } from '../data/popularCategoriesData';

const GENRE_ICONS = {
  action: Swords,
  adventure: Compass,
  comedy: Laugh,
  crime: ShieldAlert,
  demons: Flame,
  detective: Search,
  drama: Drama,
  fantasy: Wand2,
  horror: Skull,
  mystery: Ghost,
  music: Music,
  romance: Heart,
  'sci-fi': Rocket,
  sports: Trophy,
  'time travel': Clock,
};

function PopularGenresSection() {
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
    <section id="popular-genres" className="space-y-3 dashboard-section-contain">
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
            className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2.5 py-1 rounded-full bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 cursor-pointer"
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
        className="flex items-start gap-2.5 sm:gap-3 overflow-x-auto no-scrollbar py-1 scroll-smooth smooth-scroll-gpu select-none"
      >
        {POPULAR_GENRES.slice(0, 12).map((genre) => {
          const Icon = GENRE_ICONS[genre.id?.toLowerCase()] || Sparkles;

          return (
            <div
              key={genre.id}
              onClick={() => router.push(`/results?genre=${encodeURIComponent(genre.name)}`)}
              className={`relative flex-none w-52 sm:w-60 md:w-64 h-28 sm:h-32 rounded-2xl overflow-hidden border border-white/15 hover:border-white/35 bg-gradient-to-br ${genre.bgGradient} transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.6)] cursor-pointer group`}
            >
              {/* Rich Full-Color Thematic Background Image */}
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <img
                  src={genre.image}
                  alt={genre.name}
                  className="w-full h-full object-cover object-center opacity-65 group-hover:opacity-85 group-hover:scale-110 transition-all duration-500 saturate-125"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
              </div>

              {/* Top-Right Glass Icon Pill */}
              <div className="relative z-10 flex flex-col justify-between h-full p-3.5 sm:p-4">
                <div className="flex items-center justify-end">
                  <div className="w-8 h-8 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 group-hover:bg-white group-hover:text-black transition-all duration-300 shadow-md">
                    <Icon size={15} />
                  </div>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <span className="text-base sm:text-lg font-extrabold text-white tracking-wide drop-shadow-md leading-tight">
                    {genre.name}
                  </span>
                  <ChevronRight
                    size={16}
                    className="text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0"
                  />
                </div>
              </div>
            </div>
          );
        })}

        {POPULAR_GENRES.length > 12 && (
          <div
            onClick={() => router.push('/genres')}
            className="flex-none w-44 sm:w-52 h-28 sm:h-32 rounded-2xl overflow-hidden group cursor-pointer flex flex-col items-center justify-center p-3 text-center transition-all duration-300 hover:-translate-y-0.5 bg-gradient-to-br from-purple-950/40 via-indigo-950/30 to-black border border-purple-500/30 hover:border-purple-400/60 shadow-lg"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
              <Compass size={18} />
            </div>
            <span className="text-xs sm:text-sm font-extrabold text-white block">Explore All</span>
            <span className="text-[10px] text-purple-300/80 font-mono mt-0.5 block">{POPULAR_GENRES.length} Genres</span>
          </div>
        )}
      </div>
    </section>
  );
}

export default React.memo(PopularGenresSection);
