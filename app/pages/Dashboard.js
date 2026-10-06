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
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import {
  Plus, Search, Settings, FolderOpen, Loader2, Play,
  Trash2, SlidersHorizontal, FileVideo, CheckCircle2, ImagePlus,
  StickyNote, Download, Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight, ChevronDown,
  Star, Flame, TrendingUp, Clock, Sparkles, Film, Bookmark, Bell, Menu, X,
  Tv, Eye, ShieldCheck, Heart, User, Filter, Compass, Calendar, AlertTriangle,
  Youtube, Video, CheckSquare, Square, ExternalLink, Globe, Trophy, Award,
  BookOpen, HardDrive, Headphones, Music, Disc, Edit3, Check, Image as ImageIcon
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import AnimeCoverSearch from '../components/AnimeCoverSearch';
import MangaCoverSearch from '../components/MangaCoverSearch';
import AddMovieModal from '../components/AddMovieModal';
import EditMovieModal from '../components/EditMovieModal';
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
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z" fill="#FF0000" />
    <path d="M9.545 15.568V8.432L15.818 12l-6.273 3.568z" fill="#FFFFFF" />
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

const getHeroSlides = (animesList = [], mangasList = [], audioStoriesList = [], moviesList = []) => {
  const formattedAnimes = (animesList || []).map(anime => {
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
    const pct = getAnimeProgressPercent(anime);

    return {
      id: anime.id,
      mediaType: 'anime',
      isManga: false,
      isAudio: false,
      isMovie: false,
      title: (anime?.title || 'UNTITLED ANIME').toString().toUpperCase(),
      japaneseTitle: anime.japaneseTitle || 'LOCAL LIBRARY',
      logoUrl: anime.logoUrl || null,
      poster: anime.posterUrl || anime.coverUrl || anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || null,
      banner: anime.bannerUrl || anime.backdropUrl || anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(anime.id, anime.rating),
      episodes: epDisplay,
      totalSeasons: totalSeasons,
      totalEpisodes: totalEpisodes,
      year: anime.year || new Date(anime.createdAt || Date.now()).getFullYear().toString(),
      quality: anime.quality || '1080p HD',
      language: anime.language || 'SUB / DUB',
      studio: anime.studio || 'Tracked Folder',
      genres: validGenres.length > 0 ? validGenres : ['Anime'],
      description: anime.description || `Local tracked anime folder from path: ${anime.folderPath || ''}`,
      progressPercent: pct,
      inProgress: pct > 0 && pct < 100,
      lastActivity: new Date(anime.lastOpenedAt || anime.updatedAt || anime.createdAt || 0).getTime(),
    };
  });

  const formattedMangas = (mangasList || []).map(manga => {
    let genres = [];
    if (Array.isArray(manga.genres)) {
      genres = [...manga.genres];
    } else if (typeof manga.genres === 'string' && manga.genres.trim()) {
      genres = manga.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');

    const totalChapters = manga.totalChapters ? Number(manga.totalChapters) : (manga.chapterCount || 0);
    const completedChapters = manga.completedChapters || 0;
    let chDisplay = `${totalChapters} Chapters`;
    if (completedChapters > 0 && completedChapters !== totalChapters) {
      chDisplay = `${completedChapters}/${totalChapters} Ch.`;
    }
    const pct = Number(manga.progressPercent || 0);
    const inProgress = (pct > 0 && pct < 100) || manga.status === 'reading' || (completedChapters > 0 && !manga.isWatched);

    return {
      id: manga.id,
      mediaType: 'manga',
      isManga: true,
      isAudio: false,
      isMovie: false,
      title: (manga?.title || 'UNTITLED MANGA').toString().toUpperCase(),
      japaneseTitle: manga.japaneseTitle || 'LOCAL MANGA',
      logoUrl: manga.logoUrl || null,
      poster: manga.posterUrl || manga.coverUrl || manga.thumbnailBase64 || (manga.thumbnailPath ? `/api/image?path=${encodeURIComponent(manga.thumbnailPath)}` : null) || null,
      banner: manga.bannerUrl || manga.backdropUrl || manga.thumbnailBase64 || (manga.thumbnailPath ? `/api/image?path=${encodeURIComponent(manga.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(manga.id, manga.rating),
      episodes: chDisplay,
      totalSeasons: 0,
      totalEpisodes: totalChapters,
      year: manga.year || new Date(manga.createdAt || Date.now()).getFullYear().toString(),
      quality: 'Digital Manga',
      language: 'Reader PDF',
      studio: 'Manga Library',
      genres: validGenres.length > 0 ? validGenres : ['Manga', 'Comics'],
      description: manga.description || `Local tracked manga directory from path: ${manga.folderPath || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(manga.lastOpenedAt || manga.updatedAt || manga.createdAt || 0).getTime(),
    };
  });

  const formattedAudioStories = (audioStoriesList || []).map(story => {
    let genres = [];
    if (Array.isArray(story.genres)) {
      genres = [...story.genres];
    } else if (typeof story.genres === 'string' && story.genres.trim()) {
      genres = story.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    const totalTracks = story.totalTracks || story.trackCount || 0;
    const completedTracks = story.completedTracks || 0;
    const trackDisplay = completedTracks > 0
      ? `${completedTracks}/${totalTracks} Tracks`
      : `${totalTracks} Tracks`;
    const pct = Number(story.progressPercent || 0);
    const inProgress = (pct > 0 && pct < 100) || story.status === 'listening' || completedTracks > 0;

    return {
      id: story.id,
      mediaType: 'audioStory',
      isManga: false,
      isAudio: true,
      isMovie: false,
      title: (story?.title || 'UNTITLED AUDIO STORY').toString().toUpperCase(),
      japaneseTitle: story.japaneseTitle || 'LOCAL AUDIO STORY',
      logoUrl: story.logoUrl || null,
      banner: story.bannerUrl || story.backdropUrl || story.thumbnailBase64 || (story.thumbnailPath ? `/api/image?path=${encodeURIComponent(story.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(story.id, story.rating),
      episodes: trackDisplay,
      totalSeasons: 0,
      totalEpisodes: totalTracks,
      year: story.year || new Date(story.createdAt || Date.now()).getFullYear().toString(),
      quality: 'Audio Story',
      language: 'Local Audio',
      studio: story.studio || 'Audio Library',
      genres: validGenres.length > 0 ? validGenres : ['Audio Story'],
      description: story.description || story.synopsis || `Local tracked audio story from path: ${story.folderPath || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(story.lastOpenedAt || story.updatedAt || story.createdAt || 0).getTime(),
    };
  });

  const formattedMovies = (moviesList || []).map(movie => {
    let genres = [];
    if (Array.isArray(movie.genres)) {
      genres = [...movie.genres];
    } else if (typeof movie.genres === 'string' && movie.genres.trim()) {
      genres = movie.genres.split(',').map(g => g.trim());
    }
    const validGenres = genres.filter(g => GENRES_LIST.includes(g) && g !== 'All');
    const pct = Number(movie.watchProgress || 0);
    const inProgress = (pct > 0 && pct < 95) || movie.watchStatus === 'Watching';
    const runtimeStr = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : 'Feature Film';

    return {
      id: movie.id,
      mediaType: 'movie',
      isManga: false,
      isAudio: false,
      isMovie: true,
      title: (movie?.title || 'UNTITLED MOVIE').toString().toUpperCase(),
      logoUrl: movie.logoUrl || null,
      poster: movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null) || null,
      banner: movie.backdropUrl || movie.posterUrl || (movie.thumbnailBase64 || null) || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?q=80&w=1600&auto=format&fit=crop',
      rating: movie.rating ? parseFloat(movie.rating).toFixed(1) : getDeterministicRating(movie.id, 8.5),
      episodes: runtimeStr,
      totalSeasons: 0,
      totalEpisodes: 1,
      year: movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '2026'),
      quality: '4K Ultra HD',
      language: (movie.language || 'English').toUpperCase(),
      studio: (movie.productionCountries && movie.productionCountries[0]) || 'Cinema',
      genres: validGenres.length > 0 ? validGenres : ['Movie'],
      description: movie.overview || `Local tracked movie file: ${movie.localFileName || ''}`,
      progressPercent: pct,
      inProgress,
      lastActivity: new Date(movie.lastWatchedAt || movie.lastOpenedAt || movie.updatedAt || movie.addedAt || 0).getTime(),
    };
  });

  if (formattedAnimes.length === 0 && formattedMangas.length === 0 && formattedMovies.length === 0) {
    return [{
      id: 'placeholder',
      mediaType: 'anime',
      isManga: false,
      isAudio: false,
      isMovie: false,
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
      description: 'Your premium personal anime, manga & movies tracking workspace. Add your local media folders and files to get started!'
    }];
  }

  // Prioritize in-progress items, followed by top-rated (excluding audio stories from hero banner slider)
  const allItems = [...formattedAnimes, ...formattedMangas, ...formattedMovies];
  const inProgressItems = allItems
    .filter(item => item.inProgress)
    .sort((a, b) => b.lastActivity - a.lastActivity);

  const otherItems = allItems
    .filter(item => !item.inProgress)
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0));

  return [...inProgressItems, ...otherItems].slice(0, 6);
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
  const [audioStories, setAudioStories] = useState([]);
  const [movies, setMovies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMovies, setLoadingMovies] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, alpha, progress
  const [filterBy, setFilterBy] = useState('all'); // all, active, completed
  const [selectedGenre, setSelectedGenre] = useState('All');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleWindowScroll = () => {
      // Trigger after scrolling 15% of the hero banner (10-20% range)
      const heroElement = document.getElementById('hero');
      const bannerHeight = heroElement ? heroElement.offsetHeight : window.innerHeight;
      const threshold = bannerHeight * 0.15;
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

  // Ref for trending carousel horizontal scroll
  const trendingRef = useRef(null);
  // Ref for recently updated horizontal scroll
  const recentlyUpdatedRef = useRef(null);
  // Ref for manga horizontal scroll
  const mangaScrollRef = useRef(null);
  // Ref for audio story horizontal scroll
  const audioStoryScrollRef = useRef(null);
  // Ref for local anime library horizontal scroll
  const animeScrollRef = useRef(null);

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

  const [refreshingPopular, setRefreshingPopular] = useState(false);
  const [refreshPopularSuccess, setRefreshPopularSuccess] = useState(false);
  const [refreshingTrending, setRefreshingTrending] = useState(false);
  const [refreshTrendingSuccess, setRefreshTrendingSuccess] = useState(false);

  const handleRefreshPopular = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (refreshingPopular) return;
    setRefreshingPopular(true);
    setRefreshPopularSuccess(false);
    try {
      const res = await fetch(`/api/popular-anime?refresh=1&t=${Date.now()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.anime) && data.anime.length > 0) {
        setWeeklyPopular([...data.anime]);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              'watchanime_weekly_popular',
              JSON.stringify({ timestamp: Date.now(), data: data.anime })
            );
          } catch (e) {}
        }
        setRefreshPopularSuccess(true);
        setTimeout(() => setRefreshPopularSuccess(false), 3000);
      } else {
        console.warn('[Dashboard] Popular anime fetch returned no items:', data);
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to refresh weekly popular anime:', err);
    } finally {
      setRefreshingPopular(false);
    }
  };

  const handleRefreshTrending = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (refreshingTrending) return;
    setRefreshingTrending(true);
    setRefreshTrendingSuccess(false);
    try {
      const res = await fetch(`/api/trending-today?refresh=1&t=${Date.now()}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.trending) && data.trending.length > 0) {
        setInternetTrending([...data.trending]);
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem(
              'watchanime_trending_today_v3',
              JSON.stringify({ timestamp: Date.now(), data: data.trending })
            );
          } catch (e) {}
        }
        setRefreshTrendingSuccess(true);
        setTimeout(() => setRefreshTrendingSuccess(false), 3000);
      } else {
        console.warn('[Dashboard] Trending fetch returned no items:', data);
      }
    } catch (err) {
      console.warn('[Dashboard] Failed to refresh trending today:', err);
    } finally {
      setRefreshingTrending(false);
    }
  };

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

  // Helper to extract the current cover photo of a manga folder
  const getMangaFolderCover = (m) => {
    if (!m) return '';
    if (m.thumbnailBase64) {
      return (m.thumbnailBase64.startsWith('http') || m.thumbnailBase64.startsWith('data:'))
        ? m.thumbnailBase64
        : `/api/image?path=${encodeURIComponent(m.thumbnailBase64)}`;
    }
    if (m.thumbnailPath) {
      return `/api/image?path=${encodeURIComponent(m.thumbnailPath)}`;
    }
    return m.coverUrl || m.banner || m.image || '';
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

  // Get dynamic lists from database animes, mangas, audio stories and movies
  const heroSlides = useMemo(() => getHeroSlides(animes, mangas, audioStories, movies), [animes, mangas, audioStories, movies]);

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
      };
    });

    return [...formattedAnime, ...formattedManga]
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
      .slice(0, 30);
  }, [animes, mangas]);

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

  // Auto Hero Slider Timer (Advances every 20 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      setSlideDirection(1);
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 20000);
    return () => clearInterval(timer);
  }, [heroSlides.length]);

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
    }

    const localAudioStories = getLocalAudioStories();
    if (localAudioStories.length > 0) {
      setAudioStories(localAudioStories);
    }

    const localMovies = getLocalMovies();
    if (localMovies.length > 0) {
      setMovies(localMovies);
      setLoadingMovies(false);
    }

    if (isOffline || !db) {
      setLoading(false);
      setLoadingMovies(false);
      return;
    }

    const targetUserId = getUserId();
    const animeRef = collection(db, 'users', targetUserId, 'anime');
    const mangaRef = collection(db, 'users', targetUserId, 'mangas');
    const audioStoriesRef = collection(db, 'users', targetUserId, 'audioStories');
    const moviesRef = collection(db, 'users', targetUserId, 'movies');

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
    }, (err) => {
      console.warn('Firestore manga subscription error:', err);
      setMangas(getLocalMangas());
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
    }, (err) => {
      console.warn('Firestore audioStories subscription error:', err);
      setAudioStories(getLocalAudioStories());
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

    return () => {
      unsubscribeAnime();
      unsubscribeManga();
      unsubscribeAudioStories();
      unsubscribeMovies();
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
    e.stopPropagation();
    e.preventDefault();
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

  const scrollMovie = (direction) => {
    if (movieScrollRef.current) {
      const { scrollLeft, clientWidth } = movieScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      movieScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
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
    e.stopPropagation();
    e.preventDefault();
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

    return [...activeAnimes, ...activeMangas, ...activeAudioStories, ...activeMovies]
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .slice(0, 6);
  }, [animes, mangas, audioStories, movies]);

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
        const matchGenre = selectedGenre === 'All' || (Array.isArray(m?.genres) && m.genres.some(g => g.toLowerCase() === selectedGenre.toLowerCase()));
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
    if (['anime', 'movies', 'manga', 'audios', 'manga-webtoons', 'audio-stories', 'catalog'].includes(initialHash)) {
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

  return (
    <div className="min-h-screen bg-transparent text-white flex flex-col selection:bg-[#7c5cff] selection:text-white">

      {/* 1. TOP NAVBAR (Transparent over hero banner, smooth glass effect on scroll) */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 px-4 md:px-8 py-3.5 flex items-center justify-between transition-all duration-500 ease-out ${isScrolled
          ? 'bg-[#07090f]/80 backdrop-blur-xl border-b border-white/10 shadow-lg shadow-black/30'
          : 'bg-transparent backdrop-blur-none border-b border-transparent shadow-none'
          }`}
      >
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
                GANESH<span className="text-[#7c5cff]">SPACE</span>
              </span>

            </div>
          </Link>

        </div>

        {/* Right Actions & Search */}
        <div className="flex items-center gap-3">
          {/* Quick Search Input with Liquid-Glass Effect */}
          <div className="relative hidden md:block w-56 lg:w-72 group">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/80 group-hover:text-white group-focus-within:text-cyan-400 pointer-events-none z-10 transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" size={16} />
            <input
              type="text"
              placeholder="Search titles or names..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2 text-xs rounded-full liquid-glass-search placeholder-gray-400/80 focus:w-80 transition-all duration-300"
            />
            {search.length > 0 && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white transition cursor-pointer z-10"
                title="Clear search"
              >
                <X size={12} />
              </button>
            )}
            {/* Search Recommendations Dropdown */}
            {search.trim().length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 max-h-96 overflow-y-auto no-scrollbar">
                {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 && autocompleteAudioStoryMatches.length === 0 && autocompleteMovieMatches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No anime, manga, audio story or movie matches found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {autocompleteMovieMatches.slice(0, 3).map((mov) => (
                      <div
                        key={`search-movie-${mov.id}`}
                        onClick={() => {
                          router.push(`/movies/${mov.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                      >
                        <div className="w-9 h-12 rounded-lg overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {mov.posterUrl || mov.posterPath ? (
                            <img src={mov.posterUrl || mov.posterPath} alt={mov.title} className="w-full h-full object-cover" />
                          ) : (
                            <Film size={16} className="text-amber-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-[8px] font-bold text-black uppercase">Movie</span>
                            <h4 className="font-bold text-xs text-white truncate">{mov.title}</h4>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {mov.year ? `${mov.year} • ` : ''}{mov.runtime ? `${Math.floor(mov.runtime / 60)}h ${mov.runtime % 60}m` : 'Feature Film'}{mov.rating ? ` • ★ ${mov.rating}` : ''}
                          </p>
                        </div>
                      </div>
                    ))}
                    {autocompleteAudioStoryMatches.slice(0, 3).map((a) => (
                      <div
                        key={`search-audio-${a.id}`}
                        onClick={() => {
                          router.push(`/audio-story/${a.id}`);
                          setSearch('');
                        }}
                        className="flex items-center gap-3 p-2 rounded-xl hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                      >
                        <div className="w-9 h-12 rounded-lg overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                          {a.thumbnailBase64 ? (
                            <img src={a.thumbnailBase64} alt={a.title} className="w-full h-full object-cover" />
                          ) : a.thumbnailPath ? (
                            <img src={`/api/image?path=${encodeURIComponent(a.thumbnailPath)}`} alt={a.title} className="w-full h-full object-cover" />
                          ) : (
                            <Headphones size={16} className="text-cyan-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-[8px] font-bold text-white uppercase">Audio</span>
                            <h4 className="font-bold text-xs text-white truncate">{a.title}</h4>
                          </div>
                          <p className="text-[10px] text-gray-400 truncate mt-0.5">
                            {a.trackCount || a.totalTracks || 0} Tracks • Audio Story
                          </p>
                        </div>
                      </div>
                    ))}
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
            className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${isOffline
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
              }`}
            title={isOffline ? "Switch to Online Mode" : "Switch to Offline Mode"}
          >
            {isOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
            <span>{isOffline ? 'Offline' : 'Online'}</span>
          </button>

          {/* Desktop Unified Media Actions Trigger (Hover or Click Modal) */}
          <div
            ref={actionModalRef}
            className="relative hidden sm:block"
            onMouseEnter={() => {
              if (actionModalTimerRef.current) clearTimeout(actionModalTimerRef.current);
              setShowActionModal(true);
            }}
            onMouseLeave={() => {
              actionModalTimerRef.current = setTimeout(() => {
                setShowActionModal(false);
              }, 220);
            }}
          >
            <button
              type="button"
              onClick={() => setShowActionModal(prev => !prev)}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer shadow-lg ${showActionModal
                ? 'bg-gradient-to-r from-[#7c5cff] via-purple-600 to-cyan-500 text-white shadow-purple-500/30 ring-2 ring-[#7c5cff]/40'
                : 'bg-white/10 hover:bg-white/15 text-white border border-white/15 hover:border-white/30'
                }`}
              title="Add Media & Stream"
            >
              <Plus size={15} className={`transition-transform duration-300 ${showActionModal ? 'rotate-45 text-cyan-300' : 'text-[#7c5cff]'}`} />
              <span>Add / Stream</span>
              <ChevronDown size={13} className={`text-gray-300 transition-transform duration-300 ${showActionModal ? 'rotate-180' : ''}`} />
            </button>

            {/* Small Floating Modal on Hover/Click */}
            <AnimatePresence>
              {showActionModal && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="absolute top-full right-0 mt-2.5 w-72 bg-[#0d111b]/95 backdrop-blur-2xl border border-white/15 rounded-2xl p-2 shadow-2xl shadow-black/80 z-50 space-y-1"
                  onMouseEnter={() => {
                    if (actionModalTimerRef.current) clearTimeout(actionModalTimerRef.current);
                    setShowActionModal(true);
                  }}
                  onMouseLeave={() => {
                    actionModalTimerRef.current = setTimeout(() => {
                      setShowActionModal(false);
                    }, 220);
                  }}
                >
                  <div className="px-3 py-1.5 flex items-center justify-between border-b border-white/10 mb-1">
                    <span className="text-[10px] uppercase font-extrabold tracking-wider text-gray-400">Media Actions</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">Fast Track</span>
                  </div>

                  {/* 1. Add Anime */}
                  <button
                    onClick={() => {
                      setShowActionModal(false);
                      if (!isOffline) setShowAddModal(true);
                    }}
                    disabled={isOffline}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-purple-950/40 border border-transparent hover:border-purple-500/30 cursor-pointer'
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-[#7c5cff]/20 text-[#a855f7] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Film size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">Add Anime</h4>
                        <span className="text-[9px] font-bold text-gray-400">Video</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">Track local anime folder</p>
                    </div>
                  </button>

                  {/* 2. Add Manga */}
                  <button
                    onClick={() => {
                      setShowActionModal(false);
                      if (!isOffline) setShowAddMangaModal(true);
                    }}
                    disabled={isOffline}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-pink-950/40 border border-transparent hover:border-pink-500/30 cursor-pointer'
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-pink-500/20 text-pink-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <BookOpen size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-pink-300 transition-colors">Add Manga</h4>
                        <span className="text-[9px] font-bold text-gray-400">PDF</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">Track manga & webtoon folder</p>
                    </div>
                  </button>

                  {/* 3. Add Audio */}
                  <button
                    onClick={() => {
                      setShowActionModal(false);
                      if (!isOffline) setShowAddAudioStoryModal(true);
                    }}
                    disabled={isOffline}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-cyan-950/40 border border-transparent hover:border-cyan-500/30 cursor-pointer'
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Headphones size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors">Add Audio Story</h4>
                        <span className="text-[9px] font-bold text-gray-400">Audio/Video</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">Track audio story folder</p>
                    </div>
                  </button>

                  {/* 4. Add Movie */}
                  <button
                    onClick={() => {
                      setShowActionModal(false);
                      if (!isOffline) setShowAddMovieModal(true);
                    }}
                    disabled={isOffline}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group ${isOffline
                      ? 'opacity-40 cursor-not-allowed'
                      : 'hover:bg-amber-950/40 border border-transparent hover:border-amber-500/30 cursor-pointer'
                      }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Film size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors">Add Movie</h4>
                        <span className="text-[9px] font-bold text-amber-400">TMDB</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">Track local movie with TMDB</p>
                    </div>
                  </button>

                  {/* 5. Stream Link */}
                  <Link
                    href="/stream"
                    onClick={() => setShowActionModal(false)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl transition text-left group hover:bg-emerald-950/40 border border-transparent hover:border-emerald-500/30 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      <Wifi size={16} className="text-cyan-300 animate-pulse" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">Local Stream</h4>
                        <span className="text-[9px] font-bold text-cyan-400 uppercase">Live</span>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">Hotspot wireless stream page</p>
                    </div>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

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
            className={`p-2 rounded-lg bg-white/5 text-gray-300 hover:text-white transition cursor-pointer md:hidden relative ${quickActionsOpen ? 'text-[#7c5cff] bg-[#7c5cff]/10 border border-[#7c5cff]/30' : ''
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
              className="absolute top-16 right-4 z-50 w-56 glass-panel rounded-2xl p-4 shadow-xl border border-white/10 flex flex-col gap-2.5 md:hidden"
            >
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Quick Actions</span>

              {/* 1. Connection Toggle */}
              <button
                onClick={() => {
                  setManualOffline(!isManualOffline);
                  setQuickActionsOpen(false);
                }}
                className={`flex items-center justify-between w-full px-3 py-2 rounded-xl border text-[11px] font-bold uppercase tracking-wider transition ${isOffline
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

              {/* 2. Add Anime for Mobile */}
              <button
                onClick={() => {
                  setShowAddModal(true);
                  setQuickActionsOpen(false);
                }}
                disabled={isOffline}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                  : 'bg-purple-600/20 text-purple-300 hover:text-white border border-purple-500/30 cursor-pointer'
                  }`}
              >
                <Plus size={14} />
                <span>Add Anime</span>
              </button>

              {/* 3. Add Manga for Mobile */}
              <button
                onClick={() => {
                  setShowAddMangaModal(true);
                  setQuickActionsOpen(false);
                }}
                disabled={isOffline}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                  : 'bg-pink-600/20 text-pink-300 hover:text-white border border-pink-500/30 cursor-pointer'
                  }`}
              >
                <BookOpen size={14} />
                <span>Add Manga</span>
              </button>

              {/* 4. Add Audio Stories for Mobile */}
              <button
                onClick={() => {
                  setShowAddAudioStoryModal(true);
                  setQuickActionsOpen(false);
                }}
                disabled={isOffline}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                  : 'bg-cyan-600/20 text-cyan-300 hover:text-white border border-cyan-500/30 cursor-pointer'
                  }`}
              >
                <Headphones size={14} />
                <span>Add Audio</span>
              </button>

              {/* 5. Add Movie for Mobile */}
              <button
                onClick={() => {
                  setShowAddMovieModal(true);
                  setQuickActionsOpen(false);
                }}
                disabled={isOffline}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition ${isOffline
                  ? 'opacity-40 cursor-not-allowed bg-white/5 text-gray-400'
                  : 'bg-amber-600/20 text-amber-300 hover:text-white border border-amber-500/30 cursor-pointer'
                  }`}
              >
                <Film size={14} />
                <span>Add Movie</span>
              </button>

              {/* 6. Stream Page Link */}
              <Link
                href="/stream"
                onClick={() => setQuickActionsOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600/80 to-indigo-600/80 hover:from-purple-600 hover:to-indigo-600 text-white border border-purple-500/30 transition shadow-md cursor-pointer"
              >
                <Wifi size={14} className="text-cyan-300 animate-pulse" />
                <span>Local Stream</span>
              </Link>

              {/* 6. Settings Trigger */}
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
                  <div className="relative group">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-300/80 group-hover:text-white group-focus-within:text-cyan-400 z-10 pointer-events-none transition-colors drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" size={16} />
                    <input
                      type="text"
                      placeholder="Search title..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl liquid-glass-search placeholder-gray-400/80"
                    />
                    {/* Live Autocomplete Matches */}
                    {search.trim().length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0f172a]/95 border border-white/15 rounded-xl shadow-2xl z-50 max-h-64 overflow-y-auto no-scrollbar">
                        {autocompleteMatches.length === 0 && autocompleteMangaMatches.length === 0 && autocompleteAudioStoryMatches.length === 0 && autocompleteMovieMatches.length === 0 ? (
                          <div className="p-3 text-center text-xs text-gray-400">No matches found</div>
                        ) : (
                          <div className="p-1 space-y-1">
                            {autocompleteMovieMatches.slice(0, 3).map((mov) => (
                              <div
                                key={`side-search-movie-${mov.id}`}
                                onClick={() => {
                                  router.push(`/movies/${mov.id}`);
                                  setSearch('');
                                  setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-amber-950/40 border border-amber-500/20 transition cursor-pointer"
                              >
                                <div className="w-8 h-10 rounded overflow-hidden bg-amber-950/60 flex-shrink-0 relative flex items-center justify-center">
                                  {mov.posterUrl || mov.posterPath ? (
                                    <img src={mov.posterUrl || mov.posterPath} alt={mov.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <Film size={14} className="text-amber-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="px-1 py-0.2 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-[7px] font-bold text-black uppercase">Movie</span>
                                    <h4 className="font-bold text-xs text-white truncate">{mov.title}</h4>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {autocompleteAudioStoryMatches.slice(0, 3).map((a) => (
                              <div
                                key={`side-search-audio-${a.id}`}
                                onClick={() => {
                                  router.push(`/audio-story/${a.id}`);
                                  setSearch('');
                                  setMobileMenuOpen(false);
                                }}
                                className="flex items-center gap-2 p-2 rounded-lg hover:bg-cyan-950/40 border border-cyan-500/20 transition cursor-pointer"
                              >
                                <div className="w-8 h-10 rounded overflow-hidden bg-cyan-950/60 flex-shrink-0 relative flex items-center justify-center">
                                  {a.thumbnailBase64 ? (
                                    <img src={a.thumbnailBase64} alt={a.title} className="w-full h-full object-cover" />
                                  ) : a.thumbnailPath ? (
                                    <img src={`/api/image?path=${encodeURIComponent(a.thumbnailPath)}`} alt={a.title} className="w-full h-full object-cover" />
                                  ) : (
                                    <Headphones size={14} className="text-cyan-400" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                    <span className="px-1 py-0.2 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-[7px] font-bold text-white uppercase">Audio</span>
                                    <h4 className="font-bold text-xs text-white truncate">{a.title}</h4>
                                  </div>
                                </div>
                              </div>
                            ))}
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
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('hero'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <Sparkles size={15} className="text-[#a855f7]" /> Spotlight Hero
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('continue-watching'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <Play size={15} className="text-[#7c5cff]" /> Continue Watching
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('trending'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <Flame size={15} className="text-amber-400" /> Trending Today
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('manga'); }} className="hover:text-purple-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <BookOpen size={15} className="text-purple-400" /> Manga / Webtoons
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('audios'); }} className="hover:text-cyan-400 p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <Headphones size={15} className="text-cyan-400" /> Audio Stories
                    </button>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('movies'); }} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition text-left cursor-pointer w-full">
                      <span className="flex items-center gap-2"><Film size={15} className="text-amber-400" /> Movies Section</span>
                    </button>
                    <Link href="/movies" onClick={() => setMobileMenuOpen(false)} className="hover:text-amber-400 p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                      <span className="flex items-center gap-2"><Sparkles size={15} className="text-amber-400" /> All Movies (Library)</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                    </Link>
                    <button type="button" onClick={() => { setMobileMenuOpen(false); handleSectionJump('anime'); }} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition text-left cursor-pointer w-full">
                      <Tv size={15} className="text-cyan-400" /> Anime Catalog
                    </button>
                    <Link href="/animes" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center justify-between transition">
                      <span className="flex items-center gap-2"><Sparkles size={15} className="text-[#a855f7]" /> All Anime (Library)</span>
                      <span className="text-[10px] bg-[#7c5cff]/20 text-purple-300 px-2 py-0.5 rounded-full font-bold">See All</span>
                    </Link>
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
                      <Plus size={16} /> Track Anime Folder
                    </button>

                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowAddMangaModal(true); }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <BookOpen size={16} /> Track Manga Folder
                    </button>

                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowAddAudioStoryModal(true); }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 to-purple-600 text-white flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Headphones size={16} /> Track Audio Folder
                    </button>

                    <button
                      onClick={() => { setMobileMenuOpen(false); setShowAddMovieModal(true); }}
                      className="w-full py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-rose-600 text-black flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <Film size={16} /> Track Movie File
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

      {/* 2. HERO BANNER (98% SCREEN HEIGHT, 16:9 RATIO, AMAZON PRIME VIDEO STYLE TOP VIGNETTE) */}
      <section
        id="hero"
        className="relative w-full overflow-hidden shadow-2xl bg-[#07090f] h-[98vh] min-h-[580px] max-h-[98vh] flex items-end"
        style={{ aspectRatio: '16 / 9' }}
      >
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
            {/* Background Image: Crisp movie poster on mobile; soft blurred backdrop on desktop for movies; crisp sharp for anime/manga/audio */}
            {currentHero.isMovie ? (
              <>
                {/* Mobile Movie Banner: Crisp, sharp movie poster matching anime/manga banner style without blur */}
                <div
                  className="md:hidden absolute inset-0 z-0 bg-cover bg-center filter blur-none scale-100 brightness-105 saturate-[1.1] transition-all duration-700"
                  style={{ backgroundImage: `url(${currentHero.poster || currentHero.banner})` }}
                />
                {/* Desktop Movie Banner: Blurred backdrop with right-side tilted poster */}
                <div
                  className="hidden md:block absolute inset-0 z-0 bg-cover bg-center filter blur-[4px] scale-105 brightness-110 saturate-[1.2] transition-all duration-700"
                  style={{ backgroundImage: `url(${currentHero.banner})` }}
                />
              </>
            ) : (
              <div
                className="absolute inset-0 z-0 bg-cover bg-center filter blur-none scale-100 brightness-105 saturate-[1.1] transition-all duration-700"
                style={{ backgroundImage: `url(${currentHero.banner})` }}
              />
            )}

            {/* Top Dark Vignette (Prime Video Style - deep dark gradient behind fixed navbar) */}
            <div
              className="absolute top-0 inset-x-0 h-44 sm:h-52 md:h-64 z-20 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(7, 9, 15, 0.98) 0%, rgba(7, 9, 15, 0.85) 30%, rgba(7, 9, 15, 0.45) 70%, transparent 100%)'
              }}
            />

            {/* Left Vignette Overlay - ensures title, genres and description are crystal clear */}
            <div
              className="absolute inset-0 z-10 pointer-events-none"
              style={{
                background: 'linear-gradient(90deg, rgba(7, 9, 15, 0.94) 0%, rgba(7, 9, 15, 0.78) 42%, rgba(7, 9, 15, 0.25) 75%, transparent 100%)'
              }}
            />

            {/* Subtle bottom edge blend (does not obscure text or buttons) */}
            <div
              className="absolute bottom-0 inset-x-0 h-16 z-10 pointer-events-none bg-gradient-to-t from-[#07090f]/40 to-transparent"
            />

            {/* Right Side Tilted Movie Poster Box (Tilted box style matching reference image) */}
            {currentHero.isMovie && (
              <div className="absolute right-0 top-0 bottom-0 z-10 w-[50%] md:w-[46%] lg:w-[42%] pointer-events-none hidden md:flex justify-end">
                <div
                  className="relative h-[140%] -top-[10%] w-full max-w-[460px] lg:max-w-[540px] xl:max-w-[620px] overflow-hidden origin-top-right transform rotate-[7deg] shadow-[-30px_0_60px_rgba(0,0,0,0.95)] border-l border-white/10"
                >
                  <CachedImage
                    src={currentHero.poster || currentHero.banner}
                    alt={currentHero.title}
                    className="w-full h-full object-cover transform -rotate-[7deg] origin-center scale-[1.25]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />
                </div>
              </div>
            )}

            {/* Hero Content Overlay (Positioned in lower two-thirds with comfortable breathing room) */}
            <div className="relative z-30 w-full max-w-7xl mx-auto px-4 md:px-8 pt-36 sm:pt-40 md:pt-48 pb-16 md:pb-24">
              <div className="w-full md:max-w-2xl lg:max-w-3xl space-y-3 md:space-y-4">
                {/* Title or Custom Movie Logo */}
                <div>
                  {currentHero.logoUrl ? (
                    <div className="mb-3 max-w-[280px] sm:max-w-[380px] md:max-w-[480px] max-h-16 sm:max-h-20 md:max-h-28 flex items-center">
                      <img
                        src={currentHero.logoUrl}
                        alt={currentHero.title}
                        className="max-h-16 sm:max-h-20 md:max-h-28 w-auto max-w-full object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]"
                      />
                    </div>
                  ) : (
                    <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight text-amber-300 leading-tight drop-shadow-lg">
                      {currentHero.title}
                    </h1>
                  )}
                  {/* Genres Tag Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {currentHero.isManga && (
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 border border-purple-400 text-purple-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <BookOpen size={10} /> Manga
                      </span>
                    )}
                    {currentHero.isAudio && (
                      <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/30 border border-cyan-400 text-cyan-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <Headphones size={10} /> Audio Story
                      </span>
                    )}
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
                <div className="flex flex-wrap items-center gap-2.5 md:gap-4 text-xs font-bold text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span className="text-amber-400 font-extrabold">{currentHero.rating}</span>
                  </span>
                  {currentHero.isMovie ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-amber-300">
                      <Film size={13} className="text-amber-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : currentHero.isManga ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-purple-300">
                      <BookOpen size={13} className="text-purple-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : currentHero.isAudio ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-cyan-300">
                      <Headphones size={13} className="text-cyan-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[#c084fc]">
                      <Tv size={13} className="text-[#a855f7]" />
                      {currentHero.totalSeasons ? (currentHero.totalSeasons > 1 ? `${currentHero.totalSeasons} Seasons` : 'Season 1') : 'TV'}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-pink-300">
                    <Clock size={13} className="text-pink-400" /> {currentHero.isManga || currentHero.isAudio || currentHero.isMovie ? currentHero.quality : currentHero.episodes}
                  </span>
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Calendar size={14} className="text-cyan-400" /> {currentHero.year}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-2 md:line-clamp-3 max-w-xl">
                  {currentHero.description}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {currentHero.isMovie ? (
                    <button
                      onClick={() => router.push(`/movies/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-black font-extrabold flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/30 transition-all duration-300"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Watch Movie</span>
                    </button>
                  ) : currentHero.isAudio ? (
                    <button
                      onClick={() => router.push(`/audio-story/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/30 transition-all duration-300"
                    >
                      <Headphones size={14} />
                      <span>Listen Now</span>
                    </button>
                  ) : currentHero.isManga ? (
                    <button
                      onClick={() => router.push(`/manga/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-black font-extrabold flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/30 transition-all duration-300"
                    >
                      <BookOpen size={14} />
                      <span>Read Manga</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (animes.length > 0 && currentHero?.id !== 'placeholder') onSelectAnime(currentHero.id);
                        else setShowAddModal(true);
                      }}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-pink-500 to-[#a855f7] hover:brightness-110 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-pink-500/20 transition-all duration-300"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Watch Now</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (currentHero.isMovie) {
                        router.push(`/movies/${currentHero.id}`);
                      } else if (currentHero.isAudio) {
                        router.push(`/audio-story/${currentHero.id}`);
                      } else if (currentHero.isManga) {
                        router.push(`/manga/${currentHero.id}`);
                      } else if (animes.length > 0 && currentHero?.id !== 'placeholder') {
                        onSelectAnime(currentHero.id);
                      }
                    }}
                    className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 border border-white/10 text-white transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Detail</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slider Navigation Chevron Controls (Liquid Glass Effect, No Dots) */}
        <div className="absolute right-4 bottom-6 md:right-8 md:bottom-8 lg:right-12 lg:bottom-10 z-30 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSlideDirection(-1);
              setCurrentSlide((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
            }}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full liquid-glass-chevron text-white flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all"
            title="Previous Slide"
            aria-label="Previous Slide"
          >
            <ChevronLeft size={20} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSlideDirection(1);
              setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
            }}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full liquid-glass-chevron text-white flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all"
            title="Next Slide"
            aria-label="Next Slide"
          >
            <ChevronRight size={20} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
          </button>
        </div>
      </section>

      {/* Outside Bottom Black Vignette / Fade Transition (Outside the banner) */}
      <div
        className="w-full h-16 sm:h-24 pointer-events-none -mb-16 sm:-mb-24 relative z-10"
        style={{
          background: 'linear-gradient(180deg, #07090f 0%, rgba(7, 9, 15, 0.75) 40%, rgba(7, 9, 15, 0.25) 75%, transparent 100%)'
        }}
      />

      {/* MAIN BODY LAYOUT */}
      <main className="relative flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-14">

        {/* 3. MEDIA FORMAT QUICK NAVIGATION (ANIME, MOVIES, MANGA, AUDIOS) */}
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 md:gap-5">
            {/* 1. ANIME */}
            <button
              type="button"
              onClick={() => handleSectionJump('anime')}
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
                    {animes.length} Series
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
              onClick={() => handleSectionJump('movies')}
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
                    {movies.length} Films
                  </span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-amber-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
                <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-amber-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* 3. MANGA */}
            <button
              type="button"
              onClick={() => handleSectionJump('manga')}
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
                    {mangas.length} Webtoons
                  </span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-pink-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
                <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-pink-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>

            {/* 4. AUDIOS */}
            <button
              type="button"
              onClick={() => handleSectionJump('audios')}
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
                    {audioStories.length} Stories
                  </span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-full bg-white/5 group-hover:bg-cyan-500/30 flex items-center justify-center text-gray-400 group-hover:text-white transition-all flex-shrink-0">
                <ChevronDown size={14} className="group-hover:translate-y-0.5 transition-transform" />
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </section>


        {/* 4. CONTINUE WATCHING, READING & LISTENING (USER'S ACTIVE TRACKED ANIME, MANGA & AUDIO) */}
        {continueWatchingList.length > 0 && (
          <section id="continue-watching" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#7c5cff]">
                  <Play size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white flex items-center gap-2">
                    <span>Continue Watching</span>
                  </h2>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {continueWatchingList.slice(0, 6).map((item) => {
                if (item.mediaType === 'movie') {
                  const movPct = item.progressPct || (item.duration ? Math.min(100, Math.round(((item.currentTime || 0) / item.duration) * 100)) : 0);
                  const formatTime = (secs) => {
                    if (!secs || isNaN(secs)) return '00:00';
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = Math.floor(secs % 60);
                    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                  };

                  return (
                    <div
                      key={`continue-movie-${item.id}`}
                      onClick={() => router.push(`/movies/${item.id}`)}
                      className="glass-card p-4 rounded-2xl flex gap-4 items-center group cursor-pointer border border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-950/20 transition-all duration-300"
                    >
                      <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-[#181c24] flex-shrink-0">
                        {item.posterUrl || item.posterPath ? (
                          <CachedImage src={item.posterUrl || item.posterPath} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-amber-700 to-rose-900 flex items-center justify-center font-bold text-white/40 text-xl">
                            <Film size={24} className="text-amber-300/60" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="p-2 rounded-full bg-amber-500 text-black opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-amber-500/50">
                            <Play size={14} fill="currentColor" />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-amber-500 to-rose-600 text-black font-extrabold text-[8px] uppercase tracking-wider shrink-0">
                            Movie
                          </span>
                          <h3 className="font-bold text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                            {item.title}
                          </h3>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">
                          {item.currentTime ? `Resume from ${formatTime(item.currentTime)}` : (item.year ? `${item.year}` : 'Local Movie')}
                        </p>

                        <div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                            <span className="truncate">
                              {item.duration ? `${formatTime(item.currentTime || 0)} / ${formatTime(item.duration)}` : 'In Progress'}
                            </span>
                            <span className="font-bold text-amber-400 shrink-0 ml-1">{movPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-amber-500 to-rose-600 rounded-full transition-all duration-500"
                              style={{ width: `${movPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setMovieCompleteConfirm(item);
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-emerald-600/30 border border-white/10 hover:border-emerald-500/40 text-gray-400 hover:text-emerald-300 transition cursor-pointer self-center shrink-0"
                        title={item.completed ? "Mark Movie Incomplete" : "Mark Movie Complete"}
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    </div>
                  );
                }

                if (item.mediaType === 'audioStory') {
                  const aPct = item.progressPct || 0;
                  return (
                    <div
                      key={`continue-audio-${item.id}`}
                      onClick={() => router.push(`/audio-story/${item.id}`)}
                      className="glass-card p-4 rounded-2xl flex gap-4 items-center group cursor-pointer border border-cyan-500/20 hover:border-cyan-500/50 hover:bg-cyan-950/20 transition-all duration-300"
                    >
                      <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-[#181c24] flex-shrink-0">
                        {item.thumbnailBase64 ? (
                          <CachedImage src={item.thumbnailBase64} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : item.thumbnailPath ? (
                          <CachedImage src={`/api/image?path=${encodeURIComponent(item.thumbnailPath)}`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-cyan-700 to-indigo-900 flex items-center justify-center font-bold text-white/40 text-xl">
                            <Headphones size={24} className="text-cyan-300/60" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="p-2 rounded-full bg-cyan-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-cyan-600/50">
                            <Headphones size={14} />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-extrabold text-[8px] uppercase tracking-wider shrink-0">
                            Audio
                          </span>
                          <h3 className="font-bold text-sm text-white truncate group-hover:text-cyan-300 transition-colors">
                            {item.title}
                          </h3>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">
                          Last played: {item.lastWatchedTrack || (item.completedTracks ? `Track ${item.completedTracks}` : 'In progress')}
                        </p>

                        <div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                            <span className="truncate">
                              {item.completedTracks || 0}/{item.totalTracks || item.trackCount || '?'} Tracks
                            </span>
                            <span className="font-bold text-cyan-400 shrink-0 ml-1">{aPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
                              style={{ width: `${aPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setAudioStoryCompleteConfirm(item);
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-emerald-600/30 border border-white/10 hover:border-emerald-500/40 text-gray-400 hover:text-emerald-300 transition cursor-pointer self-center shrink-0"
                        title="Mark Audio Story Complete"
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    </div>
                  );
                }

                if (item.mediaType === 'manga') {
                  const mPct = item.progressPct || 0;
                  return (
                    <div
                      key={`continue-manga-${item.id}`}
                      onClick={() => router.push(`/manga/${item.id}`)}
                      className="glass-card p-4 rounded-2xl flex gap-4 items-center group cursor-pointer border border-purple-500/20 hover:border-purple-500/50 hover:bg-purple-950/20 transition-all duration-300"
                    >
                      <div className="relative w-20 h-24 rounded-xl overflow-hidden bg-[#181c24] flex-shrink-0">
                        {item.thumbnailBase64 ? (
                          <CachedImage src={item.thumbnailBase64} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : item.thumbnailPath ? (
                          <CachedImage src={`/api/image?path=${encodeURIComponent(item.thumbnailPath)}`} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-purple-700 to-indigo-900 flex items-center justify-center font-bold text-white/40 text-xl">
                            <BookOpen size={24} className="text-purple-300/60" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <div className="p-2 rounded-full bg-purple-600 text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-lg shadow-purple-600/50">
                            <BookOpen size={14} />
                          </div>
                        </div>
                      </div>

                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-purple-600 text-white font-extrabold text-[8px] uppercase tracking-wider shrink-0">
                            Manga
                          </span>
                          <h3 className="font-bold text-sm text-white truncate group-hover:text-purple-300 transition-colors">
                            {item.title}
                          </h3>
                        </div>
                        <p className="text-[10px] text-gray-400 truncate">
                          Last read: {item.lastWatchedChapter || (item.completedChapters ? `Chapter ${item.completedChapters}` : 'In progress')}
                        </p>

                        <div>
                          <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                            <span className="truncate">
                              {item.completedChapters || 0}/{item.totalChapters || item.chapterCount || '?'} Chapters
                            </span>
                            <span className="font-bold text-purple-400 shrink-0 ml-1">{mPct}%</span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all duration-500"
                              style={{ width: `${mPct}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setMangaCompleteConfirm(item);
                        }}
                        className="p-2 rounded-xl bg-white/5 hover:bg-emerald-600/30 border border-white/10 hover:border-emerald-500/40 text-gray-400 hover:text-emerald-300 transition cursor-pointer self-center shrink-0"
                        title="Mark Manga Complete"
                      >
                        <CheckCircle2 size={15} />
                      </button>
                    </div>
                  );
                }

                // Anime Card
                const anime = item;
                const pct = getAnimeProgressPercent(anime);
                return (
                  <div
                    key={`continue-anime-${anime.id}`}
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
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-[#7c5cff]/20 text-[#c084fc] font-extrabold text-[8px] uppercase tracking-wider shrink-0">
                          Anime
                        </span>
                        <h3 className="font-bold text-sm text-white truncate group-hover:text-[#7c5cff] transition-colors">
                          {anime.title}
                        </h3>
                      </div>
                      <p className="text-[10px] text-gray-400 truncate">
                        Last watched: {anime.lastWatchedEpisode ? `EP ${anime.lastWatchedEpisode}` : 'In progress'}
                      </p>

                      <div>
                        {(() => {
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
                );
              })}
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
                  </h2>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshTrending}
                  disabled={refreshingTrending}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer active:scale-95 disabled:opacity-50 ${refreshTrendingSuccess
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white'
                    }`}
                  title="Refetch Trending Today list from online and save"
                >
                  {refreshTrendingSuccess ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : (
                    <RefreshCw size={15} className={refreshingTrending ? "animate-spin text-amber-400" : "text-amber-400"} />
                  )}
                  <span className="hidden sm:inline">
                    {refreshingTrending ? "Refetching..." : refreshTrendingSuccess ? "Saved!" : "Refresh"}
                  </span>
                </button>
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
                      <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider shadow-md backdrop-blur-md ${show.typeColor === 'amber'
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
        <section id="manga" className="space-y-4 scroll-mt-24">
          <span id="manga-webtoons" className="sr-only" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <BookOpen size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Manga or Webtoons</h2>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddMangaModal(true)}
                className="px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Add</span>
              </button>

              {sortedMangas.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollManga('left')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollManga('right')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
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
            /* Horizontal Slider (X-Axis Scrollable) */
            <div
              ref={mangaScrollRef}
              className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {sortedMangas.map((m) => {
                const isWatched = Boolean(m.isWatched || m.progressPercent === 100 || m.status === 'completed');
                const coverImg = m.thumbnailBase64 || (m.thumbnailPath ? `/api/image?path=${encodeURIComponent(m.thumbnailPath)}` : null);
                return (
                  <div
                    key={`manga-${m.id}`}
                    onClick={() => router.push(`/manga/${m.id}`)}
                    className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/10 hover:border-purple-500/50 transition-all duration-300 shadow-md hover:shadow-xl"
                  >
                    <div className="relative h-56 md:h-60 overflow-hidden bg-[#181c24] flex items-center justify-center">
                      {coverImg ? (
                        <CachedImage
                          src={coverImg}
                          alt={m.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-purple-400/80 bg-purple-950/20 gap-1.5">
                          <BookOpen size={32} />
                          <span className="text-[9px] font-mono uppercase tracking-wider">PDF Manga</span>
                        </div>
                      )}

                      {/* Status / Chapter Badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        {isWatched ? (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/90 backdrop-blur-md text-[9px] uppercase font-bold text-white flex items-center gap-1 shadow">
                            <CheckCircle2 size={10} /> Completed
                          </span>
                        ) : (
                          <div className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-purple-300 font-bold text-[9px] border border-white/10">
                            {m.chapterCount || m.totalChapters || 0} Ch
                          </div>
                        )}
                      </div>

                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-purple-600 text-white font-extrabold text-[8px] shadow">
                        PDF
                      </div>

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-3 gap-2">
                        <div className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg">
                          <BookOpen size={14} />
                          <span>Read</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setMangaCompleteConfirm(m);
                          }}
                          className={`p-2 rounded-xl border transition cursor-pointer ${isWatched
                            ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/50'
                            : 'bg-white/10 border-white/20 text-gray-300 hover:bg-emerald-600 hover:text-white'
                            }`}
                          title={isWatched ? 'Mark Manga Unread' : 'Mark Manga Complete (Watched)'}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-gradient-to-b from-white/[0.02] to-black/30">
                      <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                        {m.title}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                        <span>Local PDF</span>
                        <span className={isWatched ? "text-emerald-400 font-bold flex items-center gap-1" : "text-purple-400 font-semibold"}>
                          {isWatched ? (
                            <>
                              <CheckCircle2 size={10} /> Completed
                            </>
                          ) : (
                            m.progressPercent ? `${m.progressPercent}%` : 'Ready'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* MOVIES SECTION */}
        <section id="movies" className="space-y-4 scroll-mt-24">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Film size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Movies</h2>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/movies')}
                className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                title="View All Movies in Library"
              >
                <span>All</span>
                <ChevronRight size={14} />
              </button>

              {sortedMovies.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollMovie('left')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollMovie('right')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          {loadingMovies ? (
            /* Hardcoded same-sized skeleton loader (6 items matching exact width & height of movie cards) */
            <div className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={`movie-skeleton-${i}`}
                  className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden border border-white/5 bg-[#0f141f]/70 animate-pulse flex flex-col self-start"
                >
                  <div className="relative aspect-[2/3] bg-white/[0.04] overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-t from-[#07090f] via-transparent to-transparent opacity-80" />
                    <div className="absolute top-2 left-2 w-14 h-4 rounded-lg bg-white/10" />
                    <div className="absolute top-2 right-2 w-10 h-4 rounded-lg bg-amber-500/20" />
                  </div>
                  <div className="p-3 bg-white/[0.03] space-y-2">
                    <div className="h-4 bg-white/10 rounded-md w-4/5" />
                    <div className="flex justify-between items-center pt-1">
                      <div className="h-3 bg-white/5 rounded w-16" />
                      <div className="h-3 bg-white/5 rounded w-10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : sortedMovies.length === 0 ? (
            <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto">
                <Film size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">No Movies Added Yet</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                  Track your local movie files (MP4, MKV, WEBM, AVI, MOV) with automatic TMDB metadata, posters, and playback progress!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMovieModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Plus size={14} />
                <span>+ Add Movie</span>
              </button>
            </div>
          ) : (
            /* Horizontal Slider (X-Axis Scrollable - Max 10 on Home) */
            <div
              ref={movieScrollRef}
              className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {sortedMovies.slice(0, 10).map((movie) => {
                const isWatched = Boolean(movie.watched || movie.completed || movie.watchStatus === 'Completed' || (movie.watchProgress && movie.watchProgress >= 95));
                const pct = movie.watchProgress || (movie.duration ? Math.min(100, Math.round(((movie.currentTime || 0) / movie.duration) * 100)) : 0);
                const coverImg = movie.posterUrl || movie.posterPath || (movie.thumbnailBase64 || null);
                const movieYear = movie.year || (movie.releaseDate ? movie.releaseDate.split('-')[0] : '');
                const runtimeStr = movie.runtime ? `${Math.floor(movie.runtime / 60)}h ${movie.runtime % 60}m` : null;

                return (
                  <div
                    key={`movie-${movie.id}`}
                    onClick={() => router.push(`/movies/${movie.id}`)}
                    className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col border border-white/10 hover:border-amber-500/50 transition-all duration-300 shadow-md hover:shadow-xl relative self-start"
                  >
                    <div className="relative aspect-[2/3] overflow-hidden bg-[#181c24] flex items-center justify-center">
                      {coverImg ? (
                        <CachedImage
                          src={coverImg}
                          alt={movie.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-amber-400/80 bg-gradient-to-br from-amber-950/30 to-rose-950/20 gap-1.5">
                          <Film size={36} />
                          <span className="text-[9px] font-mono uppercase tracking-wider">Movie</span>
                        </div>
                      )}

                      {/* Rating / Watched Badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        {isWatched ? (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/90 backdrop-blur-md text-[9px] uppercase font-bold text-white flex items-center gap-1 shadow">
                            <CheckCircle2 size={10} /> Watched
                          </span>
                        ) : movie.rating ? (
                          <div className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-amber-300 font-bold text-[9px] border border-white/10 flex items-center gap-1">
                            <Star size={10} className="fill-amber-400 text-amber-400" />
                            <span>{parseFloat(movie.rating).toFixed(1)}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-amber-500 text-black font-extrabold text-[8px] shadow">
                        MOVIE
                      </div>

                      {/* Hover Overlay with Action Buttons */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center p-3 gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            router.push(`/movies/${movie.id}`);
                          }}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg transition active:scale-95 cursor-pointer"
                        >
                          <Play size={14} fill="currentColor" />
                          <span>{movie.currentTime ? 'Resume' : 'Play'}</span>
                        </button>

                        <div className="flex items-center gap-1.5 mt-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              router.push(`/movies/${movie.id}`);
                            }}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                            title="Movie Details"
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setMovieEditing(movie);
                            }}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-white transition cursor-pointer"
                            title="Edit Movie"
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              setMovieCompleteConfirm(movie);
                            }}
                            className={`p-1.5 rounded-lg border transition cursor-pointer ${isWatched
                              ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/50'
                              : 'bg-white/10 border-white/20 text-gray-300 hover:bg-emerald-600 hover:text-white'
                              }`}
                            title={isWatched ? 'Mark Incomplete' : 'Mark Watched (Complete)'}
                          >
                            <CheckCircle2 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleDeleteMovie(movie, e)}
                            className="p-1.5 rounded-lg bg-white/10 hover:bg-rose-600/40 border border-white/20 text-gray-300 hover:text-rose-300 transition cursor-pointer"
                            title="Remove Movie"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white/[0.03]">
                      <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-amber-300 transition-colors">
                        {movie.title}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                        <span>{movieYear || (runtimeStr || 'Feature Film')}</span>
                        <span className={isWatched ? "text-emerald-400 font-bold flex items-center gap-1" : "text-amber-400 font-semibold"}>
                          {isWatched ? (
                            <>
                              <CheckCircle2 size={10} /> Completed
                            </>
                          ) : (
                            pct > 0 ? `${pct}%` : 'Ready'
                          )}
                        </span>
                      </div>
                      {pct > 0 && !isWatched && (
                        <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-amber-500 to-rose-600 transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {sortedMovies.length > 10 && (
                <div
                  onClick={() => router.push('/movies')}
                  className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col transition shadow-md hover:shadow-xl bg-amber-950/10 hover:bg-amber-950/20 self-start"
                >
                  <div className="aspect-[2/3] flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-300 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Film size={24} />
                    </div>
                    <div>
                      <span className="text-sm font-bold text-white block">See All Movies</span>
                      <span className="text-xs text-amber-400/80 font-mono mt-0.5 block">{movies.length} total</span>
                    </div>
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-extrabold flex items-center gap-1 group-hover:bg-amber-400 transition">
                      View All <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>


        {/* AUDIO STORIES SECTION */}
        <section id="audios" className="space-y-4 scroll-mt-24">
          <span id="audio-stories" className="sr-only" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Headphones size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Audio Stories</h2>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {sortedAudioStories.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollAudioStory('left')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollAudioStory('right')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          {sortedAudioStories.length === 0 ? (
            <div className="p-8 rounded-2xl glass-card border border-white/10 text-center space-y-3 bg-white/[0.01]">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto">
                <Headphones size={24} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">No Audio Stories Tracked Yet</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
                  Connect any local folder with audio chapters (MP3, M4A, FLAC) or narrative video files (MP4, MKV) to start listening!
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddAudioStoryModal(true)}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-black font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow-lg cursor-pointer"
              >
                <Plus size={14} />
                <span>Track Audio Stories Folder</span>
              </button>
            </div>
          ) : (
            /* Horizontal Slider (X-Axis Scrollable) */
            <div
              ref={audioStoryScrollRef}
              className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {sortedAudioStories.map((s) => {
                const isWatched = Boolean(s.isWatched || s.progressPercent === 100 || s.status === 'completed');
                const coverImg = s.thumbnailBase64 || (s.thumbnailPath ? `/api/image?path=${encodeURIComponent(s.thumbnailPath)}` : null);
                return (
                  <div
                    key={`audio-${s.id}`}
                    onClick={() => router.push(`/audio-story/${s.id}`)}
                    className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/10 hover:border-cyan-500/50 transition-all duration-300 shadow-md hover:shadow-xl"
                  >
                    <div className="relative h-56 md:h-60 overflow-hidden bg-[#181c24] flex items-center justify-center">
                      {coverImg ? (
                        <CachedImage
                          src={coverImg}
                          alt={s.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-cyan-400/80 bg-gradient-to-br from-cyan-950/30 to-purple-950/20 gap-1.5">
                          <Headphones size={36} />
                          <span className="text-[9px] font-mono uppercase tracking-wider">Audio Story</span>
                        </div>
                      )}

                      {/* Status / Track Badge */}
                      <div className="absolute top-2 left-2 flex items-center gap-1">
                        {isWatched ? (
                          <span className="px-2 py-0.5 rounded-lg bg-emerald-500/90 backdrop-blur-md text-[9px] uppercase font-bold text-white flex items-center gap-1 shadow">
                            <CheckCircle2 size={10} /> Listened
                          </span>
                        ) : (
                          <div className="px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-cyan-300 font-bold text-[9px] border border-white/10">
                            {s.trackCount || s.totalTracks || 0} Tracks
                          </div>
                        )}
                      </div>

                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-cyan-500 text-black font-extrabold text-[8px] shadow">
                        AUDIO
                      </div>

                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-3 gap-2">
                        <div className="px-3 py-1.5 rounded-xl bg-cyan-500 text-black text-xs font-bold flex items-center gap-1.5 shadow-lg">
                          <Play size={14} fill="currentColor" />
                          <span>Listen</span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            setAudioStoryCompleteConfirm(s);
                          }}
                          className={`p-2 rounded-xl border transition cursor-pointer ${isWatched
                            ? 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/50'
                            : 'bg-white/10 border-white/20 text-gray-300 hover:bg-emerald-600 hover:text-white'
                            }`}
                          title={isWatched ? 'Mark Unlistened' : 'Mark Listened (Complete)'}
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="p-3 bg-gradient-to-b from-white/[0.02] to-black/30">
                      <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-cyan-300 transition-colors">
                        {s.title}
                      </h4>
                      <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                        <span>Audio / Video</span>
                        <span className={isWatched ? "text-emerald-400 font-bold flex items-center gap-1" : "text-cyan-400 font-semibold"}>
                          {isWatched ? (
                            <>
                              <CheckCircle2 size={10} /> Completed
                            </>
                          ) : (
                            s.progressPercent ? `${s.progressPercent}%` : 'Ready'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 5. RECENTLY UPDATED */}
        {recentlyUpdated.length > 0 && (
          <section id="recently-updated" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Recently Updated</h2>
                </div>
              </div>

              {/* Scroll Navigation Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => scrollRecentlyUpdated('left')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                  title="Scroll left"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollRecentlyUpdated('right')}
                  className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                  title="Scroll right"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>

            {/* Horizontal Slider (X-Axis Scrollable) */}
            <div
              ref={recentlyUpdatedRef}
              className="flex gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {recentlyUpdated.map((show, i) => (
                <div
                  key={`recent-${show.type || 'anime'}-${show.id}-${i}`}
                  onClick={() => {
                    if (show.type === 'manga') {
                      router.push(`/manga/${show.id}`);
                    } else {
                      onSelectAnime(show.id);
                    }
                  }}
                  className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-between border border-white/5 hover:border-[#7c5cff]/40 transition-all duration-300 shadow-md hover:shadow-xl"
                >
                  <div className="relative h-56 md:h-60 overflow-hidden bg-[#181c24] flex items-center justify-center">
                    <CachedImage src={show.image} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-black/70 backdrop-blur-md text-gray-300 font-bold text-[10px] border border-white/10">
                      {show.episode}
                    </div>
                    {show.type === 'manga' ? (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-emerald-500/90 backdrop-blur-md text-white font-extrabold text-[8px] tracking-wider uppercase shadow-lg border border-emerald-400/30">
                        MANGA
                      </div>
                    ) : show.isYouTube ? (
                      <div className="absolute top-2 right-2 p-1 bg-black/60 rounded-lg shadow-lg border border-red-500/40 backdrop-blur-md flex items-center justify-center">
                        <YoutubeLogo size={16} />
                      </div>
                    ) : (
                      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-lg bg-[#7c5cff]/90 backdrop-blur-md text-white font-extrabold text-[8px] border border-purple-400/30">
                        {show.quality || 'HD'}
                      </div>
                    )}
                  </div>
                  <div className="p-3 bg-gradient-to-b from-white/[0.02] to-black/30">
                    <h4 className="font-bold text-xs sm:text-sm text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors">
                      {show.title}
                    </h4>
                    <div className="flex justify-between items-center text-[10px] text-gray-400 mt-1.5">
                      <span className={show.type === 'manga' ? "text-emerald-400/90 font-semibold" : "text-gray-400 font-medium"}>
                        {show.type === 'manga' ? 'Manga' : 'Anime'}
                      </span>
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
                  </h2>
                </div>
              </div>

              {/* Scroll Navigation Buttons & Refresh */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRefreshPopular}
                  disabled={refreshingPopular}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer active:scale-95 disabled:opacity-50 shadow-sm ${refreshPopularSuccess
                    ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    : 'bg-white/5 hover:bg-white/15 border-white/10 text-gray-300 hover:text-white'
                    }`}
                  title="Refetch Popular This Week list from online and save"
                >
                  {refreshPopularSuccess ? (
                    <CheckCircle2 size={15} className="text-emerald-400" />
                  ) : (
                    <RefreshCw size={15} className={refreshingPopular ? "animate-spin text-[#a855f7]" : "text-[#a855f7]"} />
                  )}
                  <span className="hidden sm:inline">
                    {refreshingPopular ? "Refetching..." : refreshPopularSuccess ? "Saved!" : "Refresh"}
                  </span>
                </button>
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
                  </h2>
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
                </h2>
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
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold glass-chip cursor-pointer transition select-none flex items-center justify-center shrink-0 ${selectedGenre === genre
                  ? 'active text-white bg-[#7c5cff] shadow-md border-[#7c5cff]/50 font-bold'
                  : 'text-gray-300 hover:text-white hover:bg-white/10 border-white/10'
                  }`}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>


        {/* 9. TRACKED LOCAL LIBRARY (HORIZONTAL SCROLL - TOP 10 RECENT & SEE ALL) */}
        <section id="anime" className="space-y-4 pt-4 scroll-mt-24">
          <span id="catalog" className="sr-only" />
          {/* Header Controls Panel */}
          <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center glass-panel p-4 md:p-5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7]">
                <Film size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Tracked Local Library</h2>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {animes.length > 0
                    ? `${animes.length} anime series in library • Showing 10 most recent`
                    : 'Connect your local PC anime folders to stream & track progress'}
                </p>
              </div>
            </div>

            {/* Header Action Buttons */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => !isOffline && setShowAddModal(true)}
                disabled={isOffline}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition shadow-sm ${
                  isOffline
                    ? 'bg-white/5 border border-white/10 text-gray-500 opacity-50 cursor-not-allowed'
                    : 'bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-white cursor-pointer active:scale-95'
                }`}
                title="Track Local Anime Folder"
              >
                <Plus size={14} />
                <span className="hidden sm:inline">Add Folder</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/animes')}
                className="px-3 py-1.5 rounded-xl bg-[#7c5cff]/10 hover:bg-[#7c5cff]/20 border border-[#7c5cff]/30 text-[#a855f7] hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer active:scale-95 shadow-sm"
                title="View All Anime in Library"
              >
                <span>See All</span>
                <ChevronRight size={14} />
              </button>

              {topTrackedAnimes.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => scrollAnime('left')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll left"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollAnime('right')}
                    className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition cursor-pointer active:scale-95 shadow-sm"
                    title="Scroll right"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Horizontal Slider (X-Axis Scrollable - Max 10 on Home) */}
          {loading ? (
            <div className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2">
              {[1, 2, 3, 4, 5, 6].map((idx) => (
                <div key={idx} className="flex-none w-52 sm:w-56 md:w-60 h-72 rounded-2xl bg-white/5 shimmer border border-white/5" />
              ))}
            </div>
          ) : animes.length === 0 ? (
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
            <div
              ref={animeScrollRef}
              className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2 scroll-smooth"
            >
              {/* Anime Cards - 10 Most Recent (Recently Watched 1st, then Latest Added) */}
              {topTrackedAnimes.map((anime) => (
                <div
                  key={anime.id}
                  onClick={() => onSelectAnime(anime.id)}
                  className="group relative flex-none w-52 sm:w-56 md:w-60 h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer"
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

              {/* See All Card at the end */}
              <div
                onClick={() => router.push('/animes')}
                className="flex-none w-52 sm:w-56 md:w-60 h-72 glass-card rounded-2xl overflow-hidden group cursor-pointer flex flex-col justify-center items-center p-6 text-center border border-white/10 hover:border-[#7c5cff]/50 transition shadow-md hover:shadow-xl bg-[#7c5cff]/5 hover:bg-[#7c5cff]/10"
              >
                <div className="w-12 h-12 rounded-2xl bg-[#7c5cff]/20 text-[#a855f7] flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                  <Film size={24} />
                </div>
                <span className="text-sm font-bold text-white block">See All Anime</span>
                <span className="text-xs text-purple-300/80 font-mono mt-0.5 block">{animes.length} Total Series</span>
                <span className="mt-4 px-3 py-1.5 rounded-xl bg-[#7c5cff] text-white text-xs font-extrabold flex items-center gap-1 group-hover:bg-[#6c4cf0] transition shadow-md shadow-[#7c5cff]/30">
                  View All <ChevronRight size={14} />
                </span>
              </div>
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
                </h2>
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
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-0.5 border shadow-[0_0_8px_rgba(245,158,11,0.3)] backdrop-blur-md ${show.userCustomRating
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
                GANESH<span className="text-[#7c5cff]">SPACE</span>
              </span>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">
              The premier local Anime, Movies, Manga, Manhwa, Webtoons, Audio Stories tracking and streaming engine. Organize your PC video library with zero compromise.
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
              className="w-full max-w-2xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer">
                  <X size={18} />
                </button>
              </div>

              {/* Mode Switcher Tabs */}
              <div className="flex border-b border-white/10">
                <button
                  type="button"
                  onClick={() => setAddModalTab('local')}
                  className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${addModalTab === 'local'
                    ? 'border-[#7c5cff] text-white bg-white/5 rounded-t-xl'
                    : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                  <FolderOpen size={15} /> Local Folder
                </button>
                <button
                  type="button"
                  onClick={() => setAddModalTab('youtube')}
                  className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${addModalTab === 'youtube'
                    ? 'border-red-500 text-white bg-white/5 rounded-t-xl'
                    : 'border-transparent text-gray-400 hover:text-white'
                    }`}
                >
                  <Youtube size={15} className="text-red-500" /> Add YouTube Playlist
                </button>
              </div>

              {addModalTab === 'local' ? (
                <form onSubmit={handleAddAnime} className="space-y-4">
                  {/* ── 1. Search Anime Online & Auto-Fill (AniList & Fanart.tv) ── */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                        <Sparkles size={13} className="text-purple-400" />
                        <span>1. Search Anime Online (AniList & Fanart.tv)</span>
                      </label>
                      <span className="text-[10px] text-purple-300 font-mono">
                        Online Metadata
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <div className="relative flex-grow">
                        <input
                          type="text"
                          placeholder="Search anime title (e.g. Bleach, Attack on Titan, Solo Leveling)..."
                          className="w-full px-3 py-2 pl-8 rounded-xl glass-input text-xs text-white"
                          value={animeSearchQuery}
                          onChange={(e) => setAnimeSearchQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSearchAnimeOnline();
                            }
                          }}
                        />
                        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                      </div>
                      <button
                        type="button"
                        onClick={handleSearchAnimeOnline}
                        disabled={animeSearching || !(animeSearchQuery || animeTitle).trim()}
                        className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {animeSearching ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>Searching...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={13} />
                            <span>Search Online</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Searching & Fetching status */}
                    {animeSearching && (
                      <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Searching AniList...</span>
                      </p>
                    )}
                    {animeFetchingDetails && (
                      <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                        <Loader2 size={12} className="animate-spin" />
                        <span>Fetching details, wide banners & Fanart.tv logos...</span>
                      </p>
                    )}
                    {animeSearchError && (
                      <p className="text-[11px] text-purple-300 font-medium">
                        {animeSearchError}
                      </p>
                    )}

                    {/* Active Selected Anime Pill */}
                    {selectedAnimeOnline && (
                      <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                          <span className="text-xs font-bold text-white truncate">
                            Auto-filling: {selectedAnimeOnline.title}
                          </span>
                          {selectedAnimeOnline.year && (
                            <span className="text-[10px] text-purple-300 font-mono shrink-0">
                              ({selectedAnimeOnline.year})
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => setSelectedAnimeOnline(null)}
                          className="text-gray-400 hover:text-white p-1"
                          title="Clear online selection"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    )}

                    {/* Selectable Results Dropdown List */}
                    {animeSearchResults.length > 0 && (
                      <div className="mt-2 p-2 rounded-2xl bg-black/40 border border-white/10 max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-0.5">
                          Select match to auto-populate metadata & artwork:
                        </div>
                        {animeSearchResults.map((item) => {
                          const isSelected = selectedAnimeOnline?.id === item.id;
                          return (
                            <div
                              key={item.id}
                              onClick={() => handleSelectAnimeOnline(item)}
                              className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                                isSelected
                                  ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                                  : 'bg-white/[0.02] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-transparent'
                              }`}
                            >
                              {item.posterUrl ? (
                                <img
                                  src={item.posterUrl}
                                  alt={item.title}
                                  className="w-9 h-12 rounded-lg object-cover shrink-0 border border-white/10"
                                />
                              ) : (
                                <div className="w-9 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                  <Film size={14} className="text-gray-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate">{item.title}</div>
                                {item.romajiTitle && item.romajiTitle !== item.title && (
                                  <div className="text-[10px] text-gray-400 truncate">{item.romajiTitle}</div>
                                )}
                                <div className="flex items-center gap-2 text-[10px] text-purple-300 font-mono mt-0.5">
                                  {item.year && <span>{item.year}</span>}
                                  {item.episodes && <span>• {item.episodes} eps</span>}
                                  {item.format && <span className="uppercase">• {item.format}</span>}
                                </div>
                              </div>
                              {isSelected && (
                                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                                  <Check size={12} /> Selected
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* ── 2. Local Folder Directory Path ── */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      2. Select Folder Directory *
                    </label>
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

                  {/* Scanned files alert */}
                  {scanResult.length > 0 && (
                    <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold">
                        <CheckCircle2 size={16} className="text-emerald-400" />
                        <span>Found {parsedEpsCount || scanResult.length} video episode files</span>
                      </div>
                      <span className="text-[10px] font-mono text-gray-400">Ready to track</span>
                    </div>
                  )}

                  {/* ── 3. Naming Pattern ── */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Naming Pattern
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                      {NAMING_PATTERNS.map((pat) => (
                        <button
                          key={pat.id}
                          type="button"
                          onClick={() => setNamingPattern(pat.id)}
                          className={`px-3 py-2 rounded-xl text-left text-[11px] border transition cursor-pointer ${
                            namingPattern === pat.id ? 'bg-[#7c5cff]/20 border-[#7c5cff] text-white' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          <span className="font-bold block">{pat.label}</span>
                          <span className="text-[9px] opacity-60 block truncate">{pat.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── 4. Title & Counts ── */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                        Anime Display Title *
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Bleach TYBW"
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={animeTitle}
                        onChange={(e) => setAnimeTitle(e.target.value)}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                        Romaji / Japanese Title (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Bleach: Sennen Kessen-hen"
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={animeRomajiTitle}
                        onChange={(e) => setAnimeRomajiTitle(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Season Count & Total Episodes Inputs */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                        Release Year
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 2024"
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={animeYear}
                        onChange={(e) => setAnimeYear(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Synopsis / Overview */}
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Overview / Synopsis
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Enter anime synopsis or auto-fetch from online above..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeOverview}
                      onChange={(e) => setAnimeOverview(e.target.value)}
                    />
                  </div>

                  {/* ── 5. Poster Artwork (2:3) ── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                        Cover Picture Artwork (2:3)
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowOnlineSearchAdd(prev => !prev)}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                            showOnlineSearchAdd
                              ? 'bg-purple-600 text-white shadow-md'
                              : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30'
                          }`}
                        >
                          <Sparkles size={12} className="text-purple-300" />
                          {showOnlineSearchAdd ? 'Hide Cover Search' : 'Search Covers (AniList / Fanart.tv)'}
                        </button>
                        <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                          <ImagePlus size={13} />
                          <span>Upload File</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAnimeCoverUpload}
                          />
                        </label>
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Direct cover image URL (AniList / Fanart.tv)..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={coverUrl}
                      onChange={(e) => setCoverUrl(e.target.value)}
                    />

                    {/* Dedicated Online Cover Search Tab */}
                    {showOnlineSearchAdd && (
                      <div className="mt-2">
                        <AnimeCoverSearch
                          initialQuery={animeTitle || animeSearchQuery}
                          onSelectCover={(url) => {
                            setCoverUrl(url);
                            setShowOnlineSearchAdd(false);
                          }}
                          onClose={() => setShowOnlineSearchAdd(false)}
                        />
                      </div>
                    )}

                    {/* Cover Preview & Fetched Posters List */}
                    <div className="flex flex-wrap items-start gap-3 mt-1">
                      {coverUrl && (
                        <div className="relative w-24 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 shadow-lg shrink-0">
                          <img src={coverUrl} alt="Cover Preview" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setCoverUrl('')}
                            className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                            title="Remove Cover Image"
                          >
                            <X size={10} />
                          </button>
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-emerald-400">
                            Active
                          </span>
                        </div>
                      )}

                      {/* Quick Select from Fetched AniList & Fanart.tv Posters */}
                      {Array.isArray(animeImages?.covers) && animeImages.covers.length > 1 && (
                        <div className="flex-1 min-w-[200px]">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                            Fetched Online Posters ({animeImages.covers.length}):
                          </span>
                          <div className="flex gap-2 overflow-x-auto pb-1 max-h-36 custom-scrollbar">
                            {animeImages.covers.map((cov, idx) => {
                              const isSelected = coverUrl === cov.url;
                              return (
                                <div
                                  key={cov.url || idx}
                                  onClick={() => setCoverUrl(cov.url)}
                                  className={`relative w-16 h-24 rounded-lg overflow-hidden shrink-0 border cursor-pointer transition ${
                                    isSelected ? 'border-purple-400 ring-2 ring-purple-500/50' : 'border-white/10 hover:border-white/30 opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  <img src={cov.url} alt="Cover option" className="w-full h-full object-cover" />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] text-center text-gray-300 truncate px-0.5">
                                    {cov.source || 'Poster'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── 6. Backdrop Banner Artwork (16:9) ── */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-purple-400" />
                        <span>Backdrop Banner Artwork (16:9)</span>
                      </label>
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAnimeBannerUpload}
                        />
                      </label>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Wide 16:9 background image displayed on the top hero slider and anime detail backdrops.
                    </p>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                        className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                        value={animeBannerUrl}
                        onChange={(e) => setAnimeBannerUrl(e.target.value)}
                      />
                      {animeBannerUrl && (
                        <button
                          type="button"
                          onClick={() => setAnimeBannerUrl('')}
                          className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                          title="Clear banner"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Active Banner Preview */}
                    {animeBannerUrl && (
                      <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                        <img
                          src={animeBannerUrl}
                          alt="Backdrop Preview"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                            <Check size={11} /> Active 16:9 Banner
                          </span>
                          <button
                            type="button"
                            onClick={() => setAnimeBannerUrl('')}
                            className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Visual Banner Picker from AniList & Fanart.tv */}
                    {Array.isArray(animeImages?.banners) && animeImages.banners.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Choose from Fetched Online Banners ({animeImages.banners.length} from AniList & Fanart.tv):
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                          {animeImages.banners.map((ban, idx) => {
                            const isSelected = animeBannerUrl === ban.url;
                            return (
                              <div
                                key={ban.url || idx}
                                onClick={() => setAnimeBannerUrl(ban.url)}
                                className={`relative h-20 rounded-xl overflow-hidden border cursor-pointer transition ${
                                  isSelected
                                    ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                                    : 'border-white/10 hover:border-white/30 opacity-80 hover:opacity-100'
                                }`}
                              >
                                <img
                                  src={ban.url}
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

                  {/* ── 7. Custom Anime Logo / Title Art (Transparent PNG) ── */}
                  <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={enableAnimeLogo}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEnableAnimeLogo(checked);
                            if (checked && !animeLogoUrl && animeImages?.logos?.length > 0) {
                              setAnimeLogoUrl(animeImages.logos[0].url);
                            }
                          }}
                          className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <ImageIcon size={14} className="text-purple-400" />
                          Custom Anime Logo / Title Art
                        </span>
                      </label>
                      {enableAnimeLogo && (
                        <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                          <ImagePlus size={13} />
                          <span>Upload Local Logo</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAnimeLogoUpload}
                          />
                        </label>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-400">
                      Displays the anime's official transparent logo in the home page sliding banner in place of plain text title (just like movies).
                    </p>

                    {enableAnimeLogo && (
                      <div className="space-y-3 pt-1">
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            placeholder="Select below, upload, or paste transparent logo URL..."
                            value={animeLogoUrl}
                            onChange={(e) => setAnimeLogoUrl(e.target.value)}
                            className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                          />
                          {animeLogoUrl && (
                            <button
                              type="button"
                              onClick={() => setAnimeLogoUrl('')}
                              className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                              title="Clear logo"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* Current Selected Logo Preview */}
                        {animeLogoUrl && (
                          <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                            <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                              <img
                                src={animeLogoUrl}
                                alt="Selected Logo"
                                className="max-h-12 w-auto max-w-full object-contain"
                              />
                            </div>
                            <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                              <Check size={12} /> Active Logo
                            </span>
                          </div>
                        )}

                        {/* Fetched Logos Picker from Fanart.tv */}
                        {Array.isArray(animeImages?.logos) && animeImages.logos.length > 0 ? (
                          <div className="space-y-1.5">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                              Fetched Anime Logos ({animeImages.logos.length} available from Fanart.tv):
                            </span>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                              {animeImages.logos.map((logo, idx) => {
                                const isSelected = animeLogoUrl === logo.url;
                                return (
                                  <div
                                    key={logo.url || idx}
                                    onClick={() => setAnimeLogoUrl(logo.url)}
                                    className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                                      isSelected
                                        ? 'bg-purple-500/20 border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                                        : 'bg-white/[0.04] border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                    }`}
                                  >
                                    <div className="w-full h-12 flex items-center justify-center overflow-hidden">
                                      <img
                                        src={logo.url}
                                        alt="Logo"
                                        className="max-h-10 w-auto max-w-full object-contain"
                                      />
                                    </div>
                                    <span className="text-[9px] font-mono text-gray-400 truncate">
                                      {logo.type || `Logo ${idx + 1}`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <p className="text-[10px] text-gray-500 italic">
                            No online logos found for this anime. You can upload a local PNG logo image above.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── 8. Select Categories / Genres ── */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                        Select Categories / Genres (Max 5)
                      </label>
                      {addGenres.length > 0 && (
                        <span className="text-[10px] text-purple-300 font-mono">
                          {addGenres.length}/5 selected
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2 p-1 border border-white/5 rounded-xl bg-black/20 max-h-28 overflow-y-auto custom-scrollbar">
                      {GENRES_LIST.map((genre) => {
                        if (genre === 'All') return null;
                        const isSelected = addGenres.includes(genre);
                        return (
                          <button
                            key={genre}
                            type="button"
                            onClick={() => {
                              setAddGenres((prev) => {
                                const alreadySelected = prev.includes(genre);
                                if (alreadySelected) return prev.filter((g) => g !== genre);
                                if (prev.length >= 5) {
                                  setAlertMessage("You can select a maximum of 5 genres.");
                                  return prev;
                                }
                                return [...prev, genre];
                              });
                            }}
                            className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                              isSelected
                                ? 'bg-[#7c5cff] text-white shadow-md'
                                : 'bg-white/5 border border-white/5 text-gray-400 hover:text-white'
                            }`}
                          >
                            {genre}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Footer buttons */}
                  <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={scanning || (!folderPath && parsedEpsCount === 0)}
                      className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-lg"
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
                                className={`flex items-center gap-3 p-2 rounded-xl border transition cursor-pointer ${isChecked ? 'bg-[#7c5cff]/10 border-[#7c5cff]/40' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
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
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                          className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${isSelected
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
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${showOnlineSearchEdit
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
                  <p className="text-[11px] text-gray-400">
                    Wide 16:9 background banner displayed on top hero carousel and anime detail backdrops.
                  </p>

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
                        title="Clear banner"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Active Banner Preview */}
                  {editBannerUrl && (
                    <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                      <img
                        src={editBannerUrl.startsWith('http') || editBannerUrl.startsWith('data:') ? editBannerUrl : `/api/image?path=${encodeURIComponent(editBannerUrl)}`}
                        alt="Backdrop Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                          <Check size={11} /> Active 16:9 Banner
                        </span>
                        <button
                          type="button"
                          onClick={() => setEditBannerUrl('')}
                          className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Banner Picker from AniList & Fanart.tv */}
                  {Array.isArray(editAnimeImages?.banners) && editAnimeImages.banners.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Choose from Fetched Online Banners ({editAnimeImages.banners.length} from AniList & Fanart.tv):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                        {editAnimeImages.banners.map((ban, idx) => {
                          const isSelected = editBannerUrl === ban.url;
                          return (
                            <div
                              key={ban.url || idx}
                              onClick={() => setEditBannerUrl(ban.url)}
                              className={`relative h-20 rounded-xl overflow-hidden border cursor-pointer transition ${
                                isSelected
                                  ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                                  : 'border-white/10 hover:border-white/30 opacity-80 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={ban.url}
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
                        <ImageIcon size={14} className="text-purple-400" />
                        Custom Anime Logo / Title Art
                      </span>
                    </label>
                    {enableEditAnimeLogo && (
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                          <ImagePlus size={13} />
                          <span>Upload Local Logo</span>
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
                  <p className="text-[11px] text-gray-400">
                    Displays the anime's official transparent logo in the home page sliding banner in place of plain text title (just like movies).
                  </p>

                  {enableEditAnimeLogo && (
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
                            title="Clear logo"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Current Selected Logo Preview */}
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

                      {/* Visual Logo Picker from Fanart.tv */}
                      {Array.isArray(editAnimeImages?.logos) && editAnimeImages.logos.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Choose from Fetched Transparent Logos ({editAnimeImages.logos.length} from Fanart.tv / TMDB):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1.5 rounded-xl bg-black/50 border border-white/5">
                            {editAnimeImages.logos.map((logo, idx) => {
                              const isSelected = editLogoUrl === logo.url;
                              return (
                                <div
                                  key={logo.url || idx}
                                  onClick={() => setEditLogoUrl(logo.url)}
                                  className={`relative h-20 p-2 rounded-xl bg-white/[0.04] border flex items-center justify-center cursor-pointer transition ${
                                    isSelected
                                      ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)] bg-purple-500/10'
                                      : 'border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                  }`}
                                >
                                  <img
                                    src={logo.url}
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

      {/* Manga Complete Confirmation Modal */}
      <AnimatePresence>
        {mangaCompleteConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl text-center space-y-4 bg-[#0d1117]/95 text-white"
            >
              <div className="mx-auto w-12 h-12 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <CheckCircle2 size={24} />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wider">
                  {Boolean(mangaCompleteConfirm.isWatched || mangaCompleteConfirm.progressPercent === 100)
                    ? 'Mark Manga as Unread?'
                    : 'Mark Manga as Completed?'}
                </h3>
                <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                  Are you sure you want to {Boolean(mangaCompleteConfirm.isWatched || mangaCompleteConfirm.progressPercent === 100) ? 'reset reading progress for' : 'mark all chapters as watched/completed for'}{' '}
                  <span className="text-purple-300 font-semibold font-mono">"{mangaCompleteConfirm.title}"</span>?
                </p>
              </div>
              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setMangaCompleteConfirm(null)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = mangaCompleteConfirm;
                    setMangaCompleteConfirm(null);
                    handleToggleMangaWatched(target);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#7c5cff] hover:bg-[#6b4eeb] text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  Yes, Confirm
                </button>
              </div>
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
              className="w-full max-w-2xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white max-h-[90vh] overflow-y-auto custom-scrollbar"
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
                {/* ── 1. Search Manga Online & Auto-Fill (AniList & Fanart.tv) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" />
                      <span>1. Search Manga Online (AniList & Fanart.tv)</span>
                    </label>
                    <span className="text-[10px] text-purple-300 font-mono">
                      Online Metadata
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        placeholder="Search manga / webtoon title (e.g. Solo Leveling, Berserk, One Piece)..."
                        className="w-full px-3 py-2 pl-8 rounded-xl glass-input text-xs text-white"
                        value={mangaSearchQuery}
                        onChange={(e) => setMangaSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchMangaOnline();
                          }
                        }}
                      />
                      <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchMangaOnline}
                      disabled={mangaSearching || !(mangaSearchQuery || mangaTitle).trim()}
                      className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {mangaSearching ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Search Online</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Searching & Fetching status */}
                  {mangaSearching && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Searching AniList...</span>
                    </p>
                  )}
                  {mangaFetchingDetails && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Fetching details, wide banners & Fanart.tv logos...</span>
                    </p>
                  )}
                  {mangaSearchError && (
                    <p className="text-[11px] text-purple-300 font-medium">
                      {mangaSearchError}
                    </p>
                  )}

                  {/* Active Selected Manga Pill */}
                  {selectedMangaOnline && (
                    <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
                        <span className="text-xs font-bold text-white truncate">
                          Auto-filling: {selectedMangaOnline.title}
                        </span>
                        {selectedMangaOnline.year && (
                          <span className="text-[10px] text-purple-300 font-mono shrink-0">
                            ({selectedMangaOnline.year})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMangaOnline(null)}
                        className="text-gray-400 hover:text-white p-1"
                        title="Clear online selection"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Selectable Results Dropdown List */}
                  {mangaSearchResults.length > 0 && (
                    <div className="mt-2 p-2 rounded-2xl bg-black/40 border border-white/10 max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-0.5">
                        Select match to auto-populate metadata & artwork:
                      </div>
                      {mangaSearchResults.map((item) => {
                        const isSelected = selectedMangaOnline?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectMangaOnline(item)}
                            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                              isSelected
                                ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                                : 'bg-white/[0.02] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-transparent'
                            }`}
                          >
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                className="w-9 h-12 rounded-lg object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-9 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                <BookOpen size={14} className="text-gray-500" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate">{item.title}</div>
                              {item.romajiTitle && item.romajiTitle !== item.title && (
                                <div className="text-[10px] text-gray-400 truncate">{item.romajiTitle}</div>
                              )}
                              <div className="flex items-center gap-2 text-[10px] text-purple-300 font-mono mt-0.5">
                                {item.year && <span>{item.year}</span>}
                                {item.chapters && <span>• {item.chapters} chs</span>}
                                {item.volumes && <span>• {item.volumes} vols</span>}
                                {item.format && <span className="uppercase">• {item.format}</span>}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                                <Check size={12} /> Selected
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── 2. Directory Path ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    2. Select Manga Folder Directory *
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

                {/* ── 3. Title, Romaji & Counts ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Romaji / Alternate Title (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Na Honjaman Rebeleob"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaRomajiTitle}
                      onChange={(e) => setMangaRomajiTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Volumes, Total Chapters & Year */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Volumes Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 12 (optional)"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaTotalVolumes}
                      onChange={(e) => setMangaTotalVolumes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Chapters
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={mangaScanResult.length > 0 ? `Scanned: ${mangaScanResult.length}` : 'e.g. 100'}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaTotalChapters}
                      onChange={(e) => setMangaTotalChapters(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Release Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2018"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaYear}
                      onChange={(e) => setMangaYear(e.target.value)}
                    />
                  </div>
                </div>

                {/* ── 4. Description / Synopsis ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter manga description, synopsis, or auto-fetch from online..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={mangaDescription}
                    onChange={(e) => setMangaDescription(e.target.value)}
                  />
                </div>

                {/* ── 5. Cover Picture Artwork (2:3) ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Cover Picture Artwork (2:3)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMangaCoverSearch(true)}
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
                      >
                        <Sparkles size={12} />
                        <span>Search Covers (AniList / Fanart.tv)</span>
                      </button>
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMangaCoverUpload}
                        />
                      </label>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Direct cover image URL (AniList / Fanart.tv)..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={mangaCoverUrl}
                    onChange={(e) => setMangaCoverUrl(e.target.value)}
                  />

                  {/* Cover Preview & Fetched Posters List */}
                  <div className="flex flex-wrap items-start gap-3 mt-1">
                    {mangaCoverUrl && (
                      <div className="relative w-24 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 shadow-lg shrink-0">
                        <img
                          src={mangaCoverUrl}
                          alt="Cover Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setMangaCoverUrl('')}
                          className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                          title="Remove Cover Image"
                        >
                          <X size={10} />
                        </button>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-emerald-400">
                          Active
                        </span>
                      </div>
                    )}

                    {/* Quick Select from Fetched AniList & Fanart.tv Posters */}
                    {Array.isArray(mangaImages?.covers) && mangaImages.covers.length > 1 && (
                      <div className="flex-1 min-w-[200px]">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                          Fetched Online Posters ({mangaImages.covers.length}):
                        </span>
                        <div className="flex gap-2 overflow-x-auto pb-1 max-h-36 custom-scrollbar">
                          {mangaImages.covers.map((cov, idx) => {
                            const isSelected = mangaCoverUrl === cov.url;
                            return (
                              <div
                                key={cov.url || idx}
                                onClick={() => setMangaCoverUrl(cov.url)}
                                className={`relative w-16 h-24 rounded-lg overflow-hidden shrink-0 border cursor-pointer transition ${
                                  isSelected ? 'border-purple-400 ring-2 ring-purple-500/50' : 'border-white/10 hover:border-white/30 opacity-75 hover:opacity-100'
                                }`}
                              >
                                <img src={cov.url} alt="Cover option" className="w-full h-full object-cover" />
                                <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] text-center text-gray-300 truncate px-0.5">
                                  {cov.source || 'Poster'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── 6. Backdrop Banner Artwork (16:9) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-purple-400" />
                      <span>Backdrop Banner Artwork (16:9)</span>
                    </label>
                    <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                      <ImagePlus size={13} />
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMangaBannerUpload}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Wide 16:9 background image displayed on the top hero slider and manga details.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaBannerUrl}
                      onChange={(e) => setMangaBannerUrl(e.target.value)}
                    />
                    {mangaBannerUrl && (
                      <button
                        type="button"
                        onClick={() => setMangaBannerUrl('')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                        title="Clear banner"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Active Banner Preview */}
                  {mangaBannerUrl && (
                    <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                      <img
                        src={mangaBannerUrl}
                        alt="Backdrop Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                          <Check size={11} /> Active 16:9 Banner
                        </span>
                        <button
                          type="button"
                          onClick={() => setMangaBannerUrl('')}
                          className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Banner Picker from AniList & Fanart.tv */}
                  {Array.isArray(mangaImages?.banners) && mangaImages.banners.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Choose from Fetched Online Banners ({mangaImages.banners.length} from AniList & Fanart.tv):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                        {mangaImages.banners.map((ban, idx) => {
                          const isSelected = mangaBannerUrl === ban.url;
                          return (
                            <div
                              key={ban.url || idx}
                              onClick={() => setMangaBannerUrl(ban.url)}
                              className={`relative h-20 rounded-xl overflow-hidden border cursor-pointer transition ${
                                isSelected
                                  ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                                  : 'border-white/10 hover:border-white/30 opacity-80 hover:opacity-100'
                              }`}
                            >
                              <img
                                src={ban.url}
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

                {/* ── 7. Custom Manga Logo / Title Art (Transparent PNG) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableMangaLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableMangaLogo(checked);
                          if (checked && !mangaLogoUrl && mangaImages?.logos?.length > 0) {
                            setMangaLogoUrl(mangaImages.logos[0].url);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-purple-400" />
                        Custom Manga Logo / Title Art
                      </span>
                    </label>
                    {enableMangaLogo && (
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload Local Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMangaLogoUpload}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Displays the manga's official transparent logo in the home page sliding banner instead of simple text title.
                  </p>

                  {enableMangaLogo && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Select below, upload, or paste transparent logo URL..."
                          value={mangaLogoUrl}
                          onChange={(e) => setMangaLogoUrl(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                        />
                        {mangaLogoUrl && (
                          <button
                            type="button"
                            onClick={() => setMangaLogoUrl('')}
                            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                            title="Clear logo"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Current Selected Logo Preview */}
                      {mangaLogoUrl && (
                        <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                          <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                            <img
                              src={mangaLogoUrl}
                              alt="Selected Logo"
                              className="max-h-12 w-auto max-w-full object-contain"
                            />
                          </div>
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <Check size={12} /> Active Logo
                          </span>
                        </div>
                      )}

                      {/* Fetched Logos Picker from Fanart.tv */}
                      {Array.isArray(mangaImages?.logos) && mangaImages.logos.length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Fetched Manga Logos ({mangaImages.logos.length} available from Fanart.tv):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                            {mangaImages.logos.map((logo, idx) => {
                              const isSelected = mangaLogoUrl === logo.url;
                              return (
                                <div
                                  key={logo.url || idx}
                                  onClick={() => setMangaLogoUrl(logo.url)}
                                  className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-purple-500/20 border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                                      : 'bg-white/[0.04] border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                  }`}
                                >
                                  <div className="w-full h-12 flex items-center justify-center overflow-hidden">
                                    <img
                                      src={logo.url}
                                      alt="Logo"
                                      className="max-h-10 w-auto max-w-full object-contain"
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-400 truncate">
                                    {logo.type || `Logo ${idx + 1}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-500 italic">
                          No online logos found for this manga. You can upload a local PNG logo image above.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 8. Select Genres ── */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Select Genres (Max 5)
                    </label>
                    {mangaGenres.length > 0 && (
                      <span className="text-[10px] text-purple-300 font-mono">
                        {mangaGenres.length}/5 selected
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {GENRES_LIST.filter(g => g !== 'All').map((g) => {
                      const isSel = mangaGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel) setMangaGenres(mangaGenres.filter((item) => item !== g));
                            else if (mangaGenres.length < 5) setMangaGenres([...mangaGenres, g]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${isSel
                            ? 'bg-purple-600 border-purple-500 text-white shadow-md'
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
                    disabled={mangaScanning || (!mangaFolderPath && mangaScanResult.length === 0)}
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

      {/* Quick Mark Audio Story Watched Confirmation Modal */}
      <AnimatePresence>
        {audioStoryCompleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 bg-[#0d1117] text-white text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold">
                {audioStoryCompleteConfirm.isWatched ? 'Mark Audio Story Unlistened?' : 'Mark Entire Story as Listened?'}
              </h3>
              <p className="text-xs text-gray-400">
                {audioStoryCompleteConfirm.isWatched
                  ? `Reset "${audioStoryCompleteConfirm.title}" progress back to unlistened.`
                  : `Mark all tracks in "${audioStoryCompleteConfirm.title}" as completed (100%).`}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setAudioStoryCompleteConfirm(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = audioStoryCompleteConfirm;
                    setAudioStoryCompleteConfirm(null);
                    handleToggleAudioStoryWatched(target);
                  }}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 text-black text-xs font-bold cursor-pointer"
                >
                  Yes, Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Audio Story Modal */}
      <AnimatePresence>
        {showAddAudioStoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <Headphones className="text-cyan-400" size={20} />
                  <span>Track Local Audio Story Folder</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddAudioStoryModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddAudioStory} className="space-y-4">
                {/* 1. Directory Path */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Audio Story Folder Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste audio / video story directory path..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={audioStoryFolderPath}
                      onChange={(e) => setAudioStoryFolderPath(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseAudioStoryFolder}
                      disabled={audioStoryScanning}
                      className="px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      {audioStoryScanning ? 'Scanning...' : 'Browse PC Folder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleScanAudioStory}
                      disabled={audioStoryScanning || !audioStoryFolderPath}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                {/* Scanned files alert */}
                {audioStoryScanResult.length > 0 && (
                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>Found {audioStoryScanResult.length} tracks ({audioStoryScanResult.filter(t => !t.isVideo).length} audio, {audioStoryScanResult.filter(t => t.isVideo).length} video)</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">Ready to track</span>
                  </div>
                )}

                {/* 2. Story Title + Auto-Fetch Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Audio Story Title *
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchAudioStoryOnline}
                      disabled={fetchingAudioOnline || !audioStoryTitle.trim()}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-600/30 to-purple-600/30 hover:from-cyan-600/50 hover:to-purple-600/50 text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Auto-fetch synopsis and artwork from online"
                    >
                      <Sparkles size={12} className={fetchingAudioOnline ? 'animate-spin text-cyan-400' : 'text-cyan-300'} />
                      <span>{fetchingAudioOnline ? 'Fetching Online...' : 'Auto-Fetch from Online'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Lord of the Mysteries, The Sandman, Welcome to Night Vale..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryTitle}
                    onChange={(e) => setAudioStoryTitle(e.target.value)}
                  />
                  {audioStoryOnlineMessage && (
                    <p className={`text-[11px] mt-1 font-medium ${audioStoryOnlineMessage.startsWith('✓') ? 'text-emerald-400' : 'text-cyan-300'}`}>
                      {audioStoryOnlineMessage}
                    </p>
                  )}
                </div>

                {/* 3. Total Tracks */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Total Tracks / Parts
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder={audioStoryScanResult.length > 0 ? `Scanned: ${audioStoryScanResult.length} (or enter total)` : 'e.g. 24'}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryTotalTracks}
                    onChange={(e) => setAudioStoryTotalTracks(e.target.value)}
                  />
                </div>

                {/* 4. Description / Synopsis */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter audio story description, synopsis, narrator, or auto-fetch..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryDescription}
                    onChange={(e) => setAudioStoryDescription(e.target.value)}
                  />
                </div>

                {/* 5. Cover Picture */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Cover Picture Artwork
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAudioCoverSearch(true)}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-black text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
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
                        onChange={handleNewAudioCoverUpload}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleAudioCoverBrowse}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                    >
                      <HardDrive size={14} />
                      <span>Browse PC</span>
                    </button>
                  </div>

                  {audioStoryCoverUrl && (
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-2">
                      <img
                        src={audioStoryCoverUrl}
                        alt="Cover Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setAudioStoryCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. Genres */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {GENRES_LIST.filter(g => g !== 'All').map((g) => {
                      const isSel = audioStoryGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel) setAudioStoryGenres(audioStoryGenres.filter((item) => item !== g));
                            else setAudioStoryGenres([...audioStoryGenres, g]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${isSel
                            ? 'bg-cyan-500 border-cyan-400 text-black'
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
                    onClick={() => setShowAddAudioStoryModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={audioStoryScanning || !audioStoryFolderPath || !audioStoryTitle || audioStoryScanResult.length === 0}
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:opacity-40 text-black text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    {audioStoryScanning ? 'Processing...' : 'Track Audio Story Folder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Online Audio Cover Search Modal */}
      <AnimatePresence>
        {showAudioCoverSearch && (
          <MangaCoverSearch
            initialQuery={audioStoryTitle}
            uploadToImgBB={uploadToImgBB}
            onSelectCover={(url) => {
              setAudioStoryCoverUrl(url);
              setShowAudioCoverSearch(false);
            }}
            onClose={() => setShowAudioCoverSearch(false)}
          />
        )}
      </AnimatePresence>

      {/* Add Movie Modal */}
      <AddMovieModal
        isOpen={showAddMovieModal}
        onClose={() => setShowAddMovieModal(false)}
        onAddMovie={handleAddMovie}
        existingMovies={movies}
      />

      {/* Edit Movie Modal */}
      <EditMovieModal
        isOpen={Boolean(movieEditing)}
        movie={movieEditing}
        onClose={() => setMovieEditing(null)}
        onSaveMovie={handleSaveMovieEdit}
      />

      {/* Quick Mark Movie Watched Confirmation Modal */}
      <AnimatePresence>
        {movieCompleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 bg-[#0d1117] text-white text-center"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto">
                <CheckCircle2 size={24} />
              </div>
              <h3 className="text-base font-bold">
                {movieCompleteConfirm.watched || movieCompleteConfirm.completed || movieCompleteConfirm.watchStatus === 'Completed'
                  ? 'Mark Movie Incomplete?'
                  : 'Mark Movie as Completed?'}
              </h3>
              <p className="text-xs text-gray-400">
                {movieCompleteConfirm.watched || movieCompleteConfirm.completed || movieCompleteConfirm.watchStatus === 'Completed'
                  ? `Reset "${movieCompleteConfirm.title}" progress back to uncompleted.`
                  : `Mark "${movieCompleteConfirm.title}" as fully watched (100%).`}
              </p>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMovieCompleteConfirm(null)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-xs font-semibold text-gray-300 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = movieCompleteConfirm;
                    setMovieCompleteConfirm(null);
                    handleToggleMovieWatched(target);
                  }}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 text-black text-xs font-bold cursor-pointer"
                >
                  Yes, Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}