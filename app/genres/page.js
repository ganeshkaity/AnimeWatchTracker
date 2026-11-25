"use client";

import React from 'react';
import {
  ArrowLeft, ChevronRight, Compass, Flame, Swords, Laugh,
  ShieldAlert, Ghost, Search, Drama, Sparkles, Heart, Rocket,
  Music, Trophy, Clock, Skull, Wand2
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_GENRES } from '../components/dashboard/data/popularCategoriesData';

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

export default function GenresPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-black text-white px-4 sm:px-6 lg:px-12 py-8 sm:py-12 pb-24 md:pb-12">
      {/* Top Bar with Back Button */}
      <div className="max-w-7xl mx-auto relative mb-8 sm:mb-10 flex items-center justify-center">
        <button
          type="button"
          onClick={() => router.back()}
          className="absolute left-0 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
            Popular Genres
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Browse {POPULAR_GENRES.length} curated categories across your library
          </p>
        </div>
      </div>

      {/* Grid of Genre Cards */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {POPULAR_GENRES.map((genre) => {
          const Icon = GENRE_ICONS[genre.id?.toLowerCase()] || Sparkles;

          return (
            <div
              key={genre.id}
              onClick={() => router.push(`/results?genre=${encodeURIComponent(genre.name)}`)}
              className={`relative h-28 sm:h-32 rounded-2xl overflow-hidden border border-white/15 hover:border-white/35 bg-gradient-to-br ${genre.bgGradient} transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.6)] cursor-pointer group`}
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

              <div className="relative z-10 flex flex-col justify-between h-full p-3.5 sm:p-4">
                <div className="flex items-center justify-end">
                  <div className="w-8 h-8 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center text-white/90 group-hover:bg-white group-hover:text-black transition-all duration-300 shadow-md">
                    <Icon size={15} />
                  </div>
                </div>

                <div className="flex items-end justify-between gap-2">
                  <span className="text-sm sm:text-base font-extrabold text-white tracking-wide drop-shadow-md leading-tight">
                    {genre.name}
                  </span>
                  <ChevronRight
                    size={15}
                    className="text-white/60 group-hover:text-white group-hover:translate-x-0.5 transition-all shrink-0"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
