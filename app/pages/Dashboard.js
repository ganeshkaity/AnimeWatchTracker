"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, onSnapshot, writeBatch, doc, deleteDoc, updateDoc, setDoc, getDocs, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { parseEpisode, sortEpisodes, NAMING_PATTERNS, processScannedFiles } from '../utils/parser';
import {
  getLocalAnimes, setLocalAnimes, upsertLocalAnime, deleteLocalAnime,
  getLocalEpisodes, setLocalEpisodes,
  getLocalMangas, setLocalMangas, upsertLocalManga, deleteLocalManga,
  getLocalChapters, setLocalChapters,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import { 
  Plus, Search, Settings, FolderOpen, Loader2, Play, 
  Trash2, SlidersHorizontal, FileVideo, CheckCircle2, ImagePlus,
  StickyNote, Download, Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight,
  Star, Flame, TrendingUp, Clock, Sparkles, Film, Bookmark, Bell, Menu, X,
  Tv, Eye, ShieldCheck, Heart, User, Filter, Compass, Calendar, AlertTriangle,
  Youtube, Video, CheckSquare, Square, ExternalLink, Globe, Trophy, Award,
  BookOpen, HardDrive
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import AnimeCoverSearch from '../components/AnimeCoverSearch';
import MangaCoverSearch from '../components/MangaCoverSearch';
import CachedImage from '../utils/imageCache';

const GRADIENTS = [
  "from-violet-600 to-indigo-700",
  "from-purple-600 to-pink-600",
  "from-amber-500 to-rose-600",
  "from-emerald-500 to-teal-700",
  "from-cyan-600 to-blue-700",
];

const YoutubeLogo = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000"/>
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF"/>
  </svg>
);

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with -
    .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
    .replace(/\-\-+/g, '-');        // Replace multiple - with single -
};

const getDeterministicRating = (id, rating) => {
  if (rating && !isNaN(parseFloat(rating)) && parseFloat(rating) > 0) {
    return parseFloat(rating).toFixed(1);
  }
  // Generate pseudo-random rating between 8.0 and 9.8 based on id string hash
  let hash = 0;
  const str = id || 'default';
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const min = 8.0;
  const random = min + (Math.abs(hash) % 19) * 0.1;
  return random.toFixed(1);
};

export const getAnimeProgressPercent = (anime) => {
  if (!anime) return 0;
  try {
    const localEps = getLocalEpisodes(anime.id);
    if (Array.isArray(localEps) && localEps.length > 0) {
      const watched = localEps.filter(e => !!e.isWatched).length;
      return Math.round((watched / localEps.length) * 100);
    }
  } catch (e) {}
  return Math.round(anime.progressPercent || 0);
};

const getHeroSlides = (animesList) => {
  if (animesList.length === 0) {
    return [{
      id: 'placeholder',
      title: 'WELCOME TO WATCHANIME',
      japaneseTitle: 'トラッカーへようこそ',
      banner: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      rating: '10.0',
      episodes: '0 / 0',
      year: '2026',
      quality: '4K Ultra HD',
      language: 'LOCAL',
      studio: 'Antigravity',
      genres: ['Library', 'Media', 'System'],
      description: 'Your premium personal anime tracking workspace. Add your local anime folder directory to get started parsing episodes and tracking your watch history!'
    }];
  }
  const watching = animesList.filter(a => {
    const pct = getAnimeProgressPercent(a);
    return pct > 0 && pct < 100;
  });
  const others = animesList
    .filter(a => {
      const pct = getAnimeProgressPercent(a);
      return !(pct > 0 && pct < 100);
    })
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));

  const sortedForHero = [...watching, ...others].slice(0, 4);

  return sortedForHero.map(anime => {
    let genres = [];
    if (Array.isArray(anime.genres)) {
      genres = [...anime.genres];
    } else if (typeof anime.genres === 'string' && anime.genres.trim()) {
      genres = anime.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');

    const totalSeasons = anime.totalSeasons ? Number(anime.totalSeasons) : 1;
    const totalEpisodes = anime.totalEpisodes ? Number(anime.totalEpisodes) : (anime.episodeCount || 0);
    const scannedCount = anime.episodeCount || 0;
    let epDisplay = `${totalEpisodes} EP`;
    if (scannedCount > 0 && scannedCount !== totalEpisodes) {
      epDisplay = `${scannedCount}/${totalEpisodes} EP`;
    }

    return {
      id: anime.id,
      title: (anime?.title || 'UNTITLED ANIME').toString().toUpperCase(),
      japaneseTitle: anime.japaneseTitle || 'LOCAL LIBRARY',
      banner: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(anime.id, anime.rating),
      episodes: epDisplay,
      totalSeasons: totalSeasons,
      totalEpisodes: totalEpisodes,
      year: anime.year || new Date(anime.createdAt || Date.now()).getFullYear().toString(),
      quality: anime.quality || '1080p HD',
      language: anime.language || 'SUB / DUB',
      studio: anime.studio || 'Tracked Folder',
      genres: validGenres.length > 0 ? validGenres : ['Anime'],
      description: anime.description || `Local tracked anime folder from path: ${anime.folderPath}`
    };
  });
};

const GENRES_LIST = [
  "All", "Action", "Adventure", "Comedy", "Crime", "Demons", "Detective", "Drama", 
  "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei", 
  "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Mythology", 
  "Parody", "Police", "Post-Apocalyptic", "Psychological", "Reincarnation", "Reverse Harem", 
  "Romance", "Samurai", "School", "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life", 
  "Space", "Sports", "Super Power", "Supernatural", "Suspense", "Survival", "Thriller", 
  "Time Travel", "Vampires"
];

export default function Dashboard({ onSelectAnime }) {
  const router = useRouter();
  const { currentUser, updateVlcPath, updateDefaultPlayer } = useAuth();
  const { isOffline, isManualOffline, isSyncing, lastSyncedAt, setManualOffline, syncNow } = useOffline();
  
  const [animes, setAnimes] = useState([]);
  const [mangas, setMangas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, alpha, progress
  const [filterBy, setFilterBy] = useState('all'); // all, active, completed
  const [selectedGenre, setSelectedGenre] = useState('All');

  // Manga Modal & Form States
  const [showAddMangaModal, setShowAddMangaModal] = useState(false);
  const [mangaFolderPath, setMangaFolderPath] = useState('');
  const [mangaTitle, setMangaTitle] = useState('');
  const [mangaScanning, setMangaScanning] = useState(false);
  const [mangaScanResult, setMangaScanResult] = useState([]);
  const [mangaCoverUrl, setMangaCoverUrl] = useState('');
  const [uploadingMangaCover, setUploadingMangaCover] = useState(false);
  const [mangaGenres, setMangaGenres] = useState([]);
  const [showMangaCoverSearch, setShowMangaCoverSearch] = useState(false);

  // Hero Carousel State
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // Add Anime Form State
  const [folderPath, setFolderPath] = useState('');
  const [animeTitle, setAnimeTitle] = useState('');
  const [scanning, setScanning] = useState(false);
  const [parsedEpsCount, setParsedEpsCount] = useState(0);
  const [scanResult, setScanResult] = useState([]);
  const [namingPattern, setNamingPattern] = useState('auto');
  const [customVlc, setCustomVlc] = useState(currentUser?.vlcPath || '');
  const [defaultPlayer, setDefaultPlayer] = useState(currentUser?.defaultPlayer || 'ask');
  const [exportFormat, setExportFormat] = useState('csv');

  const [coverUrl, setCoverUrl] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const [addGenres, setAddGenres] = useState([]);
  const [showOnlineSearchAdd, setShowOnlineSearchAdd] = useState(false);
  const [addTotalSeasons, setAddTotalSeasons] = useState('1');
  const [addTotalEpisodes, setAddTotalEpisodes] = useState('');

  // YouTube Playlist tab state
  const [addModalTab, setAddModalTab] = useState('local'); // 'local' | 'youtube'
  const [ytPlaylistUrl, setYtPlaylistUrl] = useState('');
  const [ytFetching, setYtFetching] = useState(false);
  const [ytPlaylistData, setYtPlaylistData] = useState(null);
  const [ytSelectedVideoIds, setYtSelectedVideoIds] = useState(new Set());
  const [ytQualitiesFetching, setYtQualitiesFetching] = useState(false);
  const [ytAvailableQualities, setYtAvailableQualities] = useState([]);
  const [ytSelectedQuality, setYtSelectedQuality] = useState('best');
  const [ytError, setYtError] = useState('');

  // Edit Anime Modal State
  const [editingAnime, setEditingAnime] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editGenres, setEditGenres] = useState([]);
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [uploadingEditCover, setUploadingEditCover] = useState(false);
  const [showOnlineSearchEdit, setShowOnlineSearchEdit] = useState(false);
  const [editTotalSeasons, setEditTotalSeasons] = useState('1');
  const [editTotalEpisodes, setEditTotalEpisodes] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // Ref for trending carousel horizontal scroll
  const trendingRef = useRef(null);

  // Weekly Popular Anime from Internet (Top 10 of the week) with Local Storage Cache
  const [weeklyPopular, setWeeklyPopular] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('watchanime_weekly_popular');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch (e) {}
    }
    return [];
  });
  const [loadingWeeklyPopular, setLoadingWeeklyPopular] = useState(false);
  const popularScrollRef = useRef(null);
  const [isDraggingPopular, setIsDraggingPopular] = useState(false);
  const [popularStartX, setPopularStartX] = useState(0);
  const [popularScrollLeft, setPopularScrollLeft] = useState(0);
  const [popularHasDragged, setPopularHasDragged] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // Check if cached data is fresh (within 3 hours)
    let isCacheFresh = false;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('watchanime_weekly_popular');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.timestamp && (Date.now() - parsed.timestamp < 3 * 3600 * 1000) && Array.isArray(parsed?.data) && parsed.data.length > 0) {
            isCacheFresh = true;
          }
        }
      } catch (e) {}
    }

    // If cache is fresh and we already have items, skip network fetch to save bandwidth & CPU
    if (isCacheFresh && weeklyPopular.length > 0) {
      return;
    }

    const fetchPopular = async () => {
      if (weeklyPopular.length === 0) {
        setLoadingWeeklyPopular(true);
      }
      try {
        const res = await fetch('/api/popular-anime');
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.anime)) {
          setWeeklyPopular(data.anime);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(
                'watchanime_weekly_popular',
                JSON.stringify({ timestamp: Date.now(), data: data.anime })
              );
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('[Dashboard] Failed to fetch weekly popular anime:', err);
      } finally {
        if (isMounted) setLoadingWeeklyPopular(false);
      }
    };
    fetchPopular();
    return () => { isMounted = false; };
  }, []);

  // Trending Today from Internet (Top 10 Episodes, Films, Hentai) with Local Storage Cache
  const [internetTrending, setInternetTrending] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('watchanime_trending_today_v3');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch (e) {}
    }
    return [];
  });
  const [loadingTrending, setLoadingTrending] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let isFresh = false;
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('watchanime_trending_today_v3');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed?.timestamp && (Date.now() - parsed.timestamp < 2 * 3600 * 1000) && Array.isArray(parsed?.data) && parsed.data.length > 0) {
            isFresh = true;
          }
        }
      } catch (e) {}
    }

    if (isFresh && internetTrending.length > 0) {
      return;
    }

    const fetchTrending = async () => {
      if (internetTrending.length === 0) setLoadingTrending(true);
      try {
        const res = await fetch('/api/trending-today');
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.trending)) {
          setInternetTrending(data.trending);
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(
                'watchanime_trending_today_v3',
                JSON.stringify({ timestamp: Date.now(), data: data.trending })
              );
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('[Dashboard] Failed to fetch trending today:', err);
      } finally {
        if (isMounted) setLoadingTrending(false);
      }
    };
    fetchTrending();
    return () => { isMounted = false; };
  }, []);

  const handlePopularScroll = (direction) => {
    if (!popularScrollRef.current) return;
    const amount = direction === 'left' ? -380 : 380;
    popularScrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  const handlePopularMouseDown = (e) => {
    if (!popularScrollRef.current) return;
    setIsDraggingPopular(true);
    setPopularHasDragged(false);
    setPopularStartX(e.pageX - popularScrollRef.current.offsetLeft);
    setPopularScrollLeft(popularScrollRef.current.scrollLeft);
  };

  const handlePopularMouseMove = (e) => {
    if (!isDraggingPopular || !popularScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - popularScrollRef.current.offsetLeft;
    const walk = (x - popularStartX) * 1.5;
    if (Math.abs(walk) > 5) {
      setPopularHasDragged(true);
    }
    popularScrollRef.current.scrollLeft = popularScrollLeft - walk;
  };

  const handlePopularMouseUp = () => {
    setIsDraggingPopular(false);
  };

  const handlePopularMouseLeave = () => {
    setIsDraggingPopular(false);
  };

  const handlePopularCardClick = (slide) => {
    if (popularHasDragged) return; // Prevent navigation while dragging
    if (slide.isUploaded && slide.uploadedAnimeId) {
      onSelectAnime(slide.uploadedAnimeId);
    } else {
      // Prefill Add Anime modal to link or track this show!
      setAnimeTitle(slide.title);
      setCoverUrl(slide.banner || slide.image);
      setShowAddModal(true);
    }
  };

  const handleOpenExternalAnime = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const title = item.animeTitle || item.title || '';
    const url = item.siteUrl || (item.rawId ? `https://anilist.co/anime/${item.rawId}` : `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`);
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenMalSearch = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const title = item.animeTitle || item.title || '';
    const url = `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}&cat=anime`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const handleAddAnimeToLibrary = (e, item) => {
    if (e && e.stopPropagation) e.stopPropagation();
    setAnimeTitle(item.animeTitle || item.title || '');
    setCoverUrl(item.banner || item.image || '');
    setShowAddModal(true);
  };

  // ── Top 20 Top Rated Anime from AniList/Jikan with 1-Day Firestore & LocalStorage Cache ──
  const [topRatedAnime, setTopRatedAnime] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('watchanime_top_rated_v1');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
            return parsed.data;
          }
        }
      } catch (e) {}
    }
    return [];
  });
  const [loadingTopRated, setLoadingTopRated] = useState(false);
  const [hasScrolledToTopRated, setHasScrolledToTopRated] = useState(false);
  const lazyTopRatedRef = useRef(null);
  const topRatedScrollRef = useRef(null);

  // Lazy-load sentinel: only triggers when user scrolls near the Top Rated section
  useEffect(() => {
    if (hasScrolledToTopRated || !lazyTopRatedRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setHasScrolledToTopRated(true);
          observer.disconnect();
        }
      },
      { rootMargin: '350px' }
    );
    observer.observe(lazyTopRatedRef.current);
    return () => observer.disconnect();
  }, [hasScrolledToTopRated]);

  // Daily fetch / sync logic (executes once daily only after user scrolls to section)
  useEffect(() => {
    if (!hasScrolledToTopRated) return;

    let isMounted = true;
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    const loadTopRated = async () => {
      // 1. Check local storage cache timestamp (update only 1 time daily)
      if (typeof window !== 'undefined') {
        try {
          const localCacheStr = localStorage.getItem('watchanime_top_rated_v1');
          if (localCacheStr) {
            const parsed = JSON.parse(localCacheStr);
            if (parsed?.timestamp && (Date.now() - parsed.timestamp < ONE_DAY_MS) && Array.isArray(parsed?.data) && parsed.data.length > 0) {
              setTopRatedAnime(parsed.data);
              return;
            }
          }
        } catch (e) {}
      }

      // 2. Check Firestore cache document (system_cache/top_rated_episodes)
      try {
        if (db) {
          const docRef = doc(db, 'system_cache', 'top_rated_episodes');
          const cachedDoc = await getDoc(docRef).catch(() => null);
          if (cachedDoc && cachedDoc.exists()) {
            const firestoreData = cachedDoc.data();
            if (firestoreData?.timestamp && (Date.now() - firestoreData.timestamp < ONE_DAY_MS) && Array.isArray(firestoreData?.items) && firestoreData.items.length > 0) {
              if (isMounted) {
                setTopRatedAnime(firestoreData.items);
              }
              if (typeof window !== 'undefined') {
                try {
                  localStorage.setItem('watchanime_top_rated_v1', JSON.stringify({ timestamp: firestoreData.timestamp, data: firestoreData.items }));
                  const photos = {};
                  firestoreData.items.forEach(it => { if (it.id && it.image) photos[it.id] = it.image; });
                  localStorage.setItem('watchanime_top_rated_photos', JSON.stringify(photos));
                } catch (e) {}
              }
              return;
            }
          }
        }
      } catch (firestoreErr) {
        console.warn('[Dashboard] Firestore top-rated cache read fallback:', firestoreErr);
      }

      // 3. Fetch fresh from /api/top-rated
      if (topRatedAnime.length === 0) setLoadingTopRated(true);
      try {
        const res = await fetch('/api/top-rated');
        const data = await res.json();
        if (isMounted && data.success && Array.isArray(data.anime) && data.anime.length > 0) {
          const items = data.anime;
          setTopRatedAnime(items);

          const now = Date.now();
          // Store in LocalStorage (photos & data)
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem('watchanime_top_rated_v1', JSON.stringify({ timestamp: now, data: items }));
              const photos = {};
              items.forEach(it => { if (it.id && it.image) photos[it.id] = it.image; });
              localStorage.setItem('watchanime_top_rated_photos', JSON.stringify(photos));
            } catch (e) {}
          }

          // Store other data in Firestore (updated daily for only 1 time)
          if (db) {
            try {
              const docRef = doc(db, 'system_cache', 'top_rated_episodes');
              await setDoc(docRef, {
                items: items,
                timestamp: now,
                dateStr: new Date().toISOString().split('T')[0],
                totalCount: items.length
              }, { merge: true });
            } catch (fsWriteErr) {
              console.warn('[Dashboard] Firestore top-rated cache write error:', fsWriteErr);
            }
          }
        }
      } catch (err) {
        console.error('[Dashboard] Failed to fetch top rated anime:', err);
      } finally {
        if (isMounted) setLoadingTopRated(false);
      }
    };

    loadTopRated();
    return () => { isMounted = false; };
  }, [hasScrolledToTopRated]);

  const scrollTopRated = (direction) => {
    if (topRatedScrollRef.current) {
      const { scrollLeft, clientWidth } = topRatedScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      topRatedScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const localTopRatedScrollRef = useRef(null);

  const scrollLocalTopRated = (direction) => {
    if (localTopRatedScrollRef.current) {
      const { scrollLeft, clientWidth } = localTopRatedScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      localTopRatedScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Helper to extract the current cover photo of an anime folder
  const getAnimeFolderCover = (a) => {
    if (!a) return '';
    if (a.thumbnailBase64) {
      return (a.thumbnailBase64.startsWith('http') || a.thumbnailBase64.startsWith('data:'))
        ? a.thumbnailBase64
        : `/api/image?path=${encodeURIComponent(a.thumbnailBase64)}`;
    }
    if (a.thumbnailPath) {
      return `/api/image?path=${encodeURIComponent(a.thumbnailPath)}`;
    }
    return a.coverImage || a.coverUrl || a.image || '';
  };

  const [isDraggingTopRated, setIsDraggingTopRated] = useState(false);
  const [topRatedStartX, setTopRatedStartX] = useState(0);
  const [topRatedScrollLeft, setTopRatedScrollLeft] = useState(0);
  const [topRatedHasDragged, setTopRatedHasDragged] = useState(false);

  const handleTopRatedMouseDown = (e) => {
    if (!topRatedScrollRef.current) return;
    setIsDraggingTopRated(true);
    setTopRatedHasDragged(false);
    setTopRatedStartX(e.pageX - topRatedScrollRef.current.offsetLeft);
    setTopRatedScrollLeft(topRatedScrollRef.current.scrollLeft);
  };

  const handleTopRatedMouseMove = (e) => {
    if (!isDraggingTopRated || !topRatedScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - topRatedScrollRef.current.offsetLeft;
    const walk = (x - topRatedStartX) * 1.5;
    if (Math.abs(walk) > 5) {
      setTopRatedHasDragged(true);
    }
    topRatedScrollRef.current.scrollLeft = topRatedScrollLeft - walk;
  };

  const handleTopRatedMouseUp = () => {
    setIsDraggingTopRated(false);
  };

  const handleTopRatedMouseLeave = () => {
    setIsDraggingTopRated(false);
  };

  const topRatedWithLibrary = useMemo(() => {
    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Process all external top-rated anime & match with local anime
    const processedExternal = topRatedAnime.map((show) => {
      const sTitle = clean(show.seriesTitle || show.animeTitle || show.title);
      const sSub = clean(show.subTitle);

      const matchingLocal = animes.find((a) => {
        const aTitle = clean(a.title);
        const aFolder = a.folderPath ? clean(a.folderPath.split(/[/\\]/).pop()) : '';
        return (
          (aTitle && (aTitle === sTitle || (sSub && aTitle === sSub))) ||
          (aTitle && aTitle.length >= 4 && (sTitle.includes(aTitle) || aTitle.includes(sTitle))) ||
          (aFolder && aFolder.length >= 4 && (sTitle.includes(aFolder) || aFolder.includes(sTitle)))
        );
      });

      const localCover = matchingLocal ? getAnimeFolderCover(matchingLocal) : '';
      const userRating = matchingLocal && matchingLocal.rating ? parseFloat(matchingLocal.rating) : null;
      const externalRating = parseFloat(show.rating || 0);
      const effectiveRating = userRating !== null && !isNaN(userRating) && userRating > 0
        ? Math.max(userRating, externalRating).toFixed(1)
        : (show.rating || '9.0');

      const epName = show.episodeName || show.title || 'Top Episode';
      const seriesName = show.seriesTitle || show.animeTitle || show.subTitle || 'Anime Series';

      return {
        ...show,
        title: epName,
        episodeName: epName,
        seriesTitle: seriesName,
        animeTitle: seriesName,
        image: (matchingLocal && localCover) ? localCover : show.image,
        banner: (matchingLocal && localCover) ? localCover : (show.banner || show.image),
        rating: effectiveRating,
        numericRating: parseFloat(effectiveRating) || 0,
        isUploaded: Boolean(matchingLocal),
        uploadedAnimeId: matchingLocal?.id,
        userCustomRating: userRating !== null && !isNaN(userRating) && userRating > 0 ? userRating.toFixed(1) : null
      };
    });

    // 2. Also check if user has local animes with user rating that should compete in top 20
    const localOnlyShows = [];
    animes.forEach((local) => {
      const isAlreadyInList = processedExternal.some(
        (ext) => ext.isUploaded && ext.uploadedAnimeId === local.id
      );

      const localRatingNum = local.rating ? parseFloat(local.rating) : 0;
      if (!isAlreadyInList && localRatingNum > 0) {
        const localCover = getAnimeFolderCover(local);
        const totalSeasons = local.totalSeasons ? Number(local.totalSeasons) : 1;
        const totalEpisodes = local.totalEpisodes ? Number(local.totalEpisodes) : (local.episodeCount || 0);
        const watchedEp = local.lastWatchedEpisode || 1;
        const epLabel = `Ep ${watchedEp}`;
        const epName = `Ep ${watchedEp} - ${local.title || 'Episode'}`;

        localOnlyShows.push({
          id: `local-top-${local.id}`,
          rawId: local.id,
          title: epName,
          episodeName: epName,
          seriesTitle: local.title || 'Untitled Anime',
          animeTitle: local.title || 'Untitled Anime',
          subTitle: local.folderPath || '',
          image: localCover || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
          banner: localCover || '',
          rating: localRatingNum.toFixed(1),
          numericRating: localRatingNum,
          episodes: epLabel,
          type: 'Local',
          year: local.year || '',
          genres: Array.isArray(local.genres) ? local.genres.slice(0, 3) : [],
          studio: local.studio || 'My Local Library',
          isUploaded: true,
          uploadedAnimeId: local.id,
          userCustomRating: localRatingNum.toFixed(1),
          description: local.notes || 'From your local tracked anime library'
        });
      }
    });

    // 3. Combine and sort by rating descending (user's higher rated anime gets top rank!)
    const combined = [...processedExternal, ...localOnlyShows]
      .sort((a, b) => (b.numericRating || 0) - (a.numericRating || 0))
      .slice(0, 20)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1
      }));

    return combined;
  }, [topRatedAnime, animes]);

  // Get dynamic lists from database animes
  const heroSlides = getHeroSlides(animes);

  const trendingShows = useMemo(() => {
    if (internetTrending.length === 0) {
      return animes.slice(0, 6).map((anime, idx) => ({
        id: anime.id,
        rank: String(idx + 1).padStart(2, '0'),
        animeTitle: anime.title || 'Untitled Anime',
        title: anime.title || 'Untitled Anime',
        episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 1',
        rating: getDeterministicRating(anime.id, anime.rating),
        image: getAnimeFolderCover(anime) || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx151807-it355ZgzquUd.png',
        lang: anime.language || 'SUB/DUB',
        quality: anime.quality || 'HD',
        type: 'Local Anime',
        typeBadge: 'LOCAL',
        typeColor: 'purple',
        isUploaded: true,
        uploadedAnimeId: anime.id,
      }));
    }

    const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    return internetTrending.map((item, idx) => {
      const iTitle = clean(item.animeTitle || item.title);
      const iRomaji = clean(item.romajiTitle);
      const iEnglish = clean(item.englishTitle);

      // Best match against library animes by title, romaji, english, or folder name
      const matched = animes.find((a) => {
        const aTitle = clean(a.title);
        const aFolder = a.folderPath ? clean(a.folderPath.split(/[/\\]/).pop()) : '';
        return (
          (aTitle && (aTitle === iTitle || (iRomaji && aTitle === iRomaji) || (iEnglish && aTitle === iEnglish))) ||
          (aTitle && aTitle.length >= 4 && (iTitle.includes(aTitle) || aTitle.includes(iTitle))) ||
          (iRomaji && aTitle && iRomaji.length >= 4 && (iRomaji.includes(aTitle) || aTitle.includes(iRomaji))) ||
          (iEnglish && aTitle && iEnglish.length >= 4 && (iEnglish.includes(aTitle) || aTitle.includes(iEnglish))) ||
          (aFolder && aFolder.length >= 4 && (iTitle.includes(aFolder) || aFolder.includes(iTitle)))
        );
      });

      // For anime already in library, use the current cover photo of the anime folder
      const localCover = matched ? getAnimeFolderCover(matched) : '';

      return {
        ...item,
        rank: String(idx + 1).padStart(2, '0'),
        image: (matched && localCover) ? localCover : item.image,
        banner: (matched && localCover) ? localCover : (item.banner || item.image),
        isUploaded: !!matched,
        uploadedAnimeId: matched ? matched.id : null,
      };
    });
  }, [internetTrending, animes]);

  const handleTrendingCardClick = (show) => {
    if (show.isUploaded && show.uploadedAnimeId) {
      onSelectAnime(show.uploadedAnimeId);
    } else {
      setAnimeTitle(show.animeTitle || show.title);
      setCoverUrl(show.banner || show.image);
      setShowAddModal(true);
    }
  };

  const recentlyUpdated = [...animes]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 6)
    .map(anime => ({
      id: anime.id,
      title: anime.title || 'Untitled Anime',
      episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 0',
      rating: getDeterministicRating(anime.id, anime.rating),
      image: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
      quality: anime.quality || 'HD',
      isYouTube: !!(anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://'))
    }));

  const popularThisWeek = useMemo(() => {
    if (weeklyPopular.length > 0) {
      const clean = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return weeklyPopular.slice(0, 10).map((item, idx) => {
        const iTitle = clean(item.title);
        const iRomaji = clean(item.romajiTitle);
        // Find if user already has this anime uploaded in their library
        const matched = animes.find((a) => {
          const aTitle = clean(a.title);
          return (
            aTitle === iTitle ||
            (iRomaji && aTitle === iRomaji) ||
            (aTitle.length > 4 && iTitle.includes(aTitle)) ||
            (iTitle.length > 4 && aTitle.includes(iTitle))
          );
        });

        const localCover = matched ? getAnimeFolderCover(matched) : '';

        return {
          id: matched ? matched.id : `ext-${item.id}`,
          title: item.title,
          animeTitle: item.title,
          romajiTitle: item.romajiTitle,
          studio: item.studio || 'Trending',
          rating: item.rating || '8.5',
          episodes: item.episodes || 'TV',
          image: (matched && localCover) ? localCover : (item.image || item.banner),
          banner: (matched && localCover) ? localCover : (item.banner || item.image),
          rank: item.rank || idx + 1,
          isUploaded: !!matched,
          uploadedAnimeId: matched ? matched.id : null,
          year: item.year,
          siteUrl: item.siteUrl || `https://anilist.co/search/anime?search=${encodeURIComponent(item.title)}`,
          source: item.source || 'AniList'
        };
      });
    }

    // Fallback if offline or loading
    return [...animes]
      .sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0))
      .slice(0, 10)
      .map((anime, idx) => {
        const totalSeasons = anime.totalSeasons ? Number(anime.totalSeasons) : 1;
        const totalEpisodes = anime.totalEpisodes ? Number(anime.totalEpisodes) : (anime.episodeCount || 0);
        const scannedCount = anime.episodeCount || 0;
        let epLabel = `${totalEpisodes} EP`;
        if (scannedCount > 0 && scannedCount !== totalEpisodes) {
          epLabel = `${scannedCount}/${totalEpisodes} EP`;
        }
        return {
          id: anime.id,
          title: anime.title || 'Untitled Anime',
          studio: anime.studio || 'Local',
          rating: getDeterministicRating(anime.id, anime.rating),
          episodes: epLabel,
          totalSeasons: totalSeasons,
          totalEpisodes: totalEpisodes,
          banner: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
          rank: idx + 1,
          isUploaded: true,
          uploadedAnimeId: anime.id,
        };
      });
  }, [weeklyPopular, animes]);

  const legacyLocalTopRated = [...animes]
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
    .slice(0, 5)
    .map(anime => ({
      id: anime.id,
      title: anime.title || 'Untitled Anime',
      rating: getDeterministicRating(anime.id, anime.rating),
      episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 0',
      image: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
    }));

  const autocompleteMatches = search.trim().length > 0
    ? animes.filter(anime => (anime.title || '').toLowerCase().includes(search.toLowerCase()))
    : [];

  const autocompleteMangaMatches = useMemo(() => {
    if (!search || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return (mangas || []).filter(m => (m?.title || '').toLowerCase().includes(q));
  }, [mangas, search]);

  // Auto Hero Slider Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideDirection(1);
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 11000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Sync state with currentUser when it updates
  useEffect(() => {
    if (currentUser) {
      setCustomVlc(currentUser.vlcPath || '');
      setDefaultPlayer(currentUser.defaultPlayer || 'ask');
    }
  }, [currentUser]);

  // Load animes & mangas: localStorage first, then Firestore
  useEffect(() => {
    if (!currentUser) return;

    const localAnimes = getLocalAnimes();
    if (localAnimes.length > 0) {
      setAnimes(localAnimes);
      setLoading(false);
    }

    const localMangas = getLocalMangas();
    if (localMangas.length > 0) {
      setMangas(localMangas);
    }

    if (isOffline || !db) {
      setLoading(false);
      return;
    }

    const targetUserId = getUserId();
    const animeRef = collection(db, 'users', targetUserId, 'anime');
    const mangaRef = collection(db, 'users', targetUserId, 'mangas');

    const unsubscribeAnime = onSnapshot(query(animeRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, userId: targetUserId, ...d.data() });
      });
      setAnimes(list);
      setLocalAnimes(list);
      setLoading(false);
    }, (err) => {
      console.error('Firestore anime subscription error:', err);
      setAnimes(getLocalAnimes());
      setLoading(false);
    });

    const unsubscribeManga = onSnapshot(query(mangaRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, userId: targetUserId, ...d.data() });
      });
      setMangas(list);
      setLocalMangas(list);
    }, (err) => {
      console.warn('Firestore manga subscription error:', err);
      setMangas(getLocalMangas());
    });

    return () => {
      unsubscribeAnime();
      unsubscribeManga();
    };
  }, [currentUser, isOffline]);

  // YouTube Playlist Handlers
  const handleFetchYouTubePlaylist = async () => {
    if (!ytPlaylistUrl || !ytPlaylistUrl.trim()) {
      setYtError('Please enter a YouTube Playlist URL.');
      return;
    }
    setYtError('');
    setYtFetching(true);
    setYtPlaylistData(null);
    try {
      const res = await fetch('/api/youtube/playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ytPlaylistUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch playlist');
      }
      setYtPlaylistData(data.playlist);
      const allIds = new Set(data.playlist.videos.map(v => v.id));
      setYtSelectedVideoIds(allIds);

      if (data.playlist.videos.length > 0) {
        fetchYouTubeQualities(data.playlist.videos[0].id);
      }
    } catch (err) {
      setYtError(err.message || 'Error fetching YouTube playlist');
    } finally {
      setYtFetching(false);
    }
  };

  const fetchYouTubeQualities = async (sampleVideoId) => {
    setYtQualitiesFetching(true);
    try {
      const res = await fetch('/api/youtube/qualities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: sampleVideoId }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.qualities)) {
        setYtAvailableQualities(data.qualities);
        if (!ytSelectedQuality && data.qualities.length > 0) {
          setYtSelectedQuality(data.qualities[0].id);
        }
      }
    } catch (err) {
      console.error('[fetchQualities error]', err);
    } finally {
      setYtQualitiesFetching(false);
    }
  };

  const toggleSelectAllYt = () => {
    if (!ytPlaylistData) return;
    if (ytSelectedVideoIds.size === ytPlaylistData.videos.length) {
      setYtSelectedVideoIds(new Set());
    } else {
      setYtSelectedVideoIds(new Set(ytPlaylistData.videos.map(v => v.id)));
    }
  };

  const toggleVideoSelection = (vId) => {
    const updated = new Set(ytSelectedVideoIds);
    if (updated.has(vId)) {
      updated.delete(vId);
    } else {
      updated.add(vId);
    }
    setYtSelectedVideoIds(updated);
  };

  const handleImportYouTubePlaylist = async () => {
    if (!ytPlaylistData || ytSelectedVideoIds.size === 0) {
      setYtError('Please select at least one video to import.');
      return;
    }
    setScanning(true);
    try {
      const selectedVideos = ytPlaylistData.videos.filter(v => ytSelectedVideoIds.has(v.id));
      const animeId = slugify(ytPlaylistData.title) || `yt_${ytPlaylistData.id}_${Date.now()}`;
      const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];

      const totalSeasonsVal = addTotalSeasons ? parseInt(addTotalSeasons, 10) : 1;
      const totalEpisodesVal = addTotalEpisodes ? parseInt(addTotalEpisodes, 10) : selectedVideos.length;

      const animeData = {
        title: ytPlaylistData.title,
        folderPath: ytPlaylistUrl.trim(),
        isYouTube: true,
        playlistId: ytPlaylistData.id,
        episodeCount: selectedVideos.length,
        totalSeasons: totalSeasonsVal,
        totalEpisodes: totalEpisodesVal,
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastWatchedEpisode: '',
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: ytPlaylistData.thumbnail || '',
        thumbnailPath: '',
        genres: ['YouTube', 'Playlist'],
        description: `Imported YouTube Playlist (${selectedVideos.length} videos)`
      };

      const parsedEps = selectedVideos.map((v, idx) => ({
        episodeNumber: idx + 1,
        fileName: v.title,
        filePath: `youtube://${v.id}`,
        youtubeId: v.id,
        selectedQuality: ytSelectedQuality || 'best',
        durationSeconds: v.durationSeconds || 0,
        durationFormatted: v.durationFormatted || '0:00',
        thumbnailUrl: v.thumbnail,
        isYouTube: true,
        createdAt: Date.now(),
        watchedSeconds: 0,
        lastPositionSeconds: 0,
        isWatched: false,
        isFlagged: false,
        flags: [],
        note: '',
        updatedAt: new Date().toISOString(),
        docId: `ep_yt_${v.id}`
      }));

      upsertLocalAnime({ id: animeId, ...animeData });
      const epObjs = parsedEps.map(({ docId, ...rest }) => ({ id: docId, ...rest }));
      setLocalEpisodes(animeId, epObjs);

      if (!isOffline && db) {
        const batch = writeBatch(db);
        const animeDocRef = doc(db, 'users', getUserId(), 'anime', animeId);
        batch.set(animeDocRef, animeData);
        parsedEps.forEach(({ docId, ...dbData }) => {
          const epDocRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', docId);
          batch.set(epDocRef, dbData);
        });
        await batch.commit();
      }

      setShowAddModal(false);
      setYtPlaylistUrl('');
      setYtPlaylistData(null);
      setYtSelectedVideoIds(new Set());
      setYtError('');
    } catch (err) {
      console.error(err);
      setYtError('Failed to import YouTube Playlist');
    } finally {
      setScanning(false);
    }
  };

  // Browse Directory using API
  const handleBrowseFolder = async () => {
    setScanning(true);
    try {
      const response = await fetch('/api/select-folder');
      const data = await response.json();
      
      if (data.success && data.path) {
        const path = data.path;
        setFolderPath(path);
        const folderName = path.split(/[\\/]/).pop();
        setAnimeTitle(folderName || '');
        
        const scanRes = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: path })
        });
        const scanData = await scanRes.json();
        
        if (scanData.success) {
          setScanResult(scanData.episodes);
          setParsedEpsCount(scanData.episodes.length);
          if (!addTotalEpisodes) {
            setAddTotalEpisodes(String(scanData.episodes.length));
          }
          if (!addTotalSeasons) {
            setAddTotalSeasons('1');
          }
        } else {
          alert("Error scanning folder: " + scanData.error);
        }
      } else if (!data.success) {
        alert("Failed to open dialog window automatically. Please type/paste directory path manually.");
      }
    } catch (err) {
      console.error(err);
      alert("Folder dialog error. Please paste the directory path directly.");
    } finally {
      setScanning(false);
    }
  };

  // Scan folder manually
  const handleScan = async () => {
    if (!folderPath) return;
    setScanning(true);
    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderPath.trim() })
      });
      const data = await res.json();
      
      if (data.success) {
        setScanResult(data.episodes);
        setParsedEpsCount(data.episodes.length);
        if (!addTotalEpisodes) {
          setAddTotalEpisodes(String(data.episodes.length));
        }
        if (!addTotalSeasons) {
          setAddTotalSeasons('1');
        }
        
        if (!animeTitle) {
          const folderName = folderPath.trim().split(/[\\/]/).pop();
          setAnimeTitle(folderName || '');
        }
      } else {
        alert("Error scanning folder: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Scan request failed: " + err.message);
    } finally {
      setScanning(false);
    }
  };

  // Add Anime
  const handleAddAnime = async (e) => {
    e.preventDefault();
    const cleanPath = folderPath.trim();
    if (!cleanPath || !animeTitle.trim() || scanResult.length === 0) {
      alert('Please select/enter a valid folder, input a title, and scan files first.');
      return;
    }

    setScanning(true);
    try {
      let animeId = slugify(animeTitle.trim());
      if (!animeId) {
        animeId = `anime_${Date.now()}`;
      } else {
        const isDuplicate = animes.some(a => a.id === animeId);
        if (isDuplicate) {
          animeId = `${animeId}-${Math.floor(Math.random() * 1000)}`;
        }
      }
      const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];

      const totalSeasonsVal = addTotalSeasons ? parseInt(addTotalSeasons, 10) : 1;
      const totalEpisodesVal = addTotalEpisodes ? parseInt(addTotalEpisodes, 10) : scanResult.length;

      const animeData = {
        title: animeTitle.trim(),
        folderPath: cleanPath,
        episodeCount: scanResult.length,
        totalSeasons: totalSeasonsVal,
        totalEpisodes: totalEpisodesVal,
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastWatchedEpisode: '',
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: coverUrl || '',
        genres: addGenres,
      };

      const processedEps = processScannedFiles(scanResult, cleanPath, namingPattern);
      const parsedEps = processedEps.map((ep) => ({
        episodeNumber: ep.episodeNumber,
        fileName: ep.fileName,
        filePath: ep.filePath,
        createdAt: ep.createdAt || Date.now(),
        watchedSeconds: 0,
        durationSeconds: 0,
        lastPositionSeconds: 0,
        isWatched: false,
        isFlagged: false,
        flags: [],
        note: '',
        updatedAt: new Date().toISOString(),
        docId: ep.docId,
        isOffPattern: ep.isOffPattern || false,
      }));

      const sortedEps = sortEpisodes(parsedEps);

      upsertLocalAnime({ id: animeId, ...animeData });
      const epObjs = sortedEps.map(({ docId, ...rest }) => ({ id: docId, ...rest }));
      setLocalEpisodes(animeId, epObjs);

      if (!isOffline && db) {
        const batch = writeBatch(db);
        const animeDocRef = doc(db, 'users', getUserId(), 'anime', animeId);
        batch.set(animeDocRef, animeData);
        sortedEps.forEach(({ docId, ...dbData }) => {
          const epDocRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', docId);
          batch.set(epDocRef, dbData);
        });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${animeId}`,
          payload: { id: animeId, ...animeData },
        });
        addToDirtyQueue({
          type: 'SET_EPISODES_BATCH',
          dedupeKey: `SET_EPISODES_BATCH_${animeId}`,
          payload: { animeId, animeUserId: getUserId(), episodes: epObjs },
        });
      }

      setShowAddModal(false);
      setFolderPath('');
      setAnimeTitle('');
      setCoverUrl('');
      setAddGenres([]);
      setAddTotalSeasons('1');
      setAddTotalEpisodes('');
      setScanResult([]);
      setNamingPattern('auto');
      setParsedEpsCount(0);
    } catch (err) {
      console.error(err);
      alert('Failed to track anime: ' + err.message);
    } finally {
      setScanning(false);
    }
  };

  // Delete Anime
  const handleDeleteAnime = async (anime, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Are you sure you want to stop tracking this anime? Progress and notes will be deleted.')) return;
    try {
      const animeId = anime.id;
      const targetUserId = anime.userId || currentUser.uid;
      deleteLocalAnime(animeId);
      if (!isOffline && db) {
        await deleteDoc(doc(db, 'users', targetUserId, 'anime', animeId));
      } else {
        addToDirtyQueue({ type: 'DELETE_ANIME', dedupeKey: `DELETE_ANIME_${animeId}`, payload: { id: animeId, userId: targetUserId } });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Manga Actions ───────────────────────────────────────────────────────────
  const handleBrowseMangaFolder = async () => {
    setMangaScanning(true);
    try {
      const response = await fetch('/api/select-folder');
      const data = await response.json();
      if (data.success && data.path) {
        const path = data.path;
        setMangaFolderPath(path);
        const folderName = path.split(/[\\/]/).pop();
        setMangaTitle(folderName || '');

        const scanRes = await fetch('/api/manga/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: path }),
        });
        const scanData = await scanRes.json();
        if (scanData.success) {
          setMangaScanResult(scanData.chapters);
        } else {
          alert("Error scanning folder: " + scanData.error);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Folder dialog error. Please paste the directory path directly.");
    } finally {
      setMangaScanning(false);
    }
  };

  const handleScanManga = async () => {
    if (!mangaFolderPath) return;
    setMangaScanning(true);
    try {
      const res = await fetch('/api/manga/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: mangaFolderPath.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setMangaScanResult(data.chapters);
        if (!mangaTitle) {
          const folderName = mangaFolderPath.trim().split(/[\\/]/).pop();
          setMangaTitle(folderName || '');
        }
      } else {
        alert("Error scanning manga folder: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Scan request failed: " + err.message);
    } finally {
      setMangaScanning(false);
    }
  };

  const handleAddManga = async (e) => {
    e.preventDefault();
    const cleanPath = mangaFolderPath.trim();
    if (!cleanPath || !mangaTitle.trim() || mangaScanResult.length === 0) {
      alert('Please select/enter a valid folder, input a title, and scan PDF files first.');
      return;
    }

    setMangaScanning(true);
    try {
      let mangaId = slugify(mangaTitle.trim());
      if (!mangaId) {
        mangaId = `manga_${Date.now()}`;
      } else {
        const isDuplicate = mangas.some(m => m.id === mangaId);
        if (isDuplicate) {
          mangaId = `${mangaId}-${Math.floor(Math.random() * 1000)}`;
        }
      }
      const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];

      const mangaData = {
        title: mangaTitle.trim(),
        folderPath: cleanPath,
        chapterCount: mangaScanResult.length,
        totalChapters: mangaScanResult.length,
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReadChapter: '',
        lastReadPage: 1,
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: mangaCoverUrl || '',
        genres: mangaGenres,
        type: 'manga',
      };

      const parsedChapters = mangaScanResult.map((ch, idx) => ({
        id: `chap_${idx + 1}_${encodeURIComponent(ch.name || ch.fileName)}`,
        chapterNumber: ch.chapterNumber !== undefined ? ch.chapterNumber : idx + 1,
        name: ch.name || ch.fileName,
        fileName: ch.fileName || ch.name,
        filePath: ch.filePath,
        size: ch.size || 0,
        createdAt: ch.createdAt || Date.now(),
        lastPage: 1,
        progress: 0,
        isRead: false,
        isFlagged: false,
        flags: [],
        note: '',
        updatedAt: new Date().toISOString(),
      }));

      upsertLocalManga({ id: mangaId, ...mangaData });
      setLocalChapters(mangaId, parsedChapters);
      setMangas(prev => [{ id: mangaId, ...mangaData }, ...prev]);

      if (!isOffline && db) {
        const batch = writeBatch(db);
        const mangaDocRef = doc(db, 'users', getUserId(), 'mangas', mangaId);
        batch.set(mangaDocRef, mangaData);
        parsedChapters.forEach((ch) => {
          const chDocRef = doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id);
          batch.set(chDocRef, ch);
        });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_MANGA',
          dedupeKey: `SET_MANGA_${mangaId}`,
          payload: { id: mangaId, ...mangaData },
        });
        addToDirtyQueue({
          type: 'SET_CHAPTERS_BATCH',
          dedupeKey: `SET_CHAPTERS_BATCH_${mangaId}`,
          payload: { mangaId, mangaUserId: getUserId(), chapters: parsedChapters },
        });
      }

      setShowAddModal(false);
      setShowAddMangaModal(false);
      setMangaFolderPath('');
      setMangaTitle('');
      setMangaCoverUrl('');
      setMangaGenres([]);
      setMangaScanResult([]);
    } catch (err) {
      console.error(err);
      alert('Error adding manga: ' + err.message);
    } finally {
      setMangaScanning(false);
    }
  };

  const handleDeleteManga = async (mangaItem, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Are you sure you want to stop tracking this manga?')) return;
    try {
      const mangaId = mangaItem.id;
      const targetUserId = mangaItem.userId || currentUser.uid;
      deleteLocalManga(mangaId);
      setMangas(prev => prev.filter(m => m.id !== mangaId));
      if (!isOffline && db) {
        await deleteDoc(doc(db, 'users', targetUserId, 'mangas', mangaId));
      } else {
        addToDirtyQueue({ type: 'DELETE_MANGA', dedupeKey: `DELETE_MANGA_${mangaId}`, payload: { id: mangaId, userId: targetUserId } });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNewMangaCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingMangaCover(true);
    try {
      const url = await uploadToImgBB(file);
      setMangaCoverUrl(url);
    } catch (err) {
      console.error(err);
      alert('Failed to upload image: ' + err.message);
    } finally {
      setUploadingMangaCover(false);
    }
  };

  const handleMangaCoverBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setMangaCoverUrl(pickData.path);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Compress Canvas
  const compressImageToBase64 = (dataUri, maxPx = 400, quality = 0.45) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = dataUri;
    });
  };

  const uploadToImgBB = async (fileOrBase64) => {
    // 1. Try via our Next.js server-side proxy route (bypasses browser CORS & ad-blockers)
    try {
      let payload = fileOrBase64;
      if (typeof fileOrBase64 !== 'string') {
        payload = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(fileOrBase64);
        });
      }

      const serverRes = await fetch('/api/upload-imgbb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: payload })
      });

      if (serverRes.ok) {
        const serverData = await serverRes.json();
        if (serverData.success && serverData.url) {
          return serverData.url;
        }
      }
    } catch (proxyErr) {
      console.warn('[uploadToImgBB] Server proxy attempt failed, trying direct:', proxyErr);
    }

    // 2. Direct client-side ImgBB upload attempt
    try {
      const formData = new FormData();
      if (typeof fileOrBase64 === 'string') {
        const cleanBase64 = fileOrBase64.split(',')[1] || fileOrBase64;
        formData.append('image', cleanBase64);
      } else {
        formData.append('image', fileOrBase64);
      }
      
      const res = await fetch('https://api.imgbb.com/1/upload?key=f836d90a7d863714c3ebfd67412a5cbf', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        return data.data.url;
      }
    } catch (directErr) {
      console.warn('[uploadToImgBB] Direct ImgBB upload failed:', directErr);
    }

    // 3. Resilient fallback: If it's already an online HTTP image URL, use it directly!
    if (typeof fileOrBase64 === 'string' && (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://'))) {
      return fileOrBase64;
    }

    // 4. Return base64 as final fallback if file data
    if (typeof fileOrBase64 === 'string' && fileOrBase64.startsWith('data:')) {
      return fileOrBase64;
    }

    throw new Error('Image upload failed. Please try another image or local file.');
  };

  const handleNewCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingCover(true);
    try {
      const url = await uploadToImgBB(file);
      setCoverUrl(url);
    } catch (err) {
      console.error(err);
      alert('Failed to upload image: ' + err.message);
    } finally {
      setUploadingCover(false);
    }
  };

  const handleEditCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingEditCover(true);
    try {
      const url = await uploadToImgBB(file);
      setEditCoverUrl(url);
    } catch (err) {
      console.error(err);
      alert('Failed to upload image: ' + err.message);
    } finally {
      setUploadingEditCover(false);
    }
  };

  const handleEditCoverBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setEditCoverUrl(pickData.path);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenEditModal = (anime, e) => {
    e.stopPropagation();
    e.preventDefault();
    setEditingAnime(anime);
    setEditTitle(anime.title || '');
    setEditTotalSeasons(anime.totalSeasons ? String(anime.totalSeasons) : '1');
    setEditTotalEpisodes(anime.totalEpisodes ? String(anime.totalEpisodes) : String(anime.episodeCount || ''));
    setShowOnlineSearchEdit(false);
    
    let rawGenres = [];
    if (Array.isArray(anime.genres)) {
      rawGenres = [...anime.genres];
    } else if (typeof anime.genres === 'string' && anime.genres.trim()) {
      rawGenres = anime.genres.split(',').map(g => g.trim());
    }
    const validGenres = rawGenres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    setEditGenres(validGenres);
    
    setEditCoverUrl(anime.thumbnailBase64 || anime.thumbnailPath || '');
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingAnime) return;

    const targetUserId = editingAnime.userId || getUserId();
    const totalSeasonsVal = editTotalSeasons ? parseInt(editTotalSeasons, 10) : (editingAnime.totalSeasons || 1);
    const totalEpisodesVal = editTotalEpisodes ? parseInt(editTotalEpisodes, 10) : (editingAnime.totalEpisodes || editingAnime.episodeCount || 0);

    const update = {
      id: editingAnime.id,
      title: editTitle.trim(),
      genres: editGenres,
      totalSeasons: totalSeasonsVal,
      totalEpisodes: totalEpisodesVal,
      updatedAt: new Date().toISOString(),
    };

    if (editCoverUrl && (editCoverUrl.startsWith('http') || editCoverUrl.startsWith('data:'))) {
      update.thumbnailBase64 = editCoverUrl;
      update.thumbnailPath = '';
    } else {
      update.thumbnailPath = editCoverUrl || '';
      update.thumbnailBase64 = '';
    }

    // Save locally
    upsertLocalAnime(update);

    // Update state
    setAnimes(prev => prev.map(a => a.id === editingAnime.id ? { ...a, ...update } : a));

    // Update in Firestore
    if (!isOffline && db) {
      try {
        await setDoc(doc(db, 'users', targetUserId, 'anime', editingAnime.id), {
          title: editTitle.trim(),
          genres: editGenres,
          totalSeasons: totalSeasonsVal,
          totalEpisodes: totalEpisodesVal,
          thumbnailBase64: update.thumbnailBase64 || '',
          thumbnailPath: update.thumbnailPath || '',
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.error(err);
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${editingAnime.id}`,
          payload: { id: editingAnime.id, ...update }
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_ANIME',
        dedupeKey: `SET_ANIME_${editingAnime.id}`,
        payload: { id: editingAnime.id, ...update }
      });
    }

    setEditingAnime(null);
    setEditTotalSeasons('1');
    setEditTotalEpisodes('');
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    await updateVlcPath(customVlc.trim());
    await updateDefaultPlayer(defaultPlayer);
    setShowSettings(false);
  };

  // Export Data
  const [exporting, setExporting] = useState(false);
  const handleExportData = async () => {
    if (!currentUser) return;
    setExporting(true);

    try {
      const animeSnap = await getDocs(collection(db, 'users', currentUser.uid, 'anime'));
      const animeDocs = [];
      animeSnap.forEach(d => animeDocs.push({ id: d.id, ...d.data() }));
      animeDocs.sort((a, b) => (a?.title || '').localeCompare(b?.title || ''));
      const dateStr = new Date().toISOString().slice(0, 10);

      if (exportFormat === 'json') {
        const exportData = [];
        for (const anime of animeDocs) {
          const epSnap = await getDocs(
            collection(db, 'users', currentUser.uid, 'anime', anime.id, 'episodes')
          );
          const episodes = [];
          epSnap.forEach(d => {
            const epData = d.data();
            episodes.push({
              episodeNumber: epData.episodeNumber,
              fileName: epData.fileName,
              filePath: epData.filePath,
              isWatched: epData.isWatched || false,
              watchedSeconds: epData.watchedSeconds || 0,
              durationSeconds: epData.durationSeconds || 0,
              lastPositionSeconds: epData.lastPositionSeconds || 0,
              isFlagged: epData.isFlagged || false,
              flags: epData.flags || [],
              note: epData.note || '',
              isOffPattern: epData.isOffPattern || false,
              updatedAt: epData.updatedAt || ''
            });
          });
          exportData.push({ ...anime, episodes });
        }
        const jsonContent = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `watchanime_tracking_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        const esc = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };
        const rows = [['Title', 'FolderPath', 'EpisodeCount', 'ProgressPercent']];
        for (const anime of animeDocs) {
          rows.push([esc(anime.title), esc(anime.folderPath), esc(anime.episodeCount), esc(anime.progressPercent)]);
        }
        const csvContent = rows.map(r => r.join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `watchanime_tracking_${dateStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error(err);
      alert('Export failed: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  // Process sorting & filtering
  const filteredAnimes = animes
    .filter(anime => {
      const title = anime?.title || '';
      const matchSearch = title.toLowerCase().includes((search || '').toLowerCase());
      if (!matchSearch) return false;

      if (selectedGenre !== 'All') {
        let genres = [];
        if (Array.isArray(anime?.genres)) {
          genres = anime.genres;
        } else if (typeof anime?.genres === 'string' && anime.genres.trim()) {
          genres = anime.genres.split(',').map(g => g.trim());
        } else {
          genres = [];
        }
        if (!genres.includes(selectedGenre)) return false;
      }
      
      const pct = getAnimeProgressPercent(anime);
      if (filterBy === 'active') return pct > 0 && pct < 100;
      if (filterBy === 'completed') return pct === 100;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'alpha') return (a?.title || '').localeCompare(b?.title || '');
      if (sortBy === 'progress') return getAnimeProgressPercent(b) - getAnimeProgressPercent(a);
      return new Date(b.lastOpenedAt || 0) - new Date(a.lastOpenedAt || 0);
    });

  // Continue Watching items (watching status)
  const continueWatchingList = useMemo(() => {
    return animes.filter(a => {
      const pct = getAnimeProgressPercent(a);
      return pct > 0 && pct < 100;
    });
  }, [animes]);

  // ── Manga List (Filtered by search & sorted new to old) ──────────────────────
  const sortedMangas = useMemo(() => {
    return mangas
      .filter((m) => {
        if (!search || !search.trim()) return true;
        return (m?.title || '').toLowerCase().includes(search.trim().toLowerCase());
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [mangas, search]);

  // ── Lazy-Load Chunking for Anime Catalog (Initial 24, +24 on scroll) ───────
  const [visibleCount, setVisibleCount] = useState(24);
  const loadMoreRef = useRef(null);

  // Reset pagination count when search, filter, or sort changes
  useEffect(() => {
    setVisibleCount(24);
  }, [search, sortBy, filterBy, selectedGenre]);

  // IntersectionObserver to lazily load next batch when scrolling near bottom
  useEffect(() => {
    if (!loadMoreRef.current || visibleCount >= filteredAnimes.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + 24, filteredAnimes.length));
        }
      },
      { rootMargin: '350px' }
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [visibleCount, filteredAnimes.length]);

  const displayedAnimes = useMemo(() => {
    return filteredAnimes.slice(0, visibleCount);
  }, [filteredAnimes, visibleCount]);

  const getInitials = (title) => {
    if (!title || typeof title !== 'string') return '';
    return title.split(' ').slice(0, 2).map(w => w ? w[0] : '').join('').toUpperCase();
  };

  const genresScrollRef = useRef(null);

  const scrollTrending = (direction) => {
    if (trendingRef.current) {
      const { scrollLeft, clientWidth } = trendingRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      trendingRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollGenres = (direction) => {
    if (genresScrollRef.current) {
      const { scrollLeft, clientWidth } = genresScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      genresScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const currentHero = heroSlides[currentSlide] || heroSlides[0];

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col selection:bg-[#7c5cff] selection:text-white">
      
      {/* 1. STICKY NAVBAR */}
      <header className="sticky top-0 z-50 glass-navbar px-4 md:px-8 py-3.5 flex items-center justify-between transition-all duration-300">
        {/* Left Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2.5 group">
            <img
              src="/logo.png"
              alt="AnimeWatch Logo"
              className="h-10 w-auto group-hover:scale-105 transition-transform duration-300 drop-shadow-[0_0_10px_rgba(124,92,255,0.5)]"
            />
            <div>
              <span className="text-xl font-extrabold tracking-wider bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400">
                ANIME<span className="text-[#7c5cff]">WATCH</span>
              </span>
              <span className="block text-[9px] font-semibold uppercase tracking-widest text-[#a855f7]/80">
                Premium Catalog
              </span>
            </div>
          </Link>

        </div>
 
        {/* Right Actions & Search */}
        <div className="flex items-center gap-3">
          {/* Quick Search Input */}
          <div className="relative hidden md:block w-56 lg:w-72">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search anime title..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 text-xs rounded-full glass-input placeholder-gray-500 focus:w-80 transition-all duration-300"
            />
              {/* Search Recommendations Dropdown */}
            {search.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 max-h-96 overflow-y-auto no-scrollbar">
                {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No anime or manga matches found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {autocompleteMangaMatches.slice(0, 3).map((m) => (
                      <div
                        key={`search-manga-${m.id}`}
                        onClick={() => {
                          router.push(`/manga/${m.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-purple-950/40 border border-purple-500/20 transition cursor-pointer"
                      >
                        <div className="w-9 h-12 rounded-lg overflow-hidden bg-purple-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {m.thumbnailBase64 ? (
                            <img src={m.thumbnailBase64} alt={m.title} className="w-full h-full object-cover" />
                          ) : (
                            <BookOpen size={16} className="text-purple-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-purple-600 text-[8px] font-bold text-white uppercase">Manga</span>
                            <h4 className="font-bold text-xs text-white truncate">{m.title}</h4>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {m.chapterCount || m.totalChapters || 0} Chapters • Local PDF
                          </p>
                        </div>
                      </div>
                    ))}
                    {autocompleteMatches.slice(0, 4).map((anime) => (
                      <div
                        key={anime.id}
                        onClick={() => {
                          onSelectAnime(anime.id);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition cursor-pointer"
                      >
                        <div className="w-9 h-12 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 relative">
                          {anime.thumbnailBase64 || anime.thumbnailPath ? (
                            <CachedImage 
                              src={anime.thumbnailBase64 && (anime.thumbnailBase64.startsWith('http') || anime.thumbnailBase64.startsWith('data:')) ? anime.thumbnailBase64 : `/api/image?path=${encodeURIComponent(anime.thumbnailPath || '')}`} 
                              alt={anime.title} 
                              className="w-full h-full object-cover" 
                            />
                          ) : (
                            <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center font-bold text-[8px] text-white/50`}>
                              {getInitials(anime.title)}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-xs text-white truncate">{anime.title}</h4>
                          <p className="text-[10px] text-gray-400 truncate">
                            {anime.totalSeasons ? `S${anime.totalSeasons} • ` : ''}
                            {anime.totalEpisodes ? (
                              anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                                ? `${anime.episodeCount}/${anime.totalEpisodes} Ep`
                                : `${anime.totalEpisodes} Episodes`
                            ) : `${anime.episodeCount} Episodes`} • {Math.round(anime.progressPercent || 0)}% completed
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
 
          {/* Interactive Connection Mode Toggle */}
          <button
            onClick={() => setManualOffline(!isManualOffline)}
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
              isOffline
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title={isOffline ? "Switch to Online Mode" : "Switch to Offline Mode"}
          >
            {isOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
            <span>{isOffline ? 'Offline' : 'Online'}</span>
          </button>
 
          {/* Add Folder CTA */}
          <button
            onClick={() => !isOffline && setShowAddModal(true)}
            disabled={isOffline}
            className={`hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold btn-accent transition ${isOffline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            title="Track Local Anime Folder"
          >
            <Plus size={15} />
            <span>Add Anime</span>
          </button>

          {/* Add Manga CTA */}
          <button
            onClick={() => !isOffline && setShowAddMangaModal(true)}
            disabled={isOffline}
            className={`hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-500/20 transition ${isOffline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
            title="Track Local Manga PDF Folder"
          >
            <BookOpen size={15} />
            <span>Add Manga</span>
          </button>

          {/* Local Hotspot Stream Link */}
          <Link
            href="/stream"
            className="hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 text-white border border-purple-500/30 transition shadow-lg shadow-purple-500/20 cursor-pointer"
            title="Local Hotspot Stream"
          >
            <Wifi size={14} className="text-cyan-300 animate-pulse" />
            <span>Stream</span>
          </Link>
 
          {/* Settings Trigger */}
          <button
            onClick={() => setShowSettings(true)}
            className="hidden md:flex p-2 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer"
            title="Settings"
          >
            <Settings size={18} />
          </button>

          {/* Quick Actions Dropdown Trigger for Mobile */}
          <button
            onClick={() => {
              setQuickActionsOpen(!quickActionsOpen);
              if (mobileMenuOpen) setMobileMenuOpen(false);
            }}
            className={`p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer md:hidden relative ${
              quickActionsOpen ? 'text-[#7c5cff] bg-[#7c5cff]/10 border border-[#7c5cff]/30' : ''
            }`}
            title="Quick Actions"
          >
            {quickActionsOpen ? <X size={20} /> : <SlidersHorizontal size={20} />}
          </button>
 
          {/* Hamburger Menu Trigger */}
          <button
            onClick={() => {
              setMobileMenuOpen(!mobileMenuOpen);
              if (quickActionsOpen) setQuickActionsOpen(false);
            }}
            className="p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer"
            title="Menu"
          >
            {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Quick Actions Dropdown */}
        <AnimatePresence>
          {quickActionsOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="absolute top-16 right-4 z-50 w-52 glass-panel rounded-2xl p-4 shadow-xl border border-white/10 flex flex-col gap-3 md:hidden"
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Quick Actions</span>
              
              {/* 1. Connection Toggle */}
              <button
                onClick={() => {
                  setManualOffline(!isManualOffline);
                  setQuickActionsOpen(false);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition ${
                  isOffline
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20'
                    : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {isOffline ? <WifiOff size={14} /> : <Wifi size={14} />}
                  {isOffline ? 'Offline' : 'Online'}
                </span>
                <span className="text-[9px] opacity-60">Toggle</span>
              </button>

              {/* 2. Stream Page Link */}
              <Link
                href="/stream"
                onClick={() => setQuickActionsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 text-white border border-purple-500/30 transition shadow-md cursor-pointer"
              >
                <Wifi size={14} className="text-cyan-300 animate-pulse" />
                <span>Local Stream</span>
              </Link>

              {/* 3. Settings Trigger */}
              <button
                onClick={() => {
                  setShowSettings(true);
                  setQuickActionsOpen(false);
                }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition cursor-pointer text-xs font-bold"
              >
                <Settings size={14} />
                <span>Settings</span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
 
      {/* Sliding Floating Menu from Top */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Backdrop Dim overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            />

            {/* Floating Top Panel */}
            <motion.div
              initial={{ opacity: 0, y: -40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.96 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-20 inset-x-4 md:inset-x-8 max-w-6xl mx-auto z-50 glass-panel rounded-3xl p-6 md:p-8 shadow-2xl border border-white/15 backdrop-blur-2xl max-h-[85vh] overflow-y-auto no-scrollbar"
            >
              {/* Header inside floating modal */}
              <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/30">
                    <SlidersHorizontal size={20} />
                  </div>
                  <div>
                    <h3 className="text-base md:text-lg font-extrabold text-white tracking-wide">Quick Controls & Filters</h3>
                    <p className="text-[11px] text-gray-400">Search, filter catalog, and jump to sections</p>
                  </div>
                </div>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white transition cursor-pointer border border-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Multi-Column Grid Layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                {/* COLUMN 1: Search & Navigation */}
                <div className="space-y-4">
                  <span className="text-[11px] font-black uppercase tracking-wider text-pink-400 flex items-center gap-1.5">
                    <Search size={14} /> Catalog Search
                  </span>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search title..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl glass-input"
                    />
                    {/* Live Autocomplete Matches */}
                    {search.trim().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0f172a]/95 border border-white/15 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto no-scrollbar">
                        {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 ? (
                          <div className="p-3 text-center text-xs text-gray-400">No matches found</div>
                        ) : (
                          <div className="p-1 space-y-1">
                            {autocompleteMangaMatches.slice(0, 3).map((m) => (
                              <div
                                key={`side-search-manga-${m.id}`}
                                onClick={() => {
                                  router.push(`/manga/${m.id}`);
                                  setSearch('');
                                  setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-purple-950/40 border border-purple-500/20 transition cursor-pointer"
                              >
                                <div className="w-8 h-10 rounded overflow-hidden bg-purple-950/60 flex-shrink-0 relative flex items-center justify-center">
                                  {m.thumbnailBase64 ? (
                                    <img src={m.thumbnailBase64} alt={m.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <BookOpen size={14} className="text-purple-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="px-1 py-0.2 rounded bg-purple-600 text-[7px] font-bold text-white uppercase">Manga</span>
                                    <h4 className="font-bold text-xs text-white truncate">{m.title}</h4>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {autocompleteMatches.slice(0, 4).map((anime) => (
                              <div
                                key={anime.id}
                                onClick={() => {
                                  onSelectAnime(anime.id);
                                  setSearch('');
                                  setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/10 transition cursor-pointer"
                              >
                                <div className="w-8 h-10 rounded overflow-hidden bg-white/5 flex-shrink-0 relative">
                                  {anime.thumbnailBase64 || anime.thumbnailPath ? (
                                    <CachedImage 
                                      src={anime.thumbnailBase64 && (anime.thumbnailBase64.startsWith('http') || anime.thumbnailBase64.startsWith('data:')) ? anime.thumbnailBase64 : `/api/image?path=${encodeURIComponent(anime.thumbnailPath || '')}`} 
                                      alt={anime.title} 
                                      className="w-full h-full object-cover" 
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gradient-to-tr from-violet-600 to-indigo-700 flex items-center justify-center font-bold text-[7px] text-white/50">
                                      {getInitials(anime.title)}
                                    </div>
                                  )}
                                </div>
                                <h4 className="font-bold text-xs text-white truncate">{anime.title}</h4>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-black uppercase tracking-wider text-gray-400 block pt-2">
                    Quick Jump
                  </span>
                  <nav className="flex flex-col gap-1 text-xs font-semibold text-gray-300">
                    <a href="#hero" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Sparkles size={15} className="text-[#a855f7]" /> Spotlight Hero
                    </a>
                    <a href="#continue-watching" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Play size={15} className="text-[#7c5cff]" /> Continue Watching
                    </a>
                    <a href="#trending" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Flame size={15} className="text-amber-400" /> Trending Today
                    </a>
                    <a href="#manga-webtoons" onClick={() => setMobileMenuOpen(false)} className="hover:text-purple-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <BookOpen size={15} className="text-purple-400" /> Manga / Webtoons
                    </a>
                    <a href="#catalog" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Film size={15} className="text-cyan-400" /> Local Catalog
                    </a>
                    <Link href="/notes" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <StickyNote size={15} className="text-emerald-400" /> Personal Notes
                    </Link>
                  </nav>
                </div>

                {/* COLUMN 2: Catalog Filter Options */}
                <div className="space-y-4">
                  <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                    <Filter size={14} /> Sort & Filter
                  </span>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Sort Catalog By</label>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { id: 'recent', label: 'Recently Updated' },
                        { id: 'alpha', label: 'Alphabetical (A-Z)' },
                        { id: 'progress', label: 'Watch Progress' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setSortBy(opt.id)}
                          className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${sortBy === opt.id ? 'bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/40' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                          <span>{opt.label}</span>
                          {sortBy === opt.id && <CheckCircle2 size={14} className="text-[#7c5cff]" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pt-1">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">Show Status</label>
                    <div className="flex flex-col gap-1.5">
                      {[
                        { id: 'all', label: 'All Catalog Shows' },
                        { id: 'active', label: 'Currently Watching' },
                        { id: 'completed', label: 'Completed Series' }
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setFilterBy(opt.id)}
                          className={`w-full p-2.5 rounded-xl text-xs font-semibold text-left transition flex items-center justify-between cursor-pointer ${filterBy === opt.id ? 'bg-[#7c5cff]/20 text-[#a855f7] border border-[#7c5cff]/40' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                        >
                          <span>{opt.label}</span>
                          {filterBy === opt.id && <CheckCircle2 size={14} className="text-[#7c5cff]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* COLUMN 3: Category & Genre Filters */}
                <div className="space-y-4">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
                    <Compass size={14} /> Genre Filter
                  </span>
                  
                  <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto no-scrollbar p-1">
                    {GENRES_LIST.map((genre) => (
                      <button
                        key={genre}
                        onClick={() => {
                          setSelectedGenre(genre);
                        }}
                        className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${selectedGenre === genre ? 'bg-[#7c5cff] text-white shadow-md' : 'bg-white/5 text-gray-400 hover:text-white border border-white/5'}`}
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                </div>

                {/* COLUMN 4: Actions & Account */}
                <div className="space-y-4">
                  <span className="text-[11px] font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Settings size={14} /> Quick Actions
                  </span>

                  <div className="space-y-2.5">
                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowAddModal(true); }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold btn-accent flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Plus size={16} /> Track New Folder
                    </button>

                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowSettings(true); }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/15 border border-white/10 text-white flex items-center justify-center gap-2 transition cursor-pointer"
                    >
                      <Settings size={16} /> Settings & Player
                    </button>
                  </div>

                  {/* Sync / Network status card */}
                  <div className="p-3 rounded-2xl bg-white/5 border border-white/10 text-xs space-y-2 mt-4">
                    <div className="flex justify-between items-center text-gray-400 text-[11px]">
                      <span>Network Status:</span>
                      <span className={`font-bold flex items-center gap-1 ${isOffline ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {isOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
                        {isOffline ? 'Offline' : 'Online'}
                      </span>
                    </div>
                    {isSyncing && (
                      <div className="flex items-center gap-1.5 text-cyan-400 text-[10px]">
                        <RefreshCw size={12} className="animate-spin" /> Syncing with cloud...
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* MAIN BODY LAYOUT */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-14">
        
        {/* 2. HERO BANNER (AUTO SLIDER) */}
        <section id="hero" className="relative w-full rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-black/30 min-h-[420px] md:min-h-[500px] flex items-end">
          
          {/* Animated Slide Content - Slides Horizontally without empty gap */}
          <AnimatePresence custom={slideDirection} mode="popLayout">
            <motion.div
              key={currentHero.id}
              custom={slideDirection}
              initial={(dir) => ({
                opacity: 0,
                x: dir > 0 ? '100%' : '-100%'
              })}
              animate={{
                opacity: 1,
                x: 0
              }}
              exit={(dir) => ({
                opacity: 0,
                x: dir > 0 ? '-100%' : '100%'
              })}
              transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-0 z-10 flex items-end justify-between"
            >
              {/* Full Background Image - 20px Backdrop Blur */}
              <div
                className="absolute inset-0 z-0 bg-cover bg-center filter blur-[12px]"
                style={{ backgroundImage: `url(${currentHero.banner})` }}
              />

              {/* Dark Backdrop Gradient Overlay */}
              <div 
                className="absolute inset-0 z-10 pointer-events-none" 
                style={{
                  background: 'linear-gradient(90deg, rgba(88, 88, 88, 0.52) 0%, rgba(39, 39, 39, 0.7) 45%, rgba(0, 0, 0, 0.59) 100%)'
                }}
              />

              {/* Right Side Tilted Image (Anchored at Top-Right Corner, 7deg Tilt) */}
              <div className="absolute right-0 top-0 bottom-0 z-10 w-[50%] md:w-[45%] lg:w-[40%] pointer-events-none hidden md:flex justify-end">
                <div
                  className="relative h-[130%] w-full max-w-[380px] lg:max-w-[440px] rounded-none overflow-hidden origin-top-right transform rotate-[7deg] shadow-[-25px_0_50px_rgba(0,0,0,0.95)]"
                >
                  <CachedImage 
                    src={currentHero.banner} 
                    alt={currentHero.title}
                    className="w-full h-full object-cover transform -rotate-[7deg] scale-[1.65] origin-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
                </div>
              </div>

              {/* Hero Content Overlay */}
              <div className="relative z-20 p-6 md:p-14 w-full md:max-w-2xl space-y-5">
                {/* Spotlight Tag
                <span className="text-amber-400 font-extrabold text-sm uppercase tracking-wider block">
                  #{currentSlide + 1} Spotlight
                </span> */}

                {/* Title */}
                <div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-amber-300 leading-tight drop-shadow-lg">
                    {currentHero.title}
                  </h1>
                  {/* Genres Tag Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {currentHero.genres && currentHero.genres.slice(0, 2).map((genre, idx) => (
                      <span 
                        key={idx} 
                        className="px-2.5 py-0.5 rounded-full bg-cyan-400/20 border border-cyan-400 text-cyan text-[10px] font-black uppercase tracking-wider"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Metadata Section */}
                <div className="flex flex-wrap items-center gap-3 md:gap-4 text-xs font-bold text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span className="text-amber-400 font-extrabold">{currentHero.rating}</span>
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-[#a855f7]/15 border border-[#a855f7]/30 text-[#c084fc]">
                    <Tv size={13} className="text-[#a855f7]" />
                    {currentHero.totalSeasons ? (currentHero.totalSeasons > 1 ? `${currentHero.totalSeasons} Seasons` : 'Season 1') : 'TV'}
                  </span>
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg bg-pink-500/15 border border-pink-500/30 text-pink-300">
                    <Clock size={13} className="text-pink-400" /> {currentHero.episodes}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Calendar size={14} className="text-cyan-400" /> {currentHero.year}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-3 max-w-xl">
                  {currentHero.description}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (animes.length > 0 && currentHero?.id !== 'placeholder') onSelectAnime(currentHero.id);
                      else setShowAddModal(true);
                    }}
                    className="px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-pink-500 to-[#a855f7] hover:brightness-110 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-pink-500/20 transition-all duration-300"
                  >
                    <Play size={14} fill="currentColor" />
                    <span>Watch Now</span>
                  </button>

                  <button
                    onClick={() => {
                      if (animes.length > 0 && currentHero?.id !== 'placeholder') onSelectAnime(currentHero.id);
                    }}
                    className="px-6 py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 border border-white/10 text-white transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Detail</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Slider Pagination Controls */}
          <div className="absolute right-4 bottom-4 md:right-8 md:bottom-8 z-30 flex items-center gap-3">
            {/* Prev/Next buttons */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setSlideDirection(-1);
                  setCurrentSlide((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
                }}
                className="p-2.5 rounded-full bg-black/60 hover:bg-[#7c5cff] border border-white/10 text-white transition cursor-pointer"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => {
                  setSlideDirection(1);
                  setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
                }}
                className="p-2.5 rounded-full bg-black/60 hover:bg-[#7c5cff] border border-white/10 text-white transition cursor-pointer"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Indicators */}
            <div className="flex items-center gap-1.5 bg-black/40 px-3 py-2 rounded-full border border-white/10">
              {heroSlides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setSlideDirection(idx > currentSlide ? 1 : -1);
                    setCurrentSlide(idx);
                  }}
                  className={`h-2 rounded-full transition-all duration-300 ${idx === currentSlide ? 'w-6 bg-[#7c5cff]' : 'w-2 bg-white/30'}`}
                />
              ))}
            </div>
          </div>
        </section>

        {/* 3. EXPLORE GENRES CATEGORY CHIPS (2-ROW HORIZONTAL SCROLLER) */}
        <section id="genres" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7]">
                <Compass size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                  Explore Genres
                  <span className="px-2 py-0.5 rounded-full bg-[#7c5cff]/20 text-purple-300 border border-[#7c5cff]/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline">
                    {GENRES_LIST.length - 1} Categories
                  </span>
                </h2>
                <p className="text-[11px] text-gray-400 font-medium">Filter catalog by your favorite category</p>
              </div>
            </div>

            {/* Scroll Navigation Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollGenres('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                title="Scroll Genres Left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollGenres('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                title="Scroll Genres Right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div
            ref={genresScrollRef}
            className="grid grid-rows-2 grid-flow-col auto-cols-max gap-2.5 overflow-x-auto no-scrollbar py-1 scroll-smooth"
          >
            {GENRES_LIST.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold glass-chip cursor-pointer transition select-none flex items-center justify-center shrink-0 ${
                  selectedGenre === genre
                    ? 'active text-white bg-[#7c5cff] shadow-md border-[#7c5cff]/50 font-bold'
                    : 'text-gray-300 hover:text-white hover:bg-white/10 border-white/10'
                }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>

        {/* 4. CONTINUE WATCHING (USER'S ACTIVE TRACKED ANIME) */}
        {continueWatchingList.length > 0 && (
          <section id="continue-watching" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#7c5cff]">
                  <Play size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Continue Watching</h2>
                  <p className="text-[11px] text-gray-400 font-medium">Resume your local playback progress</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {continueWatchingList.map((anime) => (
                <div
                  key={anime.id}
                  onClick={() => onSelectAnime(anime.id)}
                  className="glass-card p-4 rounded-2xl flex gap-4 items-center group cursor-pointer"
                >
                  <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-[#181c24] flex-shrink-0">
                    {anime.thumbnailBase64 ? (
                      <CachedImage src={anime.thumbnailBase64} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : anime.thumbnailPath ? (
                      <CachedImage src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-br ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center font-bold text-white/40 text-xl`}>
                        {getInitials(anime.title)}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                      <div className="p-2 rounded-full bg-[#7c5cff] text-white opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={14} fill="white" />
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <h3 className="font-bold text-sm text-white truncate group-hover:text-[#7c5cff] transition-colors">
                      {anime.title}
                    </h3>
                    <p className="text-[10px] text-gray-400 truncate">
                      Last watched: {anime.lastWatchedEpisode ? `EP ${anime.lastWatchedEpisode}` : 'In progress'}
                    </p>

                    <div>
                      {(() => {
                        const pct = getAnimeProgressPercent(anime);
                        return (
                          <>
                            <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                              <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                                {Boolean(anime.totalSeasons) && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-extrabold text-[9px] shrink-0">
                                    S{anime.totalSeasons}
                                  </span>
                                )}
                                <span className="truncate">
                                  {anime.totalEpisodes ? (
                                    anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                                      ? `${anime.episodeCount}/${anime.totalEpisodes} Ep`
                                      : `${anime.totalEpisodes} Ep`
                                  ) : (
                                    `${anime.episodeCount || 0} Ep`
                                  )}
                                </span>
                              </div>
                              <span className="font-bold text-[#7c5cff] shrink-0 ml-1">{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-[#7c5cff] to-[#a855f7] rounded-full transition-all duration-500"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 4. TRENDING TODAY */}
        {trendingShows.length > 0 && (
          <section id="trending" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Flame size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                    Trending Today
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline">
                      Episodes & Films
                    </span>
                  </h2>
                  <p className="text-[11px] text-gray-400 font-medium">Top 10 trending anime episodes, animation films & releases from internet</p>
                </div>
              </div>

              {/* Arrow controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollTrending('left')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => scrollTrending('right')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Horizontal Slider */}
            <div
              ref={trendingRef}
              className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {trendingShows.map((show) => (
                <div
                  key={show.id}
                  onClick={() => handleTrendingCardClick(show)}
                  className="flex-none w-48 md:w-56 group cursor-pointer"
                >
                  <div className="relative h-64 md:h-72 rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-[#7c5cff]/40 transition-all duration-300">
                    <CachedImage
                      src={show.image}
                      alt={show.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/30 to-transparent opacity-90 group-hover:opacity-95 transition-opacity" />

                    {/* Rank Badge */}
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-amber-400 font-black text-xs tracking-wider shadow-lg">
                      #{show.rank}
                    </div>

                    {/* In Library Badge / External Details */}
                    <div className="absolute top-2.5 right-2.5 z-20">
                      {show.isUploaded ? (
                        <span className="px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-emerald-500/90 text-white shadow-md flex items-center gap-1 backdrop-blur-md">
                          <CheckCircle2 size={9} /> In Library
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleOpenExternalAnime(e, show)}
                            className="p-1 rounded-lg bg-black/80 hover:bg-[#7c5cff] text-cyan-300 hover:text-white border border-white/10 hover:border-[#7c5cff]/40 transition shadow-md backdrop-blur-md cursor-pointer"
                            title="Open Online Details (AniList / MAL)"
                          >
                            <ExternalLink size={11} />
                          </button>
                          <span className="px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-black/70 text-gray-300 border border-white/10 shadow-md backdrop-blur-md">
                            Not in Library
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rating & Type Badges */}
                    <div className="absolute bottom-16 inset-x-3 flex items-center justify-between pointer-events-none">
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md ${
                        show.typeColor === 'amber'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : show.typeColor === 'rose'
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                      }`}>
                        {show.typeBadge || show.type}
                      </span>
                      <span className="px-1.5 py-0.5 rounded-md bg-black/70 text-amber-400 font-extrabold text-[10px] flex items-center gap-1 border border-white/10 backdrop-blur-md">
                        <Star size={10} className="fill-amber-400" /> {show.rating}
                      </span>
                    </div>

                    {/* Play / Add & External Link Hover Overlay */}
                    <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-3 z-10 backdrop-blur-xs">
                      {show.isUploaded ? (
                        <div className="p-3.5 rounded-full bg-[#7c5cff] text-white shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300 flex items-center justify-center">
                          <Play size={22} fill="white" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2 w-full max-w-[150px]">
                          <button
                            type="button"
                            onClick={(e) => handleAddAnimeToLibrary(e, show)}
                            className="w-full px-3 py-2 rounded-xl bg-gradient-to-r from-[#7c5cff] to-indigo-600 hover:from-[#6b47ff] hover:to-indigo-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
                          >
                            <Plus size={14} /> Add to Library
                          </button>
                          <div className="flex items-center gap-1.5 w-full">
                            <button
                              type="button"
                              onClick={(e) => handleOpenExternalAnime(e, show)}
                              className="flex-1 px-2 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-cyan-300 hover:text-white text-[10px] font-bold shadow-md flex items-center justify-center gap-1 transition cursor-pointer backdrop-blur-md"
                              title="View Details on AniList"
                            >
                              <Globe size={11} /> AniList
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOpenMalSearch(e, show)}
                              className="flex-1 px-2 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-300 hover:text-white text-[10px] font-bold shadow-md flex items-center justify-center gap-1 transition cursor-pointer backdrop-blur-md"
                              title="View Details on MyAnimeList"
                            >
                              <ExternalLink size={11} /> MAL
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Text */}
                    <div className="absolute bottom-0 inset-x-0 p-3 space-y-1 bg-gradient-to-t from-black via-black/80 to-transparent">
                      <h3 className="font-bold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors" title={show.title}>
                        {show.title}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span className="text-gray-300 font-medium truncate max-w-[65%]">{show.animeTitle}</span>
                        <span className="px-1.5 py-0.2 rounded bg-white/10 text-white font-mono text-[9px]">{show.episode}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* MANGA OR WEBTOONS SECTION */}
        <section id="manga-webtoons" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <BookOpen size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Manga or Webtoons</h2>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-mono font-bold">
                    {sortedMangas.length}
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 font-medium">Local PDF chapters, volumes & comics (New to Old)</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddMangaModal(true)}
              className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Plus size={14} />
              <span>Add Manga</span>
            </button>
          </div>

          {sortedMangas.length === 0 ? (
            <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto">
                <BookOpen size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">No Manga or Webtoons Tracked Yet</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                  Connect any local folder with PDF manga chapters to start reading with the custom PDF viewer!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMangaModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Plus size={14} />
                <span>Track Manga Folder</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {sortedMangas.map((m) => (
                <div
                  key={`manga-${m.id}`}
                  onClick={() => router.push(`/manga/${m.id}`)}
                  className="glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/10 hover:border-purple-500/50 transition duration-200"
                >
                  <div className="relative h-48 overflow-hidden bg-[#181c24] flex items-center justify-center">
                    {m.thumbnailBase64 ? (
                      <img
                        src={m.thumbnailBase64}
                        alt={m.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-purple-400/80 bg-purple-950/20 gap-1.5">
                        <BookOpen size={32} />
                        <span className="text-[9px] font-mono uppercase tracking-wider">PDF Manga</span>
                      </div>
                    )}

                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-md text-purple-300 font-bold text-[9px] border border-white/10">
                      {m.chapterCount || m.totalChapters || 0} Ch
                    </div>

                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-purple-600 text-white font-extrabold text-[8px] shadow">
                      PDF
                    </div>

                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-3">
                      <div className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                        <BookOpen size={14} />
                        <span>Read Manga</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-3 bg-black/30">
                    <h4 className="font-bold text-xs text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                      {m.title}
                    </h4>
                    <div className="flex justify-between items-center text-[9px] text-gray-400 mt-1">
                      <span>Local PDF</span>
                      <span className="text-purple-400 font-semibold">{m.progressPercent ? `${m.progressPercent}%` : 'Ready'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 5. RECENTLY UPDATED */}
        {recentlyUpdated.length > 0 && (
          <section id="recently-updated" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Clock size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-wide text-white">Recently Updated</h2>
                <p className="text-[11px] text-gray-400 font-medium">Fresh additions to your local library & releases</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {recentlyUpdated.map((show, i) => (
                <div
                  key={`recent-${show.id}-${i}`}
                  onClick={() => onSelectAnime(show.id)}
                  className="glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between"
                >
                  <div className="relative h-48 overflow-hidden bg-[#181c24] flex items-center justify-center">
                    <CachedImage src={show.image} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-gray-300 font-bold text-[9px]">
                      {show.episode}
                    </div>
                    {show.isYouTube ? (
                      <div className="absolute top-2 right-2 p-1 bg-black/60 rounded-lg shadow-lg border border-red-500/40 backdrop-blur-md flex items-center justify-center">
                        <YoutubeLogo size={16} />
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#7c5cff]/80 text-white font-extrabold text-[8px]">
                        {show.quality || 'HD'}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <h4 className="font-bold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors">
                      {show.title}
                    </h4>
                    <div className="flex justify-between items-center text-[9px] text-gray-400 mt-1">
                      <span>Local Library</span>
                      <span className="text-amber-400 font-bold">★ {show.rating}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. POPULAR THIS WEEK (Top 10 from Internet + Drag-and-Drop Slidable Row) */}
        {popularThisWeek.length > 0 && (
          <section id="popular" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[#a855f7]">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                    Popular This Week
                    <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline">
                      Top 10 Online
                    </span>
                  </h2>
                  <p className="text-[11px] text-gray-400 font-medium">Top fan favorites and community hype from MyAnimeList & AniList</p>
                </div>
              </div>

              {/* Scroll Navigation Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePopularScroll('left')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                  title="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handlePopularScroll('right')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                  title="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Slidable Row-wise with Mouse Drag & Drop */}
            <div
              ref={popularScrollRef}
              onMouseDown={handlePopularMouseDown}
              onMouseMove={handlePopularMouseMove}
              onMouseUp={handlePopularMouseUp}
              onMouseLeave={handlePopularMouseLeave}
              className="flex gap-4 overflow-x-auto no-scrollbar scroll-smooth cursor-grab active:cursor-grabbing select-none pb-3 pt-1"
            >
              {popularThisWeek.map((slide, idx) => (
                <div
                  key={`pop-${slide.id}-${idx}`}
                  onClick={() => handlePopularCardClick(slide)}
                  className="w-64 sm:w-72 shrink-0 glass-card rounded-2xl p-3 flex flex-col justify-between group cursor-pointer relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-purple-glow border border-white/10"
                >
                  {/* Poster Thumbnail */}
                  <div className="relative h-44 rounded-xl overflow-hidden mb-2.5 bg-[#181c24] flex items-center justify-center">
                    <CachedImage
                      src={slide.banner}
                      alt={slide.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 pointer-events-none"
                    />
                    
                    {/* Rank Number Badge */}
                    <div className="absolute top-2 left-2 px-2.5 py-0.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-xs shadow-md">
                      #{slide.rank || (idx + 1)}
                    </div>

                    {/* In Library / External Details Badge */}
                    <div className="absolute top-2 right-2 z-20">
                      {slide.isUploaded ? (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-emerald-500/90 text-white shadow-md flex items-center gap-1 backdrop-blur-md">
                          <CheckCircle2 size={10} /> In Library
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => handleOpenExternalAnime(e, slide)}
                            className="p-1 rounded-lg bg-black/80 hover:bg-[#7c5cff] text-cyan-300 hover:text-white border border-white/10 hover:border-[#7c5cff]/40 transition shadow-md backdrop-blur-md cursor-pointer"
                            title="Open Online Details (AniList / MAL)"
                          >
                            <ExternalLink size={11} />
                          </button>
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-amber-500/90 text-black shadow-md flex items-center gap-1 backdrop-blur-md font-bold">
                            Not in Library
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Hover Prompt if Not Uploaded */}
                    {!slide.isUploaded && (
                      <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-2 p-3 text-center z-10 backdrop-blur-xs">
                        <button
                          type="button"
                          onClick={(e) => handleAddAnimeToLibrary(e, slide)}
                          className="w-full max-w-[150px] px-3 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-[11px] font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all transform active:scale-95 cursor-pointer"
                        >
                          <Plus size={14} /> Add to Library
                        </button>
                        <div className="flex items-center gap-1.5 w-full max-w-[150px]">
                          <button
                            type="button"
                            onClick={(e) => handleOpenExternalAnime(e, slide)}
                            className="flex-1 px-2 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-cyan-300 hover:text-white text-[10px] font-bold shadow-md flex items-center justify-center gap-1 transition cursor-pointer backdrop-blur-md"
                            title="View Details on AniList"
                          >
                            <Globe size={11} /> AniList
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleOpenMalSearch(e, slide)}
                            className="flex-1 px-2 py-1.5 rounded-xl bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-300 hover:text-white text-[10px] font-bold shadow-md flex items-center justify-center gap-1 transition cursor-pointer backdrop-blur-md"
                            title="View Details on MyAnimeList"
                          >
                            <ExternalLink size={11} /> MAL
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Details */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold uppercase text-[#a855f7] tracking-wider truncate max-w-[140px]">
                        {slide.studio}
                      </span>
                      {slide.year && (
                        <span className="text-gray-500 font-semibold">{slide.year}</span>
                      )}
                    </div>

                    <h4 className="font-extrabold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors" title={slide.title}>
                      {slide.title}
                    </h4>

                    <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Star size={11} className="fill-amber-400 text-amber-400" /> {slide.rating}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-white/5 text-gray-400 text-[10px]">
                        {slide.episodes}
                      </span>
                    </div>

                    {/* Bottom Quick Action Bar for Anime Not in Library */}
                    {!slide.isUploaded && (
                      <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between text-[10px]">
                        <button
                          type="button"
                          onClick={(e) => handleAddAnimeToLibrary(e, slide)}
                          className="text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer transition"
                        >
                          <Plus size={11} /> Add to Library
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleOpenExternalAnime(e, slide)}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 cursor-pointer transition"
                        >
                          <ExternalLink size={10} /> Online Details
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 7. TOP RATED ANIME (ROW SCROLLABLE) */}
        {topRatedWithLibrary.length > 0 && (
          <section id="top-rated-masterpieces" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Star size={20} className="fill-amber-400" />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                    Top Rated Anime
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline">
                      Masterpieces
                    </span>
                  </h2>
                  <p className="text-[11px] text-gray-400 font-medium">Highest score masterpieces of all time</p>
                </div>
              </div>

              {/* Arrow navigation controls */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => scrollLocalTopRated('left')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Scroll Top Rated Left"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => scrollLocalTopRated('right')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                  title="Scroll Top Rated Right"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            <div
              ref={localTopRatedScrollRef}
              className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none"
            >
              {topRatedWithLibrary.map((show, idx) => (
                <div
                  key={`top-${show.id}-${idx}`}
                  onClick={() => {
                    if (show.isUploaded && show.uploadedAnimeId) {
                      onSelectAnime(show.uploadedAnimeId);
                    } else if (show.id && !show.id.startsWith('ext-') && !show.id.startsWith('top-rated-')) {
                      onSelectAnime(show.id);
                    } else {
                      handleAddAnimeToLibrary(null, show);
                    }
                  }}
                  className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl p-3 flex flex-col justify-between group cursor-pointer relative overflow-hidden border border-white/10 hover:border-amber-500/30 transition-all duration-300"
                >
                  <div className="relative h-44 sm:h-48 rounded-xl overflow-hidden mb-2 bg-[#181c24] flex items-center justify-center">
                    <CachedImage src={show.image} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-amber-500 text-black font-black text-xs shadow-md">
                      #{idx + 1}
                    </div>
                    {show.isUploaded && (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white font-extrabold text-[8px] uppercase tracking-wider backdrop-blur-md">
                        In Library
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white line-clamp-1 group-hover:text-amber-400 transition-colors" title={show.seriesTitle || show.title}>
                      {show.seriesTitle || show.title}
                    </h4>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Star size={10} className="fill-amber-400" /> {show.rating}
                      </span>
                      <span className="truncate max-w-[50%] text-gray-400">{show.studio || show.episodes || ''}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}



        {/* 9. LATEST RELEASES & LOCAL LIBRARY CATALOG */}
        <section id="catalog" className="space-y-6 pt-4">
          {/* Header Controls Panel */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center glass-panel p-4 md:p-6 rounded-3xl border border-white/10">
            <div>
              <h2 className="text-xl md:text-2xl font-extrabold tracking-wide text-white flex items-center gap-2">
                <Film className="text-[#7c5cff]" size={24} />
                Tracked Local Library
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {displayedAnimes.length < filteredAnimes.length
                  ? `Showing ${displayedAnimes.length} of ${filteredAnimes.length} anime series (scroll to load more)`
                  : `${filteredAnimes.length} anime series available in your local computer catalog`}
              </p>
            </div>

            {/* Sorting & Filter controls */}
            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-gray-300">
                <SlidersHorizontal size={14} className="text-[#a855f7]" />
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="bg-transparent text-xs text-white focus:outline-none cursor-pointer"
                >
                  <option value="recent" className="bg-[#111827]">Recently Watched</option>
                  <option value="alpha" className="bg-[#111827]">Alphabetical (A-Z)</option>
                  <option value="progress" className="bg-[#111827]">Most Completed</option>
                </select>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                <button
                  onClick={() => setFilterBy('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${filterBy === 'all' ? 'bg-[#7c5cff] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  All
                </button>
                <button
                  onClick={() => setFilterBy('active')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${filterBy === 'active' ? 'bg-[#7c5cff] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  Watching
                </button>
                <button
                  onClick={() => setFilterBy('completed')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${filterBy === 'completed' ? 'bg-[#7c5cff] text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                >
                  Completed
                </button>
              </div>
            </div>
          </div>

          {/* Catalog Grid */}
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {[1, 2, 3, 4, 5].map((idx) => (
                <div key={idx} className="h-72 rounded-2xl bg-white/5 shimmer border border-white/5" />
              ))}
            </div>
          ) : filteredAnimes.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel p-10 md:p-16 rounded-3xl text-center border border-white/10 max-w-xl mx-auto my-8 space-y-4"
            >
              <div className="p-4 rounded-full bg-[#7c5cff]/10 text-[#7c5cff] w-16 h-16 mx-auto flex items-center justify-center">
                <FolderOpen size={32} />
              </div>
              <h3 className="text-xl font-bold tracking-wide">No Tracked Folders Found</h3>
              <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
                Connect your local PC anime folders to automatically parse episodes, track watch progress, and stream natively!
              </p>
              <button
                onClick={() => setShowAddModal(true)}
                disabled={isOffline}
                className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider btn-accent flex items-center gap-2 mx-auto ${isOffline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
              >
                <Plus size={16} />
                {isOffline ? 'Offline Mode' : 'Track Local Anime Folder'}
              </button>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {/* Add New Folder Card */}
              <div
                onClick={() => !isOffline && setShowAddModal(true)}
                className={`h-72 rounded-2xl border-2 border-dashed flex flex-col justify-center items-center gap-3 transition cursor-pointer ${isOffline ? 'border-white/5 bg-white/[0.01] text-gray-600 opacity-40 cursor-not-allowed' : 'border-white/15 bg-white/[0.02] hover:bg-white/[0.05] hover:border-[#7c5cff]/60 text-gray-400 hover:text-white'}`}
              >
                <div className="p-3.5 rounded-full bg-[#7c5cff]/10 text-[#7c5cff]">
                  <Plus size={24} />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">
                  {isOffline ? 'Offline' : 'Add Local Folder'}
                </span>
              </div>

              {/* Anime Cards - Rendered Lazily in Chunks */}
              {displayedAnimes.map((anime) => (
                <div
                  key={anime.id}
                  onClick={() => onSelectAnime(anime.id)}
                  className="group relative h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer"
                >
                  {/* Poster Image */}
                  <div className="h-44 relative overflow-hidden bg-[#181c24] flex items-center justify-center">
                    {anime.thumbnailBase64 ? (
                      <CachedImage src={anime.thumbnailBase64} alt={anime.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : anime.thumbnailPath ? (
                      <CachedImage src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`} alt={anime.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center`}>
                        <span className="text-3xl font-black text-white/30 group-hover:scale-110 transition-transform">
                          {getInitials(anime.title)}
                        </span>
                      </div>
                    )}

                    {/* Red YouTube Logo Badge if YouTube folder */}
                    {!!(anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://')) && (
                      <div className="absolute top-2.5 right-2.5 z-10 p-1 bg-black/60 rounded-xl flex items-center justify-center shadow-lg border border-red-500/40 backdrop-blur-md">
                        <YoutubeLogo size={18} />
                      </div>
                    )}

                    {/* Actions Hover Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity duration-300">
                      <button
                        onClick={(e) => handleDeleteAnime(anime, e)}
                        className="p-2 rounded-full bg-red-950/80 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition cursor-pointer"
                        title="Stop Tracking"
                      >
                        <Trash2 size={14} />
                      </button>

                      <div className="p-3 rounded-full bg-[#7c5cff] text-white shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-transform">
                        <Play size={18} fill="white" />
                      </div>

                      <button
                        onClick={(e) => handleOpenEditModal(anime, e)}
                        className="p-2 rounded-full bg-purple-950/80 border border-purple-500/30 text-purple-400 hover:bg-purple-600 hover:text-white transition cursor-pointer"
                        title="Edit Anime Info"
                      >
                        <SlidersHorizontal size={14} />
                      </button>
                    </div>

                    {/* Status Badge */}
                    <div className="absolute top-2.5 left-2.5">
                      {(() => {
                        const pct = getAnimeProgressPercent(anime);
                        return pct === 100 ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/90 text-[9px] uppercase font-bold text-white flex items-center gap-1">
                            <CheckCircle2 size={10} /> Completed
                          </span>
                        ) : pct > 0 ? (
                          <span className="px-2 py-0.5 rounded bg-[#7c5cff]/90 text-[9px] uppercase font-bold text-white">
                            Watching
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>

                  {/* Card Details */}
                  <div className="p-3.5 flex flex-col justify-between flex-1 bg-[#111827]/40">
                    <div>
                      <h3 className="font-bold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors" title={anime.title}>
                        {anime.title}
                      </h3>
                      <p className="text-[9px] text-gray-500 line-clamp-1 mt-0.5">
                        {anime.folderPath}
                      </p>
                    </div>

                    <div className="mt-2">
                      {(() => {
                        const pct = getAnimeProgressPercent(anime);
                        return (
                          <>
                            <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                              <div className="flex items-center gap-1.5 truncate max-w-[70%]">
                                {Boolean(anime.totalSeasons) && (
                                  <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 font-extrabold text-[9px] shrink-0">
                                    S{anime.totalSeasons}
                                  </span>
                                )}
                                <span className="truncate" title={anime.totalEpisodes ? `${anime.totalEpisodes} Total Episodes (${anime.episodeCount || 0} local)` : `${anime.episodeCount || 0} Episodes`}>
                                  {anime.totalEpisodes ? (
                                    anime.episodeCount && anime.episodeCount !== Number(anime.totalEpisodes)
                                      ? `${anime.episodeCount}/${anime.totalEpisodes} Ep`
                                      : `${anime.totalEpisodes} Episodes`
                                  ) : (
                                    `${anime.episodeCount || 0} Episodes`
                                  )}
                                </span>
                              </div>
                              <span className="font-bold text-white shrink-0 ml-1">{pct}%</span>
                            </div>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7]'}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}

              {/* Lazy Loading Sentinel and Progressive Load Trigger */}
              {visibleCount < filteredAnimes.length && (
                <div
                  ref={loadMoreRef}
                  className="col-span-full py-8 flex flex-col items-center justify-center gap-3 border-t border-white/5 mt-4"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                    <Loader2 size={16} className="animate-spin text-[#7c5cff]" />
                    <span>Loading more anime ({displayedAnimes.length} of {filteredAnimes.length})...</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((prev) => Math.min(prev + 24, filteredAnimes.length))}
                    className="px-5 py-2 rounded-xl bg-white/5 hover:bg-[#7c5cff] text-xs font-bold text-gray-300 hover:text-white transition border border-white/10 shadow-sm active:scale-95"
                  >
                    Load Next 24 Shows
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 10. TOP 20 TOP-RATED EPISODES (LAZY-LOADED, DAILY SYNC) */}
        <section id="top-rated" ref={lazyTopRatedRef} className="space-y-4 pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Trophy size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                  Top 20 Top-Rated Episodes
                  <span className="px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider hidden sm:inline">
                    Top 20 Episodes
                  </span>
                </h2>
                <p className="text-[11px] text-gray-400 font-medium">
                  Highest rated anime episodes & landmark chapters · Compared with your personal library ratings
                </p>
              </div>
            </div>

            {/* Scroll Navigation Arrows */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollTopRated('left')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                title="Scroll Top Rated Left"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={() => scrollTopRated('right')}
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer"
                title="Scroll Top Rated Right"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          {/* Top Rated Cards Compact Horizontal Slider */}
          {!hasScrolledToTopRated || loadingTopRated ? (
            <div className="flex gap-3 overflow-x-auto no-scrollbar py-2">
              {[1, 2, 3, 4, 5, 6, 7].map((idx) => (
                <div key={idx} className="flex-none w-40 sm:w-44 md:w-48 h-56 sm:h-60 md:h-64 rounded-2xl bg-white/5 shimmer border border-white/5" />
              ))}
            </div>
          ) : topRatedWithLibrary.length === 0 ? (
            <div className="p-8 rounded-2xl glass-panel text-center text-xs text-gray-400 border border-white/10">
              No top-rated data available at the moment.
            </div>
          ) : (
            <div
              ref={topRatedScrollRef}
              onMouseDown={handleTopRatedMouseDown}
              onMouseMove={handleTopRatedMouseMove}
              onMouseUp={handleTopRatedMouseUp}
              onMouseLeave={handleTopRatedMouseLeave}
              className="flex gap-3 overflow-x-auto no-scrollbar py-2 scroll-smooth select-none cursor-grab active:cursor-grabbing"
            >
              {topRatedWithLibrary.map((show) => {
                const isGold = show.rank === 1;
                const isSilver = show.rank === 2;
                const isBronze = show.rank === 3;

                return (
                  <div
                    key={show.id}
                    onClick={() => {
                      if (topRatedHasDragged) return;
                      if (show.isUploaded && show.uploadedAnimeId) {
                        onSelectAnime(show.uploadedAnimeId);
                      }
                    }}
                    className="flex-none w-40 sm:w-44 md:w-48 group cursor-pointer"
                  >
                    <div className="relative h-56 sm:h-60 md:h-64 rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-amber-500/40 transition-all duration-300 shadow-md">
                      <CachedImage
                        src={show.image}
                        alt={show.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/30 to-transparent opacity-90 group-hover:opacity-95 transition-opacity" />

                      {/* Rank Podium Badge */}
                      <div className="absolute top-2 left-2 z-20">
                        {isGold ? (
                          <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black text-[11px] tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.6)] ring-1 ring-yellow-200 flex items-center gap-1">
                            <Trophy size={10} fill="black" /> #1
                          </div>
                        ) : isSilver ? (
                          <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-slate-200 to-gray-400 text-black font-black text-[11px] tracking-wider shadow-md ring-1 ring-white/50 flex items-center gap-1">
                            <Award size={10} /> #2
                          </div>
                        ) : isBronze ? (
                          <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-700 to-amber-900 text-amber-100 font-black text-[11px] tracking-wider shadow-md ring-1 ring-amber-500/50 flex items-center gap-1">
                            <Award size={10} /> #3
                          </div>
                        ) : (
                          <div className="px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-amber-400 font-black text-[11px] tracking-wider shadow-lg">
                            #{show.rank}
                          </div>
                        )}
                      </div>

                      {/* In Library Badge / User Rated Tag */}
                      <div className="absolute top-2 right-2 z-20">
                        {show.isUploaded ? (
                          <span className="px-1.5 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-emerald-500/90 text-white shadow-md flex items-center gap-0.5 backdrop-blur-md">
                            <CheckCircle2 size={8} /> In Library
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => handleOpenExternalAnime(e, show)}
                            className="p-1 rounded-lg bg-black/80 hover:bg-amber-500 text-amber-300 hover:text-black border border-white/10 hover:border-amber-500/40 transition shadow-md backdrop-blur-md cursor-pointer"
                            title="Open Online Details (AniList / MAL)"
                          >
                            <ExternalLink size={10} />
                          </button>
                        )}
                      </div>

                      {/* Rating & Format Badges */}
                      <div className="absolute bottom-14 inset-x-2 flex items-center justify-between pointer-events-none">
                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shadow-md backdrop-blur-md bg-purple-500/20 text-purple-300 border border-purple-500/40">
                          {show.type} {show.year ? `· ${show.year}` : ''}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-0.5 border shadow-[0_0_8px_rgba(245,158,11,0.3)] backdrop-blur-md ${
                          show.userCustomRating
                            ? 'bg-amber-500 text-black border-amber-400 font-black ring-1 ring-yellow-200'
                            : 'bg-black/70 text-amber-400 border-amber-500/20'
                        }`}>
                          <Star size={9} className={show.userCustomRating ? 'fill-black text-black' : 'fill-amber-400 text-amber-400'} />
                          {show.rating}
                          {show.userCustomRating && <span className="text-[7px] uppercase font-black ml-0.5">My Rating</span>}
                        </span>
                      </div>

                      {/* Play / Add Hover Overlay */}
                      <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1.5 p-2 z-10 backdrop-blur-xs">
                        {show.isUploaded ? (
                          <div className="p-3 rounded-full bg-amber-500 text-black shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300 flex items-center justify-center">
                            <Play size={20} fill="black" />
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1.5 w-full max-w-[130px]">
                            <button
                              type="button"
                              onClick={(e) => handleAddAnimeToLibrary(e, show)}
                              className="w-full px-2 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1 transition-all transform active:scale-95 cursor-pointer"
                            >
                              <Plus size={12} /> Add to Library
                            </button>
                            <div className="flex items-center gap-1 w-full">
                              <button
                                type="button"
                                onClick={(e) => handleOpenExternalAnime(e, show)}
                                className="flex-1 px-1 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-cyan-300 hover:text-white text-[9px] font-bold shadow-md flex items-center justify-center gap-0.5 transition cursor-pointer backdrop-blur-md"
                                title="View Details on AniList"
                              >
                                <Globe size={9} /> AniList
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleOpenMalSearch(e, show)}
                                className="flex-1 px-1 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-300 hover:text-white text-[9px] font-bold shadow-md flex items-center justify-center gap-0.5 transition cursor-pointer backdrop-blur-md"
                                title="View Details on MyAnimeList"
                              >
                                <ExternalLink size={9} /> MAL
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Bottom Text - Episode Name First, Series Name Subtitle */}
                      <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-0.5 bg-gradient-to-t from-black via-black/80 to-transparent">
                        <h3 className="font-extrabold text-xs text-white line-clamp-1 group-hover:text-amber-400 transition-colors" title={show.episodeName || show.title}>
                          {show.episodeName || show.title}
                        </h3>
                        <div className="flex items-center justify-between text-[9px] text-gray-400">
                          <span className="text-gray-300 font-medium truncate max-w-[68%]" title={show.seriesTitle || show.animeTitle || show.subTitle || show.studio}>
                            {show.seriesTitle || show.animeTitle || show.subTitle || show.studio}
                          </span>
                          <span className="px-1 py-0.2 rounded bg-white/10 text-white font-mono text-[8px] shrink-0">
                            {show.episodes || show.episodeLabel || 'Ep'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* 10. FOOTER */}
      <footer className="mt-20 border-t border-white/10 bg-black/40 backdrop-blur-md text-gray-400 py-12 px-6 md:px-12">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="space-y-3 md:col-span-1">
            <div className="flex items-center gap-2">
              <img
                src="/logo.png"
                alt="AnimeWatch Logo"
                className="h-8 w-auto drop-shadow-[0_0_8px_rgba(124,92,255,0.4)]"
              />
              <span className="text-lg font-black text-white tracking-wider">
                ANIME<span className="text-[#7c5cff]">WATCH</span>
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              The premier local anime tracking and streaming engine. Organize your PC video library with zero compromise.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Quick Navigation</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#hero" className="hover:text-white transition">Home Spotlight</a></li>
              <li><a href="#continue-watching" className="hover:text-white transition">Continue Watching</a></li>
              <li><a href="#trending" className="hover:text-white transition">Trending Today</a></li>
              <li><a href="#catalog" className="hover:text-white transition">Local Catalog</a></li>
              <li><a href="#top-rated" className="hover:text-white transition flex items-center gap-1.5"><span className="text-amber-400">★</span> Top 20 Rated</a></li>
            </ul>
          </div>

          {/* Categories */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Popular Genres</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#genres" className="hover:text-white transition">Action & Fantasy</a></li>
              <li><a href="#genres" className="hover:text-white transition">Supernatural & Sci-Fi</a></li>
              <li><a href="#genres" className="hover:text-white transition">Romance & Slice of Life</a></li>
              <li><a href="#genres" className="hover:text-white transition">Shounen & Drama</a></li>
            </ul>
          </div>

          {/* Support & Tools */}
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Tools & Sync</h4>
            <ul className="space-y-2 text-xs">
              <li><button onClick={() => setShowSettings(true)} className="hover:text-white transition cursor-pointer">VLC Player Path</button></li>
              <li><button onClick={() => setShowSettings(true)} className="hover:text-white transition cursor-pointer">Export Data (CSV / JSON)</button></li>
              <li><button onClick={() => setShowAddModal(true)} className="hover:text-white transition cursor-pointer">Scan Local Folder</button></li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 gap-4">
          <p>© {new Date().getFullYear()} AnimeWatch Tracker. Designed for high performance local streaming.</p>
          <div className="flex gap-4">
            <span className="hover:text-gray-400">Privacy</span>
            <span className="hover:text-gray-400">Terms</span>
            <span className="hover:text-gray-400">Local Storage</span>
          </div>
        </div>
      </footer>

      {/* MODALS PRESERVED */}
      
      {/* Add Anime Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  {addModalTab === 'youtube' ? (
                    <Youtube className="text-red-500" size={20} />
                  ) : (
                    <FolderOpen className="text-[#7c5cff]" size={20} />
                  )}
                  {addModalTab === 'youtube' ? 'Add YouTube Playlist' : 'Track Local Anime Folder'}
                </h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setAddModalTab('local')}
                  className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${
                    addModalTab === 'local'
                      ? 'border-[#7c5cff] text-white bg-white/5 rounded-t-xl'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  <FolderOpen size={15} /> Local Folder
                </button>
                <button
                  type="button"
                  onClick={() => setAddModalTab('youtube')}
                  className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${
                    addModalTab === 'youtube'
                      ? 'border-red-500 text-white bg-white/5 rounded-t-xl'
                      : 'border-transparent text-gray-400 hover:text-white'
                  }`}
                >
                  <Youtube size={15} className="text-red-500" /> Add YouTube Playlist
                </button>
              </div>

              {addModalTab === 'local' ? (
                <form onSubmit={handleAddAnime} className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Select Folder Directory *</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Browse your PC or paste local directory path..."
                        className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={folderPath}
                        onChange={(e) => setFolderPath(e.target.value)}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleBrowseFolder}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer text-white flex items-center gap-1.5 transition"
                      >
                        Browse
                      </button>
                      {folderPath && (
                        <button
                          type="button"
                          onClick={handleScan}
                          className="px-4 py-2 bg-[#7c5cff]/20 border border-[#7c5cff]/40 text-[#7c5cff] hover:bg-[#7c5cff] hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                        >
                          Scan Folder
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Naming Pattern</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                      {NAMING_PATTERNS.map((pat) => (
                        <button
                          key={pat.id}
                          type="button"
                          onClick={() => setNamingPattern(pat.id)}
                          className={`px-3 py-2 rounded-xl text-left text-[11px] border transition cursor-pointer ${namingPattern === pat.id ? 'bg-[#7c5cff]/20 border-[#7c5cff] text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'}`}
                        >
                          <span className="font-bold block">{pat.label}</span>
                          <span className="text-[9px] opacity-60 block truncate">{pat.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Anime Display Title *</label>
                    <input
                      type="text"
                      placeholder="e.g. Bleach TYBW"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeTitle}
                      onChange={(e) => setAnimeTitle(e.target.value)}
                      required
                      disabled={!folderPath}
                    />
                  </div>

                  {/* Season Count & Total Episodes Inputs */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                        Total Seasons
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder="e.g. 1"
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={addTotalSeasons}
                        onChange={(e) => setAddTotalSeasons(e.target.value)}
                        disabled={!folderPath}
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                        Total Episodes
                      </label>
                      <input
                        type="number"
                        min="1"
                        placeholder={parsedEpsCount ? `Scanned: ${parsedEpsCount}` : "e.g. 24"}
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={addTotalEpisodes}
                        onChange={(e) => setAddTotalEpisodes(e.target.value)}
                        disabled={!folderPath}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">Cover Image (Optional)</label>
                      <button
                        type="button"
                        onClick={() => setShowOnlineSearchAdd(prev => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          showOnlineSearchAdd
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 border border-purple-500/30'
                        }`}
                      >
                        <Sparkles size={12} className="text-purple-300" />
                        {showOnlineSearchAdd ? 'Hide Cover Search' : 'Search Covers Online'}
                      </button>
                    </div>

                    <div className="flex flex-col gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleNewCoverUpload}
                        className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                      />

                      {showOnlineSearchAdd && (
                        <AnimeCoverSearch
                          initialQuery={animeTitle}
                          onSelectCover={(url) => {
                            setCoverUrl(url);
                            setShowOnlineSearchAdd(false);
                          }}
                          onClose={() => setShowOnlineSearchAdd(false)}
                          uploadToImgBB={uploadToImgBB}
                        />
                      )}

                      {uploadingCover && (
                        <div className="flex items-center gap-2 text-xs text-[#7c5cff]">
                          <Loader2 className="animate-spin" size={14} />
                          Uploading to ImgBB...
                        </div>
                      )}
                      {coverUrl && (
                        <div className="relative w-28 h-40 rounded-xl overflow-hidden border border-white/15 bg-black/25 flex items-center justify-center">
                          <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setCoverUrl('')}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                            title="Remove Cover Image"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Select Categories / Genres (Max 5)</label>
                    <div className="flex flex-wrap gap-2 mt-1 p-1 border border-white/5 rounded-xl bg-black/20">
                      {GENRES_LIST.map((genre) => {
                        if (genre === 'All') return null;
                        const isSelected = addGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => {
                              setAddGenres(prev => {
                                const alreadySelected = prev.includes(genre);
                                if (alreadySelected) return prev.filter(g => g !== genre);
                                if (prev.length >= 5) {
                                  setAlertMessage("You can select a maximum of 5 genres.");
                                  return prev;
                                }
                                return [...prev, genre];
                              });
                            }}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                              isSelected 
                                ? 'bg-[#7c5cff] text-white' 
                                : 'bg-white/5 border border-white/5 text-gray-400 hover:text-white'
                            }`}
                          >
                            {genre}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {folderPath && (
                    <div className="p-4 rounded-2xl bg-black/40 border border-white/10 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Scan Status:</span>
                        {scanning ? (
                          <span className="text-[#7c5cff] flex items-center gap-1">
                            <Loader2 className="animate-spin" size={14} /> Scanning files...
                          </span>
                        ) : parsedEpsCount > 0 ? (
                          <span className="text-emerald-400 font-bold">Detected {parsedEpsCount} episode files</span>
                        ) : (
                          <span className="text-amber-400 font-bold">No episodes parsed yet</span>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={scanning || parsedEpsCount === 0}
                      className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                    >
                      {scanning ? 'Processing...' : 'Track Anime'}
                    </button>
                  </div>
                </form>
              ) : (
                /* YouTube Playlist Tab Content */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">YouTube Playlist URL *</label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        placeholder="https://www.youtube.com/playlist?list=..."
                        className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={ytPlaylistUrl}
                        onChange={(e) => setYtPlaylistUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={handleFetchYouTubePlaylist}
                        disabled={ytFetching || !ytPlaylistUrl.trim()}
                        className="px-4 py-2 bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                      >
                        {ytFetching ? <Loader2 className="animate-spin" size={14} /> : <Youtube size={14} />}
                        Fetch Playlist
                      </button>
                    </div>
                    {ytError && <p className="text-xs text-red-400 mt-1.5 font-medium">{ytError}</p>}
                  </div>

                  {ytPlaylistData && (
                    <div className="space-y-4 border-t border-white/10 pt-3">
                      {/* Playlist Header Summary */}
                      <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                        {ytPlaylistData.thumbnail && (
                          <img src={ytPlaylistData.thumbnail} alt={ytPlaylistData.title} className="w-16 h-16 object-cover rounded-xl border border-white/10 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="font-extrabold text-sm text-white truncate">{ytPlaylistData.title}</h3>
                          <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                            <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold text-[10px]">YouTube Playlist</span>
                            <span>{ytPlaylistData.totalVideos} Videos Total</span>
                          </p>
                        </div>
                      </div>

                      {/* Quality Options Control */}
                      <div className="bg-black/30 p-3 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-gray-300">Default Playback Quality:</label>
                          {ytQualitiesFetching ? (
                            <span className="text-xs text-[#7c5cff] flex items-center gap-1">
                              <Loader2 className="animate-spin" size={12} /> Fetching options...
                            </span>
                          ) : (
                            <select
                              value={ytSelectedQuality}
                              onChange={(e) => setYtSelectedQuality(e.target.value)}
                              className="bg-white/10 border border-white/15 text-xs text-white rounded-xl px-2.5 py-1 font-semibold focus:outline-none focus:border-[#7c5cff]"
                            >
                              {ytAvailableQualities.map((q) => (
                                <option key={q.id} value={q.id} className="bg-gray-900 text-white">
                                  {q.label}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => ytPlaylistData.videos.length > 0 && fetchYouTubeQualities(ytPlaylistData.videos[0].id)}
                          className="text-[11px] text-[#7c5cff] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <RefreshCw size={12} /> Refresh Quality Options
                        </button>
                      </div>

                      {/* Video Selection List */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                            Select Videos ({ytSelectedVideoIds.size} / {ytPlaylistData.videos.length})
                          </label>
                          <button
                            type="button"
                            onClick={toggleSelectAllYt}
                            className="text-[11px] text-gray-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            {ytSelectedVideoIds.size === ytPlaylistData.videos.length ? <CheckSquare size={14} className="text-[#7c5cff]" /> : <Square size={14} />}
                            {ytSelectedVideoIds.size === ytPlaylistData.videos.length ? 'Deselect All' : 'Select All'}
                          </button>
                        </div>

                        <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                          {ytPlaylistData.videos.map((vid) => {
                            const isChecked = ytSelectedVideoIds.has(vid.id);
                            return (
                              <div
                                key={vid.id}
                                onClick={() => toggleVideoSelection(vid.id)}
                                className={`flex items-center gap-3 p-2 rounded-xl border transition cursor-pointer ${
                                  isChecked ? 'bg-[#7c5cff]/10 border-[#7c5cff]/40' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded border-white/20 text-[#7c5cff] focus:ring-0 cursor-pointer"
                                />
                                {vid.thumbnail ? (
                                  <img src={vid.thumbnail} alt={vid.title} className="w-14 h-9 object-cover rounded-lg shrink-0 border border-white/10" />
                                ) : (
                                  <div className="w-14 h-9 bg-black/40 rounded-lg shrink-0 flex items-center justify-center">
                                    <Video size={16} className="text-gray-500" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h4 className="text-xs font-bold text-white truncate">{vid.title}</h4>
                                  <span className="text-[10px] text-gray-400 font-mono">{vid.durationFormatted}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Import Button */}
                      <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                        <button
                          type="button"
                          onClick={() => setShowAddModal(false)}
                          className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleImportYouTubePlaylist}
                          disabled={scanning || ytSelectedVideoIds.size === 0}
                          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer transition flex items-center gap-1.5"
                        >
                          {scanning ? <Loader2 className="animate-spin" size={14} /> : <Youtube size={14} />}
                          {scanning ? 'Importing...' : `Import ${ytSelectedVideoIds.size} Videos`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <Settings className="text-[#a855f7]" size={20} />
                  Settings & Data Backup
                </h2>
                <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Custom VLC Path</label>
                  <input
                    type="text"
                    placeholder="e.g. C:\Program Files\VideoLAN\VLC\vlc.exe"
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={customVlc}
                    onChange={(e) => setCustomVlc(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Default Media Player</label>
                  <select
                    value={defaultPlayer}
                    onChange={(e) => setDefaultPlayer(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white bg-[#111827]"
                  >
                    <option value="ask">Ask every time</option>
                    <option value="mediaserver">Media Server Player (Windows Host)</option>
                    <option value="vlc">VLC Player (Local Desktop)</option>
                  </select>
                </div>

                {/* Export Data Box */}
                <div className="p-4 rounded-2xl bg-[#111827]/80 border border-white/10 space-y-3">
                  <h3 className="text-xs font-bold text-[#7c5cff] flex items-center gap-2">
                    <Download size={14} className="text-cyan-400" />
                    Export Viewing History
                  </h3>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400 text-[11px]">Format</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setExportFormat('csv')}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold ${exportFormat === 'csv' ? 'bg-[#7c5cff] text-white' : 'text-gray-400'}`}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFormat('json')}
                        className={`px-3 py-1 rounded-lg text-[10px] font-bold ${exportFormat === 'json' ? 'bg-[#7c5cff] text-white' : 'text-gray-400'}`}
                      >
                        JSON
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exporting || isOffline}
                    className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                  >
                    {exporting ? 'Exporting...' : `Download Backup (.${exportFormat})`}
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isOffline}
                    className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                  >
                    Save Settings
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Anime Modal */}
      <AnimatePresence>
        {editingAnime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <SlidersHorizontal className="text-[#a855f7]" size={20} />
                  Edit Anime Details
                </h2>
                <button onClick={() => setEditingAnime(null)} className="p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Anime Display Title *</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                {/* Season Count & Total Episodes Inputs */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Seasons
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 1"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={editTotalSeasons}
                      onChange={(e) => setEditTotalSeasons(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Episodes
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={`Current: ${editingAnime?.episodeCount || 0}`}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={editTotalEpisodes}
                      onChange={(e) => setEditTotalEpisodes(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Select Categories / Genres (Max 5)</label>
                  <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto p-1 border border-white/5 rounded-xl bg-black/20 no-scrollbar">
                    {GENRES_LIST.map((genre) => {
                      if (genre === 'All') return null;
                      const isSelected = editGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => {
                            setEditGenres(prev => {
                              const alreadySelected = prev.includes(genre);
                              if (alreadySelected) return prev.filter(g => g !== genre);
                              if (prev.length >= 5) {
                                setAlertMessage("You can select a maximum of 5 genres.");
                                return prev;
                              }
                              return [...prev, genre];
                            });
                          }}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                            isSelected 
                              ? 'bg-[#7c5cff] text-white' 
                              : 'bg-white/5 border border-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">Cover Image (Optional)</label>
                    <button
                      type="button"
                      onClick={() => setShowOnlineSearchEdit(prev => !prev)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        showOnlineSearchEdit
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 border border-purple-500/30'
                      }`}
                    >
                      <Sparkles size={12} className="text-purple-300" />
                      {showOnlineSearchEdit ? 'Hide Cover Search' : 'Search Covers Online'}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleEditCoverUpload}
                        className="flex-grow text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                      />
                      <button
                        type="button"
                        onClick={handleEditCoverBrowse}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer text-white transition whitespace-nowrap"
                      >
                        Choose Local PC Image
                      </button>
                    </div>

                    {showOnlineSearchEdit && (
                      <AnimeCoverSearch
                        initialQuery={editTitle}
                        onSelectCover={(url) => {
                          setEditCoverUrl(url);
                          setShowOnlineSearchEdit(false);
                        }}
                        onClose={() => setShowOnlineSearchEdit(false)}
                        uploadToImgBB={uploadToImgBB}
                      />
                    )}

                    {uploadingEditCover && (
                      <div className="flex items-center gap-2 text-xs text-[#7c5cff]">
                        <Loader2 className="animate-spin" size={14} />
                        Uploading to ImgBB...
                      </div>
                    )}

                    {editCoverUrl && (
                      <div className="relative w-28 h-40 rounded-xl overflow-hidden border border-white/15 bg-black/25 flex items-center justify-center">
                        <img 
                          src={editCoverUrl.startsWith('http') || editCoverUrl.startsWith('data:') ? editCoverUrl : `/api/image?path=${encodeURIComponent(editCoverUrl)}`} 
                          alt="Cover Preview" 
                          className="w-full h-full object-cover" 
                        />
                        <button
                          type="button"
                          onClick={() => setEditCoverUrl('')}
                          className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                          title="Remove Cover Image"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setEditingAnime(null)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider cursor-pointer"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {alertMessage && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl text-center space-y-4"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">Action Blocked</h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">{alertMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setAlertMessage('')}
                className="w-full py-2.5 rounded-xl bg-[#7c5cff] hover:bg-[#6b4eeb] text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Okay
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Manga / Webtoon Modal */}
      <AnimatePresence>
        {showAddMangaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <BookOpen className="text-purple-400" size={20} />
                  <span>Track Local Manga / Webtoon Folder</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddMangaModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddManga} className="space-y-4">
                {/* 1. Directory Path */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Manga Folder Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste manga directory path..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaFolderPath}
                      onChange={(e) => setMangaFolderPath(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseMangaFolder}
                      disabled={mangaScanning}
                      className="px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      {mangaScanning ? 'Scanning...' : 'Browse PC Folder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleScanManga}
                      disabled={mangaScanning || !mangaFolderPath}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                {/* Scanned files alert */}
                {mangaScanResult.length > 0 && (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>Found {mangaScanResult.length} PDF chapters</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">Ready to track</span>
                  </div>
                )}

                {/* 2. Manga Title */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Manga / Webtoon Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Berserk, Solo Leveling, One Piece..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={mangaTitle}
                    onChange={(e) => setMangaTitle(e.target.value)}
                  />
                </div>

                {/* 3. Cover Picture */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Cover Picture Artwork
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowMangaCoverSearch(true)}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
                    >
                      <Sparkles size={14} />
                      <span>Search Online Covers</span>
                    </button>

                    <label className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10">
                      <ImagePlus size={14} />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleNewMangaCoverUpload}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleMangaCoverBrowse}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                    >
                      <HardDrive size={14} />
                      <span>Browse PC</span>
                    </button>
                  </div>

                  {mangaCoverUrl && (
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-2">
                      <img
                        src={mangaCoverUrl}
                        alt="Cover Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setMangaCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* 4. Genres */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {GENRES_LIST.filter(g => g !== 'All').map((g) => {
                      const isSel = mangaGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel) setMangaGenres(mangaGenres.filter((item) => item !== g));
                            else setMangaGenres([...mangaGenres, g]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                            isSel
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit / Cancel buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAddMangaModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={mangaScanning || !mangaFolderPath || !mangaTitle || mangaScanResult.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    {mangaScanning ? 'Processing...' : 'Track Manga Folder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Online Manga Cover Search Modal */}
      <AnimatePresence>
        {showMangaCoverSearch && (
          <MangaCoverSearch
            initialQuery={mangaTitle}
            uploadToImgBB={uploadToImgBB}
            onSelectCover={(url) => {
              setMangaCoverUrl(url);
              setShowMangaCoverSearch(false);
            }}
            onClose={() => setShowMangaCoverSearch(false)}
          />
        )}
      </AnimatePresence>

    </div>
  );
}