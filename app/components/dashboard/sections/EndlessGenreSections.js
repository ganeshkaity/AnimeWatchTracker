"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Film, Play, Tv } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MediaCard from '../cards/MediaCard';
import MediaCardSkeleton from '../skeletons/MediaCardSkeleton';

const GENRE_ROW_DEFINITIONS = [
  { id: 'action-movies', title: 'Action Movies', filterGenre: 'Action', mediaFilter: 'movie' },
  { id: 'action-anime', title: 'Action Anime', filterGenre: 'Action', mediaFilter: 'anime' },
  { id: 'romance-drama', title: 'Romance & Drama', filterGenre: 'Romance', mediaFilter: 'all' },
  { id: 'scifi-fantasy', title: 'Sci-Fi & Fantasy', filterGenre: 'Sci-Fi', mediaFilter: 'all' },
  { id: 'comedy-slice', title: 'Comedy & Slice of Life', filterGenre: 'Comedy', mediaFilter: 'all' },
  { id: 'crime-thriller', title: 'Crime & Mystery Thrillers', filterGenre: 'Crime', mediaFilter: 'all' },
];

export default function EndlessGenreSections({
  movies = [],
  animes = [],
  webseriesList = [],
  onSelectAnime,
  handleCardMouseEnter,
  handleCardMouseLeave,
  activeMobileMenu,
  setActiveMobileMenu,
}) {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(2);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerTargetRef = useRef(null);
  const rowRefs = useRef({});

  // Helper to scroll horizontal rows
  const scrollRow = (rowId, direction) => {
    const el = rowRefs.current[rowId];
    if (el) {
      const { scrollLeft, clientWidth } = el;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      el.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // IntersectionObserver for continuous endless scroll
  useEffect(() => {
    const target = observerTargetRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMore && visibleCount < GENRE_ROW_DEFINITIONS.length) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + 2, GENRE_ROW_DEFINITIONS.length));
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleCount]);

  // Aggregate and sort items for each genre definition — only from user's DB
  const genreRowsData = useMemo(() => {
    return GENRE_ROW_DEFINITIONS.slice(0, visibleCount).map((def) => {
      const gTerm = def.filterGenre.toLowerCase();

      // Filter library movies
      const matchedMovies = (movies || []).filter((m) => {
        if (def.mediaFilter === 'anime') return false;
        const gList = Array.isArray(m.genres) ? m.genres : (typeof m.genres === 'string' ? m.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (m.genre || '').toLowerCase().includes(gTerm);
      });

      // Filter library animes
      const matchedAnimes = (animes || []).filter((a) => {
        if (def.mediaFilter === 'movie') return false;
        const gList = Array.isArray(a.genres) ? a.genres : (typeof a.genres === 'string' ? a.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (a.genre || '').toLowerCase().includes(gTerm);
      });

      // Filter library webseries
      const matchedSeries = (webseriesList || []).filter((w) => {
        if (def.mediaFilter === 'movie' || def.mediaFilter === 'anime') return false;
        const gList = Array.isArray(w.genres) ? w.genres : (typeof w.genres === 'string' ? w.genres.split(',') : []);
        return gList.some((g) => g.trim().toLowerCase().includes(gTerm)) || (w.genre || '').toLowerCase().includes(gTerm);
      });

      // Only items from user's library — no curated seeds
      const combined = [
        ...matchedMovies.map((m) => ({ ...m, mediaType: 'movie' })),
        ...matchedAnimes.map((a) => ({ ...a, mediaType: 'anime' })),
        ...matchedSeries.map((s) => ({ ...s, mediaType: 'webseries' })),
      ];

      // Remove duplicates by title
      const seenTitles = new Set();
      const uniqueItems = [];
      for (const item of combined) {
        const key = (item.title || '').trim().toLowerCase();
        if (key && !seenTitles.has(key)) {
          seenTitles.add(key);
          uniqueItems.push(item);
        }
      }

      return {
        ...def,
        items: uniqueItems,
      };
    });
  }, [movies, animes, webseriesList, visibleCount]);

  // Only render rows that have at least 1 item from user's library
  const nonEmptyRows = genreRowsData.filter((row) => row.items.length > 0);

  return (
    <div className="space-y-8 pt-4">
      {nonEmptyRows.map((row) => (
        <section key={row.id} className="space-y-3">
          {/* Row Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
              <span>{row.title}</span>
            </h2>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push(`/results?filter=${encodeURIComponent(row.filterGenre)}&media=${encodeURIComponent(row.mediaFilter)}`)}
                className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => scrollRow(row.id, 'left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={() => scrollRow(row.id, 'right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                title="Scroll right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Horizontal Slider with Minimal Gap (gap-1.5 sm:gap-2) */}
          <div
            ref={(el) => {
              if (el) rowRefs.current[row.id] = el;
            }}
            className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none"
          >
            {row.items.slice(0, 12).map((item) => {
              const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
              const rating = item.rating || item.score || null;
              const isWatched = Boolean(item.watched || item.completed || item.isWatched || (item.watchProgress && item.watchProgress >= 95));
              const pct = item.watchProgress || item.progressPercent || 0;
              const subLeft = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : (item.mediaType === 'movie' ? 'Movie' : 'Anime'));
              const subRight = item.mediaType === 'movie' ? (item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'Feature') : (item.episodeCount ? `${item.episodeCount} Ep` : 'Series');

              return (
                <MediaCard
                  key={`${row.id}-${item.id}`}
                  item={item}
                  type={item.mediaType || 'movie'}
                  coverImg={coverImg}
                  rating={rating}
                  isCompleted={isWatched}
                  pct={pct}
                  subLeft={subLeft}
                  subRight={subRight}
                  accentBorder="hover:border-purple-400/50"
                  onClick={() => {
                    if (item.mediaType === 'movie') {
                      router.push(`/movies/${item.id}`);
                    } else if (item.mediaType === 'anime' && onSelectAnime) {
                      onSelectAnime(item.id);
                    } else if (item.mediaType === 'webseries') {
                      router.push(`/webseries/${item.id}`);
                    }
                  }}
                  onMouseEnter={(e) => handleCardMouseEnter && handleCardMouseEnter(item, item.mediaType || 'movie', e)}
                  onMouseLeave={handleCardMouseLeave}
                  onMobileMenuToggle={() => {
                    if (setActiveMobileMenu) {
                      setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: item.mediaType || 'movie', id: item.id, item });
                    }
                  }}
                />
              );
            })}

            {row.items.length > 12 && (
              <div
                onClick={() => router.push(`/results?filter=${encodeURIComponent(row.filterGenre)}&media=${encodeURIComponent(row.mediaFilter)}`)}
                className="flex-none w-28 sm:w-32 md:w-36 glass-card rounded-lg overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-purple-950/20 hover:bg-purple-950/30 border border-purple-500/20 self-start"
              >
                <div className="aspect-[2/3] flex flex-col items-center justify-center p-3 sm:p-4 text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-white block">See All</span>
                    <span className="text-[10px] text-purple-300/80 font-mono mt-0.5 block">{row.items.length} total</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-purple-600 text-white text-[10px] font-extrabold flex items-center gap-1 group-hover:bg-purple-500 transition">
                    View All <ChevronRight size={12} />
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      ))}

      {/* Endless Scroll Sentinel with Skeleton Loader */}
      <div ref={observerTargetRef} className="py-6">
        {isLoadingMore && (
          <div className="space-y-3">
            <div className="h-6 w-36 bg-white/10 rounded animate-pulse" />
            <div className="flex items-start gap-1.5 sm:gap-2 overflow-hidden py-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <MediaCardSkeleton key={`endless-skel-${idx}`} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
