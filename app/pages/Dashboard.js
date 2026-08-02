"use client";

import React, { useState, useEffect, useRef } from 'react';
import { collection, query, onSnapshot, writeBatch, doc, deleteDoc, updateDoc, setDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { parseEpisode, sortEpisodes, NAMING_PATTERNS, processScannedFiles } from '../utils/parser';
import {
  getLocalAnimes, setLocalAnimes, upsertLocalAnime, deleteLocalAnime,
  getLocalEpisodes, setLocalEpisodes, addToDirtyQueue, getUserId
} from '../utils/localStore';
import { 
  Plus, Search, Settings, FolderOpen, Loader2, Play, 
  Trash2, SlidersHorizontal, FileVideo, CheckCircle2, ImagePlus,
  StickyNote, Download, Wifi, WifiOff, RefreshCw, ChevronLeft, ChevronRight,
  Star, Flame, TrendingUp, Clock, Sparkles, Film, Bookmark, Bell, Menu, X,
  Tv, Eye, ShieldCheck, Heart, User, Filter, Compass, Calendar, AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';

const GRADIENTS = [
  "from-violet-600 to-indigo-700",
  "from-purple-600 to-pink-600",
  "from-amber-500 to-rose-600",
  "from-emerald-500 to-teal-700",
  "from-cyan-600 to-blue-700",
];

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
  const watching = animesList.filter(a => (a.progressPercent || 0) > 0 && (a.progressPercent || 0) < 100);
  const others = animesList
    .filter(a => !((a.progressPercent || 0) > 0 && (a.progressPercent || 0) < 100))
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
    return {
      id: anime.id,
      title: anime.title.toUpperCase(),
      japaneseTitle: anime.japaneseTitle || 'LOCAL LIBRARY',
      banner: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
      rating: getDeterministicRating(anime.id, anime.rating),
      episodes: `${anime.episodeCount || 0} EP`,
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
  const { currentUser, updateVlcPath, updateDefaultPlayer } = useAuth();
  const { isOffline, isManualOffline, isSyncing, lastSyncedAt, setManualOffline, syncNow } = useOffline();
  
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, alpha, progress
  const [filterBy, setFilterBy] = useState('all'); // all, active, completed
  const [selectedGenre, setSelectedGenre] = useState('All');

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

  // Edit Anime Modal State
  const [editingAnime, setEditingAnime] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editGenres, setEditGenres] = useState([]);
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [uploadingEditCover, setUploadingEditCover] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');

  // Ref for trending carousel horizontal scroll
  const trendingRef = useRef(null);

  // Get dynamic lists from database animes
  const heroSlides = getHeroSlides(animes);

  const trendingShows = animes.slice(0, 6).map((anime, idx) => ({
    id: anime.id,
    rank: String(idx + 1).padStart(2, '0'),
    title: anime.title,
    episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 0',
    rating: getDeterministicRating(anime.id, anime.rating),
    image: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
    lang: anime.language || 'SUB/DUB',
    quality: anime.quality || 'HD'
  }));

  const recentlyUpdated = [...animes]
    .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    .slice(0, 6)
    .map(anime => ({
      id: anime.id,
      title: anime.title,
      episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 0',
      rating: getDeterministicRating(anime.id, anime.rating),
      image: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
      quality: anime.quality || 'HD'
    }));

  const popularThisWeek = [...animes]
    .sort((a, b) => (b.progressPercent || 0) - (a.progressPercent || 0))
    .slice(0, 4)
    .map(anime => ({
      id: anime.id,
      title: anime.title,
      studio: anime.studio || 'Local',
      rating: getDeterministicRating(anime.id, anime.rating),
      episodes: `${anime.episodeCount || 0} EP`,
      banner: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=1600&auto=format&fit=crop',
    }));

  const topRatedAnime = [...animes]
    .sort((a, b) => parseFloat(b.rating || 0) - parseFloat(a.rating || 0))
    .slice(0, 5)
    .map(anime => ({
      id: anime.id,
      title: anime.title,
      rating: getDeterministicRating(anime.id, anime.rating),
      episode: anime.lastWatchedEpisode ? `Ep ${anime.lastWatchedEpisode}` : 'EP 0',
      image: anime.thumbnailBase64 || (anime.thumbnailPath ? `/api/image?path=${encodeURIComponent(anime.thumbnailPath)}` : null) || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=600&auto=format&fit=crop',
    }));

  const autocompleteMatches = search.trim().length > 0
    ? animes.filter(anime => (anime.title || '').toLowerCase().includes(search.toLowerCase()))
    : [];

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

  // Load animes: localStorage first, then Firestore
  useEffect(() => {
    if (!currentUser) return;

    const localAnimes = getLocalAnimes();
    if (localAnimes.length > 0) {
      setAnimes(localAnimes);
      setLoading(false);
    }

    if (isOffline || !db) {
      setLoading(false);
      return;
    }

    const targetUserId = getUserId();
    const animeRef = collection(db, 'users', targetUserId, 'anime');
    const q = query(animeRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const animeUserId = targetUserId;
        list.push({ id: d.id, userId: animeUserId, ...d.data() });
      });
      setAnimes(list);
      setLocalAnimes(list);
      setLoading(false);
    }, (err) => {
      console.error('Firestore subscription error:', err);
      const local = getLocalAnimes();
      setAnimes(local);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser, isOffline]);

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

      const animeData = {
        title: animeTitle.trim(),
        folderPath: cleanPath,
        episodeCount: scanResult.length,
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
    if (data.success && data.data && data.data.url) {
      return data.data.url;
    } else {
      throw new Error(data.error?.message || 'Failed to upload to ImgBB');
    }
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
    const update = {
      id: editingAnime.id,
      title: editTitle.trim(),
      genres: editGenres,
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
      animeDocs.sort((a, b) => a.title.localeCompare(b.title));
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
      
      if (filterBy === 'active') return anime.progressPercent > 0 && anime.progressPercent < 100;
      if (filterBy === 'completed') return anime.progressPercent === 100;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'alpha') return (a?.title || '').localeCompare(b?.title || '');
      if (sortBy === 'progress') return b.progressPercent - a.progressPercent;
      return new Date(b.lastOpenedAt || 0) - new Date(a.lastOpenedAt || 0);
    });

  // Continue Watching items (watching status)
  const continueWatchingList = animes.filter(a => (a.progressPercent || 0) > 0 && (a.progressPercent || 0) < 100);

  const getInitials = (title) => {
    if (!title || typeof title !== 'string') return '';
    return title.split(' ').slice(0, 2).map(w => w ? w[0] : '').join('').toUpperCase();
  };

  const scrollTrending = (direction) => {
    if (trendingRef.current) {
      const { scrollLeft, clientWidth } = trendingRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.7 : scrollLeft + clientWidth * 0.7;
      trendingRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
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
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#111827]/95 backdrop-blur-md border border-white/10 rounded-2xl shadow-2xl z-50 max-h-80 overflow-y-auto no-scrollbar">
                {autocompleteMatches.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">
                    No matches found
                  </div>
                ) : (
                  <div className="p-2 space-y-1">
                    {autocompleteMatches.slice(0, 5).map((anime) => (
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
                            <img 
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
                            {anime.episodeCount} Episodes • {Math.round(anime.progressPercent || 0)}% completed
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
            <span>Add Folder</span>
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
                      <div className="absolute top-full left-0 right-0 mt-2 bg-[#0f172a]/95 border border-white/15 rounded-xl shadow-2xl z-50 max-h-52 overflow-y-auto no-scrollbar">
                        {autocompleteMatches.length === 0 ? (
                          <div className="p-3 text-center text-xs text-gray-400">No matches found</div>
                        ) : (
                          <div className="p-1 space-y-1">
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
                                    <img 
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
                    <a href="#trending" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Flame size={15} className="text-amber-400" /> Trending Today
                    </a>
                    <a href="#continue-watching" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#7c5cff] p-2 rounded-xl hover:bg-white/5 flex items-center gap-2 transition">
                      <Play size={15} className="text-[#7c5cff]" /> Continue Watching
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
                  <img 
                    src={currentHero.banner} 
                    alt={currentHero.title}
                    className="w-full h-full object-cover transform -rotate-[7deg] scale-[1.65] origin-center"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20" />
                </div>
              </div>

              {/* Hero Content Overlay */}
              <div className="relative z-20 p-6 md:p-14 w-full md:max-w-2xl space-y-5">
                {/* Spotlight Tag */}
                <span className="text-pink-400 font-extrabold text-sm uppercase tracking-wider block">
                  #{currentSlide + 1} Spotlight
                </span>

                {/* Title */}
                <div>
                  <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold uppercase tracking-tight text-white leading-tight drop-shadow-lg">
                    {currentHero.title}
                  </h1>
                  {/* Genres Tag Pills */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {currentHero.genres && currentHero.genres.slice(0, 2).map((genre, idx) => (
                      <span 
                        key={idx} 
                        className="px-2.5 py-0.5 rounded-full bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7] text-[10px] font-black uppercase tracking-wider"
                      >
                        {genre}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Metadata Section */}
                <div className="flex flex-wrap items-center gap-4 text-xs font-bold text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span className="text-amber-400 font-extrabold">{currentHero.rating}</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Tv size={14} className="text-[#a855f7]" /> TV
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={14} className="text-pink-500" /> {currentHero.episodes}
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

        {/* 3. TRENDING TODAY */}
        {trendingShows.length > 0 && (
          <section id="trending" className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Flame size={20} />
                </div>
                <div>
                  <h2 className="text-xl font-extrabold tracking-wide text-white">Trending Today</h2>
                  <p className="text-[11px] text-gray-400 font-medium">Most watched anime of the week</p>
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
                  onClick={() => onSelectAnime(show.id)}
                  className="flex-none w-44 md:w-52 group cursor-pointer"
                >
                  <div className="relative h-64 md:h-72 rounded-2xl overflow-hidden glass-card">
                    <img
                      src={show.image}
                      alt={show.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-transparent to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                    {/* Rank Badge */}
                    <div className="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-amber-400 font-black text-xs tracking-wider shadow-lg">
                      #{show.rank}
                    </div>

                    {/* Rating & Quality */}
                    <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                      <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-[10px] flex items-center gap-1">
                        <Star size={10} className="fill-amber-400" /> {show.rating}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-black/60 text-gray-300 text-[9px] font-extrabold uppercase">
                        {show.quality}
                      </span>
                    </div>

                    {/* Play Hover Overlay */}
                    <div className="absolute inset-0 bg-[#7c5cff]/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="p-3.5 rounded-full bg-[#7c5cff] text-white shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                        <Play size={22} fill="white" />
                      </div>
                    </div>

                    {/* Bottom Text */}
                    <div className="absolute bottom-0 inset-x-0 p-3 space-y-1">
                      <h3 className="font-bold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors">
                        {show.title}
                      </h3>
                      <div className="flex items-center justify-between text-[10px] text-gray-400">
                        <span>{show.episode}</span>
                        <span className="px-1.5 py-0.5 rounded bg-white/10 text-gray-300 font-semibold">{show.lang}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
                      <img src={anime.thumbnailBase64} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : anime.thumbnailPath ? (
                      <img src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
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
                      <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                        <span>Progress</span>
                        <span className="font-bold text-[#7c5cff]">{Math.round(anime.progressPercent || 0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-[#7c5cff] to-[#a855f7] rounded-full transition-all duration-500"
                          style={{ width: `${anime.progressPercent || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

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
                    <img src={show.image} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/70 text-gray-300 font-bold text-[9px]">
                      {show.episode}
                    </div>
                    <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-[#7c5cff]/80 text-white font-extrabold text-[8px]">
                      {show.quality || 'HD'}
                    </div>
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

        {/* 6. POPULAR THIS WEEK */}
        {popularThisWeek.length > 0 && (
          <section id="popular" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[#a855f7]">
                <TrendingUp size={20} />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-wide text-white">Popular This Week</h2>
                <p className="text-[11px] text-gray-400 font-medium">Top fan favorites and community hype</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {popularThisWeek.map((slide, idx) => (
                <div
                  key={`pop-${slide.id}-${idx}`}
                  onClick={() => onSelectAnime(slide.id)}
                  className="glass-card p-3 rounded-2xl flex gap-3 items-center group cursor-pointer"
                >
                  <div className="w-16 h-20 rounded-xl overflow-hidden flex-shrink-0 relative bg-[#181c24] flex items-center justify-center">
                    <img src={slide.banner} alt={slide.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[9px] font-bold uppercase text-[#a855f7] tracking-wider block">
                      {slide.studio}
                    </span>
                    <h4 className="font-extrabold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors">
                      {slide.title}
                    </h4>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-1">
                      <span className="text-amber-400 font-bold flex items-center gap-0.5">
                        <Star size={10} className="fill-amber-400" /> {slide.rating}
                      </span>
                      <span>•</span>
                      <span>{slide.episodes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 7. TOP RATED */}
        {topRatedAnime.length > 0 && (
          <section id="top-rated" className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Star size={20} className="fill-amber-400" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold tracking-wide text-white">Top Rated Anime</h2>
                <p className="text-[11px] text-gray-400 font-medium">Highest score masterpieces of all time</p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {topRatedAnime.map((show, idx) => (
                <div
                  key={`top-${show.id}-${idx}`}
                  onClick={() => onSelectAnime(show.id)}
                  className="glass-card rounded-2xl p-3 flex flex-col justify-between group cursor-pointer relative overflow-hidden"
                >
                  <div className="relative h-44 rounded-xl overflow-hidden mb-2 bg-[#181c24] flex items-center justify-center">
                    <img src={show.image} alt={show.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-amber-500 text-black font-black text-xs">
                      #{idx + 1}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-white line-clamp-1 group-hover:text-[#7c5cff] transition-colors">
                      {show.title}
                    </h4>
                    <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
                      <span className="text-amber-400 font-bold flex items-center gap-1">
                        <Star size={10} className="fill-amber-400" /> {show.rating}
                      </span>
                      <span>{show.episode}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 8. GENRES CATEGORY CHIPS */}
        <section id="genres" className="space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#7c5cff]/10 border border-[#7c5cff]/20 text-[#a855f7]">
              <Compass size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold tracking-wide text-white">Explore Genres</h2>
              <p className="text-[11px] text-gray-400 font-medium">Filter catalog by your favorite category</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {GENRES_LIST.map((genre) => (
              <button
                key={genre}
                onClick={() => setSelectedGenre(genre)}
                className={`px-4 py-2 rounded-full text-xs font-semibold glass-chip cursor-pointer transition ${selectedGenre === genre ? 'active text-white' : 'text-gray-300 hover:text-white'}`}
              >
                {genre}
              </button>
            ))}
          </div>
        </section>

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
                {filteredAnimes.length} anime series available in your local computer catalog
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

              {/* Anime Cards */}
              {filteredAnimes.map((anime) => (
                <div
                  key={anime.id}
                  onClick={() => onSelectAnime(anime.id)}
                  className="group relative h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer"
                >
                  {/* Poster Image */}
                  <div className="h-44 relative overflow-hidden bg-[#181c24] flex items-center justify-center">
                    {anime.thumbnailBase64 ? (
                      <img src={anime.thumbnailBase64} alt={anime.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : anime.thumbnailPath ? (
                      <img src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`} alt={anime.title} className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className={`w-full h-full bg-gradient-to-tr ${anime.coverGradient || 'from-violet-600 to-indigo-700'} flex items-center justify-center`}>
                        <span className="text-3xl font-black text-white/30 group-hover:scale-110 transition-transform">
                          {getInitials(anime.title)}
                        </span>
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
                      {anime.progressPercent === 100 ? (
                        <span className="px-2 py-0.5 rounded bg-emerald-500/90 text-[9px] uppercase font-bold text-white flex items-center gap-1">
                          <CheckCircle2 size={10} /> Completed
                        </span>
                      ) : anime.progressPercent > 0 ? (
                        <span className="px-2 py-0.5 rounded bg-[#7c5cff]/90 text-[9px] uppercase font-bold text-white">
                          Watching
                        </span>
                      ) : null}
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
                      <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1">
                        <span>{anime.episodeCount} Episodes</span>
                        <span className="font-bold text-white">{Math.round(anime.progressPercent || 0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${anime.progressPercent === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-[#7c5cff] to-[#a855f7]'}`}
                          style={{ width: `${anime.progressPercent || 0}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
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
              <li><a href="#trending" className="hover:text-white transition">Trending Today</a></li>
              <li><a href="#continue-watching" className="hover:text-white transition">Continue Watching</a></li>
              <li><a href="#catalog" className="hover:text-white transition">Local Catalog</a></li>
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
                  <FolderOpen className="text-[#7c5cff]" size={20} />
                  Track Local Anime Folder
                </h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                  <X size={18} />
                </button>
              </div>

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

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Cover Image (Optional)</label>
                  <div className="flex flex-col gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleNewCoverUpload}
                      className="w-full text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                    />
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
                    <option value="builtin">Built-in HTML5 Player</option>
                    <option value="artplayer">ArtPlayer (M3U8/Custom)</option>
                    <option value="videojs">Video.js Player (Web)</option>
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
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Cover Image (Optional)</label>
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

    </div>
  );
}