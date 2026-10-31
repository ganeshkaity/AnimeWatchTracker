"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Sparkles, Film, Play, Tv, Layers } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../context/AuthContext';
import { getLocalMovieGroups, setLocalMovieGroups, getUserId } from '../../../utils/localStore';
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
  const { currentUser } = useAuth();

  const [movieGroups, setMovieGroups] = useState(() => (typeof window !== 'undefined' ? getLocalMovieGroups() || [] : []));
  const [visibleCount, setVisibleCount] = useState(2);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const observerTargetRef = useRef(null);
  const rowRefs = useRef({});

  // Sync Movie Groups from localStore and Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMovieGroups(getLocalMovieGroups() || []);
    }

    const handleGroupsUpdate = () => {
      setMovieGroups(getLocalMovieGroups() || []);
    };
    window.addEventListener('movie_groups_updated', handleGroupsUpdate);

    if (!currentUser?.uid || !db) {
      return () => {
        window.removeEventListener('movie_groups_updated', handleGroupsUpdate);
      };
    }

    const targetUserId = currentUser.uid || getUserId();
    const unsubGroups = onSnapshot(collection(db, 'users', targetUserId, 'movieGroups'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        setMovieGroups(list);
        setLocalMovieGroups(list);
      }
    });

    return () => {
      window.removeEventListener('movie_groups_updated', handleGroupsUpdate);
      unsubGroups();
    };
  }, [currentUser]);

  // Fast movie lookup map
  const movieMap = useMemo(() => {
    const map = new Map();
    (movies || []).forEach((m) => {
      if (m.id) map.set(m.id, m);
      if (m.tmdbId) map.set(String(m.tmdbId), m);
    });
    return map;
  }, [movies]);

  // Aggregate movie groups into structured rows
  const movieGroupRows = useMemo(() => {
    return (movieGroups || [])
      .map((group) => {
        const rawAssignments = Array.isArray(group.movies) ? group.movies : [];
        const sorted = [...rawAssignments].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

        const resolved = [];
        sorted.forEach((assignment) => {
          const m = movieMap.get(assignment.movieId);
          if (m) {
            resolved.push({
              ...m,
              mediaType: 'movie',
              groupOrder: assignment.order,
            });
          }
        });

        return {
          id: `group-row-${group.id}`,
          groupId: group.id,
          name: group.name,
          slug: group.slug || group.id,
          description: group.description,
          items: resolved,
          isMovieGroup: true,
        };
      })
      .filter((row) => row.items.length > 0);
  }, [movieGroups, movieMap]);

  // Total genre definitions
  const totalMaxRows = GENRE_ROW_DEFINITIONS.length;

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
        if (entries[0].isIntersecting && !isLoadingMore && visibleCount < totalMaxRows) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleCount((prev) => Math.min(prev + 2, totalMaxRows));
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [isLoadingMore, visibleCount, totalMaxRows]);

  // Aggregate and sort items for each genre definition — only from user's DB
  const genreRowsData = useMemo(() => {
    const genreRowsLimit = Math.min(visibleCount, GENRE_ROW_DEFINITIONS.length);
    return GENRE_ROW_DEFINITIONS.slice(0, genreRowsLimit).map((def) => {
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
        isMovieGroup: false,
      };
    });
  }, [movies, animes, webseriesList, visibleCount]);

  // Only render genre rows that have at least 1 item from user's library
  const nonEmptyGenreRows = genreRowsData.filter((row) => row.items.length > 0);

  // Movie group rows displayed directly after Crime & Mystery Thrillers
  const visibleGroupRows = useMemo(() => {
    if (visibleCount < GENRE_ROW_DEFINITIONS.length) {
      return [];
    }
    return movieGroupRows;
  }, [visibleCount, movieGroupRows]);

  return (
    <div className="space-y-8 pt-4">
      {/* 1. Genre Sections (Ends with Crime & Mystery Thrillers) */}
      {nonEmptyGenreRows.map((row) => (
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
              <div className="hidden sm:flex items-center gap-2">
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

      {/* 2. Movie Group Sections (Displayed after Crime & Mystery Thrillers) */}
      {visibleGroupRows.map((groupRow) => {
        const groupSlug = groupRow.slug || groupRow.groupId;
        const totalCount = groupRow.items.length;

        return (
          <section key={groupRow.id} className="space-y-3">
            {/* Group Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                  <span>{groupRow.name}</span>
                </h2>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push(`/group/${encodeURIComponent(groupSlug)}`)}
                  className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2 py-1 rounded-lg hover:bg-white/5 cursor-pointer"
                >
                  <span>View All</span>
                  <ChevronRight size={14} />
                </button>
                <div className="hidden sm:flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scrollRow(groupRow.id, 'left')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollRow(groupRow.id, 'right')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            </div>

            {/* Horizontal Slider with Minimal Gap (gap-1.5 sm:gap-2) */}
            <div
              ref={(el) => {
                if (el) rowRefs.current[groupRow.id] = el;
              }}
              className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none"
            >
              {groupRow.items.slice(0, 12).map((item) => {
                const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
                const rating = item.rating || item.score || null;
                const isWatched = Boolean(
                  item.watched || item.completed || item.watchStatus === 'Completed' || (item.watchProgress && item.watchProgress >= 95)
                );
                const pct = item.watchProgress || item.progressPercent || 0;
                const movieYear = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'Movie');
                const runtimeStr = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'Feature';

                return (
                  <div key={`${groupRow.id}-${item.id}`} className="relative group/wrapper">
                    {/* Sequential Order Number Tag */}
                    <div className="absolute top-2 right-2 z-20 px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md border border-amber-500/50 text-[10px] font-black text-amber-400 shadow-lg pointer-events-none">
                      #{item.groupOrder}
                    </div>

                    <MediaCard
                      item={item}
                      type="movie"
                      coverImg={coverImg}
                      rating={rating}
                      isCompleted={isWatched}
                      pct={pct}
                      subLeft={movieYear}
                      subRight={runtimeStr}
                      accentBorder="hover:border-amber-400/50"
                      onClick={() => router.push(`/movies/${item.id}`)}
                      onMouseEnter={(e) => handleCardMouseEnter && handleCardMouseEnter(item, 'movie', e)}
                      onMouseLeave={handleCardMouseLeave}
                      onMobileMenuToggle={() => {
                        if (setActiveMobileMenu) {
                          setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type: 'movie', id: item.id, item });
                        }
                      }}
                    />
                  </div>
                );
              })}

              {/* 13th Card: See All if > 12 movies */}
              {groupRow.items.length > 12 && (
                <div
                  onClick={() => router.push(`/group/${encodeURIComponent(groupSlug)}`)}
                  className="flex-none w-28 sm:w-32 md:w-36 glass-card rounded-lg overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-amber-950/20 hover:bg-amber-950/30 border border-amber-500/20 self-start"
                >
                  <div className="aspect-[2/3] flex flex-col items-center justify-center p-3 sm:p-4 text-center space-y-2">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Sparkles size={20} />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-white block">See All</span>
                      <span className="text-[10px] text-amber-300/80 font-mono mt-0.5 block">{totalCount} total</span>
                    </div>
                    <span className="px-2.5 py-1 rounded-lg bg-amber-600 text-white text-[10px] font-extrabold flex items-center gap-1 group-hover:bg-amber-500 transition">
                      View All <ChevronRight size={12} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* Endless Scroll Sentinel with Skeleton Loader */}
      {visibleCount < totalMaxRows && (
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
      )}
    </div>
  );
}
