"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Search, Filter, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Plus,
  Star, CheckCircle2, X, Play, SlidersHorizontal, Trash2,
  Sparkles, FolderOpen, ImagePlus, Check, Tv, Clock, Loader2
} from 'lucide-react';
import { collection, getDocs, doc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalAnimes, getLocalEpisodes, upsertLocalAnime, deleteLocalAnime,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import AnimeCoverSearch from '../components/AnimeCoverSearch';
import CachedImage from '../utils/imageCache';
import { toFanartPreview, toFanartBigPreview, toFanartFull } from '../lib/fanartUtils';

const GENRES_LIST = [
  "All", "Action", "Adventure", "Comedy", "Crime", "Demons", "Detective", "Drama",
  "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei",
  "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Mythology",
  "Parody", "Police", "Post-Apocalyptic", "Psychological", "Reincarnation", "Reverse Harem",
  "Romance", "Samurai", "School", "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life",
  "Space", "Sports", "Super Power", "Supernatural", "Suspense", "Survival", "Thriller",
  "Time Travel", "Vampires"
];

const SORT_OPTIONS = [
  { id: 'recent', label: 'Recently Watched' },
  { id: 'alpha-asc', label: 'A - Z' },
  { id: 'alpha-desc', label: 'Z - A' },
  { id: 'progress-desc', label: 'Most Completed' },
  { id: 'progress-asc', label: 'Least Completed' },
  { id: 'episodes-desc', label: 'Most Episodes' },
  { id: 'episodes-asc', label: 'Fewest Episodes' },
  { id: 'rating', label: 'Highest Rating' },
  { id: 'year', label: 'Release Year' },
];

const LENGTH_OPTIONS = [
  { id: 'all', label: 'All Lengths' },
  { id: 'short', label: '< 12 Episodes' },
  { id: 'standard', label: '12 - 25 Episodes' },
  { id: 'medium', label: '26 - 50 Episodes' },
  { id: 'long', label: '50+ Episodes' },
  { id: 'multiseason', label: '2+ Seasons' },
];

const YoutubeLogo = ({ size = 16, className = "" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
  </svg>
);

const getInitials = (title) => {
  if (!title) return 'AN';
  const parts = title.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const getAnimeProgressPercent = (anime) => {
  if (!anime) return 0;
  try {
    const localEps = getLocalEpisodes(anime.id);
    if (Array.isArray(localEps) && localEps.length > 0) {
      const watched = localEps.filter((e) => !!e.isWatched).length;
      return Math.round((watched / localEps.length) * 100);
    }
  } catch (e) {}
  return Math.round(anime.progressPercent || 0);
};

let persistedAnimeVisibleCount = 0;

const getAnimeInitialScreenCount = () => {
  if (typeof window === 'undefined') return 12;
  const w = window.innerWidth;
  if (w < 640) return 6;   // mobile: 2 cols x 3 rows = 6 cards
  if (w < 768) return 9;   // sm: 3 cols x 3 rows = 9 cards
  if (w < 1024) return 12; // md: 4 cols x 3 rows = 12 cards
  return 15;               // lg+: 5 cols x 3 rows = 15 cards
};

export default function AnimesLibrary() {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();

  const [animes, setAnimes] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalAnimes() || [];
    }
    return [];
  });
  const [loading, setLoading] = useState(false);

  // Progressive loading & screen-filling card count state with session persistence
  const [visibleCount, setVisibleCount] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = sessionStorage.getItem('watchanime_anime_lib_visible_count');
        const parsed = stored ? parseInt(stored, 10) : 0;
        const saved = Math.max(parsed || 0, persistedAnimeVisibleCount || 0);
        if (saved > 0) return saved;
      } catch (e) {}
      return getAnimeInitialScreenCount();
    }
    return 12;
  });

  const loadMoreRef = useRef(null);
  const isLoadingMoreRef = useRef(false);

  // Persist visibleCount to module and sessionStorage so re-opening library retains all loaded cards
  useEffect(() => {
    if (visibleCount > 0) {
      persistedAnimeVisibleCount = visibleCount;
      try {
        sessionStorage.setItem('watchanime_anime_lib_visible_count', String(visibleCount));
      } catch (e) {}
    }
  }, [visibleCount]);

  // Search & Filter State
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // default: recently watched
  const [selectedStatus, setSelectedStatus] = useState('all'); // all, watching, completed, unwatched
  const [selectedLength, setSelectedLength] = useState('all'); // all, short, standard, medium, long, multiseason
  const [selectedSource, setSelectedSource] = useState('all'); // all, local, youtube
  const [selectedGenres, setSelectedGenres] = useState([]);

  // Filter Modal
  const [showFilterModal, setShowFilterModal] = useState(false);

  // Edit Anime Modal State
  const [editingAnime, setEditingAnime] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editGenres, setEditGenres] = useState([]);
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [enableEditAnimeLogo, setEnableEditAnimeLogo] = useState(false);
  const [editAnimeImages, setEditAnimeImages] = useState({ covers: [], banners: [], logos: [] });
  const [searchingEditArtwork, setSearchingEditArtwork] = useState(false);
  const [editArtworkSearchQuery, setEditArtworkSearchQuery] = useState('');
  const [showOnlineSearchEdit, setShowOnlineSearchEdit] = useState(false);
  const [editTotalSeasons, setEditTotalSeasons] = useState('1');
  const [editTotalEpisodes, setEditTotalEpisodes] = useState('');
  const [bannerSectionOpen, setBannerSectionOpen] = useState(true);
  const [logoSectionOpen, setLogoSectionOpen] = useState(true);

  // Load Animes
  useEffect(() => {
    const loadData = async () => {
      const local = getLocalAnimes();
      if (local && local.length > 0) {
        setAnimes(local);
      } else {
        setLoading(true);
      }

      if (currentUser?.uid && db && !isOffline) {
        try {
          const snap = await getDocs(collection(db, 'users', currentUser.uid, 'anime'));
          const remoteAnimes = [];
          snap.forEach((d) => remoteAnimes.push({ id: d.id, ...d.data() }));

          if (remoteAnimes.length > 0) {
            setAnimes(remoteAnimes);
            remoteAnimes.forEach((a) => upsertLocalAnime(a));
          }
        } catch (err) {
          console.error('[AnimesLibrary] Load error:', err);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    loadData();
  }, [currentUser, isOffline]);

  // Handle Delete Anime
  const handleDeleteAnime = async (animeItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm(`Are you sure you want to stop tracking "${animeItem.title}"?`)) return;

    deleteLocalAnime(animeItem.id);
    setAnimes((prev) => prev.filter((a) => a.id !== animeItem.id));

    const targetUserId = animeItem.userId || currentUser?.uid || getUserId();
    if (db && targetUserId && !isOffline) {
      deleteDoc(doc(db, 'users', targetUserId, 'anime', animeItem.id)).catch(() => {
        addToDirtyQueue({
          type: 'DELETE_ANIME',
          dedupeKey: `DELETE_ANIME_${animeItem.id}`,
          payload: { id: animeItem.id, userId: targetUserId }
        });
      });
    } else {
      addToDirtyQueue({
        type: 'DELETE_ANIME',
        dedupeKey: `DELETE_ANIME_${animeItem.id}`,
        payload: { id: animeItem.id, userId: targetUserId }
      });
    }
  };

  // Edit Handlers
  const handleOpenEditModal = (anime, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setEditingAnime(anime);
    const initialTitle = anime.title || '';
    setEditTitle(initialTitle);
    setEditTotalSeasons(anime.totalSeasons ? String(anime.totalSeasons) : '1');
    setEditTotalEpisodes(anime.totalEpisodes ? String(anime.totalEpisodes) : String(anime.episodeCount || ''));
    setShowOnlineSearchEdit(false);

    let rawGenres = [];
    if (Array.isArray(anime.genres)) {
      rawGenres = [...anime.genres];
    } else if (typeof anime.genres === 'string' && anime.genres.trim()) {
      rawGenres = anime.genres.split(',').map((g) => g.trim());
    }
    const validGenres = rawGenres.filter((g) => GENRES_LIST.includes(g) && g !== 'All');
    setEditGenres(validGenres);

    setEditCoverUrl(anime.thumbnailBase64 || anime.thumbnailPath || '');
    setEditBannerUrl(anime.bannerUrl || anime.backdropUrl || '');
    setEditLogoUrl(anime.logoUrl || '');
    setEnableEditAnimeLogo(Boolean(anime.logoUrl));
    setEditArtworkSearchQuery(initialTitle);
    setEditAnimeImages({ covers: [], banners: [], logos: [] });
    setBannerSectionOpen(true);
    setLogoSectionOpen(true);
  };

  const fetchEditAnimeArtwork = async (term) => {
    const q = (term || editArtworkSearchQuery || editTitle || '').trim();
    if (!q) return;
    setSearchingEditArtwork(true);
    try {
      const res = await fetch(`/api/anime/details?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && data.anime) {
        const imgs = data.anime.images || { covers: [], banners: [], logos: [] };
        const banners = [...(imgs.banners || [])];
        if (data.anime.bannerUrl && !banners.some((b) => b.url === data.anime.bannerUrl)) {
          banners.unshift({ url: data.anime.bannerUrl, source: 'AniList' });
        }
        const logos = [...(imgs.logos || [])];
        if (data.anime.logoUrl && !logos.some((l) => l.url === data.anime.logoUrl)) {
          logos.unshift({ url: data.anime.logoUrl, source: 'Fanart.tv' });
        }
        const covers = [...(imgs.covers || [])];
        if (data.anime.coverUrl && !covers.some((c) => c.url === data.anime.coverUrl)) {
          covers.unshift({ url: data.anime.coverUrl, source: 'AniList' });
        }
        setEditAnimeImages({ covers, banners, logos });
      }
    } catch (err) {
      console.error('Failed to fetch anime artwork for edit:', err);
    } finally {
      setSearchingEditArtwork(false);
    }
  };

  const handleEditBannerUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditBannerUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleEditLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditLogoUrl(ev.target.result);
      setEnableEditAnimeLogo(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditBannerBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setEditBannerUrl(pickData.path);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEditLogoBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setEditLogoUrl(pickData.path);
        setEnableEditAnimeLogo(true);
      }
    } catch (err) {
      console.error(err);
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
      bannerUrl: editBannerUrl || '',
      backdropUrl: editBannerUrl || '',
      logoUrl: enableEditAnimeLogo ? (editLogoUrl || '') : '',
      updatedAt: new Date().toISOString(),
    };

    if (editCoverUrl && (editCoverUrl.startsWith('http') || editCoverUrl.startsWith('data:'))) {
      update.thumbnailBase64 = editCoverUrl;
      update.thumbnailPath = '';
    } else {
      update.thumbnailPath = editCoverUrl || '';
      update.thumbnailBase64 = '';
    }

    upsertLocalAnime(update);
    setAnimes((prev) => prev.map((a) => (a.id === editingAnime.id ? { ...a, ...update } : a)));

    if (!isOffline && db) {
      try {
        await setDoc(doc(db, 'users', targetUserId, 'anime', editingAnime.id), {
          title: editTitle.trim(),
          genres: editGenres,
          totalSeasons: totalSeasonsVal,
          totalEpisodes: totalEpisodesVal,
          thumbnailBase64: update.thumbnailBase64 || '',
          thumbnailPath: update.thumbnailPath || '',
          bannerUrl: editBannerUrl || '',
          backdropUrl: editBannerUrl || '',
          logoUrl: enableEditAnimeLogo ? (editLogoUrl || '') : '',
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
  };

  // Filter & Sort Logic
  const filteredAndSortedAnimes = useMemo(() => {
    const q = (search || '').toLowerCase().trim();

    return (animes || [])
      .filter((anime) => {
        // 1. Text Search
        if (q) {
          const matchTitle = (anime.title || '').toLowerCase().includes(q);
          const matchJapanese = (anime.japaneseTitle || '').toLowerCase().includes(q);
          const matchFolder = (anime.folderPath || '').toLowerCase().includes(q);
          const matchGenres = Array.isArray(anime.genres)
            ? anime.genres.some((g) => g.toLowerCase().includes(q))
            : (anime.genres || '').toLowerCase().includes(q);
          if (!matchTitle && !matchJapanese && !matchFolder && !matchGenres) {
            return false;
          }
        }

        // 2. Status Filter
        const pct = getAnimeProgressPercent(anime);
        const isCompleted = pct === 100 || anime.isWatched || anime.status === 'completed';
        const isWatching = pct > 0 && !isCompleted;
        const isUnwatched = pct === 0 && !isCompleted;

        if (selectedStatus === 'watching' && !isWatching) return false;
        if (selectedStatus === 'completed' && !isCompleted) return false;
        if (selectedStatus === 'unwatched' && !isUnwatched) return false;

        // 3. Length / Episode Count Filter
        const totalEps = anime.totalEpisodes ? Number(anime.totalEpisodes) : (anime.episodeCount || 0);
        const seasons = anime.totalSeasons ? Number(anime.totalSeasons) : 1;

        if (selectedLength === 'short' && totalEps >= 12) return false;
        if (selectedLength === 'standard' && (totalEps < 12 || totalEps > 25)) return false;
        if (selectedLength === 'medium' && (totalEps < 26 || totalEps > 50)) return false;
        if (selectedLength === 'long' && totalEps <= 50) return false;
        if (selectedLength === 'multiseason' && seasons < 2) return false;

        // 4. Source Filter
        const isYt = Boolean(anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://'));
        if (selectedSource === 'local' && isYt) return false;
        if (selectedSource === 'youtube' && !isYt) return false;

        // 5. Genre Filter (matches if anime contains ANY of the selected genres)
        if (selectedGenres.length > 0) {
          const animeGenresList = Array.isArray(anime.genres)
            ? anime.genres.map((g) => g.toLowerCase())
            : (anime.genres || '').split(',').map((g) => g.trim().toLowerCase());
          const hasMatch = selectedGenres.some((sg) => animeGenresList.includes(sg.toLowerCase()));
          if (!hasMatch) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // Default: Recently Watched first priority, then latest added
        if (sortBy === 'recent') {
          const aWatch = new Date(a.lastOpenedAt || a.lastWatchedAt || 0).getTime();
          const bWatch = new Date(b.lastOpenedAt || b.lastWatchedAt || 0).getTime();
          if (aWatch > 0 && bWatch > 0) return bWatch - aWatch;
          if (aWatch > 0 && bWatch <= 0) return -1;
          if (bWatch > 0 && aWatch <= 0) return 1;

          const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return timeB - timeA;
        }

        if (sortBy === 'alpha-asc') {
          return (a.title || '').localeCompare(b.title || '');
        }

        if (sortBy === 'alpha-desc') {
          return (b.title || '').localeCompare(a.title || '');
        }

        if (sortBy === 'progress-desc') {
          return getAnimeProgressPercent(b) - getAnimeProgressPercent(a);
        }

        if (sortBy === 'progress-asc') {
          return getAnimeProgressPercent(a) - getAnimeProgressPercent(b);
        }

        if (sortBy === 'episodes-desc') {
          const epsA = a.totalEpisodes ? Number(a.totalEpisodes) : (a.episodeCount || 0);
          const epsB = b.totalEpisodes ? Number(b.totalEpisodes) : (b.episodeCount || 0);
          return epsB - epsA;
        }

        if (sortBy === 'episodes-asc') {
          const epsA = a.totalEpisodes ? Number(a.totalEpisodes) : (a.episodeCount || 0);
          const epsB = b.totalEpisodes ? Number(b.totalEpisodes) : (b.episodeCount || 0);
          return epsA - epsB;
        }

        if (sortBy === 'rating') {
          return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
        }

        if (sortBy === 'year') {
          const yearA = parseInt(a.year || '0', 10) || 0;
          const yearB = parseInt(b.year || '0', 10) || 0;
          return yearB - yearA;
        }

        return 0;
      });
  }, [animes, search, sortBy, selectedStatus, selectedLength, selectedSource, selectedGenres]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedStatus !== 'all') count++;
    if (selectedLength !== 'all') count++;
    if (selectedSource !== 'all') count++;
    if (selectedGenres.length > 0) count += selectedGenres.length;
    return count;
  }, [selectedStatus, selectedLength, selectedSource, selectedGenres]);

  const resetAllFilters = () => {
    setSelectedStatus('all');
    setSelectedLength('all');
    setSelectedSource('all');
    setSelectedGenres([]);
    setSearch('');
  };

  // Reset lock when visibleCount updates
  useEffect(() => {
    isLoadingMoreRef.current = false;
  }, [visibleCount]);

  // Infinite scroll observer to progressively load more cards as user scrolls down
  useEffect(() => {
    if (visibleCount >= filteredAndSortedAnimes.length) return;
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isLoadingMoreRef.current) {
          isLoadingMoreRef.current = true;
          setVisibleCount((prev) => prev + getAnimeInitialScreenCount());
        }
      },
      { rootMargin: '350px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, filteredAndSortedAnimes.length]);

  const displayedAnimes = useMemo(() => {
    return filteredAndSortedAnimes.slice(0, visibleCount);
  }, [filteredAndSortedAnimes, visibleCount]);

  const skeletonCount = Math.max(visibleCount || 0, getAnimeInitialScreenCount());

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col selection:bg-[#7c5cff] selection:text-white">
      {/* ── Sticky Navigation Header ────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 px-4 md:px-8 py-3.5 flex items-center justify-between bg-[#07090f]/80 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-200 hover:text-white text-xs font-semibold transition cursor-pointer"
          >
            <ChevronLeft size={16} />
            <span>Home</span>
          </button>

          <div className="flex items-center gap-2">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide text-white">
              Anime Library
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push('/?addAnime=true')}
          className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-lg shadow-purple-500/20 transition cursor-pointer active:scale-95"
        >
          <Plus size={15} />
          <span>Add</span>
        </button>
      </header>

      {/* ── Search & Controls Bar ───────────────────────────────────────────── */}
      <div className="max-w-7xl w-full mx-auto px-4 md:px-8 pt-6 pb-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search anime title, Japanese name, genre, or local folder path..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 text-xs rounded-2xl bg-white/[0.04] border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-[#7c5cff]/50 focus:bg-white/[0.06] transition"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Action Buttons: Filter & Sort */}
          <div className="flex items-center gap-2.5 self-end md:self-auto w-full md:w-auto justify-between md:justify-end">
            {/* Filter Modal Trigger */}
            <button
              type="button"
              onClick={() => setShowFilterModal(true)}
              className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl text-xs font-bold border transition cursor-pointer ${
                activeFilterCount > 0
                  ? 'bg-purple-600/20 border-purple-500/40 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]'
                  : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Filter size={14} className={activeFilterCount > 0 ? 'text-[#a855f7]' : 'text-gray-400'} />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-[#7c5cff] text-white text-[10px] font-mono flex items-center justify-center font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10 text-xs">
              <SlidersHorizontal size={14} className="text-[#a855f7] shrink-0" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer pr-1"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id} className="bg-[#111827] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Active Filter Badges Strip ────────────────────────────────────── */}
        {(activeFilterCount > 0 || search) && (
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-gray-400 font-semibold text-[11px]">Active Filters:</span>

            {search && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 border border-white/10 text-white font-medium text-[11px]">
                Search: "{search}"
                <button type="button" onClick={() => setSearch('')} className="hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedStatus !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 font-medium text-[11px]">
                Status: {selectedStatus === 'watching' ? 'Watching' : selectedStatus === 'completed' ? 'Completed' : 'Unwatched'}
                <button type="button" onClick={() => setSelectedStatus('all')} className="hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedLength !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 font-medium text-[11px]">
                {LENGTH_OPTIONS.find((l) => l.id === selectedLength)?.label}
                <button type="button" onClick={() => setSelectedLength('all')} className="hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedSource !== 'all' && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-blue-500/20 border border-blue-500/30 text-blue-300 font-medium text-[11px]">
                Source: {selectedSource === 'local' ? 'Local Video Files' : 'YouTube'}
                <button type="button" onClick={() => setSelectedSource('all')} className="hover:text-red-400">
                  <X size={12} />
                </button>
              </span>
            )}

            {selectedGenres.map((g) => (
              <span key={g} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-300 font-medium text-[11px]">
                {g}
                <button
                  type="button"
                  onClick={() => setSelectedGenres((prev) => prev.filter((item) => item !== g))}
                  className="hover:text-red-400"
                >
                  <X size={12} />
                </button>
              </span>
            ))}

            <button
              type="button"
              onClick={resetAllFilters}
              className="text-[11px] text-[#a855f7] hover:underline font-bold ml-1 cursor-pointer"
            >
              Reset All
            </button>
          </div>
        )}
      </div>

      {/* ── Main Catalog Grid ──────────────────────────────────────────────── */}
      <main className="max-w-7xl w-full mx-auto px-4 md:px-8 pb-16 flex-1">
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {Array.from({ length: skeletonCount }).map((_, idx) => (
              <div
                key={`anime-skel-${idx}`}
                className="h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden border border-white/5 bg-[#111827]/40"
              >
                {/* Poster skeleton */}
                <div className="h-44 relative bg-white/[0.04] shimmer overflow-hidden flex items-center justify-center">
                  <div className="absolute top-2.5 left-2.5 w-14 h-4 rounded bg-white/10" />
                </div>
                {/* Details skeleton */}
                <div className="p-3.5 flex flex-col justify-between flex-1 bg-[#111827]/40 space-y-2">
                  <div>
                    <div className="h-3.5 w-3/4 rounded bg-white/10 shimmer" />
                    <div className="h-2.5 w-1/2 rounded bg-white/5 shimmer mt-2" />
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <div className="h-2.5 w-1/3 rounded bg-white/10 shimmer" />
                    <div className="h-2.5 w-8 rounded bg-white/10 shimmer" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredAndSortedAnimes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel p-10 md:p-16 rounded-3xl text-center border border-white/10 max-w-xl mx-auto my-12 space-y-4"
          >
            <div className="p-4 rounded-full bg-[#7c5cff]/10 text-[#7c5cff] w-16 h-16 mx-auto flex items-center justify-center">
              <FolderOpen size={32} />
            </div>
            <h3 className="text-xl font-bold tracking-wide">No Anime Found</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto leading-relaxed">
              {activeFilterCount > 0 || search
                ? "No tracked anime matches your current filters. Try resetting your search or filter tags."
                : "No anime folders have been tracked yet. Connect local folders or import playlists to start tracking!"}
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              {(activeFilterCount > 0 || search) && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-5 py-2.5 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
                >
                  Reset Filters
                </button>
              )}
              <button
                type="button"
                onClick={() => router.push('/?addAnime=true')}
                className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider btn-accent flex items-center gap-2 cursor-pointer"
              >
                <Plus size={16} />
                <span>Track Folder</span>
              </button>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {/* STRICTLY PRESERVED ANIME CARD STYLINGS AND UIS */}
            {displayedAnimes.map((anime) => (
              <div
                key={anime.id}
                onClick={() => router.push(`/${anime.id}`)}
                className="group relative h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer"
              >
                {/* Poster Image */}
                <div className="h-44 relative overflow-hidden bg-[#181c24] flex items-center justify-center">
                  {anime.thumbnailBase64 ? (
                    <CachedImage
                      src={toFanartBigPreview(anime.thumbnailBase64)}
                      alt={anime.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : anime.thumbnailPath ? (
                    <CachedImage
                      src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`}
                      alt={anime.title}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
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
                      type="button"
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
                      type="button"
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

            {/* Infinite Scroll Sentinel */}
            {visibleCount < filteredAndSortedAnimes.length && (
              <div ref={loadMoreRef} className="col-span-full py-8 flex justify-center items-center">
                <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400 backdrop-blur-md">
                  <Loader2 size={15} className="animate-spin text-[#7c5cff]" />
                  <span>Loading more anime...</span>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── Filter Modal (Matching Movies Filter Modal) ────────────────────── */}
      <AnimatePresence>
        {showFilterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl bg-[#0d111a] space-y-5 max-h-[85vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Filter size={18} className="text-[#a855f7]" />
                  Filter Anime Library
                </h2>
                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition"
                >
                  <X size={18} />
                </button>
              </div>

              {/* 1. Watch Status Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Watch Status
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'all', label: 'All Status' },
                    { id: 'watching', label: 'Watching' },
                    { id: 'completed', label: 'Completed' },
                    { id: 'unwatched', label: 'Unwatched' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedStatus(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        selectedStatus === opt.id
                          ? 'bg-[#7c5cff] text-white border-[#7c5cff] shadow-md font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 2. Series Length & Seasons Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Series Length & Seasons
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LENGTH_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedLength(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        selectedLength === opt.id
                          ? 'bg-[#7c5cff] text-white border-[#7c5cff] shadow-md font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Source Type Filter */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                  Media Source
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'all', label: 'All Sources' },
                    { id: 'local', label: 'Local Video Files' },
                    { id: 'youtube', label: 'YouTube' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setSelectedSource(opt.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        selectedSource === opt.id
                          ? 'bg-[#7c5cff] text-white border-[#7c5cff] shadow-md font-extrabold'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 4. Genres Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-300 uppercase tracking-wider block">
                    Genres ({selectedGenres.length} selected)
                  </label>
                  {selectedGenres.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedGenres([])}
                      className="text-[10px] text-[#a855f7] hover:underline font-bold"
                    >
                      Clear Genres
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto no-scrollbar p-1 border border-white/5 rounded-2xl bg-black/20">
                  {GENRES_LIST.map((genre) => {
                    if (genre === 'All') return null;
                    const isSelected = selectedGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          setSelectedGenres((prev) =>
                            prev.includes(genre)
                              ? prev.filter((g) => g !== genre)
                              : [...prev, genre]
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-[#7c5cff] text-white border-[#7c5cff] font-extrabold shadow'
                            : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
                >
                  Reset All
                </button>

                <button
                  type="button"
                  onClick={() => setShowFilterModal(false)}
                  className="px-5 py-2.5 rounded-xl bg-[#7c5cff] hover:bg-[#6c4cf0] text-white text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer"
                >
                  Apply Filters ({activeFilterCount})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Anime Details Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {editingAnime && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-[90vw] max-w-[90vw] glass-panel p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0d1117]/95"
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

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Seasons
                    </label>
                    <input
                      type="number"
                      min="1"
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
                            setEditGenres((prev) => {
                              const alreadySelected = prev.includes(genre);
                              if (alreadySelected) return prev.filter((g) => g !== genre);
                              if (prev.length >= 5) return prev;
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

                {/* Cover Picture */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">Cover Image (Optional)</label>
                    <button
                      type="button"
                      onClick={() => setShowOnlineSearchEdit((prev) => !prev)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        showOnlineSearchEdit
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 text-purple-200 border border-purple-500/30'
                      }`}
                    >
                      <Sparkles size={12} className="text-purple-300" />
                      {showOnlineSearchEdit ? 'Hide Cover Search' : 'Search Covers Online'}
                    </button>
                  </div>

                  <div className="flex flex-col gap-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleEditCoverBrowse}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer text-white transition"
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
                      />
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
                        >
                          <X size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Online Artwork Search (Fanart.tv & AniList) ── */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/20 via-indigo-900/20 to-black/30 border border-purple-500/20 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sparkles size={14} className="text-purple-400" />
                      Search Artwork Online (AniList & Fanart.tv)
                    </span>
                    {searchingEditArtwork && (
                      <span className="text-[11px] text-purple-300 flex items-center gap-1 font-semibold">
                        <Loader2 size={12} className="animate-spin" /> Searching...
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Enter title to search online banners and logos..."
                      value={editArtworkSearchQuery}
                      onChange={(e) => setEditArtworkSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          fetchEditAnimeArtwork(editArtworkSearchQuery);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => fetchEditAnimeArtwork(editArtworkSearchQuery)}
                      disabled={searchingEditArtwork || !editArtworkSearchQuery.trim()}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition"
                    >
                      {searchingEditArtwork ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
                      Search
                    </button>
                  </div>
                </div>

                {/* ── Backdrop Banner Artwork (16:9) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Backdrop Banner Artwork (16:9)
                    </label>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload Local</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleEditBannerUpload}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleEditBannerBrowse}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <FolderOpen size={13} />
                        <span>Browse PC</span>
                      </button>
                    </div>
                  </div>

                  {bannerSectionOpen ? (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                          className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                          value={editBannerUrl}
                          onChange={(e) => setEditBannerUrl(e.target.value)}
                        />
                        {editBannerUrl && (
                          <button
                            type="button"
                            onClick={() => setEditBannerUrl('')}
                            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {editBannerUrl && (
                        <div className="relative w-full h-28 sm:h-36 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                          <img
                            src={editBannerUrl.startsWith('http') || editBannerUrl.startsWith('data:') ? editBannerUrl : `/api/image?path=${encodeURIComponent(editBannerUrl)}`}
                            alt="Backdrop Preview"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2.5">
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                              <Check size={11} /> Active 16:9 Banner
                            </span>
                            <button
                              type="button"
                              onClick={() => setEditBannerUrl('')}
                              className="p-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </div>
                      )}

                      {Array.isArray(editAnimeImages?.banners) && editAnimeImages.banners.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Choose from Fetched Online Banners ({editAnimeImages.banners.length} found):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 max-h-52 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                            {editAnimeImages.banners.map((ban, idx) => {
                              const isSelected = editBannerUrl === ban.url;
                              return (
                                <div
                                  key={ban.url || idx}
                                  onClick={() => setEditBannerUrl(toFanartFull(ban.url))}
                                  className={`relative h-20 rounded-xl overflow-hidden border cursor-pointer transition ${
                                    isSelected
                                      ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                                      : 'border-white/10 hover:border-white/30 opacity-80 hover:opacity-100'
                                  }`}
                                >
                                  <img
                                    src={toFanartPreview(ban.url)}
                                    alt={`Banner ${idx + 1}`}
                                    className="w-full h-full object-cover"
                                  />
                                  <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 flex items-center justify-between text-[9px] text-gray-300">
                                    <span className="truncate">{ban.source || 'Banner'}</span>
                                    {isSelected && (
                                      <span className="text-emerald-400 font-bold shrink-0 flex items-center gap-0.5">
                                        <Check size={10} />
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    editBannerUrl && (
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/40 border border-white/10">
                        <div className="w-16 h-9 rounded-lg overflow-hidden shrink-0 border border-white/10">
                          <img
                            src={editBannerUrl.startsWith('http') || editBannerUrl.startsWith('data:') ? editBannerUrl : `/api/image?path=${encodeURIComponent(editBannerUrl)}`}
                            alt="Banner preview"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-[11px] text-gray-300 truncate flex-1 font-mono">{editBannerUrl}</span>
                        <span className="text-[10px] text-emerald-400 font-bold shrink-0 flex items-center gap-1">
                          <Check size={11} /> Active Banner
                        </span>
                      </div>
                    )
                  )}

                  {/* Bottom Chevron Toggle Button for Banner Section */}
                  <button
                    type="button"
                    onClick={() => setBannerSectionOpen((prev) => !prev)}
                    className="w-full pt-2.5 pb-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition cursor-pointer border-t border-white/5"
                  >
                    <span>{bannerSectionOpen ? 'Collapse Banner Selection' : 'Open Banner Selection'}</span>
                    {bannerSectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>

                {/* ── Custom Anime Logo / Title Art (Transparent PNG) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableEditAnimeLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableEditAnimeLogo(checked);
                          if (checked && !editLogoUrl && editAnimeImages?.logos?.length > 0) {
                            setEditLogoUrl(editAnimeImages.logos[0].url);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <ImagePlus size={14} className="text-purple-400" />
                        Custom Anime Logo / Title Art
                      </span>
                    </label>
                    {enableEditAnimeLogo && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                          <ImagePlus size={13} />
                          <span>Upload Local</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleEditLogoUpload}
                          />
                        </label>
                        <button
                          type="button"
                          onClick={handleEditLogoBrowse}
                          className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <FolderOpen size={13} />
                          <span>Browse PC</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {enableEditAnimeLogo && (
                    <>
                      {logoSectionOpen ? (
                        <div className="space-y-3 pt-1">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              placeholder="Select below, upload, or paste transparent logo URL..."
                              value={editLogoUrl}
                              onChange={(e) => setEditLogoUrl(e.target.value)}
                              className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                            />
                            {editLogoUrl && (
                              <button
                                type="button"
                                onClick={() => setEditLogoUrl('')}
                                className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          {editLogoUrl && (
                            <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                              <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                                <img
                                  src={editLogoUrl.startsWith('http') || editLogoUrl.startsWith('data:') ? editLogoUrl : `/api/image?path=${encodeURIComponent(editLogoUrl)}`}
                                  alt="Selected Logo"
                                  className="max-h-12 w-auto max-w-full object-contain"
                                />
                              </div>
                              <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                                <Check size={12} /> Active Logo
                              </span>
                            </div>
                          )}

                          {Array.isArray(editAnimeImages?.logos) && editAnimeImages.logos.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                Choose from Fetched Transparent Logos ({editAnimeImages.logos.length} found):
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar p-1.5 rounded-xl bg-black/50 border border-white/5">
                                {editAnimeImages.logos.map((logo, idx) => {
                                  const isSelected = editLogoUrl === logo.url;
                                  return (
                                    <div
                                      key={logo.url || idx}
                                      onClick={() => setEditLogoUrl(toFanartFull(logo.url))}
                                      className={`relative h-20 p-2 rounded-xl bg-white/[0.04] border flex items-center justify-center cursor-pointer transition ${
                                        isSelected
                                          ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)] bg-purple-500/10'
                                          : 'border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                      }`}
                                    >
                                      <img
                                        src={toFanartPreview(logo.url)}
                                        alt={`Logo ${idx + 1}`}
                                        className="max-h-14 w-auto max-w-full object-contain filter drop-shadow-md"
                                      />
                                      <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                        {logo.lang && (
                                          <span className="text-[8px] uppercase font-bold px-1 rounded bg-black/70 text-gray-300">
                                            {logo.lang}
                                          </span>
                                        )}
                                        {isSelected && (
                                          <span className="text-emerald-400 p-0.5 rounded bg-black/70">
                                            <Check size={10} />
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        editLogoUrl && (
                          <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/40 border border-white/10">
                            <div className="h-7 max-w-[80px] p-0.5 rounded-md bg-white/5 shrink-0 flex items-center justify-center border border-white/10">
                              <img
                                src={editLogoUrl.startsWith('http') || editLogoUrl.startsWith('data:') ? editLogoUrl : `/api/image?path=${encodeURIComponent(editLogoUrl)}`}
                                alt="Selected Logo"
                                className="max-h-6 w-auto max-w-full object-contain"
                              />
                            </div>
                            <span className="text-[11px] text-gray-300 truncate flex-1 font-mono">{editLogoUrl}</span>
                            <span className="text-[10px] text-emerald-400 font-bold shrink-0 flex items-center gap-1">
                              <Check size={11} /> Active Logo
                            </span>
                          </div>
                        )
                      )}

                      {/* Bottom Chevron Toggle Button for Logo Section */}
                      <button
                        type="button"
                        onClick={() => setLogoSectionOpen((prev) => !prev)}
                        className="w-full pt-2.5 pb-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-white transition cursor-pointer border-t border-white/5"
                      >
                        <span>{logoSectionOpen ? 'Collapse Logo Section' : 'Open Logo Section'}</span>
                        {logoSectionOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </button>
                    </>
                  )}
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
    </div>
  );
}
