"use client";

import React, { useRef, useMemo } from 'react';
import { Star, ChevronLeft, ChevronRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import CachedImage from '../../../utils/imageCache';
import { getEffectiveRating } from '../../../utils/ratingUtils';
import { getLocalMovies } from '../../../utils/localStore';

export default function TopRatedMoviesSection({
  movies = [],
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const scrollRef = useRef(null);

  const scrollRow = (direction) => {
    if (scrollRef.current) {
      const { scrollLeft, clientWidth } = scrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      scrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Top 20 highest rated movies from personal library
  const topMovies = useMemo(() => {
    const list = movies && movies.length > 0 ? movies : (typeof window !== 'undefined' ? getLocalMovies() || [] : []);
    if (!list || list.length === 0) return [];

    const scored = list.map((m) => {
      const eff = getEffectiveRating(m);
      const userRating = eff?.source === 'manual' ? eff.numeric : (m.rating ? parseFloat(m.rating) : null);
      const numeric = (userRating !== null && !isNaN(userRating) && userRating > 0)
        ? userRating
        : (eff ? eff.numeric : (parseFloat(m.rating || m.score || m.vote_average) || 0));
      return { item: m, rating: numeric };
    });

    // Sort descending by rating
    scored.sort((a, b) => b.rating - a.rating);

    // Return top 20 movies
    return scored.slice(0, 20).map((s) => s.item);
  }, [movies]);

  if (topMovies.length === 0) return null;

  return (
    <section id="top-rated-movies" className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-md shrink-0 mt-0.5 sm:mt-0">
            <Star size={18} className="fill-amber-400 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg md:text-xl font-extrabold text-white tracking-wide">
                Top Rated Movies
              </h2>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => router.push('/movies')}
            className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2.5 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <span>View All</span>
            <ChevronRight size={14} />
          </button>

          <div className="hidden sm:flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => scrollRow('left')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
              title="Scroll left"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => scrollRow('right')}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
              title="Scroll right"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Slider with cards matching top rated anime style + golden numerals */}
      <div
        ref={scrollRef}
        className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-3 scroll-smooth select-none"
      >
        {topMovies.map((movie, idx) => {
          const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
          const ratingObj = getEffectiveRating(movie);
          const displayRating = ratingObj ? ratingObj.value : (movie.rating && !isNaN(parseFloat(movie.rating)) ? parseFloat(movie.rating).toFixed(1) : null);

          return (
            <div
              key={`top-movie-${movie.id}`}
              onClick={() => router.push(`/movies/${movie.id}`)}
              className="relative flex-none pl-6 sm:pl-8 group cursor-pointer select-none transition-transform duration-300 hover:-translate-y-1 py-2"
            >
              {/* Poster Card */}
              <div className="relative w-32 sm:w-36 md:w-40 aspect-[2/3] rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 group-hover:border-amber-400/50 shadow-xl group-hover:shadow-2xl transition-all duration-300">
                <CachedImage
                  src={coverImg}
                  alt={movie.title}
                  title={movie.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />

                {/* Liquid Glass Rating Badge (Top-Right) */}
                {displayRating && (
                  <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 text-[10px] font-bold text-white flex items-center gap-1 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-saturate-150 pointer-events-none">
                    <Star size={10} className="fill-amber-400 text-amber-400" />
                    <span className="leading-none">{displayRating}</span>
                  </div>
                )}
              </div>

              {/* Giant Golden Rank Number Overlapping Bottom-Left Corner */}
              <div
                className="absolute left-0 -bottom-1 sm:-bottom-2 z-20 font-black text-6xl sm:text-7xl md:text-8xl select-none leading-none pointer-events-none tracking-tighter"
                style={{
                  background: 'linear-gradient(180deg, #fffbeb 0%, #fef08a 25%, #f59e0b 60%, #b45309 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.9))',
                  WebkitTextStroke: '1px rgba(254, 240, 138, 0.5)',
                }}
              >
                {idx + 1}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
