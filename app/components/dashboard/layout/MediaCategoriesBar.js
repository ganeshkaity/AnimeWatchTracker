import React from 'react';
import { Compass, Tv, Film, BookOpen, Headphones, Bookmark, ChevronDown } from 'lucide-react';

export default function MediaCategoriesBar({
  animesCount = 0,
  moviesCount = 0,
  webseriesCount = 0,
  mangasCount = 0,
  audioStoriesCount = 0,
  watchlistCount = 0,
  onSectionJump,
}) {
  return (
    <section id="media-categories" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass size={18} className="text-[#7c5cff]" />
          <h2 className="text-xs sm:text-sm font-extrabold tracking-wider uppercase text-gray-300">
            Browse by Category
          </h2>
        </div>
        <span className="text-[11px] text-gray-400 font-medium hidden sm:inline">
          Jump directly to library sections
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4 md:gap-5">
        {/* 1. ANIME */}
        <button
          type="button"
          onClick={() => onSectionJump('anime')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-[#7c5cff]/20 hover:to-indigo-950/40 border border-white/10 hover:border-[#7c5cff]/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(124,92,255,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-[#7c5cff] to-indigo-500 flex items-center justify-center text-white shadow-md shadow-[#7c5cff]/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <Tv size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-purple-300 transition-colors">
                Anime
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-purple-200/80 font-medium block truncate">
                {animesCount} Series
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-[#7c5cff]/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-[#7c5cff] to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 2. MOVIES */}
        <button
          type="button"
          onClick={() => onSectionJump('movies')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-amber-500/20 hover:to-rose-950/40 border border-white/10 hover:border-amber-500/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(245,158,11,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-black font-extrabold shadow-md shadow-amber-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <Film size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-amber-300 transition-colors">
                Movies
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-amber-200/80 font-medium block truncate">
                {moviesCount} Films
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-amber-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 3. WEBSERIES */}
        <button
          type="button"
          onClick={() => onSectionJump('webseries')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-cyan-500/20 hover:to-indigo-950/40 border border-white/10 hover:border-cyan-500/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(6,182,212,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <Tv size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-cyan-300 transition-colors">
                Web-series
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-cyan-200/80 font-medium block truncate">
                {webseriesCount} Series
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-cyan-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 4. MANGA */}
        <button
          type="button"
          onClick={() => onSectionJump('manga')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-pink-500/20 hover:to-purple-950/40 border border-white/10 hover:border-pink-500/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(236,72,153,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-pink-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <BookOpen size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-pink-300 transition-colors">
                Manga
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-pink-200/80 font-medium block truncate">
                {mangasCount} Webtoons
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-pink-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-pink-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 5. AUDIOS */}
        <button
          type="button"
          onClick={() => onSectionJump('audios')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-cyan-500/20 hover:to-blue-950/40 border border-white/10 hover:border-cyan-500/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(6,182,212,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md shadow-cyan-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <Headphones size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-cyan-300 transition-colors">
                Audios
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-cyan-200/80 font-medium block truncate">
                {audioStoriesCount} Stories
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-cyan-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        {/* 6. WATCHLIST */}
        <button
          type="button"
          onClick={() => onSectionJump('watchlist')}
          className="group relative flex items-center justify-between p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] hover:from-amber-500/20 hover:to-yellow-950/40 border border-white/10 hover:border-amber-500/50 backdrop-blur-md shadow-lg hover:shadow-[0_8px_30px_rgba(245,158,11,0.25)] transition-all duration-300 hover:-translate-y-1 active:scale-[0.98] text-left cursor-pointer overflow-hidden"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-500 flex items-center justify-center text-black font-extrabold shadow-md shadow-amber-500/30 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300 flex-shrink-0">
              <Bookmark size={20} />
            </div>
            <div className="min-w-0">
              <span className="text-sm sm:text-base font-extrabold text-white tracking-wide block group-hover:text-amber-300 transition-colors">
                Watchlist
              </span>
              <span className="text-[11px] text-gray-400 group-hover:text-amber-200/80 font-medium block truncate">
                {watchlistCount} Saved
              </span>
            </div>
          </div>
          <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-amber-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
            <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>
      </div>
    </section>
  );
}
