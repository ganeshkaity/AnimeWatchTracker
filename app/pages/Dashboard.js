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
  getLocalAudioStories, setLocalAudioStories, upsertLocalAudioStory, deleteLocalAudioStory,
  getLocalAudioTracks, setLocalAudioTracks,
  getLocalMovies, setLocalMovies, upsertLocalMovie, deleteLocalMovie,
  getLocalWebseries, setLocalWebseries, upsertLocalWebseries, deleteLocalWebseries, setLocalWebseriesEpisodes,
  getLocalWatchlist, setLocalWatchlist, upsertLocalWatchlist, deleteLocalWatchlist,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import {
  Plus, Search, Settings, FolderOpen, Loader2, Play,
  Trash2, SlidersHorizontal, FileVideo, CheckCircle2, ImagePlus,
  StickyNote, Download, Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  Star, Flame, TrendingUp, Clock, Sparkles, Film, Bookmark, Bell, Menu, X,
  Tv, Eye, ShieldCheck, Heart, User, Filter, Compass, Calendar, AlertTriangle,
  Youtube, Video, CheckSquare, Square, ExternalLink, Globe, Trophy, Award,
  BookOpen, HardDrive, Headphones, Music, Disc, Edit3, Check, Image as ImageIcon,
  MoreVertical
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import AnimeCoverSearch from '../components/AnimeCoverSearch';
import MangaCoverSearch from '../components/MangaCoverSearch';
import AddMovieModal from '../components/AddMovieModal';
import EditMovieModal from '../components/EditMovieModal';
import AddWebseriesModal from '../components/AddWebseriesModal';
import EditWebseriesModal from '../components/EditWebseriesModal';
import AddWatchlistModal from '../components/AddWatchlistModal';
import EditWatchlistModal from '../components/EditWatchlistModal';
import TransferWatchlistModal from '../components/TransferWatchlistModal';
import MediaPreviewModal from '../components/MediaPreviewModal';
import CachedImage from '../utils/imageCache';
import { toFanartPreview, toFanartBigPreview, toFanartFull } from '../lib/fanartUtils';

import {
  GRADIENTS,
  YoutubeLogo,
  slugify,
  getInitials,
  getDeterministicRating,
  getAnimeProgressPercent,
  resolveHeroImg,
  getAnimeFolderCover,
  getMangaFolderCover,
  GENRES_LIST,
  getHeroSlides,
} from '../components/dashboard/utils/dashboardHelpers';

// Re-export getAnimeProgressPercent for external compatibility
export { getAnimeProgressPercent } from '../components/dashboard/utils/dashboardHelpers';

// Extracted Layout Components
import DashboardNavbar from '../components/dashboard/layout/DashboardNavbar';
import DashboardMobileMenu from '../components/dashboard/layout/DashboardMobileMenu';
import DashboardHero from '../components/dashboard/layout/DashboardHero';
import MediaCategoriesBar from '../components/dashboard/layout/MediaCategoriesBar';
import DashboardFooter from '../components/dashboard/layout/DashboardFooter';

// Extracted Section Components
import ContinueWatchingSection from '../components/dashboard/sections/ContinueWatchingSection';
import MoviesSection from '../components/dashboard/sections/MoviesSection';
import AnimeSection from '../components/dashboard/sections/AnimeSection';
import WebseriesSection from '../components/dashboard/sections/WebseriesSection';
import MangaSection from '../components/dashboard/sections/MangaSection';
import AudioStoriesSection from '../components/dashboard/sections/AudioStoriesSection';
import WatchlistSection from '../components/dashboard/sections/WatchlistSection';
import RecentlyUpdatedSection from '../components/dashboard/sections/RecentlyUpdatedSection';
import TopRatedMasterpiecesSection from '../components/dashboard/sections/TopRatedMasterpiecesSection';
import GenresSection from '../components/dashboard/sections/GenresSection';
import TopRatedOnlineSection from '../components/dashboard/sections/TopRatedOnlineSection';

// Extracted Modal Components
import AddAnimeModal from '../components/dashboard/modals/AddAnimeModal';
import EditAnimeModal from '../components/dashboard/modals/EditAnimeModal';
import AddMangaModal from '../components/dashboard/modals/AddMangaModal';
import AddAudioStoryModal from '../components/dashboard/modals/AddAudioStoryModal';
import SettingsModal from '../components/dashboard/modals/SettingsModal';
import CustomAlertModal from '../components/dashboard/modals/CustomAlertModal';
import MediaCompleteConfirmModal from '../components/dashboard/modals/MediaCompleteConfirmModal';
import MobileMediaActionSheet from '../components/dashboard/modals/MobileMediaActionSheet';

export default function Dashboard({ onSelectAnime }) {
  const router = useRouter();
  const { currentUser, updateVlcPath, updateDefaultPlayer } = useAuth();
  const { isOffline, isManualOffline, isSyncing, lastSyncedAt, setManualOffline, syncNow } = useOffline();

  const [animes, setAnimes] = useState([]);
  const [mangas, setMangas] = useState([]);
  const [audioStories, setAudioStories] = useState([]);
  const [movies, setMovies] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [loadingManga, setLoadingManga] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalMangas();
      return !(local && local.length > 0);
    }
    return true;
  });
  const [loadingAudioStories, setLoadingAudioStories] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalAudioStories();
      return !(local && local.length > 0);
    }
    return true;
  });
  const [loadingWatchlist, setLoadingWatchlist] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalWatchlist();
      return !(local && local.length > 0);
    }
    return true;
  });

  // Dynamic Document Title
  useEffect(() => {
    document.title = "Ganeshspace - Anime, Movies & Web Series";
  }, []);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, alpha, progress
  const [filterBy, setFilterBy] = useState('all'); // all, active, completed
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleWindowScroll = () => {
      // Trigger glassy effect after scrolling 50% of the hero banner section
      const heroElement = document.getElementById('hero');
      const bannerHeight = heroElement ? heroElement.offsetHeight : window.innerHeight;
      const threshold = bannerHeight * 0.2;
      setIsScrolled(window.scrollY > threshold);
    };
    window.addEventListener('scroll', handleWindowScroll, { passive: true });
    handleWindowScroll();
    return () => window.removeEventListener('scroll', handleWindowScroll);
  }, []);

  // Manga Modal & Form States
  const [showAddMangaModal, setShowAddMangaModal] = useState(false);
  const [mangaCompleteConfirm, setMangaCompleteConfirm] = useState(null);
  const [mangaFolderPath, setMangaFolderPath] = useState('');
  const [mangaTitle, setMangaTitle] = useState('');
  const [mangaScanning, setMangaScanning] = useState(false);
  const [mangaScanResult, setMangaScanResult] = useState([]);
  const [mangaCoverUrl, setMangaCoverUrl] = useState('');
  const [uploadingMangaCover, setUploadingMangaCover] = useState(false);
  const [mangaGenres, setMangaGenres] = useState([]);
  const [showMangaCoverSearch, setShowMangaCoverSearch] = useState(false);
  const [mangaDescription, setMangaDescription] = useState('');
  const [mangaTotalVolumes, setMangaTotalVolumes] = useState('');
  const [mangaTotalChapters, setMangaTotalChapters] = useState('');
  const [fetchingMangaOnline, setFetchingMangaOnline] = useState(false);
  const [mangaOnlineMessage, setMangaOnlineMessage] = useState('');
  // Manga Online Search & Artwork State (AniList, Fanart.tv, TMDB)
  const [mangaSearchQuery, setMangaSearchQuery] = useState('');
  const [mangaSearchResults, setMangaSearchResults] = useState([]);
  const [mangaSearching, setMangaSearching] = useState(false);
  const [mangaSearchError, setMangaSearchError] = useState('');
  const [mangaFetchingDetails, setMangaFetchingDetails] = useState(false);
  const [hasSearchedManga, setHasSearchedManga] = useState(false);
  const [selectedMangaOnline, setSelectedMangaOnline] = useState(null);
  const [mangaBannerUrl, setMangaBannerUrl] = useState('');
  const [mangaLogoUrl, setMangaLogoUrl] = useState('');
  const [enableMangaLogo, setEnableMangaLogo] = useState(false);
  const [mangaImages, setMangaImages] = useState({ covers: [], banners: [], logos: [] });
  const [mangaRomajiTitle, setMangaRomajiTitle] = useState('');
  const [mangaYear, setMangaYear] = useState('');

  // Audio Story Modal & Form States
  const [showAddAudioStoryModal, setShowAddAudioStoryModal] = useState(false);
  const [audioStoryCompleteConfirm, setAudioStoryCompleteConfirm] = useState(null);
  const [audioStoryFolderPath, setAudioStoryFolderPath] = useState('');
  const [audioStoryTitle, setAudioStoryTitle] = useState('');
  const [audioStoryScanning, setAudioStoryScanning] = useState(false);
  const [audioStoryScanResult, setAudioStoryScanResult] = useState([]);
  const [audioStoryCoverUrl, setAudioStoryCoverUrl] = useState('');
  const [uploadingAudioCover, setUploadingAudioCover] = useState(false);
  const [audioStoryGenres, setAudioStoryGenres] = useState([]);
  const [showAudioCoverSearch, setShowAudioCoverSearch] = useState(false);
  const [audioStoryDescription, setAudioStoryDescription] = useState('');
  const [audioStoryTotalTracks, setAudioStoryTotalTracks] = useState('');
  const [fetchingAudioOnline, setFetchingAudioOnline] = useState(false);
  const [audioStoryOnlineMessage, setAudioStoryOnlineMessage] = useState('');

  // Movie Modal & Action States
  const [showAddMovieModal, setShowAddMovieModal] = useState(false);
  const [movieEditing, setMovieEditing] = useState(null);
  const [movieCompleteConfirm, setMovieCompleteConfirm] = useState(null);
  const movieScrollRef = useRef(null);
  const continueScrollRef = useRef(null);

  // Webseries Modal & Action States
  const [webseriesList, setWebseriesList] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWebseries() || [];
    }
    return [];
  });
  const [loadingWebseries, setLoadingWebseries] = useState(() => {
    if (typeof window !== 'undefined') {
      const local = getLocalWebseries();
      return !(local && local.length > 0);
    }
    return false;
  });
  const [showAddWebseriesModal, setShowAddWebseriesModal] = useState(false);
  const [webseriesEditing, setWebseriesEditing] = useState(null);
  const [webseriesCompleteConfirm, setWebseriesCompleteConfirm] = useState(null);
  const webseriesScrollRef = useRef(null);

  useEffect(() => {
    const handleWebseriesUpdate = () => {
      const local = getLocalWebseries() || [];
      setWebseriesList(local);
      setLoadingWebseries(false);
    };
    window.addEventListener('webseries_store_updated', handleWebseriesUpdate);
    return () => window.removeEventListener('webseries_store_updated', handleWebseriesUpdate);
  }, []);

  // Watchlist Modal & Action States
  const [showAddWatchlistModal, setShowAddWatchlistModal] = useState(false);
  const [editingWatchlistItem, setEditingWatchlistItem] = useState(null);
  const [watchlistCompleteConfirm, setWatchlistCompleteConfirm] = useState(null);
  const [transferringWatchlistItem, setTransferringWatchlistItem] = useState(null);
  const watchlistScrollRef = useRef(null);
  const isWatchlistDraggingRef = useRef(false);
  const watchlistStartXRef = useRef(0);
  const watchlistScrollLeftRef = useRef(0);

  // Card Hover Preview Modal & Mobile Menu States
  const [activePreview, setActivePreview] = useState(null); // { item, type, rect }
  const [activeMobileMenu, setActiveMobileMenu] = useState(null); // { type, id, item }
  const hoverTimeoutRef = useRef(null);
  const closeTimeoutRef = useRef(null);

  const handleCardMouseEnter = (item, type, e) => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
    if (activePreview?.item?.id === item.id) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    // Fast switch (80ms) if already previewing another card, else 500ms initial hover
    const delay = activePreview ? 80 : 500;
    hoverTimeoutRef.current = setTimeout(() => {
      setActivePreview({ item, type, rect });
    }, delay);
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

  const handleModalMouseEnter = () => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  };

  const handleModalMouseLeave = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    setActivePreview(null);
  };

  useEffect(() => {
    const handleDismissOnScroll = () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      if (activePreview) {
        setActivePreview(null);
      }
    };
    window.addEventListener('scroll', handleDismissOnScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleDismissOnScroll);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    };
  }, [activePreview]);



  const scrollWebseries = (direction) => {
    if (webseriesScrollRef.current) {
      const { scrollLeft, clientWidth } = webseriesScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      webseriesScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollWatchlist = (direction) => {
    if (watchlistScrollRef.current) {
      const { scrollLeft, clientWidth } = watchlistScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      watchlistScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleWatchlistMouseDown = (e) => {
    isWatchlistDraggingRef.current = true;
    watchlistStartXRef.current = e.pageX - (watchlistScrollRef.current?.offsetLeft || 0);
    watchlistScrollLeftRef.current = watchlistScrollRef.current?.scrollLeft || 0;
  };

  const handleWatchlistMouseMove = (e) => {
    if (!isWatchlistDraggingRef.current || !watchlistScrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - (watchlistScrollRef.current?.offsetLeft || 0);
    const walk = (x - watchlistStartXRef.current) * 1.5;
    watchlistScrollRef.current.scrollLeft = watchlistScrollLeftRef.current - walk;
  };

  const handleWatchlistMouseUpOrLeave = () => {
    isWatchlistDraggingRef.current = false;
  };

  // Hero Carousel State
  const [currentSlide, setCurrentSlide] = useState(0);
  const [slideDirection, setSlideDirection] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showActionModal, setShowActionModal] = useState(false);
  const actionModalTimerRef = useRef(null);
  const actionModalRef = useRef(null);

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
  // Anime Online Search & Artwork State (AniList, Fanart.tv, TMDB)
  const [animeSearchQuery, setAnimeSearchQuery] = useState('');
  const [animeSearchResults, setAnimeSearchResults] = useState([]);
  const [animeSearching, setAnimeSearching] = useState(false);
  const [animeSearchError, setAnimeSearchError] = useState('');
  const [animeFetchingDetails, setAnimeFetchingDetails] = useState(false);
  const [hasSearchedAnime, setHasSearchedAnime] = useState(false);
  const [selectedAnimeOnline, setSelectedAnimeOnline] = useState(null);
  const [animeBannerUrl, setAnimeBannerUrl] = useState('');
  const [animeLogoUrl, setAnimeLogoUrl] = useState('');
  const [enableAnimeLogo, setEnableAnimeLogo] = useState(false);
  const [animeImages, setAnimeImages] = useState({ covers: [], banners: [], logos: [] });
  const [animeRomajiTitle, setAnimeRomajiTitle] = useState('');
  const [animeOverview, setAnimeOverview] = useState('');
  const [animeYear, setAnimeYear] = useState('');

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
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [enableEditAnimeLogo, setEnableEditAnimeLogo] = useState(false);
  const [editAnimeImages, setEditAnimeImages] = useState({ covers: [], banners: [], logos: [] });
  const [searchingEditArtwork, setSearchingEditArtwork] = useState(false);
  const [editArtworkSearchQuery, setEditArtworkSearchQuery] = useState('');
  const [uploadingEditCover, setUploadingEditCover] = useState(false);
  const [showOnlineSearchEdit, setShowOnlineSearchEdit] = useState(false);
  const [editTotalSeasons, setEditTotalSeasons] = useState('1');
  const [editTotalEpisodes, setEditTotalEpisodes] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  // Ref for recently updated horizontal scroll
  const recentlyUpdatedRef = useRef(null);
  // Ref for manga horizontal scroll
  const mangaScrollRef = useRef(null);
  // Ref for audio story horizontal scroll
  const audioStoryScrollRef = useRef(null);
  // Ref for local anime library horizontal scroll
  const animeScrollRef = useRef(null);

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

  // Get dynamic lists from database animes, mangas, audio stories, movies and web series
  const heroSlides = useMemo(() => getHeroSlides(animes, mangas, audioStories, movies, webseriesList), [animes, mangas, audioStories, movies, webseriesList]);

  const recentlyUpdated = useMemo(() => {
    const formattedAnime = (animes || []).map(anime => {
      const cover = getAnimeFolderCover(anime) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop';
      return {
        id: anime.id,
        type: 'anime',
        title: anime.title || 'Untitled Anime',
        episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : (anime.episodeCount ? `${anime.episodeCount} EP` : 'EP 0'),
        rating: getDeterministicRating(anime.id, anime.rating),
        image: cover,
        quality: anime.quality || 'HD',
        isYouTube: !!(anime.isYouTube || anime.folderPath?.startsWith('http') || anime.folderPath?.startsWith('youtube://')),
        updatedAt: anime.updatedAt || anime.createdAt || 0,
        pct: getAnimeProgressPercent(anime),
        item: anime,
      };
    });

    const formattedManga = (mangas || []).map(manga => {
      const cover = getMangaFolderCover(manga) || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=600&auto=format&fit=crop';
      const chLabel = manga.lastReadChapter
        ? `Ch ${manga.lastReadChapter}`
        : (manga.chapterCount ? `${manga.chapterCount} Chs` : (manga.totalChapters ? `${manga.totalChapters} Chs` : 'Manga'));
      return {
        id: manga.id,
        type: 'manga',
        title: manga.title || 'Untitled Manga',
        episode: chLabel,
        rating: getDeterministicRating(manga.id, manga.rating),
        image: cover,
        quality: 'MANGA',
        isYouTube: false,
        updatedAt: manga.updatedAt || manga.lastReadAt || manga.createdAt || 0,
        pct: Number(manga.progressPercent || 0),
        item: manga,
      };
    });

    return [...formattedAnime, ...formattedManga]
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 30);
  }, [animes, mangas]);

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

  const autocompleteAudioStoryMatches = useMemo(() => {
    if (!search || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return (audioStories || []).filter(a => (a?.title || '').toLowerCase().includes(q));
  }, [audioStories, search]);

  const autocompleteMovieMatches = useMemo(() => {
    if (!search || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return (movies || []).filter(m =>
      (m?.title || '').toLowerCase().includes(q) ||
      (m?.originalTitle || '').toLowerCase().includes(q)
    );
  }, [movies, search]);

  const autocompleteWebseriesMatches = useMemo(() => {
    if (!search || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return (webseriesList || []).filter(w =>
      (w?.title || '').toLowerCase().includes(q) ||
      (w?.originalTitle || '').toLowerCase().includes(q)
    );
  }, [webseriesList, search]);

  const autocompleteWatchlistMatches = useMemo(() => {
    if (!search || !search.trim()) return [];
    const q = search.trim().toLowerCase();
    return (watchlist || []).filter(item =>
      (item?.title || '').toLowerCase().includes(q) ||
      (item?.originalTitle || '').toLowerCase().includes(q) ||
      (item?.englishTitle || '').toLowerCase().includes(q) ||
      (item?.romajiTitle || '').toLowerCase().includes(q) ||
      (item?.name || '').toLowerCase().includes(q)
    );
  }, [watchlist, search]);

  // Auto Hero Slider Timer (Advances every 30 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideDirection(1);
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 30000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

  // Aggressively prefetch and preload all hero slides' logo art and banners ahead of time
  useEffect(() => {
    if (typeof document === 'undefined' || !Array.isArray(heroSlides) || heroSlides.length === 0) return;

    const createdPreloadLinks = [];

    heroSlides.forEach((slide) => {
      // 1. Preload logos with browser <link rel="preload"> and async Image() decode
      if (slide.logoUrl) {
        const logoUrl = toFanartBigPreview(slide.logoUrl);
        try {
          if (!document.querySelector(`link[rel="preload"][href="${CSS.escape ? CSS.escape(logoUrl) : logoUrl}"]`)) {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'image';
            link.href = logoUrl;
            document.head.appendChild(link);
            createdPreloadLinks.push(link);
          }
        } catch (e) {}

        const img = new Image();
        img.decoding = 'async';
        img.src = logoUrl;
      }

      // 2. Preload full wide backdrops and posters into HTTP disk & memory cache
      if (slide.banner) {
        const bImg = new Image();
        bImg.decoding = 'async';
        bImg.src = toFanartFull(slide.banner);
      }
      if (slide.poster) {
        const pImg = new Image();
        pImg.decoding = 'async';
        pImg.src = toFanartFull(slide.poster);
      }
    });

    return () => {
      createdPreloadLinks.forEach((link) => {
        try {
          if (link.parentNode) link.parentNode.removeChild(link);
        } catch (e) {}
      });
    };
  }, [heroSlides]);

  // Immediately warm upcoming next slide's logo whenever slide changes
  useEffect(() => {
    if (!Array.isArray(heroSlides) || heroSlides.length === 0) return;
    const nextIdx = (currentSlide + 1) % heroSlides.length;
    const nextSlide = heroSlides[nextIdx];
    if (nextSlide?.logoUrl) {
      const img = new Image();
      img.decoding = 'async';
      img.src = toFanartBigPreview(nextSlide.logoUrl);
    }
  }, [currentSlide, heroSlides]);

  // Sync state with currentUser when it updates
  useEffect(() => {
    if (currentUser) {
      setCustomVlc(currentUser.vlcPath || '');
      setDefaultPlayer(currentUser.defaultPlayer || 'ask');
    }
  }, [currentUser]);

  // Close top action modal on outside click or escape
  useEffect(() => {
    if (!showActionModal) return;
    const handleOutsideClick = (e) => {
      if (actionModalRef.current && !actionModalRef.current.contains(e.target)) {
        setShowActionModal(false);
      }
    };
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setShowActionModal(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showActionModal]);

  // Open Add Anime Modal if redirected with ?addAnime=true
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('addAnime') === 'true') {
          setShowAddModal(true);
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    }
  }, []);

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
      setLoadingManga(false);
    }

    const localAudioStories = getLocalAudioStories();
    if (localAudioStories.length > 0) {
      setAudioStories(localAudioStories);
      setLoadingAudioStories(false);
    }

    const localMovies = getLocalMovies();
    if (localMovies.length > 0) {
      setMovies(localMovies);
      setLoadingMovies(false);
    }

    const localWebseries = getLocalWebseries();
    if (localWebseries.length > 0) {
      setWebseriesList(localWebseries);
      setLoadingWebseries(false);
    }

    const localWatchlist = getLocalWatchlist();
    if (localWatchlist.length > 0) {
      setWatchlist(localWatchlist);
      setLoadingWatchlist(false);
    }

    if (isOffline || !db) {
      setLoading(false);
      setLoadingMovies(false);
      setLoadingWebseries(false);
      setLoadingManga(false);
      setLoadingAudioStories(false);
      setLoadingWatchlist(false);
      return;
    }

    const targetUserId = currentUser?.uid || getUserId();
    const animeRef = collection(db, 'users', targetUserId, 'anime');
    const mangaRef = collection(db, 'users', targetUserId, 'mangas');
    const audioStoriesRef = collection(db, 'users', targetUserId, 'audioStories');
    const moviesRef = collection(db, 'users', targetUserId, 'movies');
    const webseriesRef = collection(db, 'users', targetUserId, 'webseries');
    const watchlistRef = collection(db, 'users', targetUserId, 'watchlist');

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
        const mData = d.data();
        const isWatched = Boolean(mData.isWatched || mData.progressPercent === 100 || mData.status === 'completed');
        list.push({ id: d.id, userId: targetUserId, ...mData, isWatched });
      });
      setMangas(list);
      setLocalMangas(list);
      setLoadingManga(false);
    }, (err) => {
      console.warn('Firestore manga subscription error:', err);
      setMangas(getLocalMangas());
      setLoadingManga(false);
    });

    const unsubscribeAudioStories = onSnapshot(query(audioStoriesRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const aData = d.data();
        const isWatched = Boolean(aData.isWatched || aData.progressPercent === 100 || aData.status === 'completed');
        list.push({ id: d.id, userId: targetUserId, ...aData, isWatched });
      });
      setAudioStories(list);
      setLocalAudioStories(list);
      setLoadingAudioStories(false);
    }, (err) => {
      console.warn('Firestore audioStories subscription error:', err);
      setAudioStories(getLocalAudioStories());
      setLoadingAudioStories(false);
    });

    const unsubscribeMovies = onSnapshot(query(moviesRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const mData = d.data();
        const isWatched = Boolean(mData.watched || mData.isWatched || mData.watchStatus === 'Completed' || (mData.watchProgress && mData.watchProgress >= 95));
        list.push({ id: d.id, userId: targetUserId, ...mData, watched: isWatched, isWatched });
      });
      setMovies(list);
      setLocalMovies(list);
      setLoadingMovies(false);
    }, (err) => {
      console.warn('Firestore movies subscription error:', err);
      setMovies(getLocalMovies());
      setLoadingMovies(false);
    });

    const unsubscribeWebseries = onSnapshot(query(webseriesRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const sData = d.data();
        const isWatched = Boolean(sData.watched || sData.isWatched || sData.watchStatus === 'Completed' || (sData.progressPercent && sData.progressPercent >= 100));
        list.push({ id: d.id, userId: targetUserId, ...sData, watched: isWatched, isWatched });
      });
      const local = getLocalWebseries() || [];
      const merged = [...list];
      local.forEach((locItem) => {
        if (!merged.some((m) => m.id === locItem.id || (locItem.tmdbId && m.tmdbId === locItem.tmdbId))) {
          merged.unshift(locItem);
        }
      });

      if (merged.length > 0) {
        setWebseriesList(merged);
        setLocalWebseries(merged);
        setLoadingWebseries(false);
      } else {
        setWebseriesList([]);
        setLocalWebseries([]);
        setLoadingWebseries(false);
      }
    }, (err) => {
      console.warn('Firestore webseries subscription error:', err);
      setWebseriesList(getLocalWebseries() || []);
      setLoadingWebseries(false);
    });

    const unsubscribeWatchlist = onSnapshot(query(watchlistRef), (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, userId: targetUserId, ...d.data() });
      });
      const local = getLocalWatchlist() || [];
      if (list.length > 0) {
        setWatchlist(list);
        setLocalWatchlist(list);
      } else if (local.length > 0) {
        setWatchlist(local);
        local.forEach((item) => {
          setDoc(doc(db, 'users', targetUserId, 'watchlist', item.id), item, { merge: true }).catch(console.warn);
        });
      } else {
        setWatchlist([]);
        setLocalWatchlist([]);
      }
      setLoadingWatchlist(false);
    }, (err) => {
      console.warn('Firestore watchlist subscription error:', err);
      setWatchlist(getLocalWatchlist() || []);
      setLoadingWatchlist(false);
    });

    return () => {
      unsubscribeAnime();
      unsubscribeManga();
      unsubscribeAudioStories();
      unsubscribeMovies();
      unsubscribeWebseries();
      unsubscribeWatchlist();
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

  // ── Anime Online Search & Details Handlers ──────────────────────────────────
  const handleSearchAnimeOnline = async (e) => {
    if (e) e.preventDefault();
    const q = (animeSearchQuery || animeTitle).trim();
    if (!q) return;

    setAnimeSearching(true);
    setAnimeSearchError('');
    setHasSearchedAnime(true);

    try {
      const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setAnimeSearchResults(data.results);
        if (data.results.length === 0) {
          setAnimeSearchError(`No anime found matching "${q}".`);
        }
      } else {
        setAnimeSearchError(data.error || 'Failed to search anime.');
      }
    } catch (err) {
      console.error('[handleSearchAnimeOnline error]:', err);
      setAnimeSearchError('Network error while searching online.');
    } finally {
      setAnimeSearching(false);
    }
  };

  const handleSelectAnimeOnline = async (item) => {
    setSelectedAnimeOnline(item);
    setAnimeFetchingDetails(true);
    setAnimeSearchError('');

    try {
      const res = await fetch(
        `/api/anime/details?id=${encodeURIComponent(item.id || item.aniListId || '')}&q=${encodeURIComponent(item.title || '')}`
      );
      const data = await res.json();

      if (data.success && data.anime) {
        const a = data.anime;
        setAnimeTitle(a.title || item.title || '');
        setAnimeRomajiTitle(a.romajiTitle || item.romajiTitle || '');
        if (a.overview) setAnimeOverview(a.overview);
        if (a.year) setAnimeYear(a.year);
        if (a.episodes) setAddTotalEpisodes(String(a.episodes));
        if (a.totalSeasons) setAddTotalSeasons(String(a.totalSeasons));

        // Auto-match and select genres (Item 4)
        if (Array.isArray(a.genres) && a.genres.length > 0) {
          const matched = a.genres
            .map((g) =>
              GENRES_LIST.find(
                (gl) =>
                  gl.toLowerCase() === g.toLowerCase() ||
                  gl.toLowerCase().includes(g.toLowerCase()) ||
                  g.toLowerCase().includes(gl.toLowerCase())
              )
            )
            .filter(Boolean);
          const uniqueMatched = Array.from(new Set(matched))
            .filter((g) => g !== 'All')
            .slice(0, 5);
          if (uniqueMatched.length > 0) {
            setAddGenres(uniqueMatched);
          }
        }

        // Cover picture (Item 1 & 3: direct AniList cover picture)
        if (a.coverUrl || a.posterUrl || item.posterUrl) {
          setCoverUrl(a.coverUrl || a.posterUrl || item.posterUrl);
        }

        // Banner picture (Item 2 & 3: AniList and Fanart.tv wide banner)
        if (a.bannerUrl || item.backdropUrl) {
          setAnimeBannerUrl(a.bannerUrl || item.backdropUrl);
        }

        // Title art / Logo (Item 1: Fanart.tv logo)
        if (a.logoUrl) {
          setAnimeLogoUrl(a.logoUrl);
          setEnableAnimeLogo(true);
        }

        setAnimeImages(a.images || { covers: [], banners: [], logos: [] });
      } else {
        setAnimeTitle(item.title || '');
        if (item.posterUrl) setCoverUrl(item.posterUrl);
        if (item.backdropUrl) setAnimeBannerUrl(item.backdropUrl);
        if (item.episodes) setAddTotalEpisodes(String(item.episodes));
        if (Array.isArray(item.genres) && item.genres.length > 0) {
          const matched = item.genres
            .map((g) =>
              GENRES_LIST.find(
                (gl) =>
                  gl.toLowerCase() === g.toLowerCase() ||
                  gl.toLowerCase().includes(g.toLowerCase()) ||
                  g.toLowerCase().includes(gl.toLowerCase())
              )
            )
            .filter(Boolean);
          const uniqueMatched = Array.from(new Set(matched))
            .filter((g) => g !== 'All')
            .slice(0, 5);
          if (uniqueMatched.length > 0) {
            setAddGenres(uniqueMatched);
          }
        }
      }
    } catch (err) {
      console.error('[handleSelectAnimeOnline error]:', err);
      setAnimeTitle(item.title || '');
      if (item.posterUrl) setCoverUrl(item.posterUrl);
      if (item.backdropUrl) setAnimeBannerUrl(item.backdropUrl);
    } finally {
      setAnimeFetchingDetails(false);
    }
  };

  const handleAnimeCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setCoverUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAnimeBannerUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAnimeBannerUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAnimeLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setAnimeLogoUrl(ev.target.result);
      setEnableAnimeLogo(true);
    };
    reader.readAsDataURL(file);
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
        romajiTitle: animeRomajiTitle || '',
        japaneseTitle: animeRomajiTitle || '',
        folderPath: cleanPath,
        episodeCount: scanResult.length,
        totalSeasons: totalSeasonsVal,
        totalEpisodes: totalEpisodesVal,
        year: animeYear || new Date().getFullYear().toString(),
        description: animeOverview || '',
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastWatchedEpisode: '',
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: coverUrl || '',
        coverUrl: coverUrl || '',
        posterUrl: coverUrl || '',
        bannerUrl: animeBannerUrl || '',
        backdropUrl: animeBannerUrl || '',
        logoUrl: enableAnimeLogo ? (animeLogoUrl || '') : '',
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
      setAnimeRomajiTitle('');
      setAnimeOverview('');
      setAnimeYear('');
      setCoverUrl('');
      setAnimeBannerUrl('');
      setAnimeLogoUrl('');
      setEnableAnimeLogo(false);
      setAnimeImages({ covers: [], banners: [], logos: [] });
      setSelectedAnimeOnline(null);
      setAnimeSearchQuery('');
      setAnimeSearchResults([]);
      setAnimeSearchError('');
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
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm('Are you sure you want to stop tracking this anime? Progress and notes will be deleted.')) return;
    try {
      const animeId = anime.id;
      const targetUserId = anime.userId || currentUser?.uid || getUserId();
      deleteLocalAnime(animeId);
      setAnimes(prev => prev.filter(a => a.id !== animeId));
      if (!isOffline && db && targetUserId) {
        await deleteDoc(doc(db, 'users', targetUserId, 'anime', animeId));
      } else {
        addToDirtyQueue({ type: 'DELETE_ANIME', dedupeKey: `DELETE_ANIME_${animeId}`, payload: { id: animeId, userId: targetUserId } });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Toggle Anime Completed / Incomplete
  const handleToggleAnimeComplete = async (animeItem) => {
    if (!animeItem) return;
    const currentPct = getAnimeProgressPercent(animeItem);
    const shouldMarkComplete = currentPct < 100;

    const eps = getLocalEpisodes(animeItem.id) || [];
    if (eps.length > 0) {
      const updatedEps = eps.map(e => ({
        ...e,
        isWatched: shouldMarkComplete,
        watchedSeconds: shouldMarkComplete ? (e.durationSeconds || 1440) : 0,
        lastPositionSeconds: shouldMarkComplete ? (e.durationSeconds || 1440) : 0,
        updatedAt: new Date().toISOString()
      }));
      setLocalEpisodes(animeItem.id, updatedEps);
    }

    const updatedAnime = {
      ...animeItem,
      progressPercent: shouldMarkComplete ? 100 : 0,
      watchStatus: shouldMarkComplete ? 'Completed' : 'Watching',
      completed: shouldMarkComplete,
      isWatched: shouldMarkComplete,
      updatedAt: new Date().toISOString()
    };

    upsertLocalAnime(updatedAnime);
    setAnimes(prev => prev.map(a => a.id === animeItem.id ? updatedAnime : a));

    const targetUserId = animeItem.userId || currentUser?.uid || getUserId();
    if (targetUserId && db && !isOffline) {
      try {
        await setDoc(doc(db, 'users', targetUserId, 'anime', animeItem.id), {
          progressPercent: shouldMarkComplete ? 100 : 0,
          watchStatus: shouldMarkComplete ? 'Completed' : 'Watching',
          completed: shouldMarkComplete,
          isWatched: shouldMarkComplete,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn('Failed to sync anime status to firestore:', err);
      }
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

  // ── Manga Online Search & Details Handlers ──────────────────────────────────
  const handleSearchMangaOnline = async (e) => {
    if (e) e.preventDefault();
    const q = (mangaSearchQuery || mangaTitle || '').trim();
    if (!q) return;

    setMangaSearching(true);
    setMangaSearchError('');
    setHasSearchedManga(true);

    try {
      const res = await fetch(`/api/manga/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        setMangaSearchResults(data.results);
        if (data.results.length === 0) {
          setMangaSearchError(`No manga found matching "${q}".`);
        }
      } else {
        setMangaSearchError(data.error || 'Failed to search manga.');
      }
    } catch (err) {
      console.error('[handleSearchMangaOnline error]:', err);
      setMangaSearchError('Network error while searching online.');
    } finally {
      setMangaSearching(false);
    }
  };

  const handleSelectMangaOnline = async (item) => {
    setSelectedMangaOnline(item);
    setMangaFetchingDetails(true);
    setMangaSearchError('');

    try {
      const res = await fetch(
        `/api/manga/details?id=${encodeURIComponent(item.id || item.aniListId || '')}&q=${encodeURIComponent(item.title || '')}`
      );
      const data = await res.json();

      if (data.success && data.manga) {
        const m = data.manga;
        setMangaTitle(m.title || item.title || '');
        setMangaRomajiTitle(m.romajiTitle || item.romajiTitle || '');
        if (m.synopsis || m.overview) setMangaDescription(m.synopsis || m.overview);
        if (m.year) setMangaYear(String(m.year));
        if (m.chapters) setMangaTotalChapters(String(m.chapters));
        if (m.volumes) setMangaTotalVolumes(String(m.volumes));

        // Auto-match and select genres (Requirement 4)
        if (Array.isArray(m.genres) && m.genres.length > 0) {
          const matched = m.genres
            .map((g) =>
              GENRES_LIST.find(
                (gl) =>
                  gl.toLowerCase() === g.toLowerCase() ||
                  gl.toLowerCase().includes(g.toLowerCase()) ||
                  g.toLowerCase().includes(gl.toLowerCase())
              )
            )
            .filter(Boolean);
          const uniqueMatched = Array.from(new Set(matched))
            .filter((g) => g !== 'All')
            .slice(0, 5);
          if (uniqueMatched.length > 0) {
            setMangaGenres(uniqueMatched);
          }
        }

        // Cover picture (Item 1 & 3: direct AniList cover picture)
        if (m.coverUrl || m.posterUrl || item.posterUrl) {
          setMangaCoverUrl(m.coverUrl || m.posterUrl || item.posterUrl);
        }

        // Banner picture (Item 2 & 3: AniList and Fanart.tv wide banner)
        if (m.bannerUrl || item.backdropUrl) {
          setMangaBannerUrl(m.bannerUrl || item.backdropUrl);
        }

        // Title art / Logo (Item 1: Fanart.tv logo)
        if (m.logoUrl) {
          setMangaLogoUrl(m.logoUrl);
          setEnableMangaLogo(true);
        }

        setMangaImages(m.images || { covers: [], banners: [], logos: [] });
      } else {
        setMangaTitle(item.title || '');
        if (item.posterUrl) setMangaCoverUrl(item.posterUrl);
        if (item.backdropUrl) setMangaBannerUrl(item.backdropUrl);
        if (item.chapters) setMangaTotalChapters(String(item.chapters));
        if (item.volumes) setMangaTotalVolumes(String(item.volumes));
        if (Array.isArray(item.genres) && item.genres.length > 0) {
          const matched = item.genres
            .map((g) =>
              GENRES_LIST.find(
                (gl) =>
                  gl.toLowerCase() === g.toLowerCase() ||
                  gl.toLowerCase().includes(g.toLowerCase()) ||
                  g.toLowerCase().includes(gl.toLowerCase())
              )
            )
            .filter(Boolean);
          const uniqueMatched = Array.from(new Set(matched))
            .filter((g) => g !== 'All')
            .slice(0, 5);
          if (uniqueMatched.length > 0) {
            setMangaGenres(uniqueMatched);
          }
        }
      }
    } catch (err) {
      console.error('[handleSelectMangaOnline error]:', err);
      setMangaTitle(item.title || '');
      if (item.posterUrl) setMangaCoverUrl(item.posterUrl);
      if (item.backdropUrl) setMangaBannerUrl(item.backdropUrl);
    } finally {
      setMangaFetchingDetails(false);
    }
  };

  const handleMangaCoverUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMangaCoverUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleMangaBannerUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMangaBannerUrl(ev.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleMangaLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMangaLogoUrl(ev.target.result);
      setEnableMangaLogo(true);
    };
    reader.readAsDataURL(file);
  };

  const handleFetchMangaOnline = async () => {
    const query = (mangaTitle || '').trim();
    if (!query) {
      setMangaOnlineMessage('Please enter a manga title first.');
      setTimeout(() => setMangaOnlineMessage(''), 3000);
      return;
    }
    setFetchingMangaOnline(true);
    setMangaOnlineMessage('Searching online for manga info...');
    try {
      const res = await fetch(`/api/manga-rating?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        if (data.synopsis) {
          setMangaDescription(data.synopsis);
        }
        if (data.volumes) {
          setMangaTotalVolumes(String(data.volumes));
        }
        if (data.chapters) {
          setMangaTotalChapters(String(data.chapters));
        }
        if (data.imageUrl && !mangaCoverUrl) {
          setMangaCoverUrl(data.imageUrl);
        }
        if (Array.isArray(data.genres) && data.genres.length > 0) {
          setMangaGenres(prev => {
            const set = new Set(prev);
            data.genres.forEach(g => {
              const matched = GENRES_LIST.find(gl => gl.toLowerCase() === g.toLowerCase());
              if (matched && matched !== 'All') set.add(matched);
            });
            return Array.from(set);
          });
        }
        const infoParts = [];
        if (data.volumes) infoParts.push(`${data.volumes} vols`);
        if (data.chapters) infoParts.push(`${data.chapters} chs`);
        const infoStr = infoParts.length > 0 ? ` (${infoParts.join(', ')})` : '';
        setMangaOnlineMessage(`✓ Auto-filled details from ${data.source || 'Online'}${infoStr}`);
      } else {
        setMangaOnlineMessage(data.error || 'No manga found online.');
      }
    } catch (err) {
      setMangaOnlineMessage('Fetch failed: ' + err.message);
    } finally {
      setFetchingMangaOnline(false);
      setTimeout(() => setMangaOnlineMessage(''), 5000);
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

      const totalChs = mangaTotalChapters ? parseInt(mangaTotalChapters, 10) : mangaScanResult.length;
      const totalVols = mangaTotalVolumes ? parseInt(mangaTotalVolumes, 10) : null;
      const mangaData = {
        title: mangaTitle.trim(),
        romajiTitle: mangaRomajiTitle || '',
        year: mangaYear || '',
        folderPath: cleanPath,
        chapterCount: mangaScanResult.length,
        totalChapters: totalChs,
        volumes: totalVols,
        totalVolumes: totalVols,
        description: mangaDescription.trim(),
        synopsis: mangaDescription.trim(),
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastReadChapter: '',
        lastReadPage: 1,
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: mangaCoverUrl || '',
        coverUrl: mangaCoverUrl || '',
        posterUrl: mangaCoverUrl || '',
        bannerUrl: mangaBannerUrl || '',
        backdropUrl: mangaBannerUrl || '',
        logoUrl: enableMangaLogo ? (mangaLogoUrl || '') : '',
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
      setMangaRomajiTitle('');
      setMangaYear('');
      setMangaCoverUrl('');
      setMangaBannerUrl('');
      setMangaLogoUrl('');
      setEnableMangaLogo(false);
      setMangaImages({ covers: [], banners: [], logos: [] });
      setSelectedMangaOnline(null);
      setMangaSearchQuery('');
      setMangaSearchResults([]);
      setMangaSearchError('');
      setHasSearchedManga(false);
      setMangaGenres([]);
      setMangaScanResult([]);
      setMangaDescription('');
      setMangaTotalVolumes('');
      setMangaTotalChapters('');
      setMangaOnlineMessage('');
    } catch (err) {
      console.error(err);
      alert('Error adding manga: ' + err.message);
    } finally {
      setMangaScanning(false);
    }
  };

  const handleDeleteManga = async (mangaItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
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

  const handleToggleMangaWatched = async (mangaItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const isCurrentlyWatched = Boolean(mangaItem.isWatched || mangaItem.progressPercent === 100);
      const shouldComplete = !isCurrentlyWatched;
      const mangaId = mangaItem.id;
      const targetUserId = mangaItem.userId || currentUser?.uid || getUserId();

      const localChs = getLocalChapters(mangaId);
      const updatedChapters = (localChs || []).map(ch => ({
        ...ch,
        isRead: shouldComplete,
        isWatched: shouldComplete,
        progress: shouldComplete ? 100 : 0,
        lastPage: shouldComplete ? (ch.totalPages || 1) : 1,
        updatedAt: new Date().toISOString(),
      }));
      setLocalChapters(mangaId, updatedChapters);

      const updatedManga = {
        ...mangaItem,
        isWatched: shouldComplete,
        isCompleted: shouldComplete,
        progressPercent: shouldComplete ? 100 : 0,
        completedChapters: shouldComplete ? updatedChapters.length : 0,
        status: shouldComplete ? 'completed' : 'ready',
        updatedAt: new Date().toISOString(),
      };
      upsertLocalManga(updatedManga);
      setMangas(prev => prev.map(m => m.id === mangaId ? updatedManga : m));

      if (!isOffline && db && targetUserId) {
        let batch = writeBatch(db);
        let bCount = 0;

        for (const ch of updatedChapters) {
          const chId = ch.id || `manga_${mangaId}_${encodeURIComponent(ch.name || ch.fileName || '')}`;
          const chRef = doc(db, 'users', targetUserId, 'mangas', mangaId, 'chapters', chId);
          batch.set(chRef, {
            ...ch,
            isRead: shouldComplete,
            isWatched: shouldComplete,
            progress: shouldComplete ? 100 : 0,
            lastPage: shouldComplete ? (ch.totalPages || 1) : 1,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          bCount++;
          if (bCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            bCount = 0;
          }
        }

        const mRef = doc(db, 'users', targetUserId, 'mangas', mangaId);
        batch.set(mRef, {
          progressPercent: shouldComplete ? 100 : 0,
          completedChapters: shouldComplete ? updatedChapters.length : 0,
          isWatched: shouldComplete,
          isCompleted: shouldComplete,
          status: updatedManga.status,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_CHAPTERS_BATCH',
          dedupeKey: `SET_CHAPTERS_BATCH_${mangaId}`,
          payload: { mangaId, mangaUserId: targetUserId, chapters: updatedChapters },
        });
        addToDirtyQueue({
          type: 'SET_MANGA',
          dedupeKey: `SET_MANGA_${mangaId}`,
          payload: { id: mangaId, userId: targetUserId, ...updatedManga },
        });
      }
    } catch (err) {
      console.error('Error toggling manga watched:', err);
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

  // ── Audio Stories Actions ──────────────────────────────────────────────────
  const handleBrowseAudioStoryFolder = async () => {
    setAudioStoryScanning(true);
    try {
      const response = await fetch('/api/select-folder');
      const data = await response.json();
      if (data.success && data.path) {
        const path = data.path;
        setAudioStoryFolderPath(path);
        const folderName = path.split(/[\\/]/).pop();
        setAudioStoryTitle(folderName || '');

        const scanRes = await fetch('/api/audio-story/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: path }),
        });
        const scanData = await scanRes.json();
        if (scanData.success) {
          setAudioStoryScanResult(scanData.tracks || []);
        } else {
          alert("Error scanning folder: " + scanData.error);
        }
      }
    } catch (err) {
      console.error(err);
      alert("Folder dialog error. Please paste the directory path directly.");
    } finally {
      setAudioStoryScanning(false);
    }
  };

  const handleScanAudioStory = async () => {
    if (!audioStoryFolderPath) return;
    setAudioStoryScanning(true);
    try {
      const res = await fetch('/api/audio-story/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: audioStoryFolderPath.trim() })
      });
      const data = await res.json();
      if (data.success) {
        setAudioStoryScanResult(data.tracks || []);
        if (!audioStoryTitle) {
          const folderName = audioStoryFolderPath.trim().split(/[\\/]/).pop();
          setAudioStoryTitle(folderName || '');
        }
      } else {
        alert("Error scanning folder: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Scan request failed: " + err.message);
    } finally {
      setAudioStoryScanning(false);
    }
  };

  const handleFetchAudioStoryOnline = async () => {
    const query = (audioStoryTitle || '').trim();
    if (!query) {
      setAudioStoryOnlineMessage('Please enter a story title first.');
      setTimeout(() => setAudioStoryOnlineMessage(''), 3000);
      return;
    }
    setFetchingAudioOnline(true);
    setAudioStoryOnlineMessage('Searching online for story details...');
    try {
      const res = await fetch(`/api/anime-rating?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        if (data.synopsis) setAudioStoryDescription(data.synopsis);
        if (data.imageUrl && !audioStoryCoverUrl) setAudioStoryCoverUrl(data.imageUrl);
        if (Array.isArray(data.genres) && data.genres.length > 0) {
          setAudioStoryGenres(prev => {
            const set = new Set(prev);
            data.genres.forEach(g => {
              const matched = GENRES_LIST.find(gl => gl.toLowerCase() === g.toLowerCase());
              if (matched && matched !== 'All') set.add(matched);
            });
            return Array.from(set);
          });
        }
        setAudioStoryOnlineMessage(`✓ Auto-filled details from ${data.source || 'Online'}`);
      } else {
        const mRes = await fetch(`/api/manga-rating?q=${encodeURIComponent(query)}`);
        const mData = await mRes.json();
        if (mData.success) {
          if (mData.synopsis) setAudioStoryDescription(mData.synopsis);
          if (mData.imageUrl && !audioStoryCoverUrl) setAudioStoryCoverUrl(mData.imageUrl);
          setAudioStoryOnlineMessage(`✓ Auto-filled details from ${mData.source || 'Online'}`);
        } else {
          setAudioStoryOnlineMessage('No story found online. You can enter details manually.');
        }
      }
    } catch (err) {
      setAudioStoryOnlineMessage('Fetch failed: ' + err.message);
    } finally {
      setFetchingAudioOnline(false);
      setTimeout(() => setAudioStoryOnlineMessage(''), 5000);
    }
  };

  const handleAddAudioStory = async (e) => {
    e.preventDefault();
    const cleanPath = audioStoryFolderPath.trim();
    if (!cleanPath || !audioStoryTitle.trim() || audioStoryScanResult.length === 0) {
      alert('Please select a valid folder, input a title, and scan audio/video files first.');
      return;
    }

    setAudioStoryScanning(true);
    try {
      let storyId = slugify(audioStoryTitle.trim());
      if (!storyId) {
        storyId = `audio_${Date.now()}`;
      } else {
        const isDuplicate = audioStories.some(s => s.id === storyId);
        if (isDuplicate) {
          storyId = `${storyId}-${Math.floor(Math.random() * 1000)}`;
        }
      }
      const randomGradient = GRADIENTS[Math.floor(Math.random() * GRADIENTS.length)];
      const totalTrks = audioStoryTotalTracks ? parseInt(audioStoryTotalTracks, 10) : audioStoryScanResult.length;

      const storyData = {
        title: audioStoryTitle.trim(),
        folderPath: cleanPath,
        trackCount: audioStoryScanResult.length,
        totalTracks: totalTrks,
        description: audioStoryDescription.trim(),
        synopsis: audioStoryDescription.trim(),
        progressPercent: 0,
        coverGradient: randomGradient,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastPlayedTrack: '',
        lastOpenedAt: new Date().toISOString(),
        userId: getUserId(),
        thumbnailBase64: audioStoryCoverUrl || '',
        genres: audioStoryGenres,
        type: 'audio-story',
      };

      const parsedTracks = audioStoryScanResult.map((tr, idx) => ({
        id: `track_${idx + 1}_${encodeURIComponent(tr.name || tr.fileName)}`,
        trackNumber: tr.trackNumber !== undefined ? tr.trackNumber : idx + 1,
        episodeNumber: tr.trackNumber !== undefined ? tr.trackNumber : idx + 1,
        name: tr.name || tr.fileName,
        fileName: tr.fileName || tr.name,
        filePath: tr.filePath,
        size: tr.size || 0,
        isVideo: Boolean(tr.isVideo),
        fileType: tr.fileType || (tr.isVideo ? 'video' : 'audio'),
        ext: tr.ext || '',
        createdAt: tr.createdAt || Date.now(),
        progress: 0,
        progressPercent: 0,
        isWatched: false,
        flags: [],
        note: '',
        updatedAt: new Date().toISOString(),
      }));

      upsertLocalAudioStory({ id: storyId, ...storyData });
      setLocalAudioTracks(storyId, parsedTracks);
      setAudioStories(prev => [{ id: storyId, ...storyData }, ...prev]);

      if (!isOffline && db) {
        const batch = writeBatch(db);
        const storyDocRef = doc(db, 'users', getUserId(), 'audioStories', storyId);
        batch.set(storyDocRef, storyData);
        parsedTracks.forEach((tr) => {
          const trDocRef = doc(db, 'users', getUserId(), 'audioStories', storyId, 'tracks', tr.id);
          batch.set(trDocRef, tr);
        });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_AUDIO_STORY',
          dedupeKey: `SET_AUDIO_STORY_${storyId}`,
          payload: { id: storyId, ...storyData },
        });
        addToDirtyQueue({
          type: 'SET_AUDIO_TRACKS_BATCH',
          dedupeKey: `SET_AUDIO_TRACKS_BATCH_${storyId}`,
          payload: { storyId, storyUserId: getUserId(), tracks: parsedTracks },
        });
      }

      setShowAddAudioStoryModal(false);
      setAudioStoryFolderPath('');
      setAudioStoryTitle('');
      setAudioStoryCoverUrl('');
      setAudioStoryGenres([]);
      setAudioStoryScanResult([]);
      setAudioStoryDescription('');
      setAudioStoryTotalTracks('');
      setAudioStoryOnlineMessage('');
    } catch (err) {
      console.error(err);
      alert('Error adding audio story: ' + err.message);
    } finally {
      setAudioStoryScanning(false);
    }
  };

  const handleDeleteAudioStory = async (storyItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm('Are you sure you want to stop tracking this audio story?')) return;
    try {
      const storyId = storyItem.id;
      const targetUserId = storyItem.userId || currentUser?.uid || getUserId();
      deleteLocalAudioStory(storyId);
      setAudioStories(prev => prev.filter(s => s.id !== storyId));
      if (!isOffline && db) {
        await deleteDoc(doc(db, 'users', targetUserId, 'audioStories', storyId));
      } else {
        addToDirtyQueue({
          type: 'DELETE_AUDIO_STORY',
          dedupeKey: `DELETE_AUDIO_STORY_${storyId}`,
          payload: { id: storyId, userId: targetUserId }
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleAudioStoryWatched = async (storyItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const isCurrentlyWatched = Boolean(storyItem.isWatched || storyItem.progressPercent === 100);
      const shouldComplete = !isCurrentlyWatched;
      const storyId = storyItem.id;
      const targetUserId = storyItem.userId || currentUser?.uid || getUserId();

      const localTrks = getLocalAudioTracks(storyId);
      const updatedTracks = (localTrks || []).map(tr => ({
        ...tr,
        isWatched: shouldComplete,
        progressPercent: shouldComplete ? 100 : 0,
        updatedAt: new Date().toISOString(),
      }));
      setLocalAudioTracks(storyId, updatedTracks);

      const updatedStory = {
        ...storyItem,
        isWatched: shouldComplete,
        isCompleted: shouldComplete,
        progressPercent: shouldComplete ? 100 : 0,
        completedTracks: shouldComplete ? updatedTracks.length : 0,
        status: shouldComplete ? 'completed' : 'ready',
        updatedAt: new Date().toISOString(),
      };
      upsertLocalAudioStory(updatedStory);
      setAudioStories(prev => prev.map(s => s.id === storyId ? updatedStory : s));

      if (!isOffline && db && targetUserId) {
        let batch = writeBatch(db);
        let bCount = 0;

        for (const tr of updatedTracks) {
          const trDocRef = doc(db, 'users', targetUserId, 'audioStories', storyId, 'tracks', tr.id);
          batch.set(trDocRef, {
            ...tr,
            isWatched: shouldComplete,
            progressPercent: shouldComplete ? 100 : 0,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          bCount++;
          if (bCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            bCount = 0;
          }
        }

        const sRef = doc(db, 'users', targetUserId, 'audioStories', storyId);
        batch.set(sRef, {
          progressPercent: shouldComplete ? 100 : 0,
          completedTracks: shouldComplete ? updatedTracks.length : 0,
          isWatched: shouldComplete,
          isCompleted: shouldComplete,
          status: updatedStory.status,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_AUDIO_TRACKS_BATCH',
          dedupeKey: `SET_AUDIO_TRACKS_BATCH_${storyId}`,
          payload: { storyId, storyUserId: targetUserId, tracks: updatedTracks },
        });
        addToDirtyQueue({
          type: 'SET_AUDIO_STORY',
          dedupeKey: `SET_AUDIO_STORY_${storyId}`,
          payload: { id: storyId, userId: targetUserId, ...updatedStory },
        });
      }
    } catch (err) {
      console.error('Error toggling audio story watched:', err);
    }
  };

  const handleNewAudioCoverUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingAudioCover(true);
    try {
      const url = await uploadToImgBB(file);
      setAudioStoryCoverUrl(url);
    } catch (err) {
      console.error(err);
      alert('Failed to upload image: ' + err.message);
    } finally {
      setUploadingAudioCover(false);
    }
  };

  const handleAudioCoverBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setAudioStoryCoverUrl(pickData.path);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Movies Actions ──────────────────────────────────────────────────────────
  const handleAddMovie = async (movieData) => {
    upsertLocalMovie(movieData);
    setMovies(prev => [movieData, ...prev]);

    const targetUserId = getUserId();
    if (!isOffline && db && targetUserId) {
      try {
        const movieDocRef = doc(db, 'users', targetUserId, 'movies', movieData.id);
        await setDoc(movieDocRef, movieData, { merge: true });
      } catch (err) {
        console.warn('Firestore add movie error, fallback to dirty queue:', err);
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movieData.id}`,
          payload: { id: movieData.id, userId: targetUserId, ...movieData },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_MOVIE',
        dedupeKey: `SET_MOVIE_${movieData.id}`,
        payload: { id: movieData.id, userId: targetUserId, ...movieData },
      });
    }
  };

  const handleSaveMovieEdit = async (updatedMovie) => {
    upsertLocalMovie(updatedMovie);
    setMovies(prev => prev.map(m => m.id === updatedMovie.id ? updatedMovie : m));

    const targetUserId = getUserId();
    if (!isOffline && db && targetUserId) {
      try {
        const movieDocRef = doc(db, 'users', targetUserId, 'movies', updatedMovie.id);
        await setDoc(movieDocRef, updatedMovie, { merge: true });
      } catch (err) {
        console.warn('Firestore update movie error, fallback to dirty queue:', err);
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${updatedMovie.id}`,
          payload: { id: updatedMovie.id, userId: targetUserId, ...updatedMovie },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_MOVIE',
        dedupeKey: `SET_MOVIE_${updatedMovie.id}`,
        payload: { id: updatedMovie.id, userId: targetUserId, ...updatedMovie },
      });
    }
  };

  const handleDeleteMovie = async (movieItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm(`Are you sure you want to stop tracking "${movieItem.title}"?`)) return;
    try {
      const movieId = movieItem.id;
      const targetUserId = movieItem.userId || currentUser?.uid || getUserId();
      deleteLocalMovie(movieId);
      setMovies(prev => prev.filter(m => m.id !== movieId));
      if (!isOffline && db && targetUserId) {
        await deleteDoc(doc(db, 'users', targetUserId, 'movies', movieId));
      } else {
        addToDirtyQueue({
          type: 'DELETE_MOVIE',
          dedupeKey: `DELETE_MOVIE_${movieId}`,
          payload: { id: movieId, userId: targetUserId }
        });
      }
    } catch (err) {
      console.error('Delete movie error:', err);
    }
  };

  const handleToggleMovieWatched = async (movieItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const isCurrentlyWatched = Boolean(movieItem.watched || movieItem.watchStatus === 'Completed' || (movieItem.watchProgress && movieItem.watchProgress >= 95));
      const shouldComplete = !isCurrentlyWatched;
      const movieId = movieItem.id;
      const targetUserId = movieItem.userId || currentUser?.uid || getUserId();

      const updatedMovie = {
        ...movieItem,
        watched: shouldComplete,
        completed: shouldComplete,
        watchStatus: shouldComplete ? 'Completed' : 'Not Started',
        watchProgress: shouldComplete ? 100 : 0,
        progressPercentage: shouldComplete ? 100 : 0,
        currentTime: shouldComplete ? (movieItem.duration || 0) : 0,
        updatedAt: new Date().toISOString(),
      };

      upsertLocalMovie(updatedMovie);
      setMovies(prev => prev.map(m => m.id === movieId ? updatedMovie : m));

      if (!isOffline && db && targetUserId) {
        const movieDocRef = doc(db, 'users', targetUserId, 'movies', movieId);
        await setDoc(movieDocRef, updatedMovie, { merge: true });
      } else {
        addToDirtyQueue({
          type: 'SET_MOVIE',
          dedupeKey: `SET_MOVIE_${movieId}`,
          payload: { id: movieId, userId: targetUserId, ...updatedMovie },
        });
      }
    } catch (err) {
      console.error('Toggle movie watched error:', err);
    }
  };

  // ── Webseries Actions ──────────────────────────────────────────────────────
  const handleAddWebseries = async (seriesData, episodesList = []) => {
    upsertLocalWebseries(seriesData);
    if (episodesList && episodesList.length > 0) {
      setLocalWebseriesEpisodes(seriesData.id, episodesList);
    }
    setWebseriesList(prev => [seriesData, ...prev.filter(w => w.id !== seriesData.id)]);

    const targetUserId = getUserId();
    if (!isOffline && db && targetUserId) {
      try {
        const wsDocRef = doc(db, 'users', targetUserId, 'webseries', seriesData.id);
        await setDoc(wsDocRef, seriesData, { merge: true });
        if (episodesList && episodesList.length > 0) {
          const epBatch = writeBatch(db);
          episodesList.forEach((ep) => {
            const epRef = doc(db, 'users', targetUserId, 'webseries', seriesData.id, 'episodes', ep.id);
            epBatch.set(epRef, ep, { merge: true });
          });
          await epBatch.commit();
        }
      } catch (err) {
        console.warn('Firestore add webseries error, fallback to dirty queue:', err);
        addToDirtyQueue({
          type: 'SET_WEBSERIES',
          dedupeKey: `SET_WEBSERIES_${seriesData.id}`,
          payload: { id: seriesData.id, userId: targetUserId, ...seriesData },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_WEBSERIES',
        dedupeKey: `SET_WEBSERIES_${seriesData.id}`,
        payload: { id: seriesData.id, userId: targetUserId, ...seriesData },
      });
    }
  };

  const handleSaveWebseriesEdit = async (updatedSeries) => {
    upsertLocalWebseries(updatedSeries);
    setWebseriesList(prev => prev.map(w => w.id === updatedSeries.id ? updatedSeries : w));

    const targetUserId = getUserId();
    if (!isOffline && db && targetUserId) {
      try {
        const wsDocRef = doc(db, 'users', targetUserId, 'webseries', updatedSeries.id);
        await setDoc(wsDocRef, updatedSeries, { merge: true });
      } catch (err) {
        console.warn('Firestore update webseries error, fallback to dirty queue:', err);
        addToDirtyQueue({
          type: 'SET_WEBSERIES',
          dedupeKey: `SET_WEBSERIES_${updatedSeries.id}`,
          payload: { id: updatedSeries.id, userId: targetUserId, ...updatedSeries },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_WEBSERIES',
        dedupeKey: `SET_WEBSERIES_${updatedSeries.id}`,
        payload: { id: updatedSeries.id, userId: targetUserId, ...updatedSeries },
      });
    }
  };

  const handleDeleteWebseries = async (webseriesItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm(`Are you sure you want to stop tracking "${webseriesItem.title}"?`)) return;
    try {
      const wsId = webseriesItem.id;
      const targetUserId = webseriesItem.userId || currentUser?.uid || getUserId();
      deleteLocalWebseries(wsId);
      setWebseriesList(prev => prev.filter(w => w.id !== wsId));
      if (!isOffline && db && targetUserId) {
        await deleteDoc(doc(db, 'users', targetUserId, 'webseries', wsId));
      } else {
        addToDirtyQueue({
          type: 'DELETE_WEBSERIES',
          dedupeKey: `DELETE_WEBSERIES_${wsId}`,
          payload: { id: wsId, userId: targetUserId }
        });
      }
    } catch (err) {
      console.error('Delete webseries error:', err);
    }
  };

  const handleToggleWebseriesWatched = async (webseriesItem, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    try {
      const isCurrentlyWatched = Boolean(webseriesItem.watched || webseriesItem.isWatched || webseriesItem.watchStatus === 'Completed' || (webseriesItem.progressPercent && webseriesItem.progressPercent >= 100));
      const shouldComplete = !isCurrentlyWatched;
      const wsId = webseriesItem.id;
      const targetUserId = webseriesItem.userId || currentUser?.uid || getUserId();

      const updatedWebseries = {
        ...webseriesItem,
        watched: shouldComplete,
        isWatched: shouldComplete,
        watchStatus: shouldComplete ? 'Completed' : 'Watching',
        progressPercent: shouldComplete ? 100 : 0,
        updatedAt: new Date().toISOString(),
      };

      upsertLocalWebseries(updatedWebseries);
      setWebseriesList(prev => prev.map(w => w.id === wsId ? updatedWebseries : w));

      if (!isOffline && db && targetUserId) {
        const wsDocRef = doc(db, 'users', targetUserId, 'webseries', wsId);
        await setDoc(wsDocRef, updatedWebseries, { merge: true });
      } else {
        addToDirtyQueue({
          type: 'SET_WEBSERIES',
          dedupeKey: `SET_WEBSERIES_${wsId}`,
          payload: { id: wsId, userId: targetUserId, ...updatedWebseries },
        });
      }
    } catch (err) {
      console.error('Toggle webseries watched error:', err);
    }
  };

  const handleToggleWatchlistStatus = async (item) => {
    try {
      const isCompleted = item.status === 'Completed';
      const newStatus = isCompleted ? 'Plan to Watch' : 'Completed';
      const updated = {
        ...item,
        status: newStatus,
        completed: !isCompleted,
        updatedAt: new Date().toISOString()
      };
      upsertLocalWatchlist(updated);
      setWatchlist(prev => prev.map(w => w.id === item.id ? updated : w));
      const uid = currentUser?.uid || getUserId();
      if (!isOffline && db && uid) {
        await setDoc(doc(db, 'users', uid, 'watchlist', item.id), updated, { merge: true });
      }
    } catch (err) {
      console.error('Toggle watchlist status error:', err);
    }
  };

  const handleSaveWatchlistEdit = async (updatedItem) => {
    setWatchlist(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    upsertLocalWatchlist(updatedItem);
    const uid = currentUser?.uid || getUserId();
    if (!isOffline && db && uid) {
      try {
        await setDoc(doc(db, 'users', uid, 'watchlist', updatedItem.id), updatedItem, { merge: true });
      } catch (err) {
        console.warn('Dashboard save watchlist edit error:', err);
      }
    }
  };

  const handleDeleteWatchlist = async (item, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    if (!confirm(`Are you sure you want to remove "${item.title}" from your watchlist?`)) return;
    try {
      const itemId = item.id;
      const targetUserId = currentUser?.uid || getUserId();
      deleteLocalWatchlist(itemId);
      setWatchlist(prev => prev.filter(i => i.id !== itemId));
      if (!isOffline && db && targetUserId) {
        await deleteDoc(doc(db, 'users', targetUserId, 'watchlist', itemId));
      }
    } catch (err) {
      console.error('Delete watchlist error:', err);
    }
  };

  const scrollMovie = (direction) => {
    if (activePreview) setActivePreview(null);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (movieScrollRef.current) {
      const { scrollLeft, clientWidth } = movieScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      movieScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollContinue = (direction) => {
    if (activePreview) setActivePreview(null);
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    if (continueScrollRef.current) {
      const { scrollLeft, clientWidth } = continueScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      continueScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
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
        if (data.anime.bannerUrl && !banners.some(b => b.url === data.anime.bannerUrl)) {
          banners.unshift({ url: data.anime.bannerUrl, source: 'AniList' });
        }
        const logos = [...(imgs.logos || [])];
        if (data.anime.logoUrl && !logos.some(l => l.url === data.anime.logoUrl)) {
          logos.unshift({ url: data.anime.logoUrl, source: 'Fanart.tv' });
        }
        const covers = [...(imgs.covers || [])];
        if (data.anime.coverUrl && !covers.some(c => c.url === data.anime.coverUrl)) {
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
      rawGenres = anime.genres.split(',').map(g => g.trim());
    }
    const validGenres = rawGenres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    setEditGenres(validGenres);

    setEditCoverUrl(anime.thumbnailBase64 || anime.thumbnailPath || '');
    setEditBannerUrl(anime.bannerUrl || anime.backdropUrl || '');
    setEditLogoUrl(anime.logoUrl || '');
    setEnableEditAnimeLogo(Boolean(anime.logoUrl));
    setEditArtworkSearchQuery(initialTitle);
    setEditAnimeImages({ covers: [], banners: [], logos: [] });

    if (initialTitle) {
      fetchEditAnimeArtwork(initialTitle);
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
    setEditTotalSeasons('1');
    setEditTotalEpisodes('');
    setEditBannerUrl('');
    setEditLogoUrl('');
    setEnableEditAnimeLogo(false);
    setEditAnimeImages({ covers: [], banners: [], logos: [] });
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

  // Tracked anime prioritized by recently watched first, then latest added (Max 10 for horizontal slider)
  const sortedTrackedAnimes = useMemo(() => {
    return [...animes]
      .filter((anime) => {
        if (!anime) return false;
        if (selectedGenre !== 'All') {
          let genres = [];
          if (Array.isArray(anime.genres)) {
            genres = anime.genres;
          } else if (typeof anime.genres === 'string' && anime.genres.trim()) {
            genres = anime.genres.split(',').map((g) => g.trim());
          }
          if (!genres.includes(selectedGenre)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aWatch = new Date(a.lastOpenedAt || a.lastWatchedAt || 0).getTime();
        const bWatch = new Date(b.lastOpenedAt || b.lastWatchedAt || 0).getTime();
        if (aWatch > 0 && bWatch > 0) return bWatch - aWatch;
        if (aWatch > 0 && bWatch <= 0) return -1;
        if (bWatch > 0 && aWatch <= 0) return 1;

        const timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
        const timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
        return timeB - timeA;
      });
  }, [animes, selectedGenre]);

  const topTrackedAnimes = useMemo(() => {
    return sortedTrackedAnimes.slice(0, 10);
  }, [sortedTrackedAnimes]);

  // Continue Watching, Reading & Listening items (user's active tracked anime, manga & audio)
  const continueWatchingList = useMemo(() => {
    const activeAnimes = (animes || [])
      .filter(a => {
        const pct = getAnimeProgressPercent(a);
        return pct > 0 && pct < 100;
      })
      .map(a => ({
        ...a,
        mediaType: 'anime',
        progressPct: getAnimeProgressPercent(a),
        lastActivity: new Date(a.lastOpenedAt || a.updatedAt || a.createdAt || 0).getTime(),
      }));

    const activeMangas = (mangas || [])
      .filter(m => {
        const pct = Number(m.progressPercent || 0);
        const isCompleted = Boolean(m.isWatched || m.isCompleted || pct === 100);
        if (isCompleted) return false;
        return (pct > 0 && pct < 100) || m.status === 'reading' || (m.completedChapters > 0);
      })
      .map(m => {
        const pct = Number(m.progressPercent || 0);
        return {
          ...m,
          mediaType: 'manga',
          progressPct: pct,
          lastActivity: new Date(m.lastOpenedAt || m.updatedAt || m.createdAt || 0).getTime(),
        };
      });

    const activeAudioStories = (audioStories || [])
      .filter(a => {
        const pct = Number(a.progressPercent || 0);
        const isCompleted = Boolean(a.isWatched || a.isCompleted || pct === 100);
        if (isCompleted) return false;
        // Include if there is ANY indicator of listening activity
        return (
          (pct > 0 && pct < 100) ||
          a.status === 'listening' ||
          Number(a.completedTracks || 0) > 0 ||
          Number(a.lastPositionSeconds || 0) > 0 ||
          Boolean(a.lastWatchedTrack) ||
          Boolean(a.lastOpenedAt) ||
          Boolean(a.lastPlayedTrackId)
        );
      })
      .map(a => {
        const pct = Number(a.progressPercent || 0);
        return {
          ...a,
          mediaType: 'audioStory',
          progressPct: pct,
          lastActivity: new Date(a.lastOpenedAt || a.updatedAt || a.createdAt || 0).getTime(),
        };
      });

    const activeMovies = (movies || [])
      .filter(m => {
        const pct = Number(m.watchProgress || 0);
        const isCompleted = Boolean(m.watched || m.completed || m.watchStatus === 'Completed' || pct >= 95);
        if (isCompleted) return false;
        return (pct > 0 && pct < 95) || m.watchStatus === 'Watching' || Number(m.currentTime || 0) > 0;
      })
      .map(m => {
        const pct = Number(m.watchProgress || 0);
        return {
          ...m,
          mediaType: 'movie',
          progressPct: pct,
          lastActivity: new Date(m.lastWatchedAt || m.lastOpenedAt || m.updatedAt || m.addedAt || 0).getTime(),
        };
      });

    const activeWebseries = (webseriesList || [])
      .filter(w => {
        const pct = Number(w.progressPercent || 0);
        const isCompleted = Boolean(w.watched || w.isWatched || w.watchStatus === 'Completed' || pct >= 100);
        if (isCompleted) return false;
        return (pct > 0 && pct < 100) || w.watchStatus === 'Watching' || Boolean(w.lastWatchedAt) || Boolean(w.lastWatchedEpisode);
      })
      .map(w => {
        const pct = Number(w.progressPercent || 0);
        return {
          ...w,
          mediaType: 'webseries',
          progressPct: pct,
          lastActivity: new Date(w.lastWatchedAt || w.lastOpenedAt || w.updatedAt || w.addedAt || w.createdAt || 0).getTime(),
        };
      });

    return [...activeAnimes, ...activeMangas, ...activeAudioStories, ...activeMovies, ...activeWebseries]
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 25);
  }, [animes, mangas, audioStories, movies, webseriesList]);

  // ── Manga List (Filtered by search & sorted new to old) ──────────────────────
  const sortedMangas = useMemo(() => {
    return mangas
      .filter((m) => {
        if (!search || !search.trim()) return true;
        return (m?.title || '').toLowerCase().includes(search.trim().toLowerCase());
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [mangas, search]);

  // ── Audio Stories List (Filtered by search & sorted new to old) ──────────────
  const sortedAudioStories = useMemo(() => {
    return audioStories
      .filter((a) => {
        if (!search || !search.trim()) return true;
        return (a?.title || '').toLowerCase().includes(search.trim().toLowerCase());
      })
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [audioStories, search]);

  // ── Movies List (Filtered by search, genre & status; recently watched first priority, then latest added) ──────
  const sortedMovies = useMemo(() => {
    return (movies || [])
      .filter((m) => {
        const q = (search || '').toLowerCase().trim();
        const matchSearch = !q || (m?.title || '').toLowerCase().includes(q) || (m?.originalTitle || '').toLowerCase().includes(q);
        const matchGenre = selectedGenre === 'All' || (Array.isArray(m?.genres) && m.genres.some(g => (typeof g === 'string' ? g : g?.name || '').toLowerCase() === selectedGenre.toLowerCase()));
        const isWatched = Boolean(m.watched || m.completed || m.watchStatus === 'Completed' || (m.watchProgress && m.watchProgress >= 95));
        const matchFilter = filterBy === 'all' || (filterBy === 'completed' ? isWatched : !isWatched);
        return matchSearch && matchGenre && matchFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'alpha') return (a.title || '').localeCompare(b.title || '');
        if (sortBy === 'progress') return (b.watchProgress || 0) - (a.watchProgress || 0);

        // Priority 1: Recently watched movies first
        const aWatch = new Date(a.lastWatchedAt || a.lastOpenedAt || ((a.currentTime > 0 || a.watchProgress > 0) ? (a.updatedAt || 0) : 0)).getTime();
        const bWatch = new Date(b.lastWatchedAt || b.lastOpenedAt || ((b.currentTime > 0 || b.watchProgress > 0) ? (b.updatedAt || 0) : 0)).getTime();

        if (aWatch > 0 && bWatch > 0) {
          return bWatch - aWatch;
        }
        if (aWatch > 0 && bWatch <= 0) {
          return -1;
        }
        if (bWatch > 0 && aWatch <= 0) {
          return 1;
        }

        // Priority 2: Latest added movies
        const aAdded = new Date(a.addedAt || a.createdAt || a.updatedAt || 0).getTime();
        const bAdded = new Date(b.addedAt || b.createdAt || b.updatedAt || 0).getTime();
        return bAdded - aAdded;
      });
  }, [movies, search, selectedGenre, filterBy, sortBy]);

  // ── Webseries List (Filtered by search, genre & status; recently watched first priority, then latest added) ──────
  const sortedWebseries = useMemo(() => {
    return (webseriesList || [])
      .filter((w) => {
        const q = (search || '').toLowerCase().trim();
        const matchSearch = !q || (w?.title || '').toLowerCase().includes(q) || (w?.originalTitle || '').toLowerCase().includes(q);
        const matchGenre = selectedGenre === 'All' || (Array.isArray(w?.genres) && w.genres.some(g => (typeof g === 'string' ? g : g?.name || '').toLowerCase() === selectedGenre.toLowerCase()));
        const isWatched = Boolean(w.watched || w.isWatched || w.watchStatus === 'Completed' || (w.progressPercent && w.progressPercent >= 100));
        const matchFilter = filterBy === 'all' || (filterBy === 'completed' ? isWatched : !isWatched);
        return matchSearch && matchGenre && matchFilter;
      })
      .sort((a, b) => {
        if (sortBy === 'alpha') return (a.title || '').localeCompare(b.title || '');
        if (sortBy === 'progress') return (b.progressPercent || b.watchProgress || 0) - (a.progressPercent || a.watchProgress || 0);

        // Priority 1: Recently watched/opened
        const aWatch = new Date(wLastActivity(a)).getTime();
        const bWatch = new Date(wLastActivity(b)).getTime();

        function wLastActivity(item) {
          return item.lastWatchedAt || item.lastOpenedAt || ((item.currentTime > 0 || item.progressPercent > 0) ? (item.updatedAt || 0) : 0);
        }

        if (aWatch > 0 && bWatch > 0) return bWatch - aWatch;
        if (aWatch > 0 && bWatch <= 0) return -1;
        if (bWatch > 0 && aWatch <= 0) return 1;

        // Priority 2: Latest added
        const aAdded = new Date(a.addedAt || a.createdAt || a.updatedAt || 0).getTime();
        const bAdded = new Date(b.addedAt || b.createdAt || b.updatedAt || 0).getTime();
        return bAdded - aAdded;
      });
  }, [webseriesList, search, selectedGenre, filterBy, sortBy]);

  // ── Watchlist List (Filtered by search & sorted new to old) ──────────────────
  const sortedWatchlist = useMemo(() => {
    return (watchlist || [])
      .filter((w) => {
        if (!search || !search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (w?.title || '').toLowerCase().includes(q) || (w?.originalTitle || '').toLowerCase().includes(q);
      })
      .sort((a, b) => new Date(b.addedAt || b.createdAt || b.updatedAt || 0) - new Date(a.addedAt || a.createdAt || a.updatedAt || 0));
  }, [watchlist, search]);

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

  const genresScrollRef = useRef(null);

  const scrollRecentlyUpdated = (direction) => {
    if (recentlyUpdatedRef.current) {
      const { scrollLeft, clientWidth } = recentlyUpdatedRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      recentlyUpdatedRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollManga = (direction) => {
    if (mangaScrollRef.current) {
      const { scrollLeft, clientWidth } = mangaScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      mangaScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollAudioStory = (direction) => {
    if (audioStoryScrollRef.current) {
      const { scrollLeft, clientWidth } = audioStoryScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      audioStoryScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollAnime = (direction) => {
    if (animeScrollRef.current) {
      const { scrollLeft, clientWidth } = animeScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      animeScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollGenres = (direction) => {
    if (genresScrollRef.current) {
      const { scrollLeft, clientWidth } = genresScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      genresScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const handleSectionJump = (sectionId) => {
    if (typeof window === 'undefined') return;
    try {
      window.history.pushState(null, '', `#${sectionId}`);
    } catch (e) {}

    const targetElement = document.getElementById(sectionId) ||
      (sectionId === 'watchlist' ? document.getElementById('watchlist') : null) ||
      (sectionId === 'manga' ? document.getElementById('manga-webtoons') : null) ||
      (sectionId === 'audios' ? document.getElementById('audio-stories') : null) ||
      (sectionId === 'anime' ? document.getElementById('catalog') : null);

    if (targetElement) {
      const headerOffset = 80;
      const elementPosition = targetElement.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const initialHash = window.location.hash.replace('#', '');
    if (['anime', 'movies', 'watchlist', 'manga', 'audios', 'manga-webtoons', 'audio-stories', 'catalog'].includes(initialHash)) {
      setTimeout(() => {
        handleSectionJump(initialHash);
      }, 400);
    }
    const handleHash = () => {
      const h = window.location.hash.replace('#', '');
      if (h) handleSectionJump(h);
    };
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, []);

  const currentHero = heroSlides[currentSlide] || heroSlides[0];
  const isHeroLoading = loading && loadingMovies && loadingWebseries && loadingManga;
  const isContinueLoading = loading && loadingMovies && loadingWebseries && loadingManga && loadingAudioStories;

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col selection:bg-[#7c5cff] selection:text-white">

      {/* 1. TOP NAVBAR */}
      <DashboardNavbar
        isScrolled={isScrolled}
        search={search}
        setSearch={setSearch}
        autocompleteMatches={autocompleteMatches}
        autocompleteMangaMatches={autocompleteMangaMatches}
        autocompleteAudioStoryMatches={autocompleteAudioStoryMatches}
        autocompleteMovieMatches={autocompleteMovieMatches}
        autocompleteWebseriesMatches={autocompleteWebseriesMatches}
        autocompleteWatchlistMatches={autocompleteWatchlistMatches}
        isOffline={isOffline}
        isManualOffline={isManualOffline}
        setManualOffline={setManualOffline}
        showActionModal={showActionModal}
        setShowActionModal={setShowActionModal}
        quickActionsOpen={quickActionsOpen}
        setQuickActionsOpen={setQuickActionsOpen}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        onSelectAnime={onSelectAnime}
        setShowAddModal={setShowAddModal}
        setShowAddMangaModal={setShowAddMangaModal}
        setShowAddAudioStoryModal={setShowAddAudioStoryModal}
        setShowAddMovieModal={setShowAddMovieModal}
        setShowAddWebseriesModal={setShowAddWebseriesModal}
        setShowAddWatchlistModal={setShowAddWatchlistModal}
        setShowSettings={setShowSettings}
      />

      {/* 2. MOBILE MENU & QUICK ACTIONS */}
      <DashboardMobileMenu
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        search={search}
        setSearch={setSearch}
        autocompleteMatches={autocompleteMatches}
        autocompleteMangaMatches={autocompleteMangaMatches}
        autocompleteAudioStoryMatches={autocompleteAudioStoryMatches}
        autocompleteMovieMatches={autocompleteMovieMatches}
        autocompleteWebseriesMatches={autocompleteWebseriesMatches}
        autocompleteWatchlistMatches={autocompleteWatchlistMatches}
        onSelectAnime={onSelectAnime}
        sortBy={sortBy}
        setSortBy={setSortBy}
        filterBy={filterBy}
        setFilterBy={setFilterBy}
        selectedGenre={selectedGenre}
        setSelectedGenre={setSelectedGenre}
        handleSectionJump={handleSectionJump}
        setShowAddModal={setShowAddModal}
        setShowAddMangaModal={setShowAddMangaModal}
        setShowAddAudioStoryModal={setShowAddAudioStoryModal}
        setShowAddMovieModal={setShowAddMovieModal}
        setShowAddWebseriesModal={setShowAddWebseriesModal}
        setShowSettings={setShowSettings}
        isOffline={isOffline}
        isSyncing={isSyncing}
      />

      {/* 3. HERO SPOTLIGHT BANNER */}
      <DashboardHero
        heroSlides={heroSlides}
        currentSlide={currentSlide}
        setCurrentSlide={setCurrentSlide}
        slideDirection={slideDirection}
        setSlideDirection={setSlideDirection}
        currentHero={currentHero}
        animesCount={animes.length}
        onSelectAnime={onSelectAnime}
        setShowAddModal={setShowAddModal}
        isLoading={isHeroLoading && heroSlides.length === 0}
      />

      {/* MAIN BODY LAYOUT */}
      <main className="relative flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-7 md:space-y-8">
        {/* Category Jump Cards */}
        <MediaCategoriesBar
          animesCount={animes.length}
          moviesCount={movies.length}
          webseriesCount={webseriesList.length}
          mangasCount={mangas.length}
          audioStoriesCount={audioStories.length}
          watchlistCount={watchlist.length}
          onSectionJump={handleSectionJump}
        />

        {/* Continue Watching */}
        <ContinueWatchingSection
          continueWatchingList={continueWatchingList}
          isLoading={isContinueLoading}
          onSelectAnime={onSelectAnime}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Movies */}
        <MoviesSection
          sortedMovies={sortedMovies}
          moviesCount={movies.length}
          loadingMovies={loadingMovies}
          setShowAddMovieModal={setShowAddMovieModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Anime */}
        <AnimeSection
          topTrackedAnimes={topTrackedAnimes}
          animesCount={animes.length}
          loading={loading}
          isOffline={isOffline}
          onSelectAnime={onSelectAnime}
          setShowAddModal={setShowAddModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Webseries */}
        <WebseriesSection
          sortedWebseries={sortedWebseries}
          webseriesCount={webseriesList.length}
          loadingWebseries={loadingWebseries}
          setShowAddWebseriesModal={setShowAddWebseriesModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Manga */}
        <MangaSection
          sortedMangas={sortedMangas}
          loadingManga={loadingManga}
          setShowAddMangaModal={setShowAddMangaModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Audio Stories */}
        <AudioStoriesSection
          sortedAudioStories={sortedAudioStories}
          loadingAudioStories={loadingAudioStories}
          setShowAddAudioStoryModal={setShowAddAudioStoryModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Watchlist */}
        <WatchlistSection
          sortedWatchlist={sortedWatchlist}
          watchlistCount={watchlist.length}
          loadingWatchlist={loadingWatchlist}
          setShowAddWatchlistModal={setShowAddWatchlistModal}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Recently Updated */}
        <RecentlyUpdatedSection
          recentlyUpdated={recentlyUpdated}
          onSelectAnime={onSelectAnime}
          handleCardMouseEnter={handleCardMouseEnter}
          handleCardMouseLeave={handleCardMouseLeave}
          activeMobileMenu={activeMobileMenu}
          setActiveMobileMenu={setActiveMobileMenu}
        />

        {/* Top Rated Masterpieces */}
        <TopRatedMasterpiecesSection
          topRatedWithLibrary={topRatedWithLibrary}
          onSelectAnime={onSelectAnime}
          handleAddAnimeToLibrary={handleAddAnimeToLibrary}
        />

        {/* Genres */}
        <GenresSection
          selectedGenre={selectedGenre}
          setSelectedGenre={setSelectedGenre}
        />

        {/* Top Rated Online */}
        <TopRatedOnlineSection
          lazyTopRatedRef={lazyTopRatedRef}
          scrollTopRated={scrollTopRated}
          hasScrolledToTopRated={hasScrolledToTopRated}
          loadingTopRated={loadingTopRated}
          topRatedWithLibrary={topRatedWithLibrary}
          topRatedScrollRef={topRatedScrollRef}
          handleTopRatedMouseDown={handleTopRatedMouseDown}
          handleTopRatedMouseMove={handleTopRatedMouseMove}
          handleTopRatedMouseUp={handleTopRatedMouseUp}
          handleTopRatedMouseLeave={handleTopRatedMouseLeave}
          topRatedHasDragged={topRatedHasDragged}
          onSelectAnime={onSelectAnime}
          handleAddAnimeToLibrary={handleAddAnimeToLibrary}
          handleOpenExternalAnime={handleOpenExternalAnime}
          handleOpenMalSearch={handleOpenMalSearch}
        />
      </main>

      {/* Footer */}
      <DashboardFooter
        setShowSettings={setShowSettings}
        setShowAddModal={setShowAddModal}
      />

      {/* Desktop Card Hover Preview Modal */}
      <MediaPreviewModal
        isOpen={Boolean(activePreview)}
        item={activePreview?.item}
        type={activePreview?.type}
        cardRect={activePreview?.rect}
        onClose={() => setActivePreview(null)}
        onMouseEnter={handleModalMouseEnter}
        onMouseLeave={handleModalMouseLeave}
        onOpenDetails={(item) => {
          setActivePreview(null);
          if (activePreview?.type === 'movie') {
            router.push(`/movies/${item.id}`);
          } else if (activePreview?.type === 'webseries') {
            router.push(`/webseries/${item.id}`);
          } else if (activePreview?.type === 'anime') {
            onSelectAnime(item.id);
          } else if (activePreview?.type === 'manga') {
            router.push(`/manga/${item.id}`);
          } else if (activePreview?.type === 'audioStory') {
            router.push(`/audio-story/${item.id}`);
          } else {
            router.push(`/watchlist/${item.id}`);
          }
        }}
        onAskComplete={(item) => {
          if (activePreview?.type === 'movie') {
            setMovieCompleteConfirm(item);
          } else if (activePreview?.type === 'webseries') {
            setWebseriesCompleteConfirm(item);
          } else if (activePreview?.type === 'anime') {
            handleToggleAnimeComplete(item);
          } else if (activePreview?.type === 'manga') {
            setMangaCompleteConfirm(item);
          } else if (activePreview?.type === 'audioStory') {
            setAudioStoryCompleteConfirm(item);
          } else {
            setWatchlistCompleteConfirm(item);
          }
        }}
        onEdit={(item) => {
          setActivePreview(null);
          if (activePreview?.type === 'movie') {
            setMovieEditing(item);
          } else if (activePreview?.type === 'webseries') {
            setWebseriesEditing(item);
          } else if (activePreview?.type === 'anime') {
            handleOpenEditModal(item);
          } else {
            setEditingWatchlistItem(item);
          }
        }}
        onDelete={(item) => {
          setActivePreview(null);
          if (activePreview?.type === 'movie') {
            handleDeleteMovie(item);
          } else if (activePreview?.type === 'webseries') {
            handleDeleteWebseries(item);
          } else if (activePreview?.type === 'anime') {
            handleDeleteAnime(item);
          } else if (activePreview?.type === 'manga') {
            handleDeleteManga(item);
          } else if (activePreview?.type === 'audioStory') {
            handleDeleteAudioStory(item);
          } else {
            handleDeleteWatchlist(item);
          }
        }}
        onTransfer={(item) => {
          setActivePreview(null);
          setTransferringWatchlistItem(item);
        }}
      />

      {/* Add Anime Modal */}
      <AddAnimeModal
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        addModalTab={addModalTab}
        setAddModalTab={setAddModalTab}
        handleAddAnime={handleAddAnime}
        animeSearchQuery={animeSearchQuery}
        setAnimeSearchQuery={setAnimeSearchQuery}
        handleSearchAnimeOnline={handleSearchAnimeOnline}
        animeSearching={animeSearching}
        animeFetchingDetails={animeFetchingDetails}
        animeSearchError={animeSearchError}
        selectedAnimeOnline={selectedAnimeOnline}
        setSelectedAnimeOnline={setSelectedAnimeOnline}
        animeSearchResults={animeSearchResults}
        handleSelectAnimeOnline={handleSelectAnimeOnline}
        folderPath={folderPath}
        setFolderPath={setFolderPath}
        handleBrowseFolder={handleBrowseFolder}
        handleScan={handleScan}
        scanResult={scanResult}
        parsedEpsCount={parsedEpsCount}
        namingPattern={namingPattern}
        setNamingPattern={setNamingPattern}
        animeTitle={animeTitle}
        setAnimeTitle={setAnimeTitle}
        animeRomajiTitle={animeRomajiTitle}
        setAnimeRomajiTitle={setAnimeRomajiTitle}
        addTotalSeasons={addTotalSeasons}
        setAddTotalSeasons={setAddTotalSeasons}
        addTotalEpisodes={addTotalEpisodes}
        setAddTotalEpisodes={setAddTotalEpisodes}
        animeYear={animeYear}
        setAnimeYear={setAnimeYear}
        animeOverview={animeOverview}
        setAnimeOverview={setAnimeOverview}
        showOnlineSearchAdd={showOnlineSearchAdd}
        setShowOnlineSearchAdd={setShowOnlineSearchAdd}
        handleAnimeCoverUpload={handleAnimeCoverUpload}
        coverUrl={coverUrl}
        setCoverUrl={setCoverUrl}
        animeImages={animeImages}
        handleAnimeBannerUpload={handleAnimeBannerUpload}
        animeBannerUrl={animeBannerUrl}
        setAnimeBannerUrl={setAnimeBannerUrl}
        enableAnimeLogo={enableAnimeLogo}
        setEnableAnimeLogo={setEnableAnimeLogo}
        handleAnimeLogoUpload={handleAnimeLogoUpload}
        animeLogoUrl={animeLogoUrl}
        setAnimeLogoUrl={setAnimeLogoUrl}
        addGenres={addGenres}
        setAddGenres={setAddGenres}
        setAlertMessage={setAlertMessage}
        scanning={scanning}
        ytPlaylistUrl={ytPlaylistUrl}
        setYtPlaylistUrl={setYtPlaylistUrl}
        handleFetchYouTubePlaylist={handleFetchYouTubePlaylist}
        ytFetching={ytFetching}
        ytError={ytError}
        ytPlaylistData={ytPlaylistData}
        ytQualitiesFetching={ytQualitiesFetching}
        ytSelectedQuality={ytSelectedQuality}
        setYtSelectedQuality={setYtSelectedQuality}
        ytAvailableQualities={ytAvailableQualities}
        fetchYouTubeQualities={fetchYouTubeQualities}
        ytSelectedVideoIds={ytSelectedVideoIds}
        toggleSelectAllYt={toggleSelectAllYt}
        toggleVideoSelection={toggleVideoSelection}
        handleImportYouTubePlaylist={handleImportYouTubePlaylist}
      />

      {/* Edit Anime Modal */}
      <EditAnimeModal
        editingAnime={editingAnime}
        setEditingAnime={setEditingAnime}
        handleSaveEdit={handleSaveEdit}
        editTitle={editTitle}
        setEditTitle={setEditTitle}
        editTotalSeasons={editTotalSeasons}
        setEditTotalSeasons={setEditTotalSeasons}
        editTotalEpisodes={editTotalEpisodes}
        setEditTotalEpisodes={setEditTotalEpisodes}
        editGenres={editGenres}
        setEditGenres={setEditGenres}
        setAlertMessage={setAlertMessage}
        showOnlineSearchEdit={showOnlineSearchEdit}
        setShowOnlineSearchEdit={setShowOnlineSearchEdit}
        handleEditCoverUpload={handleEditCoverUpload}
        handleEditCoverBrowse={handleEditCoverBrowse}
        editCoverUrl={editCoverUrl}
        setEditCoverUrl={setEditCoverUrl}
        uploadingEditCover={uploadingEditCover}
        uploadToImgBB={uploadToImgBB}
        searchingEditArtwork={searchingEditArtwork}
        editArtworkSearchQuery={editArtworkSearchQuery}
        setEditArtworkSearchQuery={setEditArtworkSearchQuery}
        fetchEditAnimeArtwork={fetchEditAnimeArtwork}
        handleEditBannerUpload={handleEditBannerUpload}
        handleEditBannerBrowse={handleEditBannerBrowse}
        editBannerUrl={editBannerUrl}
        setEditBannerUrl={setEditBannerUrl}
        editAnimeImages={editAnimeImages}
        enableEditAnimeLogo={enableEditAnimeLogo}
        setEnableEditAnimeLogo={setEnableEditAnimeLogo}
        handleEditLogoUpload={handleEditLogoUpload}
        handleEditLogoBrowse={handleEditLogoBrowse}
        editLogoUrl={editLogoUrl}
        setEditLogoUrl={setEditLogoUrl}
      />

      {/* Add Manga Modal */}
      <AddMangaModal
        showAddMangaModal={showAddMangaModal}
        setShowAddMangaModal={setShowAddMangaModal}
        handleAddManga={handleAddManga}
        mangaSearchQuery={mangaSearchQuery}
        setMangaSearchQuery={setMangaSearchQuery}
        handleSearchMangaOnline={handleSearchMangaOnline}
        mangaSearching={mangaSearching}
        mangaFetchingDetails={mangaFetchingDetails}
        mangaSearchError={mangaSearchError}
        selectedMangaOnline={selectedMangaOnline}
        setSelectedMangaOnline={setSelectedMangaOnline}
        mangaSearchResults={mangaSearchResults}
        handleSelectMangaOnline={handleSelectMangaOnline}
        mangaFolderPath={mangaFolderPath}
        setMangaFolderPath={setMangaFolderPath}
        handleBrowseMangaFolder={handleBrowseMangaFolder}
        handleScanManga={handleScanManga}
        mangaScanning={mangaScanning}
        mangaScanResult={mangaScanResult}
        mangaTitle={mangaTitle}
        setMangaTitle={setMangaTitle}
        mangaRomajiTitle={mangaRomajiTitle}
        setMangaRomajiTitle={setMangaRomajiTitle}
        mangaTotalVolumes={mangaTotalVolumes}
        setMangaTotalVolumes={setMangaTotalVolumes}
        mangaTotalChapters={mangaTotalChapters}
        setMangaTotalChapters={setMangaTotalChapters}
        mangaYear={mangaYear}
        setMangaYear={setMangaYear}
        mangaDescription={mangaDescription}
        setMangaDescription={setMangaDescription}
        showMangaCoverSearch={showMangaCoverSearch}
        setShowMangaCoverSearch={setShowMangaCoverSearch}
        handleMangaCoverUpload={handleMangaCoverUpload}
        mangaCoverUrl={mangaCoverUrl}
        setMangaCoverUrl={setMangaCoverUrl}
        mangaImages={mangaImages}
        handleMangaBannerUpload={handleMangaBannerUpload}
        mangaBannerUrl={mangaBannerUrl}
        setMangaBannerUrl={setMangaBannerUrl}
        enableMangaLogo={enableMangaLogo}
        setEnableMangaLogo={setEnableMangaLogo}
        handleMangaLogoUpload={handleMangaLogoUpload}
        mangaLogoUrl={mangaLogoUrl}
        setMangaLogoUrl={setMangaLogoUrl}
        mangaGenres={mangaGenres}
        setMangaGenres={setMangaGenres}
        uploadToImgBB={uploadToImgBB}
      />

      {/* Add Audio Story Modal */}
      <AddAudioStoryModal
        showAddAudioStoryModal={showAddAudioStoryModal}
        setShowAddAudioStoryModal={setShowAddAudioStoryModal}
        handleAddAudioStory={handleAddAudioStory}
        audioStoryFolderPath={audioStoryFolderPath}
        setAudioStoryFolderPath={setAudioStoryFolderPath}
        handleBrowseAudioStoryFolder={handleBrowseAudioStoryFolder}
        handleScanAudioStory={handleScanAudioStory}
        audioStoryScanning={audioStoryScanning}
        audioStoryScanResult={audioStoryScanResult}
        audioStoryTitle={audioStoryTitle}
        setAudioStoryTitle={setAudioStoryTitle}
        handleFetchAudioStoryOnline={handleFetchAudioStoryOnline}
        fetchingAudioOnline={fetchingAudioOnline}
        audioStoryOnlineMessage={audioStoryOnlineMessage}
        audioStoryTotalTracks={audioStoryTotalTracks}
        setAudioStoryTotalTracks={setAudioStoryTotalTracks}
        audioStoryDescription={audioStoryDescription}
        setAudioStoryDescription={setAudioStoryDescription}
        showAudioCoverSearch={showAudioCoverSearch}
        setShowAudioCoverSearch={setShowAudioCoverSearch}
        handleNewAudioCoverUpload={handleNewAudioCoverUpload}
        handleAudioCoverBrowse={handleAudioCoverBrowse}
        audioStoryCoverUrl={audioStoryCoverUrl}
        setAudioStoryCoverUrl={setAudioStoryCoverUrl}
        audioStoryGenres={audioStoryGenres}
        setAudioStoryGenres={setAudioStoryGenres}
        uploadToImgBB={uploadToImgBB}
      />

      {/* Add/Edit Movie Modals */}
      <AddMovieModal
        isOpen={showAddMovieModal}
        onClose={() => setShowAddMovieModal(false)}
        onAddMovie={handleAddMovie}
        existingMovies={movies}
      />
      <EditMovieModal
        isOpen={Boolean(movieEditing)}
        movie={movieEditing}
        onClose={() => setMovieEditing(null)}
        onSaveMovie={handleSaveMovieEdit}
      />

      {/* Add/Edit Web-series Modals */}
      <AddWebseriesModal
        isOpen={showAddWebseriesModal}
        onClose={() => setShowAddWebseriesModal(false)}
        onAddWebseries={handleAddWebseries}
        existingSeries={webseriesList}
      />
      <EditWebseriesModal
        isOpen={Boolean(webseriesEditing)}
        series={webseriesEditing}
        onClose={() => setWebseriesEditing(null)}
        onSaveWebseries={handleSaveWebseriesEdit}
      />

      {/* Watchlist Modals */}
      <AddWatchlistModal
        isOpen={showAddWatchlistModal}
        onClose={() => setShowAddWatchlistModal(false)}
        onAddWatchlist={async (item) => {
          setWatchlist(prev => [item, ...prev.filter(i => i.id !== item.id)]);
          upsertLocalWatchlist(item);
          if (db) {
            const uid = currentUser?.uid || getUserId();
            if (uid) {
              try {
                await setDoc(doc(db, 'users', uid, 'watchlist', item.id), item, { merge: true });
              } catch (err) {
                console.warn('Dashboard save to watchlist error:', err);
              }
            }
          }
        }}
      />
      <EditWatchlistModal
        isOpen={Boolean(editingWatchlistItem)}
        onClose={() => setEditingWatchlistItem(null)}
        item={editingWatchlistItem}
        onSave={handleSaveWatchlistEdit}
      />
      <TransferWatchlistModal
        isOpen={Boolean(transferringWatchlistItem)}
        onClose={() => setTransferringWatchlistItem(null)}
        item={transferringWatchlistItem}
        onTransferred={(deletedId) => {
          setWatchlist(prev => prev.filter(i => i.id !== deletedId));
          setTransferringWatchlistItem(null);
          setWebseriesList(getLocalWebseries() || []);
          setMovies(getLocalMovies() || []);
          setAnimes(getLocalAnimes() || []);
          setMangas(getLocalMangas() || []);
          setAudioStories(getLocalAudioStories() || []);
        }}
      />

      {/* Confirmation Dialogs for Complete/Incomplete */}
      <MediaCompleteConfirmModal
        item={mangaCompleteConfirm}
        type="manga"
        onClose={() => setMangaCompleteConfirm(null)}
        onConfirm={(target) => {
          setMangaCompleteConfirm(null);
          handleToggleMangaComplete(target);
        }}
      />
      <MediaCompleteConfirmModal
        item={audioStoryCompleteConfirm}
        type="audioStory"
        onClose={() => setAudioStoryCompleteConfirm(null)}
        onConfirm={(target) => {
          setAudioStoryCompleteConfirm(null);
          handleToggleAudioStoryComplete(target);
        }}
      />
      <MediaCompleteConfirmModal
        item={movieCompleteConfirm}
        type="movie"
        onClose={() => setMovieCompleteConfirm(null)}
        onConfirm={(target) => {
          setMovieCompleteConfirm(null);
          handleToggleMovieWatched(target);
        }}
      />
      <MediaCompleteConfirmModal
        item={webseriesCompleteConfirm}
        type="webseries"
        onClose={() => setWebseriesCompleteConfirm(null)}
        onConfirm={(target) => {
          setWebseriesCompleteConfirm(null);
          handleToggleWebseriesWatched(target);
        }}
      />
      <MediaCompleteConfirmModal
        item={watchlistCompleteConfirm}
        type="watchlist"
        onClose={() => setWatchlistCompleteConfirm(null)}
        onConfirm={(target) => {
          setWatchlistCompleteConfirm(null);
          handleToggleWatchlistStatus(target);
        }}
      />

      {/* Settings Modal */}
      <SettingsModal
        showSettings={showSettings}
        setShowSettings={setShowSettings}
        handleSaveSettings={handleSaveSettings}
        customVlc={customVlc}
        setCustomVlc={setCustomVlc}
        defaultPlayer={defaultPlayer}
        setDefaultPlayer={setDefaultPlayer}
        exportFormat={exportFormat}
        setExportFormat={setExportFormat}
        handleExportData={handleExportData}
        exporting={exporting}
        isOffline={isOffline}
      />

      {/* Action Blocked Custom Alert Modal */}
      <CustomAlertModal
        alertMessage={alertMessage}
        onClose={() => setAlertMessage('')}
      />

      {/* Mobile 3-Dot Options Bottom Sheet */}
      <MobileMediaActionSheet
        activeMobileMenu={activeMobileMenu}
        onClose={() => setActiveMobileMenu(null)}
        router={router}
        onSelectAnime={onSelectAnime}
        handleOpenEditModal={handleOpenEditModal}
        handleDeleteAnime={handleDeleteAnime}
        handleDeleteMovie={handleDeleteMovie}
        handleDeleteWebseries={handleDeleteWebseries}
        handleDeleteManga={handleDeleteManga}
        handleDeleteAudioStory={handleDeleteAudioStory}
        handleDeleteWatchlist={handleDeleteWatchlist}
        handleToggleAnimeComplete={handleToggleAnimeComplete}
        setMovieCompleteConfirm={setMovieCompleteConfirm}
        setWebseriesCompleteConfirm={setWebseriesCompleteConfirm}
        setMangaCompleteConfirm={setMangaCompleteConfirm}
        setAudioStoryCompleteConfirm={setAudioStoryCompleteConfirm}
        setWatchlistCompleteConfirm={setWatchlistCompleteConfirm}
        setMovieEditing={setMovieEditing}
        setWebseriesEditing={setWebseriesEditing}
        setEditingWatchlistItem={setEditingWatchlistItem}
        setTransferringWatchlistItem={setTransferringWatchlistItem}
      />

    </div>
  );
}
