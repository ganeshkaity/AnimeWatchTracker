"use client";

import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { POPULAR_GENRES } from '../components/dashboard/data/popularCategoriesData';

export default function GenresPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#07090e] text-white px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
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
          Popular Genres
        </h1>
      </div>

      {/* Grid of Genre Cards (Image 3) */}
      <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
        {POPULAR_GENRES.map((genre) => (
          <div
            key={genre.id}
            onClick={() => router.push(`/?genre=${genre.id}`)}
            className={`relative h-24 sm:h-28 rounded-lg overflow-hidden border border-white/10 bg-gradient-to-br ${genre.bgGradient} transition-all duration-300 hover:scale-[1.02] hover:brightness-110 cursor-pointer shadow-lg group`}
          >
            {/* Thematic Background Image with Duotone Overlay */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              <img
                src={genre.image}
                alt={genre.name}
                className="w-full h-full object-cover object-center opacity-30 mix-blend-luminosity group-hover:scale-105 transition-transform duration-500"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            </div>

            {/* Bottom Left Title */}
            <div className="relative z-10 flex flex-col justify-end h-full p-3 sm:p-4">
              <span className="text-sm sm:text-base font-bold text-white tracking-wide drop-shadow-md">
                {genre.name}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
