"use client";

import React, { useState, useEffect } from 'react';
import { collection, collectionGroup, query, onSnapshot, writeBatch, doc, deleteDoc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
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
  StickyNote, Download, Wifi, WifiOff, RefreshCw, CheckCheck
} from 'lucide-react';
import Link from 'next/link';

import { motion, AnimatePresence } from 'framer-motion';

const GRADIENTS = [
  "from-cyan-500 to-blue-600",
  "from-purple-500 to-indigo-600",
  "from-pink-500 to-rose-600",
  "from-violet-600 to-fuchsia-600",
  "from-teal-400 to-emerald-600",
];

export default function Dashboard({ onSelectAnime }) {
  const { currentUser, updateVlcPath, updateDefaultPlayer } = useAuth();
  const { isOffline, isManualOffline, isSyncing, lastSyncedAt, setManualOffline, syncNow } = useOffline();
  const [animes, setAnimes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('recent'); // recent, alpha, progress
  const [filterBy, setFilterBy] = useState('all'); // all, active, completed
  
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
  const [exportFormat, setExportFormat] = useState('csv'); // csv or json

  // Sync state with currentUser when it updates
  useEffect(() => {
    if (currentUser) {
      setCustomVlc(currentUser.vlcPath || '');
      setDefaultPlayer(currentUser.defaultPlayer || 'ask');
    }
  }, [currentUser]);


  // Load animes: localStorage first (instant), then Firestore if online
  useEffect(() => {
    if (!currentUser) return;

    // Load from localStorage immediately
    const localAnimes = getLocalAnimes();
    if (localAnimes.length > 0) {
      setAnimes(localAnimes);
      setLoading(false);
    }

    if (isOffline || !db) {
      setLoading(false);
      return;
    }

    // Subscribe to Firestore for live updates
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
      setLocalAnimes(list); // keep local cache in sync
      setLoading(false);
    }, (err) => {
      console.error('Firestore subscription error:', err);
      // Fall back to local cache
      const local = getLocalAnimes();
      setAnimes(local);
      setLoading(false);
    });

    return unsubscribe;
  }, [currentUser, isOffline]);

  // Browse Directory using Next.js backend API
  const handleBrowseFolder = async () => {
    setScanning(true);
    try {
      const response = await fetch('/api/select-folder');
      const data = await response.json();
      
      if (data.success && data.path) {
        const path = data.path;
        setFolderPath(path);
        // Auto-populate Title based on folder name
        const folderName = path.split(/[\\/]/).pop();
        setAnimeTitle(folderName || '');
        
        // Auto trigger scan
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
        console.error("Folder dialog failed:", data.error);
        alert("Failed to open dialog window automatically. Please type/paste the directory path manually.");
      }
    } catch (err) {
      console.error(err);
      alert("Folder dialog error. Please copy-paste the directory path directly.");
    } finally {
      setScanning(false);
    }
  };

  // Scan folder manually (useful if folder path is copy-pasted)
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
        
        // Auto populate title if empty
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

  // Add Anime & Episodes — writes locally first, queues Firestore if offline
  const handleAddAnime = async (e) => {
    e.preventDefault();
    const cleanPath = folderPath.trim();
    if (!cleanPath || !animeTitle.trim() || scanResult.length === 0) {
      alert('Please select/enter a valid folder, input a title, and scan files first.');
      return;
    }

    setScanning(true);
    try {
      const animeId = `anime_${Date.now()}`;
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

      // Always write to localStorage
      upsertLocalAnime({ id: animeId, ...animeData });
      const epObjs = sortedEps.map(({ docId, ...rest }) => ({ id: docId, ...rest }));
      setLocalEpisodes(animeId, epObjs);

      if (!isOffline && db) {
        // Write to Firestore directly
        const batch = writeBatch(db);
        const animeDocRef = doc(db, 'users', getUserId(), 'anime', animeId);
        batch.set(animeDocRef, animeData);
        sortedEps.forEach(({ docId, ...dbData }) => {
          const epDocRef = doc(db, 'users', getUserId(), 'anime', animeId, 'episodes', docId);
          batch.set(epDocRef, dbData);
        });
        await batch.commit();
      } else {
        // Queue for later sync
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

  // Delete tracked anime — local first, Firestore if online
  const handleDeleteAnime = async (anime, e) => {
    e.stopPropagation();
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

  // Compress an image data URI to a low-quality JPEG via Canvas (client-side)
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

  // Change Thumbnail — reads local file, compresses, stores base64 in Firestore document
  const handleChangeThumbnail = async (anime, e) => {
    e.stopPropagation();
    try {
      const animeId = anime.id;
      const targetUserId = anime.userId || currentUser.uid;

      // Step 1: open native image picker
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (!pickData.success || !pickData.path) return;

      // Step 2: read the raw image bytes from server as base64 data URI
      const b64Res = await fetch(`/api/image-base64?path=${encodeURIComponent(pickData.path)}`);
      const b64Data = await b64Res.json();
      if (!b64Data.success || !b64Data.dataUri) {
        alert('Failed to read image file.');
        return;
      }

      // Step 3: compress client-side using Canvas (max 400px, quality 0.45)
      const compressedBase64 = await compressImageToBase64(b64Data.dataUri, 400, 0.45);

      // Step 4: persist — store base64 string directly in document
      const updatedAt = new Date().toISOString();
      upsertLocalAnime({ id: animeId, thumbnailBase64: compressedBase64, updatedAt });
      if (!isOffline && db) {
        await updateDoc(doc(db, 'users', targetUserId, 'anime', animeId), {
          thumbnailBase64: compressedBase64,
          updatedAt,
        });
      } else {
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${animeId}`,
          payload: { id: animeId, userId: targetUserId, thumbnailBase64: compressedBase64, updatedAt },
        });
      }
    } catch (err) {
      console.error('Thumbnail selection error:', err);
      alert('Failed to set thumbnail: ' + err.message);
    }
  };

  // Mark all episodes as watched ("Mark Complete")
  const handleMarkAllWatched = async (anime, e) => {
    e.stopPropagation();
    try {
      const targetUserId = anime.userId || currentUser.uid;
      const episodes = getLocalEpisodes(anime.id);
      const updatedEps = episodes.map(ep => ({ ...ep, isWatched: true, updatedAt: new Date().toISOString() }));
      setLocalEpisodes(anime.id, updatedEps);
      upsertLocalAnime({ id: anime.id, progressPercent: 100, updatedAt: new Date().toISOString() });

      if (!isOffline && db) {
        const batch = writeBatch(db);
        updatedEps.forEach(ep => {
          const { id, ...data } = ep;
          batch.update(doc(db, 'users', targetUserId, 'anime', anime.id, 'episodes', id), {
            isWatched: true, updatedAt: new Date().toISOString()
          });
        });
        batch.update(doc(db, 'users', targetUserId, 'anime', anime.id), {
          progressPercent: 100, updatedAt: new Date().toISOString()
        });
        await batch.commit();
      } else {
        addToDirtyQueue({
          type: 'SET_EPISODES_BATCH',
          dedupeKey: `MARK_COMPLETE_${anime.id}`,
          payload: { animeId: anime.id, animeUserId: targetUserId, episodes: updatedEps },
        });
        addToDirtyQueue({
          type: 'SET_ANIME',
          dedupeKey: `SET_ANIME_${anime.id}`,
          payload: { id: anime.id, userId: targetUserId, progressPercent: 100, updatedAt: new Date().toISOString() },
        });
      }
    } catch (err) {
      console.error('Mark complete error:', err);
    }
  };

  // Save Settings
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    await updateVlcPath(customVlc.trim());
    await updateDefaultPlayer(defaultPlayer);
    setShowSettings(false);
  };

  // Export all anime + episode data as CSV
  const [exporting, setExporting] = useState(false);

  const handleExportData = async () => {
    if (!currentUser) return;
    setExporting(true);

    try {
      // Fetch all anime docs
      const animeSnap = await getDocs(collection(db, 'users', currentUser.uid, 'anime'));
      const animeDocs = [];
      animeSnap.forEach(d => animeDocs.push({ id: d.id, ...d.data() }));

      // Sort alphabetically for the export
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
          episodes.sort((a, b) => {
            const aOff = !!a.isOffPattern;
            const bOff = !!b.isOffPattern;
            if (aOff && !bOff) return -1;
            if (!aOff && bOff) return 1;
            if (aOff && bOff) {
              return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
            }
            return a.episodeNumber - b.episodeNumber;
          });

          exportData.push({
            title: anime.title,
            folderPath: anime.folderPath,
            episodeCount: anime.episodeCount || episodes.length,
            progressPercent: anime.progressPercent || 0,
            lastWatchedEpisode: anime.lastWatchedEpisode || '',
            lastOpenedAt: anime.lastOpenedAt || '',
            createdAt: anime.createdAt || '',
            coverGradient: anime.coverGradient || '',
            thumbnailPath: anime.thumbnailPath || '',
            episodes
          });
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
        URL.revokeObjectURL(url);
      } else {
        // ─── Helper: escape a cell value for CSV ─────────────────────────────
        const esc = (val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          // Wrap in quotes if the value contains comma, quote or newline
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return '"' + str.replace(/"/g, '""') + '"';
          }
          return str;
        };

        const formatDuration = (secs) => {
          if (!secs || secs === 0) return '0:00';
          const h = Math.floor(secs / 3600);
          const m = Math.floor((secs % 3600) / 60);
          const s = Math.floor(secs % 60);
          const pad = (n) => String(n).padStart(2, '0');
          return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
        };

        const rows = [];

        // ─── Sheet 1: Anime Summary ──────────────────────────────────────────
        rows.push(['=== ANIME LIBRARY SUMMARY ===']);
        rows.push([
          'Anime Title',
          'Folder Path',
          'Total Episodes',
          'Watched Episodes',
          'Progress %',
          'Last Watched Episode',
          'Last Opened At',
          'Created At',
          'Cover Gradient'
        ]);

        // ─── Sheet 2: Episode Detail header (appended below summary) ─────────
        const episodeRows = [];
        episodeRows.push([]);
        episodeRows.push(['=== EPISODE DETAILS (ALL ANIME) ===']);
        episodeRows.push([
          'Anime Title',
          'Episode Number',
          'File Name',
          'File Path',
          'Watched Status',
          'Watched Duration',
          'Total Duration',
          'Last Position',
          'Completion %',
          'Flags / Tags',
          'Episode Note',
          'Last Updated'
        ]);

        for (const anime of animeDocs) {
          // Fetch episodes subcollection
          const epSnap = await getDocs(
            collection(db, 'users', currentUser.uid, 'anime', anime.id, 'episodes')
          );
          const episodes = [];
          epSnap.forEach(d => episodes.push({ id: d.id, ...d.data() }));

          // Sort episodes using the custom sortEpisodes logic so off-pattern files are at the top
          episodes.sort((a, b) => {
            const aOff = !!a.isOffPattern;
            const bOff = !!b.isOffPattern;
            if (aOff && !bOff) return -1;
            if (!aOff && bOff) return 1;
            if (aOff && bOff) {
              return a.fileName.localeCompare(b.fileName, undefined, { numeric: true, sensitivity: 'base' });
            }
            return a.episodeNumber - b.episodeNumber;
          });

          const watchedCount = episodes.filter(ep => ep.isWatched).length;

          // Anime summary row
          rows.push([
            esc(anime.title),
            esc(anime.folderPath),
            esc(anime.episodeCount || episodes.length),
            esc(watchedCount),
            esc(Math.round(anime.progressPercent || 0) + '%'),
            esc(anime.lastWatchedEpisode || '—'),
            esc(anime.lastOpenedAt ? new Date(anime.lastOpenedAt).toLocaleString() : '—'),
            esc(anime.createdAt ? new Date(anime.createdAt).toLocaleString() : '—'),
            esc(anime.coverGradient || '—')
          ]);

          // Episode rows for this anime
          for (const ep of episodes) {
            const completionPct = ep.durationSeconds > 0
              ? Math.round((ep.watchedSeconds / ep.durationSeconds) * 100)
              : (ep.isWatched ? 100 : 0);

            episodeRows.push([
              esc(anime.title),
              esc('EP-' + String(ep.episodeNumber || '?').padStart(2, '0')),
              esc(ep.fileName),
              esc(ep.filePath),
              esc(ep.isWatched ? 'Watched ✓' : 'Not Watched'),
              esc(formatDuration(ep.watchedSeconds)),
              esc(formatDuration(ep.durationSeconds)),
              esc(formatDuration(ep.lastPositionSeconds)),
              esc(completionPct + '%'),
              esc((ep.flags && ep.flags.length > 0) ? ep.flags.join(', ') : '—'),
              esc(ep.note || '—'),
              esc(ep.updatedAt ? new Date(ep.updatedAt).toLocaleString() : '—')
            ]);
          }

          // Blank separator between anime in the episodes sheet
          episodeRows.push([]);
        }

        // Combine both sections into a single CSV string
        const allRows = [...rows, ...episodeRows];
        const csvContent = allRows
          .map(row => (Array.isArray(row) ? row.join(',') : row))
          .join('\n');

        // Trigger download
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `watchanime_tracking_${dateStr}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export data: ' + err.message);
    } finally {
      setExporting(false);
    }
  };


  // Process sorting & filtering
  const filteredAnimes = animes
    .filter(anime => {
      const matchSearch = anime.title.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      
      if (filterBy === 'active') return anime.progressPercent > 0 && anime.progressPercent < 100;
      if (filterBy === 'completed') return anime.progressPercent === 100;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'alpha') return a.title.localeCompare(b.title);
      if (sortBy === 'progress') return b.progressPercent - a.progressPercent;
      return new Date(b.lastOpenedAt || 0) - new Date(a.lastOpenedAt || 0);
    });

  // Initials for fallback covers
  const getInitials = (title) => {
    return title
      .split(' ')
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
  };

  return (
    <div className="min-h-screen pb-24 text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 glass-panel border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-neon-gradient flex items-center justify-center text-white shadow-cyan-glow">
            <FileVideo size={22} className="animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider">
              WATCH<span className="text-neonCyan">ANIME</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Local Tracker</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online / Offline / Syncing Status Badge */}
          {isSyncing ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neonCyan/10 border border-neonCyan/30 text-neonCyan text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <RefreshCw size={11} className="animate-spin" />
              Syncing
            </span>
          ) : isOffline ? (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold uppercase tracking-wider">
              <WifiOff size={11} />
              Offline Mode
            </span>
          ) : (
            <span className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              <Wifi size={11} />
              Online
            </span>
          )}

          <Link
            href="/notes"
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-300 hover:text-white hover:bg-white/10 hover:border-neonCyan/20 transition cursor-pointer flex items-center gap-1.5 font-bold uppercase tracking-wider shadow-inner"
          >
            <StickyNote size={14} className="text-neonCyan" />
            <span>Notes</span>
          </Link>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Settings"
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 md:px-12 mt-8">
        {/* Controls Panel */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center mb-10">
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10 pointer-events-none" size={18} />
            <input
              type="text"
              placeholder="Search local libraries..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm text-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex w-full md:w-auto items-center gap-3 overflow-x-auto pb-1 md:pb-0">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-gray-400 border border-white/5 whitespace-nowrap">
              <SlidersHorizontal size={14} />
              Sort
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-[#0b0b18] border border-white/5 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
            >
              <option value="recent">Recently Watched</option>
              <option value="alpha">Alphabetical (A-Z)</option>
              <option value="progress">Most Completed</option>
            </select>

            <div className="h-6 w-px bg-white/10" />

            <button
              onClick={() => setFilterBy('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition whitespace-nowrap ${
                filterBy === 'all' 
                  ? 'bg-neonCyan/10 border-neonCyan text-neonCyan shadow-cyan-glow' 
                  : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              All Library
            </button>
            <button
              onClick={() => setFilterBy('active')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition whitespace-nowrap ${
                filterBy === 'active' 
                  ? 'bg-neonPurple/10 border-neonPurple text-neonPurple shadow-purple-glow' 
                  : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Watching
            </button>
            <button
              onClick={() => setFilterBy('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition whitespace-nowrap ${
                filterBy === 'completed' 
                  ? 'bg-neonPink/10 border-neonPink text-neonPink shadow-cyan-glow' 
                  : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              Completed
            </button>
          </div>
        </div>

        {/* Anime List Grid */}
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
            className="glass-panel p-12 md:p-20 rounded-3xl text-center border border-white/5 max-w-xl mx-auto mt-12"
          >
            <FolderOpen className="mx-auto text-neonPurple mb-6 animate-bounce" size={48} />
            <h2 className="text-2xl font-bold tracking-wide mb-3">No Tracked Folders</h2>
            <p className="text-gray-400 text-sm max-w-sm mx-auto mb-8 leading-relaxed">
              Your tracking catalog is empty! Connect your local anime folders (where video filenames contain [EP-xxx]) to start parsing episodes.
            </p>
            <button
              onClick={() => setShowAddModal(true)}
              disabled={isOffline}
              className={`px-6 py-3.5 rounded-xl bg-neon-gradient text-white font-bold text-sm tracking-wider uppercase flex items-center justify-center gap-2.5 mx-auto shadow-purple-glow transition-all ${isOffline ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:brightness-110'}`}
              title={isOffline ? 'Cannot add anime while offline' : ''}
            >
              <Plus size={18} />
              {isOffline ? 'Offline — Cannot Add' : 'Add Local Anime Folder'}
            </button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {/* Add Card */}
            <div 
              onClick={() => !isOffline && setShowAddModal(true)}
              className={`group h-72 rounded-2xl border border-dashed flex flex-col justify-center items-center gap-4 transition shadow-inner ${isOffline ? 'border-white/5 bg-white/[0.01] text-gray-600 cursor-not-allowed opacity-40' : 'border-white/10 bg-white/[0.01] hover:bg-white/[0.03] hover:border-neonCyan/40 cursor-pointer text-gray-500 hover:text-neonCyan'}`}
              title={isOffline ? 'Cannot add anime while offline' : ''}
            >
              <div className={`p-4 rounded-full border transition-all ${isOffline ? 'bg-white/5 border-white/5' : 'bg-white/5 group-hover:bg-neonCyan/10 border-white/5 group-hover:border-neonCyan/20'}`}>
                <Plus size={24} />
              </div>
              <span className="text-xs uppercase tracking-wider font-bold">{isOffline ? 'Offline' : 'Add New Folder'}</span>
            </div>

            {filteredAnimes.map((anime) => (
              <Link
                key={anime.id}
                href={`/anime/${anime.id}`}
                className="group relative h-72 glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer block"
                style={{ display: 'flex', flexDirection: 'column' }}
              >
                <motion.div
                  layout
                  className="flex flex-col flex-1 overflow-hidden"
                >
                {/* Visual Cover — prefers compressed base64, falls back to legacy local path */}
                <div className={`h-40 ${!anime.thumbnailBase64 && !anime.thumbnailPath ? `bg-gradient-to-tr ${anime.coverGradient || 'from-violet-500 to-indigo-600'}` : ''} flex items-center justify-center relative overflow-hidden`}>
                  {anime.thumbnailBase64 ? (
                    <img
                      src={anime.thumbnailBase64}
                      alt={anime.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : anime.thumbnailPath ? (
                    <img 
                      src={`/api/image?path=${encodeURIComponent(anime.thumbnailPath)}`} 
                      alt={anime.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
                      <div className="absolute -top-10 -right-10 w-24 h-24 rounded-full bg-white/10 blur-xl pointer-events-none" />
                      {/* Initials Text */}
                      <span className="text-4xl md:text-5xl font-black text-white/20 select-none transform group-hover:scale-110 transition duration-300">
                        {getInitials(anime.title)}
                      </span>
                    </>
                  )}

                  {/* Actions overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center gap-2 transition-opacity duration-300">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => { e.preventDefault(); handleDeleteAnime(anime, e); }}
                        className="p-2.5 rounded-full bg-red-950/80 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition shadow-lg cursor-pointer"
                        title="Stop Tracking"
                      >
                        <Trash2 size={16} />
                      </button>
                      <div className="p-3 rounded-full bg-neonCyan text-bgDark shadow-cyan-glow transform translate-y-4 group-hover:translate-y-0 transition duration-300">
                        <Play size={20} fill="#03030d" />
                      </div>
                      <button
                        onClick={(e) => { e.preventDefault(); handleChangeThumbnail(anime, e); }}
                        className="p-2.5 rounded-full bg-violet-950/80 border border-violet-500/30 text-violet-400 hover:bg-violet-600 hover:text-white transition shadow-lg cursor-pointer"
                        title="Change Thumbnail"
                      >
                        <ImagePlus size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex gap-1.5">
                    {anime.progressPercent === 100 ? (
                      <span className="px-2 py-0.5 rounded bg-emerald-500/80 border border-emerald-400/30 text-[9px] uppercase tracking-wider font-bold text-white flex items-center gap-1 shadow-md">
                        <CheckCircle2 size={10} />
                        Completed
                      </span>
                    ) : anime.progressPercent > 0 ? (
                      <span className="px-2 py-0.5 rounded bg-neonPurple/80 border border-neonPurple/30 text-[9px] uppercase tracking-wider font-bold text-white shadow-md">
                        Watching
                      </span>
                    ) : null}
                  </div>
                </div>

                {/* Card Details */}
                <div className="p-4 flex flex-col justify-between flex-grow bg-[#0b0b1a]/40">
                  <div>
                    <h3 className="font-bold text-sm text-white line-clamp-1 group-hover:text-neonCyan transition duration-200" title={anime.title}>
                      {anime.title}
                    </h3>
                    <p className="text-[10px] text-gray-500 mt-1 line-clamp-1">
                      {anime.folderPath}
                    </p>
                  </div>

                  <div className="mt-3">
                    <div className="flex justify-between items-center text-[10px] text-gray-400 mb-1.5">
                      <span>{anime.episodeCount} Episodes</span>
                      <span className="font-semibold text-white">{Math.round(anime.progressPercent || 0)}%</span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          anime.progressPercent === 100 ? 'bg-emerald-500' : 'bg-neonCyan shadow-cyan-glow'
                        }`}
                        style={{ width: `${anime.progressPercent || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                </motion.div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {/* Add Anime Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-xl glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border z-10 max-h-[90vh] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
            >
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <FolderOpen className="text-neonCyan" size={20} />
                Track Local Anime Folder
              </h2>

              <form onSubmit={handleAddAnime} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Select Local Folder *</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste local directory path..."
                      className="flex-grow px-3 py-2 rounded-lg glass-input text-xs text-white"
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-lg text-xs font-semibold cursor-pointer text-white flex items-center gap-1.5 transition"
                    >
                      Browse
                    </button>
                    {folderPath && (
                      <button
                        type="button"
                        onClick={handleScan}
                        className="px-4 py-2 bg-neonCyan/10 border border-neonCyan/30 text-neonCyan hover:bg-neonCyan hover:text-bgDark rounded-lg text-xs font-bold transition"
                      >
                        Scan Folder
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Episode Naming Pattern</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1.5">
                    {NAMING_PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setNamingPattern(pat.id)}
                        className={`px-3 py-2 rounded-lg text-left text-[11px] border transition cursor-pointer ${
                          namingPattern === pat.id
                            ? 'bg-neonCyan/10 border-neonCyan text-neonCyan shadow-cyan-glow'
                            : 'bg-white/[0.02] border-white/5 text-gray-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <span className="font-bold block">{pat.label}</span>
                        <span className="text-[9px] opacity-60 block mt-0.5 truncate">{pat.example}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Anime Display Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Bleach TYBW"
                    className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white"
                    value={animeTitle}
                    onChange={(e) => setAnimeTitle(e.target.value)}
                    required
                    disabled={!folderPath}
                  />
                </div>

                {folderPath && (
                  <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400">Scan Status:</span>
                      {scanning ? (
                        <span className="text-neonCyan flex items-center gap-1">
                          <Loader2 className="animate-spin" size={14} />
                          Scanning folder...
                        </span>
                      ) : parsedEpsCount > 0 ? (
                        <span className="text-emerald-400 font-semibold">
                          Detected {parsedEpsCount} episode files
                        </span>
                      ) : (
                        <span className="text-amber-400 font-semibold flex items-center gap-1">
                          No episodes scanned yet (click Scan Folder)
                        </span>
                      )}
                    </div>

                    {parsedEpsCount > 0 && (
                      <div className="mt-3 max-h-32 overflow-y-auto border border-white/5 rounded p-2 text-[10px] text-gray-500 space-y-1 bg-black/20">
                        {scanResult.slice(0, 5).map((ep, i) => (
                          <div key={i} className="truncate flex justify-between">
                            <span className="text-gray-300">{ep.name}</span>
                            <span className="text-neonCyan">EP-{parseEpisode(ep.name, i, namingPattern).episodeNumber}</span>
                          </div>
                        ))}
                        {scanResult.length > 5 && (
                          <div className="text-center pt-1 text-[9px] text-neonPurple font-semibold">
                            + {scanResult.length - 5} more episodes...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false);
                      setFolderPath('');
                      setAnimeTitle('');
                      setScanResult([]);
                      setNamingPattern('auto');
                    }}
                    className="px-4 py-2 bg-transparent text-gray-400 hover:text-white text-xs cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={scanning || parsedEpsCount === 0}
                    className="px-5 py-2.5 rounded-lg bg-neon-gradient text-white text-xs font-bold uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer disabled:opacity-50"
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
              className="w-full max-w-md glass-panel p-6 rounded-2xl border border-white/10 shadow-neon-border modal-scroll"
            >
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-white">
                <Settings className="text-neonPurple animate-spin-slow" size={20} />
                Application Settings
              </h2>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Custom VLC Path</label>
                  <input
                    type="text"
                    placeholder="e.g. C:\Program Files\VideoLAN\VLC\vlc.exe"
                    className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white"
                    value={customVlc}
                    onChange={(e) => setCustomVlc(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Leave blank to use default location. On Windows, we automatically check common paths in <code>Program Files</code>.
                  </p>
                </div>

                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">Default Media Player</label>
                  <select
                    value={defaultPlayer}
                    onChange={(e) => setDefaultPlayer(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg glass-input text-xs text-white bg-[#0b0b18]"
                  >
                    <option value="ask">Ask every time</option>
                    <option value="builtin">Built-in HTML5 Player</option>
                    <option value="artplayer">ArtPlayer (M3U8/Custom)</option>
                    <option value="vlc">VLC Player (Local Desktop)</option>
                  </select>
                  <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">
                    Choose which media player is selected by default when playing an episode. Choose "Ask every time" to choose on every click.
                  </p>
                </div>

                {/* Export Data Card */}
                <div className="p-4 rounded-xl bg-[#0b0b1a]/80 border border-white/5 text-xs space-y-3">
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <Download size={14} className="text-neonCyan" />
                    Export Viewing Data
                  </h3>
                  <p className="text-gray-400 leading-relaxed text-[11px]">
                    Download a comprehensive backup of all tracked anime, progress, flags, notes, and play history.
                  </p>
                  
                  <div className="flex items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-2 rounded-lg">
                    <span className="text-[10px] uppercase font-bold text-gray-400">Format</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setExportFormat('csv')}
                        className={`px-3 py-1 rounded-md text-[10px] uppercase font-bold transition ${
                          exportFormat === 'csv'
                            ? 'bg-neonCyan/10 border border-neonCyan text-neonCyan'
                            : 'bg-transparent border border-transparent text-gray-400 hover:text-white'
                        }`}
                      >
                        CSV
                      </button>
                      <button
                        type="button"
                        onClick={() => setExportFormat('json')}
                        className={`px-3 py-1 rounded-md text-[10px] uppercase font-bold transition ${
                          exportFormat === 'json'
                            ? 'bg-neonPurple/10 border border-neonPurple text-neonPurple'
                            : 'bg-transparent border border-transparent text-gray-400 hover:text-white'
                        }`}
                      >
                        JSON
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleExportData}
                    disabled={exporting || isOffline}
                    className="w-full mt-1 px-4 py-2.5 rounded-lg bg-neonCyan/10 border border-neonCyan/30 text-neonCyan hover:bg-neonCyan hover:text-bgDark font-bold uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    title={isOffline ? 'Not available in offline mode' : ''}
                  >
                    {exporting ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Building Export...
                      </>
                    ) : (
                      <>
                        <Download size={14} />
                        {isOffline ? 'Export Disabled (Offline)' : `Download Data (.${exportFormat})`}
                      </>
                    )}
                  </button>
                </div>

                {/* Offline Mode Controls */}
                <div className="p-3 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-400 space-y-2">
                  <h3 className="font-semibold text-white">Connectivity</h3>
                  <div className="flex items-center justify-between">
                    <span>Mode:</span>
                    <span className={`font-bold ${isOffline ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {isOffline ? 'Offline' : 'Online'}
                    </span>
                  </div>
                  {lastSyncedAt && (
                    <div className="flex items-center justify-between">
                      <span>Last sync:</span>
                      <span className="text-gray-300">{lastSyncedAt.toLocaleTimeString()}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setManualOffline(!isManualOffline)}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition cursor-pointer ${
                        isManualOffline
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300 hover:bg-amber-500/30'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:text-white hover:border-white/20'
                      }`}
                    >
                      <WifiOff size={10} className="inline mr-1" />
                      {isManualOffline ? 'Exit Offline Mode' : 'Go Offline'}
                    </button>
                    <button
                      type="button"
                      onClick={syncNow}
                      disabled={isOffline || isSyncing}
                      className="flex-1 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border bg-neonCyan/10 border-neonCyan/30 text-neonCyan hover:bg-neonCyan/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <RefreshCw size={10} className={`inline mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing...' : 'Sync Now'}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Reset Firebase config? This will require re-entering database credentials.')) {
                        localStorage.removeItem('firebase_config');
                        window.location.reload();
                      }
                    }}
                    className="text-red-400 hover:underline mt-1 text-[10px]"
                  >
                    Disconnect Database Config
                  </button>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowSettings(false);
                      setCustomVlc(currentUser?.vlcPath || '');
                    }}
                    className="px-4 py-2 bg-transparent text-gray-400 hover:text-white text-xs cursor-pointer"
                  >
                    Close
                  </button>
                  <button
                    type="submit"
                    disabled={isOffline}
                    className="px-5 py-2.5 rounded-lg bg-neon-gradient text-white text-xs font-bold uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    title={isOffline ? 'Settings cannot be saved in offline mode' : ''}
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
