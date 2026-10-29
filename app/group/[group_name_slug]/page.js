"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Layers,
  Edit3,
  Calendar,
  Clock,
  Sparkles,
  Film,
  Plus,
  CheckCircle2,
  ListOrdered
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import {
  getLocalMovies,
  getLocalMovieGroups,
  setLocalMovieGroups,
  getUserId
} from '../../utils/localStore';
import { slugify } from '../../components/dashboard/utils/dashboardHelpers';
import MediaCard from '../../components/dashboard/cards/MediaCard';
import MediaPreviewModal from '../../components/MediaPreviewModal';
import MediaCardSkeleton from '../../components/dashboard/skeletons/MediaCardSkeleton';

export default function SingleGroupDetailsPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useAuth();

  const groupSlugRaw = params?.group_name_slug || '';
  const groupSlug = decodeURIComponent(groupSlugRaw);

  const [movies, setMovies] = useState(() => (typeof window !== 'undefined' ? getLocalMovies() || [] : []));
  const [movieGroups, setMovieGroups] = useState(() => (typeof window !== 'undefined' ? getLocalMovieGroups() || [] : []));
  const [isLoading, setIsLoading] = useState(true);

  const [activePreview, setActivePreview] = useState(null);
  const [activeMobileMenu, setActiveMobileMenu] = useState(null);

  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  // Sync groups & movies from localStore and Firestore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const localM = getLocalMovies() || [];
      const localG = getLocalMovieGroups() || [];
      setMovies(localM);
      setMovieGroups(localG);
      if (localG.length > 0) setIsLoading(false);
    }

    const handleGroupsUpdate = () => {
      const updatedG = getLocalMovieGroups() || [];
      setMovieGroups(updatedG);
      setIsLoading(false);
    };
    window.addEventListener('movie_groups_updated', handleGroupsUpdate);

    if (!currentUser?.uid || !db) {
      setIsLoading(false);
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
      setIsLoading(false);
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

  // Find target group by slug or id
  const targetGroup = useMemo(() => {
    if (!groupSlug || movieGroups.length === 0) return null;
    const lowerSlug = groupSlug.toLowerCase().trim();
    return (
      movieGroups.find(
        (g) =>
          (g.slug && g.slug.toLowerCase() === lowerSlug) ||
          (g.id && g.id.toLowerCase() === lowerSlug) ||
          (g.name && slugify(g.name) === lowerSlug) ||
          (g.name && g.name.toLowerCase() === lowerSlug)
      ) || null
    );
  }, [groupSlug, movieGroups]);

  // Ordered resolved movies
  const orderedMovies = useMemo(() => {
    if (!targetGroup) return [];
    const assignments = Array.isArray(targetGroup.movies) ? targetGroup.movies : [];
    const sorted = [...assignments].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

    const list = [];
    sorted.forEach((assignment) => {
      const movie = movieMap.get(assignment.movieId);
      if (movie) {
        list.push({
          ...movie,
          groupOrder: assignment.order,
        });
      }
    });
    return list;
  }, [targetGroup, movieMap]);

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#07090e] text-white px-4 sm:px-6 lg:px-12 py-10 max-w-7xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-white/10 rounded animate-pulse" />
        <div className="h-4 w-72 bg-white/5 rounded animate-pulse" />
        <div className="flex flex-wrap gap-2 pt-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <MediaCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (!targetGroup) {
    return (
      <div className="min-h-screen bg-[#07090e] text-white px-4 sm:px-6 lg:px-12 py-20 flex flex-col items-center justify-center text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 mb-4">
          <Layers size={32} />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold mb-2">Group Not Found</h1>
        <p className="text-sm text-gray-400 mb-6 max-w-md">
          The requested movie group could not be found or may have been deleted.
        </p>
        <button
          type="button"
          onClick={() => router.push('/group')}
          className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold text-sm transition flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to All Groups</span>
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07090e] text-white">
      {/* Top Header / Hero */}
      <header className="sticky top-0 z-30 bg-[#07090e]/90 backdrop-blur-xl border-b border-white/10 px-4 sm:px-6 lg:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push('/group')}
              className="p-2 sm:p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
              title="Back to All Groups"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">All Groups</span>
            </button>

            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight">
                  {targetGroup.name}
                </h1>
                <span className="text-xs sm:text-sm font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  {orderedMovies.length} {orderedMovies.length === 1 ? 'Movie' : 'Movies'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push(`/create-group?edit=${encodeURIComponent(targetGroup.id)}`)}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 hover:text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition cursor-pointer active:scale-95"
            >
              <Edit3 size={15} />
              <span>Edit</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-6 sm:py-8 space-y-8">
        {/* Movies in Ordered Sequence */}
        {orderedMovies.length === 0 ? (
          <div className="py-16 text-center text-gray-400 space-y-3">
            <Film size={36} className="mx-auto text-gray-500" />
            <p className="text-sm">No movies in this group yet or assigned movies are no longer in your library.</p>
            <button
              type="button"
              onClick={() => router.push(`/create-group?edit=${encodeURIComponent(targetGroup.id)}`)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
            >
              Add Movies to Group
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
              {orderedMovies.map((item) => {
                const coverImg = item.posterUrl || item.posterPath || (item.thumbnailBase64 || null);
                const rating = item.rating || item.score || null;
                const isWatched = Boolean(
                  item.watched || item.completed || item.watchStatus === 'Completed' || (item.watchProgress && item.watchProgress >= 95)
                );
                const pct = item.watchProgress || item.progressPercent || 0;
                const movieYear = item.year || (item.releaseDate ? item.releaseDate.split('-')[0] : 'Movie');
                const runtimeStr = item.runtime ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m` : 'Feature';

                return (
                  <div key={item.id} className="relative group/wrapper">
                    {/* Prominent Sequence Number Badge */}
                    <div className="absolute top-2 right-2 z-20 px-2 py-0.5 rounded-md bg-black/85 backdrop-blur-md border border-amber-500/60 text-[11px] font-black text-amber-400 shadow-xl pointer-events-none flex items-center gap-0.5">
                      <span className="text-amber-500/70 text-[9px]">#</span>
                      <span>{item.groupOrder}</span>
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
            </div>
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

