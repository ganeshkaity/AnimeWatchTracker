"use client";

import React, { Suspense, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ArrowLeft, Film, Sparkles, BookOpen, Bookmark, Tv, Loader2, Filter, Search, X } from 'lucide-react';
import { collection, query, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalAnimes,
  getLocalMangas,
  getLocalMovies,
  getLocalWebseries,
  getLocalWatchlist,
  getUserId,
} from '../utils/localStore';
import MediaCard from '../components/dashboard/cards/MediaCard';
import MediaPreviewModal from '../components/MediaPreviewModal';
import MediaCardSkeleton from '../components/dashboard/skeletons/MediaCardSkeleton';

const ITEMS_PER_BATCH = 18;

function ResultsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();

  // URL query params
  const genreParam = searchParams.get('genre') || '';
  const langParam = searchParams.get('lang') || '';
  const filterParam = searchParams.get('filter') || '';
  const mediaParam = searchParams.get('media') || ''; // 'movie' | 'anime' | 'webseries' | 'manga' | 'watchlist' | 'all'

  // Search input state on results page
  const [searchTerm, setSearchTerm] = useState('');

  // Media data states
  const [animes, setAnimes] = useState(() => (typeof window !== 'undefined' ? getLocalAnimes() || [] : []));
  const [mangas, setMangas] = useState(() => (typeof window !== 'undefined' ? getLocalMangas() || [] : []));
  const [movies, setMovies] = useState(() => (typeof window !== 'undefined' ? getLocalMovies() || [] : []));
  const [webseriesList, setWebseriesList] = useState(() => (typeof window !== 'undefined' ? getLocalWebseries() || [] : []));
  const [watchlist, setWatchlist] = useState(() => (typeof window !== 'undefined' ? getLocalWatchlist() || [] : []));
  const [dataLoaded, setDataLoaded] = useState(false);

  // Pagination / Infinite scroll state
  const [visibleLimits, setVisibleLimits] = useState({
    movie: ITEMS_PER_BATCH,
    anime: ITEMS_PER_BATCH,
    webseries: ITEMS_PER_BATCH,
    manga: ITEMS_PER_BATCH,
    watchlist: ITEMS_PER_BATCH,
    all: ITEMS_PER_BATCH,
  });
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Hover Preview Modal & Mobile Action Sheet
  const [activePreview, setActivePreview] = useState(null);
  const [activeMobileMenu, setActiveMobileMenu] = useState(null);
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);
  const sentinelRef = useRef(null);

  // Sync with Firestore & localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAnimes(getLocalAnimes() || []);
      setMangas(getLocalMangas() || []);
      setMovies(getLocalMovies() || []);
      setWebseriesList(getLocalWebseries() || []);
      setWatchlist(getLocalWatchlist() || []);
      setDataLoaded(true);
    }

    if (!currentUser || isOffline || !db) return;

    const targetUserId = currentUser.uid || getUserId();
    const unsubAnime = onSnapshot(collection(db, 'users', targetUserId, 'anime'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setAnimes(list);
    });
    const unsubManga = onSnapshot(collection(db, 'users', targetUserId, 'mangas'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMangas(list);
    });
    const unsubMovies = onSnapshot(collection(db, 'users', targetUserId, 'movies'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMovies(list);
    });
    const unsubWeb = onSnapshot(collection(db, 'users', targetUserId, 'webseries'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWebseriesList(list);
    });
    const unsubWatchlist = onSnapshot(collection(db, 'users', targetUserId, 'watchlist'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setWatchlist(list);
    });

    return () => {
      unsubAnime();
      unsubManga();
      unsubMovies();
      unsubWeb();
      unsubWatchlist();
    };
  }, [currentUser, isOffline]);

  // Determine Title & Query interpretation
  const pageTitle = useMemo(() => {
    if (genreParam) return `Genre: ${genreParam}`;
    if (langParam) return `Language: ${langParam.toUpperCase()}`;
    if (filterParam) {
      if (filterParam.toLowerCase() === 'genres') return 'All Genres';
      if (filterParam.toLowerCase() === 'languages') return 'All Languages';
      return `Filter: ${filterParam}`;
    }
    return 'Results';
  }, [genreParam, langParam, filterParam]);

  // Clean and check genre match
  const matchesGenre = useCallback((itemGenres, queryGenre) => {
    if (!queryGenre) return true;
    const target = queryGenre.toLowerCase().trim();
    if (!itemGenres) return false;
    const list = Array.isArray(itemGenres)
      ? itemGenres
      : typeof itemGenres === 'string'
      ? itemGenres.split(',').map((g) => g.trim())
      : [];
    return list.some((g) => {
      const gl = g.toLowerCase();
      return gl === target || gl.includes(target) || target.includes(gl);
    });
  }, []);

  // Clean and check language match
  const matchesLang = useCallback((itemLang, queryLang) => {
    if (!queryLang) return true;
    const target = queryLang.toLowerCase().trim();
    if (!itemLang) return false;
    const val = String(itemLang).toLowerCase().trim();
    return val === target || val.includes(target) || target.includes(val);
  }, []);

  // Check search text filter
  const matchesSearch = useCallback((item, queryText) => {
    if (!queryText) return true;
    const q = queryText.toLowerCase().trim();
    const title = (item.title || item.name || item.animeTitle || item.seriesTitle || '').toLowerCase();
    const original = (item.originalTitle || item.romajiTitle || item.japaneseTitle || '').toLowerCase();
    return title.includes(q) || original.includes(q);
  }, []);

  // Is single media type filter active?
  const singleMediaType = useMemo(() => {
    if (mediaParam && ['movie', 'anime', 'manga', 'webseries', 'watchlist'].includes(mediaParam.toLowerCase())) {
      return mediaParam.toLowerCase();
    }
    const gp = genreParam.toLowerCase();
    if (gp === 'anime' || gp === 'animes') return 'anime';
    if (gp === 'movie' || gp === 'movies') return 'movie';
    if (gp === 'manga' || gp === 'mangas') return 'manga';
    if (gp === 'webseries' || gp === 'web-series') return 'webseries';
    return null;
  }, [mediaParam, genreParam]);

  // Target query genre to match
  const effectiveGenre = useMemo(() => {
    if (genreParam) return genreParam;
    if (filterParam && filterParam !== 'genres' && filterParam !== 'languages') return filterParam;
    return '';
  }, [genreParam, filterParam]);

  // Filter items per category
  const filteredMovies = useMemo(() => {
    if (singleMediaType && singleMediaType !== 'movie') return [];
    return (movies || []).filter((m) => {
      if (effectiveGenre && !matchesGenre(m.genres || m.genre, effectiveGenre)) return false;
      if (langParam && !matchesLang(m.language || m.lang, langParam)) return false;
      if (searchTerm && !matchesSearch(m, searchTerm)) return false;
      return true;
    });
  }, [movies, singleMediaType, effectiveGenre, langParam, searchTerm, matchesGenre, matchesLang, matchesSearch]);

  const filteredAnimes = useMemo(() => {
    if (singleMediaType && singleMediaType !== 'anime') return [];
    return (animes || []).filter((a) => {
      if (effectiveGenre && !matchesGenre(a.genres || a.genre, effectiveGenre)) return false;
      if (langParam && !matchesLang(a.language || a.lang, langParam)) return false;
      if (searchTerm && !matchesSearch(a, searchTerm)) return false;
      return true;
    });
  }, [animes, singleMediaType, effectiveGenre, langParam, searchTerm, matchesGenre, matchesLang, matchesSearch]);

  const filteredWebseries = useMemo(() => {
    if (singleMediaType && singleMediaType !== 'webseries') return [];
    return (webseriesList || []).filter((w) => {
      if (effectiveGenre && !matchesGenre(w.genres || w.genre, effectiveGenre)) return false;
      if (langParam && !matchesLang(w.language || w.lang, langParam)) return false;
      if (searchTerm && !matchesSearch(w, searchTerm)) return false;
      return true;
    });
  }, [webseriesList, singleMediaType, effectiveGenre, langParam, searchTerm, matchesGenre, matchesLang, matchesSearch]);

  const filteredMangas = useMemo(() => {
    if (singleMediaType && singleMediaType !== 'manga') return [];
    return (mangas || []).filter((m) => {
      if (effectiveGenre && !matchesGenre(m.genres || m.genre, effectiveGenre)) return false;
      if (langParam && !matchesLang(m.language || m.lang, langParam)) return false;
      if (searchTerm && !matchesSearch(m, searchTerm)) return false;
      return true;
    });
  }, [mangas, singleMediaType, effectiveGenre, langParam, searchTerm, matchesGenre, matchesLang, matchesSearch]);

  const filteredWatchlist = useMemo(() => {
    if (singleMediaType && singleMediaType !== 'watchlist') return [];
    return (watchlist || []).filter((item) => {
      if (effectiveGenre && !matchesGenre(item.genres || item.genre, effectiveGenre)) return false;
      if (langParam && !matchesLang(item.language || item.lang, langParam)) return false;
      if (searchTerm && !matchesSearch(item, searchTerm)) return false;
      return true;
    });
  }, [watchlist, singleMediaType, effectiveGenre, langParam, searchTerm, matchesGenre, matchesLang, matchesSearch]);

  const totalResultsCount = filteredMovies.length + filteredAnimes.length + filteredWebseries.length + filteredMangas.length + filteredWatchlist.length;

  // Infinite scroll trigger
  const hasMore = useMemo(() => {
    if (singleMediaType) {
      if (singleMediaType === 'movie') return visibleLimits.movie < filteredMovies.length;
      if (singleMediaType === 'anime') return visibleLimits.anime < filteredAnimes.length;
      if (singleMediaType === 'webseries') return visibleLimits.webseries < filteredWebseries.length;
      if (singleMediaType === 'manga') return visibleLimits.manga < filteredMangas.length;
      if (singleMediaType === 'watchlist') return visibleLimits.watchlist < filteredWatchlist.length;
    }
    return (
      visibleLimits.movie < filteredMovies.length ||
      visibleLimits.anime < filteredAnimes.length ||
      visibleLimits.webseries < filteredWebseries.length ||
      visibleLimits.manga < filteredMangas.length ||
      visibleLimits.watchlist < filteredWatchlist.length
    );
  }, [singleMediaType, visibleLimits, filteredMovies, filteredAnimes, filteredWebseries, filteredMangas, filteredWatchlist]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          setIsLoadingMore(true);
          setTimeout(() => {
            setVisibleLimits((prev) => ({
              movie: prev.movie + ITEMS_PER_BATCH,
              anime: prev.anime + ITEMS_PER_BATCH,
              webseries: prev.webseries + ITEMS_PER_BATCH,
              manga: prev.manga + ITEMS_PER_BATCH,
              watchlist: prev.watchlist + ITEMS_PER_BATCH,
              all: prev.all + ITEMS_PER_BATCH,
            }));
            setIsLoadingMore(false);
          }, 350);
        }
      },
      { rootMargin: '300px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore]);

  // Card click navigation
  const handleItemClick = (item, type) => {
    if (type === 'movie') {
      router.push(`/movies/${item.id}`);
    } else if (type === 'anime') {
      router.push(`/${item.id}`);
    } else if (type === 'webseries') {
      router.push(`/webseries/${item.id}`);
    } else if (type === 'manga') {
      router.push(`/reader/${item.id}`);
    } else if (type === 'watchlist') {
      router.push(`/watchlist/${item.id}`);
    }
  };

  // Hover handlers
  const handleCardMouseEnter = (item, type, e) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    hoverTimeoutRef.current = setTimeout(() => {
      setActivePreview({ item, type, rect });
    }, 300);
  };

  const handleCardMouseLeave = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    closeTimeoutRef.current = setTimeout(() => {
      setActivePreview(null);
    }, 140);
  };

  // Group renderer helper
  const renderMediaGroup = (title, icon, items, type, limitKey) => {
    if (items.length === 0) return null;
    const visibleItems = items.slice(0, visibleLimits[limitKey]);

    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-xl sm:text-2xl font-extrabold text-white tracking-wide">
              {title}
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/10 text-gray-300">
              {items.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
          {visibleItems.map((item) => {
            const coverImg =
              item.posterUrl ||
              item.posterPath ||
              item.coverUrl ||
              item.thumbnailBase64 ||
              (item.thumbnailPath ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}` : null);
            const rating = item.rating || item.score || null;
            const isWatched = Boolean(
              item.watched ||
              item.completed ||
              item.isWatched ||
              (item.watchProgress && item.watchProgress >= 95) ||
              (item.progressPercent && item.progressPercent >= 100)
            );
            const pct = item.watchProgress || item.progressPercent || 0;
            const subLeft =
              item.year ||
              (item.releaseDate ? item.releaseDate.split('-')[0] : type === 'movie' ? 'Movie' : 'Series');
            const subRight =
              type === 'movie'
                ? item.runtime
                  ? `${Math.floor(item.runtime / 60)}h ${item.runtime % 60}m`
                  : 'Feature'
                : item.episodeCount
                ? `${item.episodeCount} Ep`
                : item.totalChapters
                ? `${item.totalChapters} Ch`
                : '';

            return (
              <MediaCard
                key={item.id}
                item={item}
                type={type}
                coverImg={coverImg}
                rating={rating}
                isCompleted={isWatched}
                pct={pct}
                subLeft={subLeft}
                subRight={subRight}
                accentBorder="hover:border-purple-400/50"
                onClick={() => handleItemClick(item, type)}
                onMouseEnter={(e) => handleCardMouseEnter(item, type, e)}
                onMouseLeave={handleCardMouseLeave}
                onMobileMenuToggle={() =>
                  setActiveMobileMenu(activeMobileMenu?.id === item.id ? null : { type, id: item.id, item })
                }
              />
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-white px-4 sm:px-6 lg:px-12 py-8 sm:py-12">
      {/* Top Header Bar */}
      <div className="max-w-7xl mx-auto mb-8 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition flex items-center gap-1.5 text-xs font-semibold cursor-pointer active:scale-95 shadow-md"
            >
              <ArrowLeft size={18} />
              <span className="hidden sm:inline">Back</span>
            </button>

            <div>
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight">
                {pageTitle}
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">
                {dataLoaded ? `${totalResultsCount} items found in your library` : 'Loading your library...'}
              </p>
            </div>
          </div>

          {/* Quick search input */}
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Filter results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <main className="max-w-7xl mx-auto space-y-10">
        {!dataLoaded ? (
          /* Initial Loading Skeletons */
          <div className="space-y-6">
            <div className="h-6 w-36 bg-white/10 rounded animate-pulse" />
            <div className="flex flex-wrap items-start gap-1.5 sm:gap-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <MediaCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ) : totalResultsCount === 0 ? (
          /* Empty state */
          <div className="py-20 text-center space-y-3">
            <Filter size={40} className="mx-auto text-gray-600" />
            <h3 className="text-lg font-bold text-gray-300">No content matches your filter</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              There are currently no items tracked in your library with this genre, language, or criteria.
            </p>
            <button
              type="button"
              onClick={() => router.push('/')}
              className="mt-4 px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/30 text-xs font-semibold text-purple-200 transition"
            >
              Return Home
            </button>
          </div>
        ) : (
          /* Content Groups */
          <div className="space-y-12">
            {renderMediaGroup('Movies', <Film className="text-amber-400" size={22} />, filteredMovies, 'movie', 'movie')}
            {renderMediaGroup('Animes', <Sparkles className="text-purple-400" size={22} />, filteredAnimes, 'anime', 'anime')}
            {renderMediaGroup('Web Series', <Tv className="text-indigo-400" size={22} />, filteredWebseries, 'webseries', 'webseries')}
            {renderMediaGroup('Manga', <BookOpen className="text-pink-400" size={22} />, filteredMangas, 'manga', 'manga')}
            {renderMediaGroup('Watchlist', <Bookmark className="text-cyan-400" size={22} />, filteredWatchlist, 'watchlist', 'watchlist')}
          </div>
        )}

        {/* Endless Scroll Sentinel & Loading Indicator */}
        <div ref={sentinelRef} className="py-8 flex items-center justify-center">
          {isLoadingMore && (
            <div className="space-y-4 w-full">
              <div className="flex items-center justify-center gap-2 text-xs text-gray-400 font-mono">
                <Loader2 size={16} className="animate-spin text-purple-400" />
                <span>Loading more cards...</span>
              </div>
              <div className="flex flex-wrap items-start justify-center gap-1.5 sm:gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <MediaCardSkeleton key={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hover preview modal */}
      <MediaPreviewModal
        isOpen={Boolean(activePreview)}
        item={activePreview?.item}
        type={activePreview?.type}
        cardRect={activePreview?.rect}
        onClose={() => setActivePreview(null)}
        onMouseEnter={() => {
          if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
        }}
        onMouseLeave={() => setActivePreview(null)}
        onOpenDetails={(item) => {
          setActivePreview(null);
          handleItemClick(item, activePreview?.type);
        }}
      />
    </div>
  );
}

export default function ResultsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#07090e] flex flex-col justify-center items-center gap-3 text-white">
          <Loader2 className="animate-spin text-purple-400" size={36} />
          <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Loading Results...</span>
        </div>
      }
    >
      <ResultsContent />
    </Suspense>
  );
}

