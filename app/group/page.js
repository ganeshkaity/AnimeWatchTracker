"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
  FolderPlus,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Layers,
  Film,
  Plus,
  Edit3,
  Calendar,
  Clock
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalMovies,
  getLocalMovieGroups,
  setLocalMovieGroups,
  getUserId
} from '../utils/localStore';
import MediaCard from '../components/dashboard/cards/MediaCard';
import MediaPreviewModal from '../components/MediaPreviewModal';

export default function MovieGroupsOverviewPage() {
  const router = useRouter();
  const { currentUser } = useAuth();

  const [movies, setMovies] = useState(() => (typeof window !== 'undefined' ? getLocalMovies() || [] : []));
  const [movieGroups, setMovieGroups] = useState(() => (typeof window !== 'undefined' ? getLocalMovieGroups() || [] : []));
  const [activePreview, setActivePreview] = useState(null); // { item, type, rect }
  const [activeMobileMenu, setActiveMobileMenu] = useState(null);

  const rowRefs = useRef({});
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Sync groups & movies from localStore and Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMovies(getLocalMovies() || []);
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

    // Subscribe to movies
    const unsubMovies = onSnapshot(collection(db, 'users', targetUserId, 'movies'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (list.length > 0) setMovies(list);
    });

    // Subscribe to movieGroups
    const unsubGroups = onSnapshot(collection(db, 'users', targetUserId, 'movieGroups'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      if (list.length > 0) {
        setMovieGroups(list);
        setLocalMovieGroups(list);
      }
    });

    return () => {
      window.removeEventListener('movie_groups_updated', handleGroupsUpdate);
      unsubMovies();
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

  // Map each group with its ordered resolved movie objects
  const groupsWithMovies = useMemo(() => {
    return (movieGroups || []).map((group) => {
      const rawMovies = Array.isArray(group.movies) ? group.movies : [];
      // Sort by assigned number sequence
      const sortedAssignments = [...rawMovies].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

      const resolved = [];
      sortedAssignments.forEach((assignment) => {
        const movie = movieMap.get(assignment.movieId);
        if (movie) {
          resolved.push({
            ...movie,
            groupOrder: assignment.order,
          });
        }
      });

      return {
        ...group,
        resolvedMovies: resolved,
      };
    });
  }, [movieGroups, movieMap]);

  // Horizontal scroll handler
  const scrollRow = (groupId, direction) => {
    const el = rowRefs.current[groupId];
    if (el) {
      const { scrollLeft, clientWidth } = el;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      el.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Hover preview handlers
  const handleCardMouseEnter = (item, type, e) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimeoutRef.current = setTimeout(() => {
      setActivePreview({ item, type, rect });
    }, 400);
  };

  const handleCardMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setActivePreview(null);
    }, 200);
  };

  const handleModalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleModalMouseLeave = () => {
    closeTimeoutRef.current = setTimeout(() => {
      setActivePreview(null);
    }, 200);
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#07090e]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/movies')}
              className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
              title="Back to Movies Library"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Library</span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight flex items-center gap-2">
                  <span>Movie Groups</span>
                </h1>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/create-group')}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition shadow-lg shadow-amber-600/20 cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              <span>Create</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-8 space-y-10">
        {groupsWithMovies.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-20 text-center px-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/20 to-purple-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-5 shadow-2xl">
              <FolderPlus size={36} />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">No Movie Groups Yet</h2>
            <p className="text-sm text-gray-400 max-w-md mb-6 leading-relaxed">
              Create customized movie collections like Marvel Cinematic Universe, Harry Potter, or your favorite trilogies and arrange them in their exact watch sequence.
            </p>
            <button
              type="button"
              onClick={() => router.push('/create-group')}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-white font-bold text-sm flex items-center gap-2 transition shadow-xl shadow-amber-600/30 cursor-pointer active:scale-95"
            >
              <Plus size={18} />
              <span>Create Your First Group</span>
            </button>
          </div>
        ) : (
          /* List of Groups as Horizontal Scrollable Sections */
          <div className="space-y-10">
            {groupsWithMovies.map((group) => {
              const groupSlug = group.slug || group.id;
              const moviesCount = group.resolvedMovies.length;

              return (
                <section key={group.id} className="space-y-3">
                  {/* Section Header */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-baseline gap-2.5 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-extrabold tracking-wide text-white flex items-center gap-2">
                        <span>{group.name}</span>
                      </h2>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/group/${encodeURIComponent(groupSlug)}`)}
                        className="text-xs font-bold text-gray-300 hover:text-white flex items-center gap-1 transition px-2.5 py-1 rounded-lg hover:bg-white/10 cursor-pointer"
                      >
                        <span>View All</span>
                        <ChevronRight size={14} />
                      </button>

                      <button
                        type="button"
                        onClick={() => scrollRow(group.id, 'left')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                        title="Scroll left"
                      >
                        <ChevronLeft size={16} />
                      </button>

                      <button
                        type="button"
                        onClick={() => scrollRow(group.id, 'right')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                        title="Scroll right"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Horizontally scrollable row with minimal gap (gap-1.5 sm:gap-2) */}
                  <div
                    ref={(el) => {
                      if (el) rowRefs.current[group.id] = el;
                    }}
                    className="flex items-start gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none"
                  >
                    {group.resolvedMovies.slice(0, 12).map((item) => {
                      const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
                      const rating = item.rating || item.score || null;
                      const isWatched = Boolean(
                        item.watched || item.completed || item.watchStatus === 'Completed' || (item.watchProgress && item.watchProgress >= 95)
                      );
                      const pct = item.watchProgress || item.progressPercent || 0;
                      const movieYear = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'Movie');
                      const runtimeStr = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'Feature';

                      return (
                        <div key={`${group.id}-${item.id}`} className="relative group/wrapper">
                          {/* Sequential Order Pill */}
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
                            onMouseEnter={(e) => handleCardMouseEnter(item, 'movie', e)}
                            onMouseLeave={handleCardMouseLeave}
                            onMobileMenuToggle={() => {
                              setActiveMobileMenu(
                                activeMobileMenu?.id === item.id ? null : { type: 'movie', id: item.id, item }
                              );
                            }}
                          />
                        </div>
                      );
                    })}

                    {/* 13th Card: See All if more than 12 movies */}
                    {group.resolvedMovies.length > 12 && (
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
                            <span className="text-[10px] text-amber-300/80 font-mono mt-0.5 block">
                              {group.resolvedMovies.length} total
                            </span>
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
          </div>
        )}
      </main>

      {/* Desktop Card Hover Preview Modal */}
      <MediaPreviewModal
        isOpen={Boolean(activePreview)}
        item={activePreview?.item}
        type={activePreview?.type || 'movie'}
        cardRect={activePreview?.rect}
        onClose={() => setActivePreview(null)}
        onMouseEnter={handleModalMouseEnter}
        onMouseLeave={handleModalMouseLeave}
        onOpenDetails={(item) => {
          setActivePreview(null);
          router.push(`/movies/${item.id}`);
        }}
      />
    </div>
  );
}

