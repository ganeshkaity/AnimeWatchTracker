"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  getLocalManga, upsertLocalManga, deleteLocalManga,
  getLocalChapters, setLocalChapters, upsertLocalChapter, deleteLocalChapter,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import { getReadingProgress, saveReadingProgress } from '../utils/indexedDBStore';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { doc, getDocs, collection, setDoc, deleteDoc, updateDoc, writeBatch, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import{
  ArrowLeft, BookOpen, Clock, Folder, CheckCircle2, Bookmark,
  StickyNote, Star, RefreshCw, FolderPlus, FolderTree, Search,
  ChevronDown, ChevronUp, Trash2, Edit3, Check, ExternalLink, HardDrive,
  FileText, Sparkles, Heart, SlidersHorizontal, ImagePlus, X, FilePlus,
  Move, CornerDownRight, ArrowRight, Layers, Loader2, RotateCcw,
  PlusCircle, CheckSquare, FolderMinus, AlertTriangle, Menu, FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MangaCoverSearch from '../components/MangaCoverSearch';
import { getSubfolder } from '../utils/parser';

const GENRES_LIST = [
  "All", "Action", "Adventure", "Comedy", "Crime", "Demons", "Detective", "Drama", 
  "Ecchi", "Fantasy", "Game", "Harem", "Historical", "Horror", "Isekai", "Josei", 
  "Magic", "Martial Arts", "Mecha", "Military", "Music", "Mystery", "Mythology", 
  "Parody", "Police", "Post-Apocalyptic", "Psychological", "Reincarnation", "Reverse Harem", 
  "Romance", "Samurai", "School", "Sci-Fi", "Seinen", "Shoujo", "Shounen", "Slice of Life", 
  "Space", "Sports", "Super Power", "Supernatural", "Suspense", "Survival", "Thriller", 
  "Time Travel", "Vampires"
];

export function extractChapterNumber(filename) {
  if (!filename) return 0;
  let clean = String(filename).replace(/\.(pdf|zip|cbz)$/i, '').trim();

  // Strip resolution tags and years in parens/brackets
  clean = clean.replace(/\[\d{3,4}p\]/gi, '').replace(/\(\d{3,4}p\)/gi, '');
  clean = clean.replace(/[\(\[]\d{4}[\)\]]/g, '');

  // 1. Explicit Chapter keywords: "Chapter 12", "Chap 12", "Ch. 12", "Ch 12.5"
  const chMatch = clean.match(/(?:chapter|chap|ch)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (chMatch) return parseFloat(chMatch[1]);

  // 2. Volume + Chapter: "Vol. 1 Ch. 2" or "v01 c02"
  const vcMatch = clean.match(/(?:vol|volume)[\s._-]*\d+[\s._-]*(?:ch|c)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (vcMatch) return parseFloat(vcMatch[1]);

  // 3. Word-bounded "c01", "c.01"
  const cMatch = clean.match(/(?:^|[\s_\-\[])c[\s._-]*(\d+(?:\.\d+)?)(?:$|[\s_\-\]\.])/i);
  if (cMatch) return parseFloat(cMatch[1]);

  // 4. Number following a hyphen or separator e.g. "Title - 01"
  const sepMatch = clean.match(/[-–—]\s*(\d+(?:\.\d+)?)/);
  if (sepMatch) return parseFloat(sepMatch[1]);

  // 5. Volume keyword alone: "Volume 01", "Vol. 2", "v01"
  const volMatch = clean.match(/(?:volume|vol|v)[\s._-]*(\d+(?:\.\d+)?)/i);
  if (volMatch) return parseFloat(volMatch[1]);

  // 6. Leading numbers e.g. "01 - The Beginning", "001.pdf"
  const leadMatch = clean.match(/^\[?(\d+(?:\.\d+)?)\]?[\s._-]/);
  if (leadMatch) return parseFloat(leadMatch[1]);

  // 7. Find all standalone numbers; chapter is typically the last number
  const allNums = clean.match(/\b(\d+(?:\.\d+)?)\b/g);
  if (allNums && allNums.length > 0) {
    return parseFloat(allNums[allNums.length - 1]);
  }

  return 0;
}

export function naturalChapterSort(a, b, ascending = true) {
  const nameA = a.name || a.fileName || a.title || '';
  const nameB = b.name || b.fileName || b.title || '';

  const numA = a.chapterNumber !== undefined && !isNaN(Number(a.chapterNumber)) && Number(a.chapterNumber) > 0
    ? Number(a.chapterNumber)
    : extractChapterNumber(nameA);
  const numB = b.chapterNumber !== undefined && !isNaN(Number(b.chapterNumber)) && Number(b.chapterNumber) > 0
    ? Number(b.chapterNumber)
    : extractChapterNumber(nameB);

  if (numA !== numB && !isNaN(numA) && !isNaN(numB)) {
    return ascending ? numA - numB : numB - numA;
  }

  const strCompare = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  return ascending ? strCompare : -strCompare;
}

export default function MangaDetail({ mangaId, onBack, onReadChapter }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();

  const [manga, setManga] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [sortAscending, setSortAscending] = useState(true);
  const [chapterStatusFilter, setChapterStatusFilter] = useState('incomplete'); // 'incomplete' | 'completed' | 'all'
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('ALL');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const filterInitializedMangaId = useRef(null);

  // Note Modal state
  const [editingChapter, setEditingChapter] = useState(null);
  const [noteText, setNoteText] = useState('');

  // Rescan & Multi-Option Sync State
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [rescanStatus, setRescanStatus] = useState('idle'); // 'idle' | 'scanning' | 'preview' | 'applying' | 'completed' | 'error'
  const [rescanMessage, setRescanMessage] = useState('');
  const [manageFolderExpanded, setManageFolderExpanded] = useState(false);
  const [rescanDiff, setRescanDiff] = useState(null);
  const [rescanSyncMode, setRescanSyncMode] = useState('normal'); // 'normal' | 'new_only' | 'deleted_only' | 'custom'
  const [selectedNewChIds, setSelectedNewChIds] = useState(new Set());
  const [selectedRemovedChIds, setSelectedRemovedChIds] = useState(new Set());
  const [rescanActiveTab, setRescanActiveTab] = useState('all'); // 'all' | 'new' | 'removed'

  // ── Rating State ──────────────────────────────────────────────────────────
  const [hoverRating, setHoverRating] = useState(0);
  const [manualRatingInput, setManualRatingInput] = useState('');
  const [fetchingAniListRating, setFetchingAniListRating] = useState(false);
  const [ratingMessage, setRatingMessage] = useState('');
  const [showRatingPanel, setShowRatingPanel] = useState(false);

  // ── File Manager State ───────────────────────────────────────────────────
  const [showFileManagerModal, setShowFileManagerModal] = useState(false);
  const [fmTree, setFmTree] = useState(null);
  const [fmLoading, setFmLoading] = useState(false);
  const [fmCurrentPath, setFmCurrentPath] = useState('');
  const [fmNewFolderName, setFmNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [fmNewFileName, setFmNewFileName] = useState('');
  const [showNewFileInput, setShowNewFileInput] = useState(false);
  const [fmRenameTarget, setFmRenameTarget] = useState(null);
  const [fmNewName, setFmNewName] = useState('');
  const [fmMoveTarget, setFmMoveTarget] = useState(null);
  const [fmDestPath, setFmDestPath] = useState('');

  // ── Edit Manga Modal State ───────────────────────────────────────────────
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTotalChapters, setEditTotalChapters] = useState('');
  const [editTotalVolumes, setEditTotalVolumes] = useState('');
  const [editGenres, setEditGenres] = useState([]);
  const [editDescription, setEditDescription] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editLogoUrl, setEditLogoUrl] = useState('');
  const [enableEditMangaLogo, setEnableEditMangaLogo] = useState(false);
  const [editMangaImages, setEditMangaImages] = useState({ covers: [], banners: [], logos: [] });
  const [searchingEditArtwork, setSearchingEditArtwork] = useState(false);
  const [editArtworkSearchQuery, setEditArtworkSearchQuery] = useState('');
  const [bannerSectionOpen, setBannerSectionOpen] = useState(true);
  const [logoSectionOpen, setLogoSectionOpen] = useState(true);
  const [showOnlineSearchEdit, setShowOnlineSearchEdit] = useState(false);
  const [uploadingEditCover, setUploadingEditCover] = useState(false);
  const [fetchingEditOnline, setFetchingEditOnline] = useState(false);
  const [editOnlineMessage, setEditOnlineMessage] = useState('');

  // ── Mark Entire Manga Complete State ─────────────────────────────────────
  const [showMarkAllModal, setShowMarkAllModal] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);

  // ── Sync with DB State ───────────────────────────────────────────────────
  const [isSyncingWithDb, setIsSyncingWithDb] = useState(false);
  const [syncDbMessage, setSyncDbMessage] = useState('');

  // ── Load Manga & Chapters ──────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      let localManga = getLocalManga(mangaId);
      let localChapters = getLocalChapters(mangaId);

      // Pull from Firestore if missing locally
      if (!localManga && currentUser?.uid && db) {
        const snap = await getDocs(collection(db, 'users', currentUser.uid, 'mangas'));
        snap.forEach((d) => {
          if (d.id === mangaId) {
            localManga = { id: d.id, ...d.data() };
            upsertLocalManga(localManga);
          }
        });
      }

      if (localChapters.length === 0 && currentUser?.uid && db) {
        const cSnap = await getDocs(collection(db, 'users', currentUser.uid, 'mangas', mangaId, 'chapters'));
        const dbChs = [];
        cSnap.forEach((d) => dbChs.push({ id: d.id, ...d.data() }));
        if (dbChs.length > 0) {
          localChapters = dbChs;
          setLocalChapters(mangaId, dbChs);
        }
      }

      // Enrich chapters with latest IndexedDB reading progress
      const enrichedChapters = await Promise.all(
        localChapters.map(async (ch) => {
          const docId = ch.id || `manga_${mangaId}_${encodeURIComponent(ch.name || ch.fileName || '')}`;
          let prog = await getReadingProgress(docId);
          if (!prog && ch.name) {
            prog = await getReadingProgress(`manga_${mangaId}_${encodeURIComponent(ch.name)}`) || await getReadingProgress(ch.name);
          }
          if (prog) {
            const isReadVal = prog.isRead !== undefined
              ? Boolean(prog.isRead)
              : ((prog.progress || 0) >= 95 || Boolean(ch.isRead || ch.isWatched));
            return {
              ...ch,
              lastPage: prog.lastPage,
              totalPages: prog.totalPages,
              progress: prog.progress !== undefined ? prog.progress : (isReadVal ? 100 : 0),
              isRead: isReadVal,
              isWatched: isReadVal,
            };
          }
          const isReadVal = Boolean(ch.isRead || ch.isWatched || (ch.progress && ch.progress >= 95));
          return {
            ...ch,
            isRead: isReadVal,
            isWatched: isReadVal,
          };
        })
      );

      // Sort in natural ascending order (small to big)
      enrichedChapters.sort((a, b) => naturalChapterSort(a, b, true));

      const watchedChsCount = enrichedChapters.filter((c) => c.isWatched || c.isRead).length;
      const totalChsCount = (localManga?.totalChapters && Number(localManga.totalChapters) > 0)
        ? Number(localManga.totalChapters)
        : enrichedChapters.length;
      const overallPct = totalChsCount > 0 ? Math.round((watchedChsCount / totalChsCount) * 100) : (localManga?.progressPercent || 0);
      const isMangaWatched = overallPct === 100 || Boolean(localManga?.isWatched);

      const normalizedManga = localManga ? {
        ...localManga,
        progressPercent: overallPct,
        completedChapters: watchedChsCount,
        isWatched: isMangaWatched,
        isCompleted: isMangaWatched,
        status: isMangaWatched ? 'completed' : (watchedChsCount > 0 ? 'reading' : localManga.status || 'ready'),
      } : null;

      if (normalizedManga) {
        upsertLocalManga(normalizedManga);
      }

      setManga(normalizedManga);
      setChapters(enrichedChapters);

      // If user is online and logged in, sync any local watched status to Firestore
      if (!isOffline && db && currentUser?.uid && normalizedManga && (isMangaWatched || watchedChsCount > 0)) {
        setDoc(doc(db, 'users', currentUser.uid, 'mangas', mangaId), {
          isWatched: isMangaWatched,
          isCompleted: isMangaWatched,
          progressPercent: overallPct,
          completedChapters: watchedChsCount,
          status: normalizedManga.status,
          updatedAt: normalizedManga.updatedAt || new Date().toISOString(),
        }, { merge: true }).catch(() => {});
      }
    } catch (err) {
      console.error('[MangaDetail] Error loading manga:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mangaId) loadData();
  }, [mangaId, currentUser]);

  // Set default filter mode: if manga is completed, default to 'all'; otherwise 'incomplete' (unread only)
  useEffect(() => {
    if (!loading && manga && filterInitializedMangaId.current !== mangaId) {
      filterInitializedMangaId.current = mangaId;
      const isMangaDone = Boolean(
        manga.isCompleted ||
        manga.isWatched ||
        (manga.status && manga.status.toLowerCase() === 'completed') ||
        (chapters.length > 0 && chapters.every((c) => Boolean(c.isRead || c.isWatched || (c.progress && c.progress >= 95))))
      );
      setChapterStatusFilter(isMangaDone ? 'all' : 'incomplete');
    }
  }, [loading, manga, chapters, mangaId]);

  // ── Subfolders / Volumes grouping ──────────────────────────────────────────
  const subfolders = useMemo(() => {
    const set = new Set();
    chapters.forEach((c) => {
      if (c.filePath && manga?.folderPath) {
        const rel = c.filePath.replace(manga.folderPath, '').replace(/^[\\/]/, '');
        const parts = rel.split(/[\\/]/);
        if (parts.length > 1) {
          set.add(parts[0]);
        }
      }
    });
    return Array.from(set).sort();
  }, [chapters, manga]);

  // Chapter counts for filter tabs
  const unreadChaptersCount = useMemo(() => {
    return chapters.filter(c => !c.isRead && !c.isWatched && !(c.progress && c.progress >= 95)).length;
  }, [chapters]);

  const completedChaptersCount = useMemo(() => {
    return chapters.filter(c => Boolean(c.isRead || c.isWatched || (c.progress && c.progress >= 95))).length;
  }, [chapters]);

  // Filtered chapters (respecting status filter, subfolder, search, and sort order)
  const filteredChapters = useMemo(() => {
    const list = chapters.filter((c) => {
      const matchSearch = (c.name || c.title || '').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (selectedSubfolder !== 'ALL') {
        const rel = (c.filePath || '').replace(manga?.folderPath || '', '').replace(/^[\\/]/, '');
        if (!rel.startsWith(selectedSubfolder)) return false;
      }

      const isChRead = Boolean(c.isRead || c.isWatched || (c.progress && c.progress >= 95));
      if (chapterStatusFilter === 'incomplete') {
        return !isChRead;
      }
      if (chapterStatusFilter === 'completed') {
        return isChRead;
      }
      // 'all'
      return true;
    });

    return list.sort((a, b) => naturalChapterSort(a, b, sortAscending));
  }, [chapters, search, selectedSubfolder, manga, sortAscending, chapterStatusFilter]);

  // Target chapter for "Start / Continue Reading": first unread chapter in natural ascending order
  const targetReadingChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    const sortedAsc = [...chapters].sort((a, b) => naturalChapterSort(a, b, true));
    const firstUnread = sortedAsc.find((c) => !c.isRead && !c.isWatched && !(c.progress && c.progress >= 95));
    return firstUnread || sortedAsc[0];
  }, [chapters]);

  const targetReadingChapterNum = useMemo(() => {
    if (!targetReadingChapter) return '';
    const num = extractChapterNumber(targetReadingChapter.name || targetReadingChapter.fileName || targetReadingChapter.title);
    if (num !== 0 && num !== null && num !== undefined && !isNaN(num)) return num;
    if (targetReadingChapter.chapterNumber !== undefined && Number(targetReadingChapter.chapterNumber) > 0) {
      return targetReadingChapter.chapterNumber;
    }
    return '';
  }, [targetReadingChapter]);

  const hasAnyChaptersRead = useMemo(() => {
    return chapters.some((c) => c.isRead || c.isWatched || (c.progress && c.progress >= 95));
  }, [chapters]);

  const areAllChaptersRead = useMemo(() => {
    return chapters.length > 0 && chapters.every((c) => c.isRead || c.isWatched || (c.progress && c.progress >= 95));
  }, [chapters]);

  // Handle open chapter in reader
  const handleOpenChapter = (chapter) => {
    if (manga) {
      const updated = {
        ...manga,
        lastWatchedChapter: chapter.name || chapter.fileName || '',
        lastOpenedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setManga(updated);
      upsertLocalManga(updated);
    }
    if (onReadChapter) {
      onReadChapter(chapter);
    } else {
      router.push(`/reader/${mangaId}?chapter=${encodeURIComponent(chapter.id || chapter.name)}&path=${encodeURIComponent(chapter.filePath)}&title=${encodeURIComponent(manga?.title || '')}&chapterTitle=${encodeURIComponent(chapter.name || '')}`);
    }
  };

  // ── Rescan Folder & Compute Diff for Preview & Consent ──────────────────────────
  const handleRescanFolder = async () => {
    if (!manga?.folderPath) return;
    setRescanStatus('scanning');
    setRescanMessage('Scanning folder for PDF chapters and library differences...');
    setShowRescanModal(true);

    try {
      const res = await fetch('/api/manga/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: manga.folderPath }),
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to scan manga folder');
      }

      const scannedFiles = Array.isArray(data.chapters) ? data.chapters : [];
      // Natural sort discovered files
      scannedFiles.sort((a, b) => naturalChapterSort(a, b, true));

      const existingById = new Map(chapters.map(c => [c.id, c]));
      const existingByPath = new Map(chapters.map(c => [(c.filePath || '').replace(/\\/g, '/').toLowerCase(), c]));
      const existingByName = new Map(chapters.map(c => [(c.name || c.fileName || '').toLowerCase(), c]));

      const findExisting = (pCh, rawId) => {
        if (existingById.has(rawId)) return existingById.get(rawId);
        const normPath = (pCh.filePath || '').replace(/\\/g, '/').toLowerCase();
        if (normPath && existingByPath.has(normPath)) return existingByPath.get(normPath);
        const normName = (pCh.name || pCh.fileName || '').toLowerCase();
        if (normName && existingByName.has(normName)) return existingByName.get(normName);
        return null;
      };

      const scannedCandidateChs = scannedFiles.map((ch, idx) => {
        const rawId = ch.id || `chap_${ch.chapterNumber || (idx + 1)}_${encodeURIComponent(ch.name || ch.fileName || '')}`;
        const existing = findExisting(ch, rawId);
        const chId = existing?.id || rawId;

        return {
          ...ch,
          id: chId,
          mangaId: mangaId,
          chapterNumber: ch.chapterNumber !== undefined ? ch.chapterNumber : (existing?.chapterNumber || extractChapterNumber(ch.name || ch.fileName)),
          name: ch.name || ch.fileName,
          fileName: ch.fileName || ch.name,
          filePath: ch.filePath,
          size: ch.size || existing?.size || 0,
          isRead: existing ? !!existing.isRead : false,
          isWatched: existing ? !!existing.isWatched : false,
          progress: existing ? (existing.progress || 0) : 0,
          lastPage: existing ? (existing.lastPage || 1) : 1,
          totalPages: existing ? (existing.totalPages || 0) : 0,
          flags: existing ? (existing.flags || []) : [],
          isFlagged: existing ? !!existing.isFlagged : false,
          note: existing ? (existing.note || '') : '',
          createdAt: existing?.createdAt || ch.createdAt || Date.now(),
          updatedAt: new Date().toISOString(),
        };
      });

      // Calculate Diff against current chapters
      const existingIdSet = new Set(chapters.map(c => c.id));
      const scannedIdSet = new Set(scannedCandidateChs.map(c => c.id));

      const newChapters = scannedCandidateChs.filter(c => !existingIdSet.has(c.id));
      const retainedChapters = scannedCandidateChs.filter(c => existingIdSet.has(c.id));
      const removedChapters = chapters.filter(c => !scannedIdSet.has(c.id));

      // Folder Diff
      const oldFolders = new Set(chapters.map(c => getSubfolder(c.filePath, manga?.folderPath || '')));
      const newFolders = new Set(scannedCandidateChs.map(c => getSubfolder(c.filePath, manga?.folderPath || '')));

      const addedFoldersList = Array.from(newFolders).filter(f => f && f !== '' && !oldFolders.has(f));
      const removedFoldersList = Array.from(oldFolders).filter(f => f && f !== '' && !newFolders.has(f));

      const mergedList = [...retainedChapters, ...newChapters].sort((a, b) => naturalChapterSort(a, b, true));

      const diff = {
        newChapters,
        retainedChapters,
        removedChapters,
        addedFolders: addedFoldersList,
        removedFolders: removedFoldersList,
        allMergedChapters: mergedList,
        scannedCount: scannedCandidateChs.length,
      };

      setRescanDiff(diff);

      // Initialize selection sets
      const allNewIds = new Set(newChapters.map(c => c.id));
      const allRemovedIds = new Set(removedChapters.map(c => c.id));
      setSelectedNewChIds(allNewIds);
      setSelectedRemovedChIds(allRemovedIds);

      // Smart default mode based on detected changes
      if (newChapters.length > 0 && removedChapters.length > 0) {
        setRescanSyncMode('normal');
      } else if (newChapters.length > 0) {
        setRescanSyncMode('new_only');
      } else if (removedChapters.length > 0) {
        setRescanSyncMode('deleted_only');
      } else {
        setRescanSyncMode('normal');
      }

      setRescanActiveTab('all');
      setRescanStatus('preview');
    } catch (err) {
      console.error('Error during manga rescan:', err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Error occurred while rescanning folder');
    }
  };

  // Switch Sync Mode handler
  const handleSelectSyncMode = (mode) => {
    setRescanSyncMode(mode);
    if (!rescanDiff) return;
    if (mode === 'normal') {
      setSelectedNewChIds(new Set(rescanDiff.newChapters.map(c => c.id)));
      setSelectedRemovedChIds(new Set(rescanDiff.removedChapters.map(c => c.id)));
    } else if (mode === 'new_only') {
      setSelectedNewChIds(new Set(rescanDiff.newChapters.map(c => c.id)));
      setSelectedRemovedChIds(new Set()); // Nothing deleted
    } else if (mode === 'deleted_only') {
      setSelectedNewChIds(new Set()); // Nothing added
      setSelectedRemovedChIds(new Set(rescanDiff.removedChapters.map(c => c.id)));
    }
  };

  // Toggle single new chapter checkbox
  const handleToggleNewChapter = (chId) => {
    setRescanSyncMode('custom');
    setSelectedNewChIds(prev => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  // Toggle single removed chapter checkbox (checked = will remove)
  const handleToggleRemovedChapter = (chId) => {
    setRescanSyncMode('custom');
    setSelectedRemovedChIds(prev => {
      const next = new Set(prev);
      if (next.has(chId)) next.delete(chId);
      else next.add(chId);
      return next;
    });
  };

  // Select all or deselect all new chapters
  const handleSelectAllNew = (select) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    if (select) {
      setSelectedNewChIds(new Set(rescanDiff.newChapters.map(c => c.id)));
    } else {
      setSelectedNewChIds(new Set());
    }
  };

  // Select all or deselect all removed chapters
  const handleSelectAllRemoved = (select) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    if (select) {
      setSelectedRemovedChIds(new Set(rescanDiff.removedChapters.map(c => c.id)));
    } else {
      setSelectedRemovedChIds(new Set());
    }
  };

  // Toggle entire subfolder for new chapters
  const handleToggleFolderNew = (folderName, selectAll) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    const folderChIds = rescanDiff.newChapters
      .filter(c => getSubfolder(c.filePath, manga?.folderPath || '') === folderName)
      .map(c => c.id);
    setSelectedNewChIds(prev => {
      const next = new Set(prev);
      folderChIds.forEach(id => {
        if (selectAll) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  // Toggle entire subfolder for removed chapters
  const handleToggleFolderRemoved = (folderName, selectAll) => {
    if (!rescanDiff) return;
    setRescanSyncMode('custom');
    const folderChIds = rescanDiff.removedChapters
      .filter(c => getSubfolder(c.filePath, manga?.folderPath || '') === folderName)
      .map(c => c.id);
    setSelectedRemovedChIds(prev => {
      const next = new Set(prev);
      folderChIds.forEach(id => {
        if (selectAll) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  // Apply Rescan Changes Handler (respects chosen sync mode & selected items)
  const handleApplyRescanChanges = async () => {
    if (!rescanDiff || !manga) return;
    setRescanStatus('applying');
    setRescanMessage('Applying rescan changes to library and database...');

    try {
      const { newChapters, removedChapters } = rescanDiff;

      // Filter exact chapters to add & remove based on user's selected sets
      const chaptersToAdd = newChapters.filter(c => selectedNewChIds.has(c.id));
      const chaptersToRemove = removedChapters.filter(c => selectedRemovedChIds.has(c.id));

      // Build retained list: all currently existing chapters EXCEPT those selected for removal
      const removedIdSet = new Set(chaptersToRemove.map(c => c.id));
      const retainedCurrentChapters = chapters.filter(c => !removedIdSet.has(c.id));

      // Build final merged chapters
      const allMergedChapters = [...retainedCurrentChapters, ...chaptersToAdd].sort((a, b) => naturalChapterSort(a, b, true));

      const total = allMergedChapters.length;
      const completed = allMergedChapters.filter(c => Boolean(c.isRead || c.isWatched || (c.progress && c.progress >= 95))).length;
      const effectiveTotalChapters = (manga?.totalChapters && Number(manga.totalChapters) > 0)
        ? Number(manga.totalChapters)
        : total;
      const newProgressPercent = effectiveTotalChapters > 0 ? Math.round((completed / effectiveTotalChapters) * 100) : 0;
      const isMangaDone = effectiveTotalChapters > 0 && completed >= effectiveTotalChapters;

      const updatedMangaDoc = {
        ...manga,
        chapterCount: total,
        totalChapters: effectiveTotalChapters,
        completedChapters: completed,
        progressPercent: newProgressPercent,
        isWatched: isMangaDone,
        isCompleted: isMangaDone,
        status: isMangaDone ? 'completed' : (completed > 0 ? 'reading' : manga.status || 'ready'),
        updatedAt: new Date().toISOString(),
      };

      // 1. Immediately apply locally to state & storage
      chaptersToAdd.forEach(ch => upsertLocalChapter(mangaId, ch));
      chaptersToRemove.forEach(ch => deleteLocalChapter(mangaId, ch.id));

      setChapters(allMergedChapters);
      setLocalChapters(mangaId, allMergedChapters);
      upsertLocalManga(updatedMangaDoc);
      setManga(updatedMangaDoc);

      // 2. Upload to Firestore if online
      if (!isOffline && db && currentUser) {
        const batch = writeBatch(db);

        // Upload newly added chapters
        chaptersToAdd.forEach(ch => {
          const chRef = doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id);
          batch.set(chRef, ch, { merge: true });
        });

        // Delete selected removed chapters
        chaptersToRemove.forEach(ch => {
          const chRef = doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id);
          batch.delete(chRef);
        });

        // Update manga metadata
        const mangaRef = doc(db, 'users', getUserId(), 'mangas', mangaId);
        batch.set(mangaRef, {
          chapterCount: total,
          totalChapters: effectiveTotalChapters,
          completedChapters: completed,
          progressPercent: newProgressPercent,
          isWatched: isMangaDone,
          isCompleted: isMangaDone,
          status: isMangaDone ? 'completed' : (completed > 0 ? 'reading' : manga.status || 'ready'),
          updatedAt: new Date().toISOString(),
        }, { merge: true });

        await batch.commit();
      } else {
        // Queue dirty ops for offline sync
        chaptersToAdd.forEach(ch => {
          addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, ...ch } });
        });
        chaptersToRemove.forEach(ch => {
          addToDirtyQueue({ type: 'DELETE_CHAPTER', dedupeKey: `DELETE_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, id: ch.id } });
        });
        addToDirtyQueue({
          type: 'SET_MANGA',
          dedupeKey: `SET_MANGA_${mangaId}`,
          payload: {
            id: mangaId,
            chapterCount: total,
            totalChapters: effectiveTotalChapters,
            completedChapters: completed,
            progressPercent: newProgressPercent,
            isWatched: isMangaDone,
            isCompleted: isMangaDone,
            status: isMangaDone ? 'completed' : (completed > 0 ? 'reading' : manga.status || 'ready'),
            updatedAt: new Date().toISOString(),
          },
        });
      }

      setRescanStatus('completed');
      let summaryText = 'Library updated successfully!';
      if (chaptersToAdd.length > 0 && chaptersToRemove.length > 0) {
        summaryText = `Added ${chaptersToAdd.length} new chapter(s) and removed ${chaptersToRemove.length} missing item(s).`;
      } else if (chaptersToAdd.length > 0) {
        summaryText = `Added ${chaptersToAdd.length} new chapter(s). Existing & missing items were kept untouched.`;
      } else if (chaptersToRemove.length > 0) {
        summaryText = `Removed ${chaptersToRemove.length} missing item(s) from library.`;
      } else {
        summaryText = `No chapter changes applied. Library metadata refreshed.`;
      }
      setRescanMessage(`Rescan complete! ${summaryText} (${total} total chapters, ${completed} completed).`);
    } catch (err) {
      console.error("Error applying manga rescan changes:", err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Failed to apply rescan changes');
    }
  };

  // ── Ratings Handlers ───────────────────────────────────────────────────────
  const handleSaveRating = async (newRating) => {
    if (!manga || !mangaId) return;
    const ratingStr = parseFloat(newRating).toFixed(1);
    const updated = { ...manga, rating: ratingStr, updatedAt: new Date().toISOString() };
    setManga(updated);
    upsertLocalManga(updated);

    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId), {
          rating: ratingStr,
          updatedAt: new Date().toISOString()
        });
      } catch (err) {
        addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updated });
      }
    } else {
      addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updated });
    }
    setRatingMessage(`✓ Rating saved: ${ratingStr}/10`);
    setTimeout(() => setRatingMessage(''), 3500);
  };

  const handleFetchAniListRating = async () => {
    if (!manga?.title || fetchingAniListRating) return;
    setFetchingAniListRating(true);
    setRatingMessage('Connecting to AniList...');

    try {
      const res = await fetch(`/api/manga-rating?q=${encodeURIComponent(manga.title)}`);
      const data = await res.json();

      if (data.success && data.rating) {
        const ratingStr = parseFloat(data.rating).toFixed(1);
        const updated = {
          ...manga,
          rating: ratingStr,
          aniListRating: ratingStr,
          aniListScore: data.score || ratingStr,
          aniListPopularity: data.popularity || null,
          aniListRank: data.rank || null,
          aniListStatus: data.status || null,
          aniListUrl: data.url || '',
          synopsis: manga.synopsis || data.synopsis || '',
          updatedAt: new Date().toISOString()
        };

        setManga(updated);
        upsertLocalManga(updated);

        if (!isOffline && db && currentUser) {
          try {
            await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId), {
              rating: ratingStr,
              aniListRating: ratingStr,
              aniListScore: data.score || ratingStr,
              aniListPopularity: data.popularity || null,
              aniListRank: data.rank || null,
              aniListStatus: data.status || null,
              aniListUrl: data.url || '',
              synopsis: updated.synopsis,
              updatedAt: new Date().toISOString()
            });
          } catch (err) {
            addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updated });
          }
        } else {
          addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updated });
        }

        setRatingMessage(`✓ Updated: ${ratingStr}/10 (${data.source}${data.popularity ? ` • Pop #${data.popularity}` : ''})`);
        setTimeout(() => setRatingMessage(''), 5000);
      } else {
        setRatingMessage(data.error || 'Could not fetch rating from AniList.');
        setTimeout(() => setRatingMessage(''), 4000);
      }
    } catch (err) {
      setRatingMessage('Failed to connect: ' + err.message);
      setTimeout(() => setRatingMessage(''), 4000);
    } finally {
      setFetchingAniListRating(false);
    }
  };

  // ── File Manager Handlers ──────────────────────────────────────────────────
  const buildTreeFromChapters = useCallback((chList, rootFolder, currentPath) => {
    const root = (rootFolder || 'Root').replace(/\\/g, '/').replace(/\/$/, '');
    const current = (currentPath || root).replace(/\\/g, '/').replace(/\/$/, '');

    const children = [];
    const folderSet = new Map();

    chList.forEach((ch) => {
      const rawPath = (ch.filePath || ch.fileName || ch.name || ch.title || '').replace(/\\/g, '/');
      let relPath = rawPath;

      if (current && rawPath.startsWith(current)) {
        relPath = rawPath.slice(current.length).replace(/^\//, '');
      } else if (root && rawPath.startsWith(root)) {
        relPath = rawPath.slice(root.length).replace(/^\//, '');
      }

      const parts = relPath.split('/').filter(Boolean);
      if (parts.length === 0) return;

      if (parts.length === 1) {
        if (parts[0] === '.keep') return;
        children.push({
          name: ch.fileName || ch.name || ch.title || parts[0],
          isDirectory: false,
          path: ch.filePath || `${current}/${parts[0]}`,
          relativePath: parts[0],
          id: ch.id,
          size: ch.size || 0,
          chapter: ch
        });
      } else {
        const subFolderName = parts[0];
        const subFolderPath = `${current}/${subFolderName}`;
        if (!folderSet.has(subFolderName)) {
          folderSet.set(subFolderName, subFolderPath);
        }
      }
    });

    folderSet.forEach((fPath, fName) => {
      children.push({
        name: fName,
        isDirectory: true,
        path: fPath,
        relativePath: fName,
        children: []
      });
    });

    children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      name: current.split('/').pop() || 'Root',
      isDirectory: true,
      path: current,
      children
    };
  }, []);

  const loadFileManagerTree = useCallback((targetPath) => {
    const queryPath = targetPath || manga?.folderPath || 'Root';
    setFmLoading(true);
    try {
      const tree = buildTreeFromChapters(chapters, manga?.folderPath, queryPath);
      setFmTree(tree);
      setFmCurrentPath(tree.path);
    } catch (err) {
      console.error("File manager tree build error:", err);
    } finally {
      setFmLoading(false);
    }
  }, [manga, chapters, buildTreeFromChapters]);

  const openFileManagerModal = () => {
    setShowFileManagerModal(true);
    loadFileManagerTree(manga?.folderPath);
  };

  const handleCreateSubfolder = async () => {
    if (!fmNewFolderName.trim() || !fmCurrentPath) return;
    const folderName = fmNewFolderName.trim();
    const cleanCurrent = fmCurrentPath.replace(/\\/g, '/').replace(/\/$/, '');
    const newFolderPath = `${cleanCurrent}/${folderName}`;
    try {
      setFmLoading(true);
      const placeholderId = `folder_${Date.now()}_${encodeURIComponent(folderName)}`;
      const placeholderCh = {
        id: placeholderId,
        name: '.keep',
        fileName: '.keep',
        title: '.keep',
        filePath: `${newFolderPath}/.keep`,
        isRead: false,
        updatedAt: new Date().toISOString()
      };

      if (!isOffline && db && currentUser) {
        await setDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', placeholderId), placeholderCh);
      } else {
        addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${placeholderId}`, payload: { mangaId, ...placeholderCh } });
      }
      upsertLocalChapter(mangaId, placeholderCh);
      setChapters(prev => [...prev, placeholderCh]);

      setFmNewFolderName('');
      setShowNewFolderInput(false);
      loadFileManagerTree(newFolderPath);
    } catch (err) {
      console.error("Error creating folder:", err);
      alert("Error creating folder: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleAddManualFile = async () => {
    if (!fmNewFileName.trim() || !fmCurrentPath) return;
    const fileName = fmNewFileName.trim().endsWith('.pdf') ? fmNewFileName.trim() : `${fmNewFileName.trim()}.pdf`;
    const cleanCurrent = fmCurrentPath.replace(/\\/g, '/').replace(/\/$/, '');
    const newFilePath = `${cleanCurrent}/${fileName}`;
    try {
      setFmLoading(true);
      const newChId = `chap_${Date.now()}_${encodeURIComponent(fileName)}`;
      const newCh = {
        id: newChId,
        name: fileName,
        fileName: fileName,
        title: fileName.replace(/\.pdf$/i, ''),
        filePath: newFilePath,
        chapterNumber: chapters.length + 1,
        isRead: false,
        size: 0,
        updatedAt: new Date().toISOString()
      };

      if (!isOffline && db && currentUser) {
        await setDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', newChId), newCh);
      } else {
        addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${newChId}`, payload: { mangaId, ...newCh } });
      }
      upsertLocalChapter(mangaId, newCh);
      const updatedList = [...chapters, newCh];
      setChapters(updatedList);

      const updatedManga = { ...manga, chapterCount: updatedList.length, totalChapters: manga?.totalChapters || updatedList.length };
      upsertLocalManga(updatedManga);
      setManga(updatedManga);

      alert(`Added "${fileName}" to library!`);
      setFmNewFileName('');
      setShowNewFileInput(false);
      loadFileManagerTree(cleanCurrent);
    } catch (err) {
      console.error("Error adding file:", err);
      alert("Error adding file: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleRenameItem = async () => {
    if (!fmRenameTarget || !fmNewName.trim()) return;
    const newName = fmNewName.trim();
    try {
      setFmLoading(true);
      if (!fmRenameTarget.isDirectory) {
        const ch = fmRenameTarget.chapter;
        if (!ch) return;

        const oldPath = (ch.filePath || fmRenameTarget.path || '').replace(/\\/g, '/');
        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/'));
        const newFilePath = parentDir ? `${parentDir}/${newName}` : newName;

        const updatedCh = {
          ...ch,
          name: newName,
          fileName: newName,
          title: newName.replace(/\.pdf$/i, ''),
          filePath: newFilePath,
          updatedAt: new Date().toISOString()
        };

        if (!isOffline && db && currentUser) {
          await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id), updatedCh);
        } else {
          addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, ...updatedCh } });
        }
        upsertLocalChapter(mangaId, updatedCh);
        setChapters(prev => prev.map(c => c.id === ch.id ? updatedCh : c));
      } else {
        const oldSubfolderPath = fmRenameTarget.path.replace(/\\/g, '/').replace(/\/$/, '');
        const parentDir = oldSubfolderPath.substring(0, oldSubfolderPath.lastIndexOf('/'));
        const newSubfolderPath = parentDir ? `${parentDir}/${newName}` : newName;

        const targetChs = chapters.filter(ch => {
          const chPath = (ch.filePath || '').replace(/\\/g, '/');
          return chPath.startsWith(oldSubfolderPath + '/') || chPath === oldSubfolderPath;
        });

        for (const ch of targetChs) {
          const oldChPath = (ch.filePath || '').replace(/\\/g, '/');
          const newChPath = oldChPath.replace(oldSubfolderPath, newSubfolderPath);
          const updatedCh = {
            ...ch,
            filePath: newChPath,
            updatedAt: new Date().toISOString()
          };
          if (!isOffline && db && currentUser) {
            await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id), updatedCh);
          } else {
            addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, ...updatedCh } });
          }
          upsertLocalChapter(mangaId, updatedCh);
        }

        setChapters(prev => prev.map(c => {
          const cPath = (c.filePath || '').replace(/\\/g, '/');
          if (cPath.startsWith(oldSubfolderPath + '/')) {
            return { ...c, filePath: cPath.replace(oldSubfolderPath, newSubfolderPath) };
          }
          return c;
        }));
      }

      setFmRenameTarget(null);
      setFmNewName('');
      loadFileManagerTree(fmCurrentPath);
    } catch (err) {
      console.error("Error renaming item:", err);
      alert("Error renaming item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleDeleteItem = async (item) => {
    if (!confirm(`Are you sure you want to remove "${item.name}" from your manga library?`)) return;
    try {
      setFmLoading(true);
      let updatedRemaining = [];

      if (!item.isDirectory) {
        const chId = item.id;
        if (!isOffline && db && currentUser) {
          await deleteDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', chId));
        } else {
          addToDirtyQueue({ type: 'DELETE_CHAPTER', dedupeKey: `DELETE_CHAPTER_${mangaId}_${chId}`, payload: { mangaId, id: chId } });
        }
        deleteLocalChapter(mangaId, chId);
        updatedRemaining = chapters.filter(c => c.id !== chId);
        setChapters(updatedRemaining);
      } else {
        const subfolderPathNorm = item.path.replace(/\\/g, '/').replace(/\/$/, '') + '/';
        const targetChs = chapters.filter(ch => {
          const chPathNorm = (ch.filePath || '').replace(/\\/g, '/');
          return chPathNorm.startsWith(subfolderPathNorm);
        });

        for (const ch of targetChs) {
          if (!isOffline && db && currentUser) {
            await deleteDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id));
          } else {
            addToDirtyQueue({ type: 'DELETE_CHAPTER', dedupeKey: `DELETE_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, id: ch.id } });
          }
          deleteLocalChapter(mangaId, ch.id);
        }

        const targetIds = new Set(targetChs.map(c => c.id));
        updatedRemaining = chapters.filter(c => !targetIds.has(c.id));
        setChapters(updatedRemaining);
      }

      // Recalculate manga total chapters
      const updatedManga = {
        ...manga,
        chapterCount: updatedRemaining.length,
        totalChapters: manga?.totalChapters || updatedRemaining.length,
        updatedAt: new Date().toISOString()
      };
      upsertLocalManga(updatedManga);
      setManga(updatedManga);

      loadFileManagerTree(fmCurrentPath);
    } catch (err) {
      console.error("Error deleting item:", err);
      alert("Error deleting item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  const handleMoveItem = async () => {
    if (!fmMoveTarget || !fmDestPath) return;
    const destFolder = fmDestPath.replace(/\\/g, '/').replace(/\/$/, '');
    try {
      setFmLoading(true);
      if (!fmMoveTarget.isDirectory) {
        const ch = fmMoveTarget.chapter;
        if (!ch) return;
        const newFilePath = `${destFolder}/${ch.fileName || ch.name}`;
        const updatedCh = {
          ...ch,
          filePath: newFilePath,
          updatedAt: new Date().toISOString()
        };

        if (!isOffline && db && currentUser) {
          await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id), updatedCh);
        } else {
          addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, ...updatedCh } });
        }
        upsertLocalChapter(mangaId, updatedCh);
        setChapters(prev => prev.map(c => c.id === ch.id ? updatedCh : c));
      } else {
        const oldFolder = fmMoveTarget.path.replace(/\\/g, '/').replace(/\/$/, '');
        const folderName = oldFolder.split('/').pop();
        const newSubfolderPath = `${destFolder}/${folderName}`;

        const targetChs = chapters.filter(c => {
          const cPath = (c.filePath || '').replace(/\\/g, '/');
          return cPath.startsWith(oldFolder + '/') || cPath === oldFolder;
        });

        for (const ch of targetChs) {
          const oldChPath = (ch.filePath || '').replace(/\\/g, '/');
          const newChPath = oldChPath.replace(oldFolder, newSubfolderPath);
          const updatedCh = {
            ...ch,
            filePath: newChPath,
            updatedAt: new Date().toISOString()
          };
          if (!isOffline && db && currentUser) {
            await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId, 'chapters', ch.id), updatedCh);
          } else {
            addToDirtyQueue({ type: 'SET_CHAPTER', dedupeKey: `SET_CHAPTER_${mangaId}_${ch.id}`, payload: { mangaId, ...updatedCh } });
          }
          upsertLocalChapter(mangaId, updatedCh);
        }

        setChapters(prev => prev.map(c => {
          const cPath = (c.filePath || '').replace(/\\/g, '/');
          if (cPath.startsWith(oldFolder + '/')) {
            return { ...c, filePath: cPath.replace(oldFolder, newSubfolderPath) };
          }
          return c;
        }));
      }

      setFmMoveTarget(null);
      setFmDestPath('');
      loadFileManagerTree(destFolder);
    } catch (err) {
      console.error("Error moving item:", err);
      alert("Error moving item: " + err.message);
    } finally {
      setFmLoading(false);
    }
  };

  // ── Edit Manga Modal Handlers ──────────────────────────────────────────────
  const openEditModal = () => {
    setEditTitle(manga?.title || '');
    setEditTotalChapters(manga?.totalChapters || manga?.chapterCount || chapters.length || '');
    setEditTotalVolumes(manga?.volumes || manga?.totalVolumes || '');
    setEditGenres(Array.isArray(manga?.genres) ? manga.genres : typeof manga?.genres === 'string' ? manga.genres.split(',').map(s => s.trim()) : []);
    setEditDescription(manga?.description || manga?.synopsis || '');
    setEditCoverUrl(manga?.thumbnailBase64 || manga?.thumbnailPath || '');
    setEditBannerUrl(manga?.bannerUrl || manga?.backdropUrl || '');
    setEditLogoUrl(manga?.logoUrl || '');
    setEnableEditMangaLogo(Boolean(manga?.logoUrl));
    setEditArtworkSearchQuery(manga?.title || '');
    setEditMangaImages({ covers: [], banners: [], logos: [] });
    setBannerSectionOpen(true);
    setLogoSectionOpen(true);
    setEditOnlineMessage('');
    setShowOnlineSearchEdit(false);
    setShowEditModal(true);
  };

  const fetchEditMangaArtwork = async (term) => {
    const q = (term || editArtworkSearchQuery || editTitle || manga?.title || '').trim();
    if (!q) return;
    setSearchingEditArtwork(true);
    try {
      const res = await fetch(`/api/manga/details?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      const banners = [];
      const logos = [];
      const covers = [];

      if (data.success && data.manga) {
        if (Array.isArray(data.manga.images?.banners)) {
          banners.push(...data.manga.images.banners);
        }
        if (Array.isArray(data.manga.images?.logos)) {
          logos.push(...data.manga.images.logos);
        }
        if (Array.isArray(data.manga.images?.covers)) {
          covers.push(...data.manga.images.covers);
        }
        if (data.manga.bannerUrl && !banners.some(b => b.url === data.manga.bannerUrl)) {
          banners.unshift({ url: data.manga.bannerUrl, source: 'AniList' });
        }
        if (data.manga.logoUrl && !logos.some(l => l.url === data.manga.logoUrl)) {
          logos.unshift({ url: data.manga.logoUrl, source: 'Fanart.tv' });
        }
      }

      // Fallback query to /api/anime/details if needed for title art / backdrops
      if (banners.length === 0 || logos.length === 0) {
        try {
          const animeRes = await fetch(`/api/anime/details?q=${encodeURIComponent(q)}`);
          const animeData = await animeRes.json();
          if (animeData.success && animeData.anime) {
            if (Array.isArray(animeData.anime.images?.banners)) {
              for (const b of animeData.anime.images.banners) {
                if (!banners.some(item => item.url === b.url)) banners.push(b);
              }
            }
            if (Array.isArray(animeData.anime.images?.logos)) {
              for (const l of animeData.anime.images.logos) {
                if (!logos.some(item => item.url === l.url)) logos.push(l);
              }
            }
            if (animeData.anime.bannerUrl && !banners.some(b => b.url === animeData.anime.bannerUrl)) {
              banners.unshift({ url: animeData.anime.bannerUrl, source: 'AniList' });
            }
            if (animeData.anime.logoUrl && !logos.some(l => l.url === animeData.anime.logoUrl)) {
              logos.unshift({ url: animeData.anime.logoUrl, source: 'Fanart.tv' });
            }
          }
        } catch (_) {}
      }

      setEditMangaImages({ covers, banners, logos });
    } catch (err) {
      console.error('Error fetching online manga artwork:', err);
    } finally {
      setSearchingEditArtwork(false);
    }
  };

  const handleFetchEditOnline = async () => {
    const query = (editTitle || '').trim();
    if (!query) {
      setEditOnlineMessage('Please enter a manga title first.');
      setTimeout(() => setEditOnlineMessage(''), 3000);
      return;
    }
    setFetchingEditOnline(true);
    setEditOnlineMessage('Searching online for manga info...');
    try {
      const res = await fetch(`/api/manga-rating?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (data.success) {
        if (data.synopsis) {
          setEditDescription(data.synopsis);
        }
        if (data.volumes) {
          setEditTotalVolumes(String(data.volumes));
        }
        if (data.chapters) {
          setEditTotalChapters(String(data.chapters));
        }
        if (data.imageUrl) {
          setEditCoverUrl(data.imageUrl);
        }
        if (Array.isArray(data.genres) && data.genres.length > 0) {
          setEditGenres(prev => {
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
        setEditOnlineMessage(`✓ Auto-filled details from ${data.source || 'Online'}${infoStr}`);
      } else {
        setEditOnlineMessage(data.error || 'No manga found online.');
      }
    } catch (err) {
      setEditOnlineMessage('Fetch failed: ' + err.message);
    } finally {
      setFetchingEditOnline(false);
      setTimeout(() => setEditOnlineMessage(''), 5000);
    }
  };

  const handleEditCoverUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingEditCover(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      setEditCoverUrl(event.target.result);
      setUploadingEditCover(false);
    };
    reader.onerror = () => setUploadingEditCover(false);
    reader.readAsDataURL(file);
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
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditBannerUrl(ev.target.result);
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

  const handleEditLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setEditLogoUrl(ev.target.result);
      setEnableEditMangaLogo(true);
    };
    reader.readAsDataURL(file);
  };

  const handleEditLogoBrowse = async () => {
    try {
      const pickRes = await fetch('/api/select-image');
      const pickData = await pickRes.json();
      if (pickData.success && pickData.path) {
        setEditLogoUrl(pickData.path);
        setEnableEditMangaLogo(true);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      const totalChs = editTotalChapters ? parseInt(editTotalChapters, 10) : chapters.length;
      const totalVols = editTotalVolumes ? parseInt(editTotalVolumes, 10) : null;
      const updatedManga = {
        ...manga,
        title: editTitle.trim(),
        totalChapters: totalChs,
        chapterCount: totalChs,
        volumes: totalVols,
        totalVolumes: totalVols,
        genres: editGenres,
        description: editDescription,
        synopsis: editDescription,
        thumbnailBase64: editCoverUrl || manga?.thumbnailBase64,
        bannerUrl: editBannerUrl || manga?.bannerUrl || manga?.backdropUrl || '',
        backdropUrl: editBannerUrl || manga?.bannerUrl || manga?.backdropUrl || '',
        logoUrl: enableEditMangaLogo ? (editLogoUrl || '') : '',
        updatedAt: new Date().toISOString()
      };

      upsertLocalManga(updatedManga);
      setManga(updatedManga);

      if (!isOffline && db && currentUser) {
        try {
          await updateDoc(doc(db, 'users', getUserId(), 'mangas', mangaId), updatedManga);
        } catch (err) {
          addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updatedManga });
        }
      } else {
        addToDirtyQueue({ type: 'SET_MANGA', dedupeKey: `SET_MANGA_${mangaId}`, payload: updatedManga });
      }

      setShowEditModal(false);
    } catch (err) {
      alert('Error updating manga: ' + err.message);
    }
  };

  // Save Note
  const handleSaveNote = () => {
    if (!editingChapter) return;
    const updated = chapters.map((c) => (c.id === editingChapter.id ? { ...c, note: noteText } : c));
    setChapters(updated);
    setLocalChapters(mangaId, updated);
    setEditingChapter(null);
    setNoteText('');
  };

  // ── Toggle Individual Chapter Completed / Unwatched ───────────────────────
  const handleToggleChapterComplete = async (chapter) => {
    const docId = chapter.id || `manga_${mangaId}_${encodeURIComponent(chapter.name || chapter.fileName || '')}`;
    const currentlyRead = Boolean(chapter.isWatched || chapter.isRead || (chapter.progress && chapter.progress >= 95));
    const willBeRead = !currentlyRead;

    const totalP = chapter.totalPages || 1;
    const updatedProgress = willBeRead ? 100 : 0;
    const updatedLastPage = willBeRead ? totalP : 1;

    const progressPayload = {
      documentId: docId,
      lastPage: updatedLastPage,
      totalPages: totalP,
      progress: updatedProgress,
      isRead: willBeRead,
      isWatched: willBeRead,
      lastReadAt: new Date().toISOString(),
    };

    // 1. Save to IndexedDB & localStorage
    await saveReadingProgress(docId, progressPayload);
    if (chapter.name) {
      await saveReadingProgress(`manga_${mangaId}_${encodeURIComponent(chapter.name)}`, progressPayload);
    }

    // 2. Update React State & localStore
    const updatedChapters = chapters.map((c) => {
      const match = (c.id && chapter.id && c.id === chapter.id) || (c.name && chapter.name && c.name === chapter.name);
      if (match) {
        return {
          ...c,
          isRead: willBeRead,
          isWatched: willBeRead,
          progress: updatedProgress,
          lastPage: updatedLastPage,
          totalPages: totalP,
        };
      }
      return c;
    });
    setChapters(updatedChapters);
    setLocalChapters(mangaId, updatedChapters);

    // 3. Recalculate Manga Progress
    const newCompletedCount = updatedChapters.filter((c) => c.isWatched || c.isRead || (c.progress && c.progress >= 95)).length;
    const totalCount = (manga?.totalChapters && Number(manga.totalChapters) > 0) ? Number(manga.totalChapters) : updatedChapters.length;
    const newOverallPct = totalCount > 0 ? Math.round((newCompletedCount / totalCount) * 100) : 0;
    const isMangaWatched = newOverallPct === 100;
    const updatedManga = {
      ...manga,
      progressPercent: newOverallPct,
      completedChapters: newCompletedCount,
      isWatched: isMangaWatched,
      isCompleted: isMangaWatched,
      status: newOverallPct === 100 ? 'completed' : (newCompletedCount > 0 ? 'reading' : manga?.status || 'ready'),
      lastWatchedChapter: chapter.name || chapter.fileName || '',
      updatedAt: new Date().toISOString(),
    };
    setManga(updatedManga);
    upsertLocalManga(updatedManga);

    // 4. Sync to Firestore if user logged in
    const uid = currentUser?.uid || getUserId();
    const chDocId = chapter.id || docId;
    const chapterDbPayload = {
      id: chDocId,
      isRead: willBeRead,
      isWatched: willBeRead,
      progress: updatedProgress,
      lastPage: updatedLastPage,
      totalPages: totalP,
      updatedAt: new Date().toISOString(),
    };

    if (!isOffline && db && uid) {
      try {
        // 1. Update the chapter doc in Firestore chapters collection
        await setDoc(doc(db, 'users', uid, 'mangas', mangaId, 'chapters', chDocId), chapterDbPayload, { merge: true });
        // 2. Backward compatibility: also store in progress subcollection
        await setDoc(doc(db, 'users', uid, 'mangas', mangaId, 'progress', docId), progressPayload, { merge: true });
        // 3. Update the parent manga doc with watched status and progress
        await setDoc(doc(db, 'users', uid, 'mangas', mangaId), {
          isWatched: isMangaWatched,
          isCompleted: isMangaWatched,
          progressPercent: newOverallPct,
          completedChapters: newCompletedCount,
          status: updatedManga.status,
          lastWatchedChapter: updatedManga.lastWatchedChapter || '',
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (err) {
        console.error('[MangaDetail] Firestore chapter sync error:', err);
        addToDirtyQueue({
          type: 'SET_CHAPTER',
          dedupeKey: `SET_CHAPTER_${mangaId}_${chDocId}`,
          payload: { mangaId, mangaUserId: uid, ...chapterDbPayload },
        });
        addToDirtyQueue({
          type: 'SET_MANGA',
          dedupeKey: `SET_MANGA_${mangaId}`,
          payload: { id: mangaId, userId: uid, ...updatedManga },
        });
      }
    } else {
      addToDirtyQueue({
        type: 'SET_CHAPTER',
        dedupeKey: `SET_CHAPTER_${mangaId}_${chDocId}`,
        payload: { mangaId, mangaUserId: uid, ...chapterDbPayload },
      });
      addToDirtyQueue({
        type: 'SET_MANGA',
        dedupeKey: `SET_MANGA_${mangaId}`,
        payload: { id: mangaId, userId: uid, ...updatedManga },
      });
    }
  };

  // ── Mark Entire Manga Complete (or Unread) ─────────────────────────────────
  const handleMarkEntireMangaComplete = async (shouldComplete = true) => {
    if (!chapters || chapters.length === 0) {
      setShowMarkAllModal(false);
      return;
    }
    setMarkingAll(true);

    try {
      const updatedChapters = [];
      const chaptersForDb = [];

      for (const ch of chapters) {
        const docId = ch.id || `manga_${mangaId}_${encodeURIComponent(ch.name || ch.fileName || '')}`;
        const totalP = ch.totalPages || 1;
        const prog = shouldComplete ? 100 : 0;
        const lastP = shouldComplete ? totalP : 1;

        const progressPayload = {
          documentId: docId,
          lastPage: lastP,
          totalPages: totalP,
          progress: prog,
          isRead: shouldComplete,
          isWatched: shouldComplete,
          lastReadAt: new Date().toISOString(),
        };

        await saveReadingProgress(docId, progressPayload);
        if (ch.name) {
          await saveReadingProgress(`manga_${mangaId}_${encodeURIComponent(ch.name)}`, progressPayload);
        }

        const chData = {
          ...ch,
          id: docId,
          isRead: shouldComplete,
          isWatched: shouldComplete,
          progress: prog,
          lastPage: lastP,
          totalPages: totalP,
          updatedAt: new Date().toISOString(),
        };

        updatedChapters.push(chData);
        chaptersForDb.push({
          id: docId,
          name: ch.name || ch.fileName || '',
          fileName: ch.fileName || ch.name || '',
          filePath: ch.filePath || '',
          isRead: shouldComplete,
          isWatched: shouldComplete,
          progress: prog,
          lastPage: lastP,
          totalPages: totalP,
          updatedAt: new Date().toISOString(),
        });
      }

      setChapters(updatedChapters);
      setLocalChapters(mangaId, updatedChapters);

      const newCompletedCount = shouldComplete ? updatedChapters.length : 0;
      const newOverallPct = shouldComplete ? 100 : 0;
      const updatedManga = {
        ...manga,
        progressPercent: newOverallPct,
        completedChapters: newCompletedCount,
        isWatched: shouldComplete,
        isCompleted: shouldComplete,
        status: shouldComplete ? 'completed' : 'ready',
        updatedAt: new Date().toISOString(),
      };
      setManga(updatedManga);
      upsertLocalManga(updatedManga);

      // Firestore sync
      const uid = currentUser?.uid || getUserId();
      if (!isOffline && db && uid) {
        try {
          let batch = writeBatch(db);
          let bCount = 0;

          for (const ch of chaptersForDb) {
            const chRef = doc(db, 'users', uid, 'mangas', mangaId, 'chapters', ch.id);
            batch.set(chRef, ch, { merge: true });
            bCount++;
            if (bCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              bCount = 0;
            }
          }

          const mangaDocRef = doc(db, 'users', uid, 'mangas', mangaId);
          batch.set(mangaDocRef, {
            progressPercent: newOverallPct,
            completedChapters: newCompletedCount,
            isWatched: shouldComplete,
            isCompleted: shouldComplete,
            status: updatedManga.status,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          await batch.commit();
        } catch (err) {
          console.error('[MangaDetail] Firestore batch error:', err);
          addToDirtyQueue({
            type: 'SET_CHAPTERS_BATCH',
            dedupeKey: `SET_CHAPTERS_BATCH_${mangaId}`,
            payload: { mangaId, mangaUserId: uid, chapters: chaptersForDb },
          });
          addToDirtyQueue({
            type: 'SET_MANGA',
            dedupeKey: `SET_MANGA_${mangaId}`,
            payload: { id: mangaId, userId: uid, ...updatedManga },
          });
        }
      } else {
        addToDirtyQueue({
          type: 'SET_CHAPTERS_BATCH',
          dedupeKey: `SET_CHAPTERS_BATCH_${mangaId}`,
          payload: { mangaId, mangaUserId: uid, chapters: chaptersForDb },
        });
        addToDirtyQueue({
          type: 'SET_MANGA',
          dedupeKey: `SET_MANGA_${mangaId}`,
          payload: { id: mangaId, userId: uid, ...updatedManga },
        });
      }
    } catch (err) {
      console.error('[MangaDetail] Error marking all complete:', err);
    } finally {
      setMarkingAll(false);
      setShowMarkAllModal(false);
    }
  };

  // ── Sync with Firestore DB (Bidirectional watched reconciliation) ──────────
  const handleSyncWithDb = async () => {
    const uid = currentUser?.uid || getUserId();
    if (!uid) {
      setSyncDbMessage('Please log in to sync with the database.');
      setTimeout(() => setSyncDbMessage(''), 4000);
      return;
    }
    if (isOffline || !db) {
      setSyncDbMessage('Cannot sync with database while offline.');
      setTimeout(() => setSyncDbMessage(''), 4000);
      return;
    }

    setIsSyncingWithDb(true);
    setSyncDbMessage('Fetching watched chapters from Firestore database...');

    try {
      // 1. Fetch DB manga document
      const mangaDocRef = doc(db, 'users', uid, 'mangas', mangaId);
      const mangaDocSnap = await getDoc(mangaDocRef);
      const dbMangaData = mangaDocSnap.exists() ? mangaDocSnap.data() : null;

      // 2. Fetch DB chapters subcollection
      const chaptersRef = collection(db, 'users', uid, 'mangas', mangaId, 'chapters');
      const chaptersSnap = await getDocs(chaptersRef);
      const dbChaptersMap = new Map();
      chaptersSnap.forEach((cd) => {
        dbChaptersMap.set(cd.id, { id: cd.id, ...cd.data() });
      });

      // 3. Also check progress subcollection for fallback
      const progRef = collection(db, 'users', uid, 'mangas', mangaId, 'progress');
      const progSnap = await getDocs(progRef);
      const dbProgMap = new Map();
      progSnap.forEach((pd) => {
        dbProgMap.set(pd.id, pd.data());
      });

      // 4. Get current local chapters
      const currentLocalChapters = getLocalChapters(mangaId).length > 0 ? getLocalChapters(mangaId) : chapters;

      let uploadedCount = 0;
      let downloadedCount = 0;
      const chaptersToUpload = [];
      const mergedChapters = [];

      for (const ch of currentLocalChapters) {
        const docId = ch.id || `manga_${mangaId}_${encodeURIComponent(ch.name || ch.fileName || '')}`;

        // Match DB chapter
        let dbCh = dbChaptersMap.get(ch.id) || dbChaptersMap.get(docId);
        if (!dbCh && (ch.name || ch.fileName)) {
          for (const [, v] of dbChaptersMap.entries()) {
            if (
              (ch.name && (v.name === ch.name || v.fileName === ch.name)) ||
              (ch.fileName && (v.name === ch.fileName || v.fileName === ch.fileName)) ||
              (ch.title && v.title === ch.title)
            ) {
              dbCh = v;
              break;
            }
          }
        }

        const dbProg = dbProgMap.get(docId) || dbProgMap.get(ch.id);

        const localIsWatched = Boolean(ch.isWatched || ch.isRead || (ch.progress && ch.progress >= 95));
        const dbIsWatched = Boolean(
          dbCh?.isWatched ||
          dbCh?.isRead ||
          (dbCh?.progress && dbCh.progress >= 95) ||
          dbProg?.isRead ||
          (dbProg?.progress && dbProg.progress >= 95)
        );

        const localProg = ch.progress !== undefined ? ch.progress : (localIsWatched ? 100 : 0);
        const dbProgVal = dbCh?.progress !== undefined
          ? dbCh.progress
          : (dbProg?.progress !== undefined ? dbProg.progress : (dbIsWatched ? 100 : 0));

        const finalIsWatched = localIsWatched || dbIsWatched;
        const finalProgress = finalIsWatched ? 100 : Math.max(localProg, dbProgVal);
        const finalLastPage = Math.max(ch.lastPage || 1, dbCh?.lastPage || dbProg?.lastPage || 1);
        const totalP = ch.totalPages || dbCh?.totalPages || dbProg?.totalPages || 1;

        const mergedCh = {
          ...ch,
          id: ch.id || docId,
          isWatched: finalIsWatched,
          isRead: finalIsWatched,
          progress: finalProgress,
          lastPage: finalLastPage,
          totalPages: totalP,
          updatedAt: new Date().toISOString(),
        };
        mergedChapters.push(mergedCh);

        // Upload to DB if local was watched but DB wasn't, or local progress is higher, or DB doesn't have the chapter
        if ((localIsWatched && !dbIsWatched) || (localProg > dbProgVal) || !dbCh) {
          uploadedCount++;
          chaptersToUpload.push(mergedCh);
        }

        // Update local if DB was watched but local wasn't, or DB has higher progress
        if ((dbIsWatched && !localIsWatched) || (dbProgVal > localProg)) {
          downloadedCount++;
        }

        // Keep IndexedDB in sync
        const progPayload = {
          documentId: docId,
          lastPage: finalLastPage,
          totalPages: totalP,
          progress: finalProgress,
          isRead: finalIsWatched,
          isWatched: finalIsWatched,
          lastReadAt: new Date().toISOString(),
        };
        await saveReadingProgress(docId, progPayload);
        if (ch.name) {
          await saveReadingProgress(`manga_${mangaId}_${encodeURIComponent(ch.name)}`, progPayload);
        }
      }

      // Sort natural order
      mergedChapters.sort((a, b) => naturalChapterSort(a, b, true));

      // 5. Update local state & storage
      setChapters(mergedChapters);
      setLocalChapters(mangaId, mergedChapters);

      const completedCount = mergedChapters.filter((c) => c.isWatched || c.isRead).length;
      const totalCount = (manga?.totalChapters && Number(manga.totalChapters) > 0)
        ? Number(manga.totalChapters)
        : mergedChapters.length;
      const overallPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
      const isMangaWatched = overallPct === 100 || Boolean(dbMangaData?.isWatched) || Boolean(manga?.isWatched);

      const updatedManga = {
        ...(dbMangaData || {}),
        ...manga,
        progressPercent: overallPct,
        completedChapters: completedCount,
        isWatched: isMangaWatched,
        isCompleted: isMangaWatched,
        status: isMangaWatched ? 'completed' : (completedCount > 0 ? 'reading' : manga?.status || 'ready'),
        updatedAt: new Date().toISOString(),
      };
      setManga(updatedManga);
      upsertLocalManga(updatedManga);

      // 6. Batch update Firestore with any chapters needing upload
      let batch = writeBatch(db);
      let bCount = 0;

      for (const ch of chaptersToUpload) {
        const chRef = doc(db, 'users', uid, 'mangas', mangaId, 'chapters', ch.id);
        batch.set(chRef, ch, { merge: true });
        bCount++;
        if (bCount >= 450) {
          await batch.commit();
          batch = writeBatch(db);
          bCount = 0;
        }
      }

      batch.set(mangaDocRef, updatedManga, { merge: true });
      await batch.commit();

      setSyncDbMessage(`✓ Synced with database! (${uploadedCount} uploaded to cloud, ${downloadedCount} updated locally)`);
    } catch (err) {
      console.error('[MangaDetail] Sync with DB failed:', err);
      setSyncDbMessage('Sync failed: ' + err.message);
    } finally {
      setIsSyncingWithDb(false);
      setTimeout(() => setSyncDbMessage(''), 5000);
    }
  };

  // Calculate Overall Progress
  const totalChaptersCount = (manga?.totalChapters && Number(manga.totalChapters) > 0) ? Number(manga.totalChapters) : (chapters.length || 0);
  const completedCount = chapters.filter((c) => c.isRead || (c.progress && c.progress >= 95)).length;
  const overallProgressPct = totalChaptersCount > 0 ? Math.round((completedCount / totalChaptersCount) * 100) : 0;
  const currentRatingNum = manga?.rating ? parseFloat(manga.rating) : 0;
  const mangaCoverImg = manga?.thumbnailBase64
    ? (manga.thumbnailBase64.startsWith('http') || manga.thumbnailBase64.startsWith('data:')
        ? manga.thumbnailBase64
        : `/api/image?path=${encodeURIComponent(manga.thumbnailBase64)}`)
    : (manga?.coverUrl || '');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex flex-col items-center justify-center text-white gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-purple-500/30 border-t-purple-500 animate-spin" />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">
          Loading Manga Details...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-white selection:bg-purple-600/30 pb-20">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#0d1117]/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between gap-3">
        <button
          onClick={onBack || (() => router.push('/'))}
          className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer shrink-0"
        >
          <ArrowLeft size={16} />
          <span className="hidden sm:inline">Back to Library</span>
          <span className="sm:hidden">Back</span>
        </button>

        {/* Mobile Center Title (Truncated) */}
        <div className="md:hidden flex-1 min-w-0 px-1 text-center">
          <h1 className="text-xs font-extrabold text-white truncate">
            {manga?.title || 'Manga Details'}
          </h1>
        </div>

        {/* Desktop Navigation Actions */}
        <div className="hidden md:flex items-center gap-2">
          {/* Sync with DB Button */}
          <button
            type="button"
            onClick={handleSyncWithDb}
            disabled={isSyncingWithDb}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
              isSyncingWithDb
                ? 'bg-blue-600/25 border-blue-500/50 text-blue-300 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                : 'bg-blue-600/15 hover:bg-blue-600/25 border-blue-500/30 text-blue-400 hover:text-blue-300'
            }`}
            title="Sync watched chapters with Firestore Database"
          >
            <RefreshCw size={14} className={isSyncingWithDb ? "animate-spin text-blue-400" : "text-blue-400"} />
            <span>{isSyncingWithDb ? 'Syncing...' : 'Sync with DB'}</span>
          </button>

          {/* Mark Manga Complete Button */}
          <button
            type="button"
            onClick={() => setShowMarkAllModal(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
              overallProgressPct === 100
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.25)]'
                : 'bg-emerald-600/15 hover:bg-emerald-600/25 border-emerald-500/30 text-emerald-400 hover:text-emerald-300'
            }`}
            title={overallProgressPct === 100 ? "Manga Fully Completed (click to review or mark unread)" : "Mark Entire Manga as Completed"}
          >
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span>{overallProgressPct === 100 ? 'Fully Read' : 'Mark Complete'}</span>
          </button>

          {/* Rating Button */}
          <button
            type="button"
            onClick={() => setShowRatingPanel(!showRatingPanel)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition cursor-pointer"
            title="Rate & Fetch AniList Rating"
          >
            <Star size={14} className="fill-amber-400 text-amber-400" />
            <span>{manga?.rating ? `${manga.rating}/10` : 'Add Rating'}</span>
          </button>

          {/* Edit Manga Button */}
          <button
            type="button"
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-bold transition cursor-pointer"
            title="Edit Manga Folder & Cover"
          >
            <SlidersHorizontal size={14} />
            <span>Edit Manga</span>
          </button>

          {/* File Manager Button */}
          <button
            type="button"
            onClick={openFileManagerModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition cursor-pointer"
            title="Folder File Manager"
          >
            <FolderTree size={14} />
            <span>File Manager</span>
          </button>
        </div>

        {/* Mobile Hamburger Menu Toggle Button */}
        <div className="flex md:hidden items-center shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className={`p-2 rounded-xl border transition cursor-pointer flex items-center justify-center ${
              mobileNavOpen
                ? 'bg-purple-600/25 border-purple-500/50 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                : 'bg-white/5 hover:bg-white/10 border-white/10 text-gray-300 hover:text-white'
            }`}
            aria-label="Toggle Navigation Menu"
            title={mobileNavOpen ? "Close Menu" : "Open Menu"}
          >
            {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {/* ── Mobile Navigation Drawer / Dropdown ────────────────────────────── */}
      <AnimatePresence>
        {mobileNavOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              className="md:hidden fixed inset-0 top-16 z-40 bg-black/60 backdrop-blur-sm"
            />

            {/* Mobile Menu Panel */}
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="md:hidden fixed top-16 left-0 right-0 z-50 bg-[#0d1117]/95 backdrop-blur-2xl border-b border-white/15 p-4 shadow-2xl space-y-3 max-h-[calc(100vh-4.5rem)] overflow-y-auto custom-scrollbar"
            >
              {/* Manga Info Banner */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/30 to-pink-900/20 border border-purple-500/25 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-3">
                  <div className="text-xs font-black text-white truncate">{manga?.title || 'Manga Details'}</div>
                  <div className="text-[11px] text-gray-400 font-mono mt-0.5">
                    {completedCount} / {manga?.totalChapters || chapters.length || 0} chapters read ({overallProgressPct}%)
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${
                  overallProgressPct === 100
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                }`}>
                  {overallProgressPct === 100 ? 'Completed' : 'Reading'}
                </span>
              </div>

              {/* Action Buttons List */}
              <div className="space-y-2">
                {/* 1. Sync with DB */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    handleSyncWithDb();
                  }}
                  disabled={isSyncingWithDb}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  <div className="flex items-center gap-2.5">
                    <RefreshCw size={16} className={isSyncingWithDb ? "animate-spin text-blue-400" : "text-blue-400"} />
                    <span>{isSyncingWithDb ? 'Syncing with DB...' : 'Sync with Database'}</span>
                  </div>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20">
                    Firestore
                  </span>
                </button>

                {/* 2. Mark Complete */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setShowMarkAllModal(true);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <CheckCircle2 size={16} className="text-emerald-400" />
                    <span>{overallProgressPct === 100 ? 'Manga Completed (Review / Reset)' : 'Mark Entire Manga Complete'}</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                    {overallProgressPct}%
                  </span>
                </button>

                {/* 3. Rating */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    setShowRatingPanel(true);
                    setTimeout(() => {
                      const el = document.getElementById('rating-panel-section');
                      if (el) el.scrollIntoView({ behavior: 'smooth' });
                    }, 100);
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-bold transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Star size={16} className="fill-amber-400 text-amber-400" />
                    <span>Rate & AniList Score</span>
                  </div>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                    {manga?.rating ? `★ ${manga.rating}/10` : 'Unrated'}
                  </span>
                </button>

                {/* 4. Edit Manga */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    openEditModal();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-bold transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <SlidersHorizontal size={16} className="text-purple-400" />
                    <span>Edit Manga Details & Cover</span>
                  </div>
                  <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-lg border border-purple-500/20">
                    Edit
                  </span>
                </button>

                {/* 5. File Manager */}
                <button
                  type="button"
                  onClick={() => {
                    setMobileNavOpen(false);
                    openFileManagerModal();
                  }}
                  className="w-full flex items-center justify-between p-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 text-xs font-bold transition cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderTree size={16} className="text-cyan-400" />
                    <span>Folder & File Manager</span>
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-lg border border-cyan-500/20">
                    Files
                  </span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* ── Hero Banner / Overview Card ────────────────────────────────────── */}
        <div className="relative rounded-3xl overflow-hidden border border-white/10 p-6 sm:p-8 bg-[#0d1117]/90 md:bg-gradient-to-br md:from-purple-900/20 md:via-[#10141d] md:to-[#0d1117] shadow-2xl flex flex-col md:flex-row gap-8 items-start">
          {/* Ambient Background Cover: uses bannerUrl if present, otherwise cover */}
          {(manga?.bannerUrl || mangaCoverImg) && (
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <img
                src={
                  manga?.bannerUrl
                    ? (manga.bannerUrl.startsWith('http') || manga.bannerUrl.startsWith('data:') ? manga.bannerUrl : `/api/image?path=${encodeURIComponent(manga.bannerUrl)}`)
                    : mangaCoverImg
                }
                alt=""
                className="w-full h-full object-cover object-center opacity-45 md:opacity-25 blur-[1.5px] md:blur-md scale-105"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0d1117] via-[#0d1117]/65 to-black/30 md:bg-gradient-to-b md:from-[#0d1117]/40 md:via-[#0d1117]/80 md:to-[#0d1117]" />
            </div>
          )}

          {/* Cover Poster (Desktop only: hidden on mobile per user request) */}
          <div className="relative z-10 hidden md:block w-48 sm:w-56 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/50 group">
            {mangaCoverImg ? (
              <img
                src={mangaCoverImg}
                alt={manga.title}
                className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-purple-400/80 bg-purple-950/20">
                <BookOpen size={48} />
                <span className="text-[10px] font-bold uppercase tracking-wider">No Cover</span>
              </div>
            )}
            <div className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-extrabold text-purple-300 border border-white/10">
              PDF Manga
            </div>

            <button
              onClick={openEditModal}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 text-xs font-bold text-white cursor-pointer"
            >
              <Edit3 size={14} /> Change Cover
            </button>
          </div>

          {/* Details Column */}
          <div className="relative z-10 flex-1 space-y-4 w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1.5 md:hidden">
                  <span className="px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-extrabold text-purple-300 border border-purple-500/30">
                    PDF Manga
                  </span>
                  <button
                    onClick={openEditModal}
                    className="text-[10px] font-bold text-purple-300 hover:text-white flex items-center gap-1 transition px-2 py-0.5 rounded-md bg-white/10 border border-white/10 cursor-pointer"
                  >
                    <Edit3 size={11} /> Change Cover
                  </button>
                </div>
                {manga?.logoUrl ? (
                  <div className="h-14 sm:h-16 flex items-center mb-1">
                    <img
                      src={manga.logoUrl.startsWith('http') || manga.logoUrl.startsWith('data:') ? manga.logoUrl : `/api/image?path=${encodeURIComponent(manga.logoUrl)}`}
                      alt={manga.title}
                      className="max-h-14 sm:max-h-16 w-auto object-contain filter drop-shadow-lg"
                    />
                  </div>
                ) : (
                  <h1 className="text-2xl sm:text-3xl font-black tracking-wide text-white drop-shadow-md">
                    {manga?.title || 'Untitled Manga'}
                  </h1>
                )}
                {manga?.folderPath && (
                  <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1 font-mono truncate">
                    <HardDrive size={13} className="text-purple-400 shrink-0" />
                    <span className="truncate">{manga.folderPath}</span>
                  </div>
                )}
              </div>

              {/* Rating Tag */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRatingPanel(!showRatingPanel)}
                  className="px-3.5 py-1.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold text-sm flex items-center gap-1.5 hover:bg-amber-500/20 transition cursor-pointer"
                >
                  <Star size={16} className="fill-amber-400 text-amber-400" />
                  <span>{manga?.rating ? `${manga.rating}/10` : 'Unrated'}</span>
                  {manga?.aniListScore && (
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.2 rounded bg-purple-600/40 text-purple-200 border border-purple-500/30 ml-1">
                      AniList
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Description / Synopsis */}
            {(manga?.description || manga?.synopsis) && (
              <p className="text-xs text-gray-300 line-clamp-3 leading-relaxed">
                {manga.description || manga.synopsis}
              </p>
            )}

            {/* Genres */}
            {manga?.genres && manga.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(Array.isArray(manga.genres) ? manga.genres : [manga.genres]).map((g, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-[11px] font-semibold"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Chapters</span>
                <span className="text-lg font-black text-white">{chapters.length} / {manga?.totalChapters || chapters.length || 0}</span>
                {(manga?.volumes || manga?.totalVolumes) && (
                  <span className="text-[10px] text-purple-300 font-mono block mt-0.5">
                    {manga.volumes || manga.totalVolumes} Volumes
                  </span>
                )}
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Completed</span>
                <span className="text-lg font-black text-emerald-400">{completedCount} / {manga?.totalChapters || chapters.length || 0}</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Reading Progress</span>
                <span className="text-lg font-black text-purple-400">{overallProgressPct}%</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Rating</span>
                <span className="text-lg font-black text-amber-400">
                  {manga?.rating ? `★ ${manga.rating}` : '—'}
                </span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-1.5 pt-1">
              <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-600 to-pink-500 rounded-full transition-all duration-500"
                  style={{ width: `${overallProgressPct}%` }}
                />
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="pt-2 flex flex-wrap gap-3 items-center">
              {chapters.length > 0 && targetReadingChapter && (
                <button
                  type="button"
                  onClick={() => handleOpenChapter(targetReadingChapter)}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-purple-500/25 transition transform active:scale-95 cursor-pointer"
                >
                  <BookOpen size={16} />
                  <span>
                    {areAllChaptersRead
                      ? 'Start Reading (Ch. 1)'
                      : hasAnyChaptersRead
                        ? `Continue Reading ${targetReadingChapterNum !== '' ? `(Ch. ${targetReadingChapterNum})` : ''}`
                        : `Start Reading ${targetReadingChapterNum !== '' ? `(Ch. ${targetReadingChapterNum})` : '(Ch. 1)'}`}
                  </span>
                </button>
              )}

              <button
                type="button"
                onClick={openFileManagerModal}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
              >
                <FolderTree size={15} className="text-cyan-400" />
                <span>File Manager</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRatingPanel(!showRatingPanel)}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
              >
                <Star size={15} className="text-amber-400 fill-amber-400/20" />
                <span>Rate / AniList</span>
              </button>
            </div>

            {syncDbMessage && (
              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-semibold flex items-center gap-2 mt-2">
                <RefreshCw size={14} className={isSyncingWithDb ? "animate-spin shrink-0 text-blue-400" : "shrink-0 text-blue-400"} />
                <span>{syncDbMessage}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Rating Panel Dropdown ────────────────────────────────────────── */}
        <AnimatePresence>
          {showRatingPanel && (
            <motion.div
              id="rating-panel-section"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-amber-950/10 space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                    <Star className="text-amber-400 fill-amber-400" size={18} />
                    <span>Manga Rating & AniList Integration</span>
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Rate this manga manually or automatically fetch the community score from AniList
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleFetchAniListRating}
                    disabled={fetchingAniListRating}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
                  >
                    {fetchingAniListRating ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    <span>{fetchingAniListRating ? 'Fetching...' : 'Fetch from AniList'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowRatingPanel(false)}
                    className="p-2 rounded-lg text-gray-400 hover:text-white transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {ratingMessage && (
                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-semibold">
                  {ratingMessage}
                </div>
              )}

              {/* 10 Star Rating Selector */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="text-xs font-bold text-gray-400">Quick Star Rating:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((starVal) => {
                    const isFilled = (hoverRating || currentRatingNum) >= starVal;
                    return (
                      <button
                        key={starVal}
                        type="button"
                        onMouseEnter={() => setHoverRating(starVal)}
                        onMouseLeave={() => setHoverRating(0)}
                        onClick={() => handleSaveRating(starVal)}
                        className="p-1 text-gray-600 hover:scale-125 transition cursor-pointer"
                        title={`Rate ${starVal}/10`}
                      >
                        <Star
                          size={20}
                          className={isFilled ? 'fill-amber-400 text-amber-400' : 'text-gray-600'}
                        />
                      </button>
                    );
                  })}
                </div>
                <span className="text-xs font-mono font-bold text-amber-400 ml-2">
                  {hoverRating || currentRatingNum || 0} / 10
                </span>
              </div>

              {/* Manual input */}
              <div className="flex items-center gap-3 pt-2">
                <span className="text-xs font-bold text-gray-400">Custom Decimal Rating:</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="10"
                  placeholder="e.g. 8.7"
                  value={manualRatingInput}
                  onChange={(e) => setManualRatingInput(e.target.value)}
                  className="w-28 px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (manualRatingInput && !isNaN(parseFloat(manualRatingInput))) {
                      handleSaveRating(parseFloat(manualRatingInput));
                      setManualRatingInput('');
                    }
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition cursor-pointer"
                >
                  Save
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Manage Folder Accordion (Quick Rescan) ─────────────────────────── */}
        <div className="glass-panel p-5 rounded-2xl border border-white/10 space-y-3">
          <button
            type="button"
            onClick={() => setManageFolderExpanded(!manageFolderExpanded)}
            className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-purple-300 hover:text-white transition cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <RefreshCw size={16} className="text-purple-400" />
              <span>Rescan Manga Folder Directory</span>
            </span>
            {manageFolderExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {manageFolderExpanded && (
            <div className="pt-3 border-t border-white/10 space-y-3 text-xs">
              <p className="text-gray-400">
                Added new PDF files or chapters to this directory? Click rescan to check for changes and choose your sync options.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRescanFolder}
                  disabled={rescanStatus === 'scanning' || rescanStatus === 'applying'}
                  className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={14} className={rescanStatus === 'scanning' || rescanStatus === 'applying' ? 'animate-spin' : ''} />
                  <span>{rescanStatus === 'scanning' ? 'Scanning...' : 'Rescan Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={openFileManagerModal}
                  className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <FolderTree size={14} />
                  <span>Open Full File Manager</span>
                </button>

                {rescanMessage && !showRescanModal && (
                  <span className="text-xs font-semibold text-purple-300">{rescanMessage}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Chapter Catalog Section ────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <span>Chapters</span>
                <span className="text-xs text-gray-500 font-mono font-normal">
                  ({filteredChapters.length} of {chapters.length})
                </span>
              </h2>
              <p className="text-xs text-gray-400">Select any chapter to launch the custom PDF viewer</p>
            </div>

            {/* Filter buttons, Sort Order toggle, and Search */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Status Filter Tabs: Incomplete, Completed, All */}
              <div className="flex items-center p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
                <button
                  type="button"
                  onClick={() => setChapterStatusFilter('incomplete')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    chapterStatusFilter === 'incomplete'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-500/25'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Show only unread/incomplete chapters"
                >
                  <Clock size={13} className={chapterStatusFilter === 'incomplete' ? 'text-white' : 'text-purple-400'} />
                  <span>Incomplete ({unreadChaptersCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChapterStatusFilter('completed')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    chapterStatusFilter === 'completed'
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/25'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Show only completed/read chapters"
                >
                  <CheckCircle2 size={13} className={chapterStatusFilter === 'completed' ? 'text-white' : 'text-emerald-400'} />
                  <span>Completed ({completedChaptersCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setChapterStatusFilter('all')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                    chapterStatusFilter === 'all'
                      ? 'bg-white/20 text-white shadow-md'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  title="Show all chapters"
                >
                  <Layers size={13} className={chapterStatusFilter === 'all' ? 'text-white' : 'text-gray-400'} />
                  <span>All ({chapters.length})</span>
                </button>
              </div>

              {/* Sort Order Toggle */}
              <button
                type="button"
                onClick={() => setSortAscending(!sortAscending)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer whitespace-nowrap"
                title={sortAscending ? "Sorting: Ascending (1 → N). Click for Descending." : "Sorting: Descending (N → 1). Click for Ascending."}
              >
                <SlidersHorizontal size={13} className="text-purple-400" />
                <span>{sortAscending ? '1 → N (Asc)' : 'N → 1 (Desc)'}</span>
              </button>

              {/* Search input */}
              <div className="relative w-full sm:w-52">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search chapters..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Subfolder tabs if any */}
          {subfolders.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
              <button
                type="button"
                onClick={() => setSelectedSubfolder('ALL')}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border ${
                  selectedSubfolder === 'ALL'
                    ? 'bg-purple-600 text-white border-purple-500'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                }`}
              >
                All Folders
              </button>
              {subfolders.map((sf) => (
                <button
                  key={sf}
                  type="button"
                  onClick={() => setSelectedSubfolder(sf)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition cursor-pointer border flex items-center gap-1.5 whitespace-nowrap ${
                    selectedSubfolder === sf
                      ? 'bg-purple-600 text-white border-purple-500'
                      : 'bg-white/5 text-gray-400 border-white/10 hover:text-white'
                  }`}
                >
                  <Folder size={12} />
                  <span>{sf}</span>
                </button>
              ))}
            </div>
          )}

          {/* Chapters Grid / List */}
          {filteredChapters.length === 0 ? (
            <div className="p-12 text-center text-gray-400 rounded-2xl border border-white/10 bg-white/[0.02] flex flex-col items-center justify-center gap-3">
              <BookOpen size={36} className="text-gray-600 mb-1" />
              <p className="text-sm font-semibold text-gray-300">
                {search
                  ? `No chapters found matching "${search}".`
                  : chapterStatusFilter === 'incomplete'
                  ? 'No unread chapters! All available chapters are marked completed.'
                  : chapterStatusFilter === 'completed'
                  ? 'No completed chapters yet. Start reading from Chapter 1!'
                  : 'No chapters available.'}
              </p>
              {chapterStatusFilter === 'incomplete' && chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setChapterStatusFilter('all')}
                  className="px-4 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold transition cursor-pointer"
                >
                  Switch to All Chapters ({chapters.length})
                </button>
              )}
              {chapterStatusFilter === 'completed' && chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setChapterStatusFilter('incomplete')}
                  className="px-4 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-bold transition cursor-pointer"
                >
                  Switch to Incomplete Chapters ({unreadChaptersCount})
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
              {filteredChapters.map((chapter) => {
                const isRead = chapter.isRead || (chapter.progress && chapter.progress >= 95);
                const hasStarted = chapter.lastPage && chapter.lastPage > 1;

                return (
                  <div
                    key={chapter.id || chapter.name}
                    onClick={() => handleOpenChapter(chapter)}
                    className="p-4 rounded-2xl glass-card border border-white/10 hover:border-purple-500/50 transition duration-200 cursor-pointer flex flex-col justify-between group"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition">
                            <FileText size={16} />
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-purple-400 font-bold block">
                              Chapter {extractChapterNumber(chapter.name || chapter.fileName || chapter.title) || (chapter.chapterNumber !== undefined && Number(chapter.chapterNumber) > 0 ? chapter.chapterNumber : '—')}
                            </span>
                            <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-300 transition">
                              {chapter.name || chapter.title}
                            </h4>
                          </div>
                        </div>

                        {/* Toggle Chapter Complete Button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleChapterComplete(chapter);
                          }}
                          className={`p-1.5 rounded-full transition-all duration-200 cursor-pointer shrink-0 ${
                            isRead
                              ? 'bg-emerald-500/25 text-emerald-400 hover:bg-emerald-500/40 hover:text-emerald-300 ring-1 ring-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.25)]'
                              : 'bg-white/5 text-gray-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30'
                          }`}
                          title={isRead ? "Mark as unread (click to mark unwatched)" : "Mark as complete"}
                        >
                          <Check size={13} strokeWidth={isRead ? 2.8 : 2} />
                        </button>
                      </div>

                      {/* Reading Progress Indicator */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                          <span>
                            {isRead ? 'Completed' : (hasStarted ? `Page ${chapter.lastPage}` : 'Unread')}
                          </span>
                          <span>{isRead ? '100%' : (chapter.progress ? `${chapter.progress}%` : '')}</span>
                        </div>
                        <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full"
                            style={{ width: `${chapter.progress || (isRead ? 100 : 0)}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions footer */}
                    <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/5 text-[11px] text-gray-400">
                      <span className="font-mono text-[10px]">
                        {chapter.size ? `${(chapter.size / (1024 * 1024)).toFixed(1)} MB` : 'PDF'}
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChapter(chapter);
                          setNoteText(chapter.note || '');
                        }}
                        className="p-1 text-gray-400 hover:text-purple-300 transition cursor-pointer"
                        title="Chapter Note"
                      >
                        <StickyNote size={14} className={chapter.note ? 'text-purple-400 fill-purple-400/20' : ''} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── File Manager Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showFileManagerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl max-h-[85vh] overflow-y-auto glass-panel p-6 rounded-2xl border border-white/15 shadow-2xl flex flex-col space-y-4 bg-[#0d1117]/95 text-white"
            >
              {/* Header */}
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                    <FolderTree size={20} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      Manage Folder & Files — {manga?.title}
                    </h2>
                    <p className="text-[11px] text-gray-400 font-mono line-clamp-1" title={fmCurrentPath}>
                      {fmCurrentPath}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowFileManagerModal(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-black/40 p-3 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => loadFileManagerTree(manga?.folderPath)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 border border-white/10 cursor-pointer"
                    title="Root Folder"
                  >
                    <HardDrive size={14} className="text-cyan-400" /> Root
                  </button>

                  <button
                    onClick={() => {
                      setShowNewFolderInput(false);
                      setShowNewFileInput(!showNewFileInput);
                    }}
                    className="px-3 py-1.5 bg-pink-500/10 hover:bg-pink-500/20 text-pink-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-pink-500/30 cursor-pointer"
                  >
                    <FilePlus size={14} /> Add File
                  </button>

                  <button
                    onClick={() => {
                      setShowNewFileInput(false);
                      setShowNewFolderInput(!showNewFolderInput);
                    }}
                    className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 border border-cyan-500/30 cursor-pointer"
                  >
                    <FolderPlus size={14} /> New Sub-folder
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {fmMoveTarget && (
                    <div className="flex items-center gap-2 bg-purple-600/20 border border-purple-500/40 px-3 py-1 rounded-lg text-xs">
                      <span className="text-purple-300 font-medium">Moving: {fmMoveTarget.name}</span>
                      <button
                        onClick={handleMoveItem}
                        className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded font-bold transition"
                      >
                        Move Here
                      </button>
                      <button
                        onClick={() => { setFmMoveTarget(null); setFmDestPath(''); }}
                        className="text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  <button
                    onClick={() => loadFileManagerTree(fmCurrentPath)}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-semibold text-gray-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={14} className={fmLoading ? 'animate-spin' : ''} /> Refresh
                  </button>
                </div>
              </div>

              {/* New Folder Form */}
              {showNewFolderInput && (
                <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/10">
                  <input
                    type="text"
                    placeholder="Enter new sub-folder name..."
                    value={fmNewFolderName}
                    onChange={(e) => setFmNewFolderName(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/15 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={handleCreateSubfolder}
                    className="px-3 py-1.5 bg-cyan-400 text-black font-bold text-xs rounded-lg cursor-pointer hover:brightness-110"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => setShowNewFolderInput(false)}
                    className="px-3 py-1.5 bg-white/5 text-gray-400 hover:text-white text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* New File Form */}
              {showNewFileInput && (
                <div className="flex items-center gap-2 bg-white/5 p-3 rounded-xl border border-white/10">
                  <input
                    type="text"
                    placeholder="Enter full filename with extension (e.g. Chapter 03.pdf)..."
                    value={fmNewFileName}
                    onChange={(e) => setFmNewFileName(e.target.value)}
                    className="flex-1 bg-black/60 border border-white/15 text-xs text-white rounded-lg px-3 py-1.5 focus:outline-none focus:border-pink-400"
                  />
                  <button
                    onClick={handleAddManualFile}
                    className="px-3 py-1.5 bg-pink-500 text-white font-bold text-xs rounded-lg cursor-pointer hover:brightness-110"
                  >
                    Add File
                  </button>
                  <button
                    onClick={() => setShowNewFileInput(false)}
                    className="px-3 py-1.5 bg-white/5 text-gray-400 hover:text-white text-xs rounded-lg cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Directory Items List */}
              <div className="space-y-1.5 overflow-y-auto max-h-[50vh] pr-1">
                {fmTree?.children?.length === 0 ? (
                  <div className="text-center py-10 text-gray-500 text-xs">
                    This folder is empty.
                  </div>
                ) : (
                  fmTree?.children?.map((item, idx) => (
                    <div
                      key={`fm-item-${idx}`}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 transition group"
                    >
                      {/* Left: Icon and Name */}
                      <div
                        onClick={() => {
                          if (item.isDirectory) {
                            loadFileManagerTree(item.path);
                          }
                        }}
                        className={`flex items-center gap-3 min-w-0 flex-1 ${item.isDirectory ? 'cursor-pointer hover:text-cyan-300' : ''}`}
                      >
                        {item.isDirectory ? (
                          <Folder size={18} className="text-cyan-400 shrink-0" />
                        ) : (
                          <FileText size={18} className="text-purple-400 shrink-0" />
                        )}

                        <div className="min-w-0 flex-1">
                          {fmRenameTarget?.path === item.path ? (
                            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="text"
                                value={fmNewName}
                                onChange={(e) => setFmNewName(e.target.value)}
                                className="px-2 py-1 rounded bg-black/80 border border-white/20 text-xs text-white"
                                autoFocus
                              />
                              <button
                                onClick={handleRenameItem}
                                className="px-2 py-1 rounded bg-emerald-600 text-white text-xs font-bold"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => { setFmRenameTarget(null); setFmNewName(''); }}
                                className="px-2 py-1 rounded bg-white/10 text-gray-300 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs font-medium text-white truncate block">
                              {item.name}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Right: Size and Actions */}
                      <div className="flex items-center gap-3">
                        {!item.isDirectory && (
                          <span className="text-[10px] font-mono text-gray-500">
                            {item.size ? `${(item.size / (1024 * 1024)).toFixed(1)} MB` : 'PDF'}
                          </span>
                        )}

                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          {/* Rename */}
                          <button
                            onClick={() => {
                              setFmRenameTarget(item);
                              setFmNewName(item.name);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
                            title="Rename"
                          >
                            <Edit3 size={13} />
                          </button>

                          {/* Move */}
                          <button
                            onClick={() => {
                              setFmMoveTarget(item);
                              setFmDestPath(fmCurrentPath);
                            }}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-purple-300 hover:bg-white/10 transition cursor-pointer"
                            title="Move"
                          >
                            <Move size={13} />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteItem(item)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                            title="Delete File"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Edit Manga Details Modal ────────────────────────────────────────── */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-[90vw] max-w-[90vw] glass-panel p-6 md:p-8 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar bg-[#0d1117]/95 text-white"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <SlidersHorizontal className="text-purple-400" size={20} />
                  <span>Edit Manga Folder Details</span>
                </h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                {/* 1. Manga Title + Auto-Fetch Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Manga Title *
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchEditOnline}
                      disabled={fetchingEditOnline || !editTitle.trim()}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-purple-200 border border-purple-500/30 hover:border-purple-400 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Auto-fetch description, volumes, chapters count, and cover from online"
                    >
                      <Sparkles size={12} className={fetchingEditOnline ? 'animate-spin text-purple-400' : 'text-purple-300'} />
                      <span>{fetchingEditOnline ? 'Fetching Online...' : 'Auto-Fetch from Online'}</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                  {editOnlineMessage && (
                    <p className={`text-[11px] mt-1 font-medium ${editOnlineMessage.startsWith('✓') ? 'text-emerald-400' : 'text-purple-300'}`}>
                      {editOnlineMessage}
                    </p>
                  )}
                </div>

                {/* 2. Volumes & Total Chapters */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Volumes Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 12 (optional)"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={editTotalVolumes}
                      onChange={(e) => setEditTotalVolumes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Chapters
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={`Current: ${chapters.length}`}
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={editTotalChapters}
                      onChange={(e) => setEditTotalChapters(e.target.value)}
                    />
                  </div>
                </div>

                {/* 3. Description / Synopsis */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter manga overview, plot or notes, or auto-fetch from online..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                  />
                </div>

                {/* 4. Genres / Categories */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Genres (Max 5)
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 border border-white/5 rounded-xl bg-black/20 custom-scrollbar">
                    {GENRES_LIST.filter(g => g !== 'All').map((g) => {
                      const isSel = editGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel) setEditGenres(editGenres.filter((item) => item !== g));
                            else if (editGenres.length < 5) setEditGenres([...editGenres, g]);
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

                {/* 5. Cover Image Artwork */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Cover Artwork
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowOnlineSearchEdit(!showOnlineSearchEdit)}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                        showOnlineSearchEdit
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-gradient-to-r from-purple-600/30 to-pink-600/30 hover:from-purple-600/50 hover:to-pink-600/50 text-purple-200 border border-purple-500/30'
                      }`}
                    >
                      <Sparkles size={12} className="text-purple-300" />
                      <span>{showOnlineSearchEdit ? 'Hide Cover Search' : 'Search Covers Online'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10">
                      <ImagePlus size={14} />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleEditCoverUpload}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleEditCoverBrowse}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                    >
                      <HardDrive size={14} />
                      <span>Browse PC</span>
                    </button>
                  </div>

                  {showOnlineSearchEdit && (
                    <MangaCoverSearch
                      initialQuery={editTitle || manga?.title}
                      onSelectCover={(url) => {
                        setEditCoverUrl(url);
                        setShowOnlineSearchEdit(false);
                      }}
                      onClose={() => setShowOnlineSearchEdit(false)}
                    />
                  )}

                  {uploadingEditCover && (
                    <div className="flex items-center gap-2 text-xs text-purple-400">
                      <Loader2 className="animate-spin" size={14} />
                      Loading image...
                    </div>
                  )}

                  {editCoverUrl && (
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-2">
                      <img
                        src={editCoverUrl.startsWith('http') || editCoverUrl.startsWith('data:') ? editCoverUrl : `/api/image?path=${encodeURIComponent(editCoverUrl)}`}
                        alt="Cover Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setEditCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Online Artwork Search (AniList & Fanart.tv) ── */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/20 via-pink-900/20 to-black/30 border border-purple-500/20 space-y-2.5">
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
                          fetchEditMangaArtwork(editArtworkSearchQuery);
                        }
                      }}
                      className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => fetchEditMangaArtwork(editArtworkSearchQuery)}
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

                      {Array.isArray(editMangaImages?.banners) && editMangaImages.banners.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Choose from Fetched Online Banners ({editMangaImages.banners.length} found):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 max-h-52 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                            {editMangaImages.banners.map((ban, idx) => {
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

                {/* ── Custom Manga Logo / Title Art (Transparent PNG) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableEditMangaLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableEditMangaLogo(checked);
                          if (checked && !editLogoUrl && editMangaImages?.logos?.length > 0) {
                            setEditLogoUrl(editMangaImages.logos[0].url);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <ImagePlus size={14} className="text-purple-400" />
                        Custom Manga Logo / Title Art
                      </span>
                    </label>
                    {enableEditMangaLogo && (
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

                  {enableEditMangaLogo && (
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

                          {Array.isArray(editMangaImages?.logos) && editMangaImages.logos.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                                Choose from Fetched Transparent Logos ({editMangaImages.logos.length} found):
                              </span>
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar p-1.5 rounded-xl bg-black/50 border border-white/5">
                                {editMangaImages.logos.map((logo, idx) => {
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

                {/* Submit buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg shadow-purple-500/20"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Note Editor Modal ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {editingChapter && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white/15 shadow-2xl bg-[#0d1117]/95 text-white"
            >
              <h3 className="text-base font-extrabold mb-1 flex items-center gap-2">
                <StickyNote size={17} className="text-purple-400" />
                <span>Chapter Notes</span>
              </h3>
              <p className="text-xs text-gray-400 truncate mb-4">{editingChapter.name}</p>

              <textarea
                rows={4}
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Write your review, chapter thoughts, or notes..."
                className="w-full p-3 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
              />

              <div className="flex items-center justify-end gap-2.5 pt-4 mt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingChapter(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Save Note
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirmation Modal: Mark Entire Manga Complete / Unread ───────── */}
      <AnimatePresence>
        {showMarkAllModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white/15 shadow-2xl bg-[#0d1117]/95 text-white"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0 shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">
                    {overallProgressPct === 100 ? 'Manga Reading Status' : 'Mark Entire Manga Complete'}
                  </h3>
                  <p className="text-xs text-gray-400 font-mono truncate">{manga?.title}</p>
                </div>
              </div>

              <div className="space-y-3 py-2 text-xs text-gray-300">
                {overallProgressPct === 100 ? (
                  <p>
                    All <span className="text-emerald-400 font-bold">{chapters.length} chapters</span> of this manga are currently marked as completed. Would you like to mark them all as unread?
                  </p>
                ) : (
                  <p>
                    Are you sure you want to mark all <span className="text-emerald-400 font-bold">{chapters.length} chapters</span> of <span className="text-white font-semibold">{manga?.title}</span> as fully read and completed?
                  </p>
                )}
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-[11px] text-gray-400 font-mono">
                  <span>Current Progress:</span>
                  <span className="text-emerald-400 font-bold">{completedCount} / {manga?.totalChapters || chapters.length || 0} chapters ({overallProgressPct}%)</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 mt-3 border-t border-white/10">
                <button
                  type="button"
                  disabled={markingAll}
                  onClick={() => setShowMarkAllModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white transition cursor-pointer"
                >
                  Cancel
                </button>
                {overallProgressPct === 100 ? (
                  <button
                    type="button"
                    disabled={markingAll}
                    onClick={() => handleMarkEntireMangaComplete(false)}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg disabled:opacity-50"
                  >
                    {markingAll ? <Loader2 className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                    <span>Mark All Unread</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={markingAll}
                    onClick={() => handleMarkEntireMangaComplete(true)}
                    className="flex items-center gap-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg shadow-emerald-600/30 disabled:opacity-50"
                  >
                    {markingAll ? <Loader2 className="animate-spin" size={14} /> : <Check size={14} strokeWidth={2.5} />}
                    <span>Mark All Complete</span>
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Folder Rescan Status & Multi-Option Sync Modal ───────────────── */}
      <AnimatePresence>
        {showRescanModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="w-full max-w-2xl glass-panel p-5 sm:p-6 rounded-2xl border border-white/15 shadow-neon-border text-left space-y-4 max-h-[92vh] flex flex-col my-auto"
            >
              {/* Modal Header */}
              <div className="flex justify-between items-start border-b border-white/10 pb-3.5 shrink-0">
                <div>
                  <h2 className="text-base sm:text-lg font-black flex items-center gap-2 text-white">
                    <RefreshCw className={`text-neonPurple ${rescanStatus === 'scanning' || rescanStatus === 'applying' ? 'animate-spin' : ''}`} size={20} />
                    {rescanStatus === 'preview' ? 'Folder Rescan Results & Sync Options' : 'Rescan Manga Folder Directory'}
                  </h2>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {rescanStatus === 'preview'
                      ? 'Review discovered changes and choose how your library should be updated.'
                      : 'Scanning your disk and checking for library differences...'}
                  </p>
                </div>
                {rescanStatus !== 'scanning' && rescanStatus !== 'applying' && (
                  <button
                    onClick={() => setShowRescanModal(false)}
                    className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Scanning / Applying State */}
              {(rescanStatus === 'scanning' || rescanStatus === 'applying') && (
                <div className="bg-black/40 border border-white/10 rounded-xl p-5 space-y-3 text-xs my-auto">
                  <div className="flex items-center gap-2.5">
                    <Loader2 className="animate-spin text-neonPurple" size={18} />
                    <span className="font-bold text-gray-100 text-sm">
                      {rescanStatus === 'scanning' ? 'Scanning directory for PDF chapters...' : 'Applying updates to library & cloud...'}
                    </span>
                  </div>
                  <div className="p-3 bg-black/60 rounded-lg border border-white/5 font-mono text-[11px] text-purple-300">
                    {rescanMessage}
                  </div>
                </div>
              )}

              {/* Preview Diff & Multi-Option Sync State */}
              {rescanStatus === 'preview' && rescanDiff && (
                <div className="space-y-4 overflow-y-auto pr-1 flex-1 text-xs">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-emerald-400">+{rescanDiff.newChapters.length}</span>
                      <span className="text-[10px] text-emerald-300/80 font-medium">New Chapters</span>
                    </div>

                    <div className="bg-purple-500/10 border border-purple-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-neonPurple">+{rescanDiff.addedFolders.length}</span>
                      <span className="text-[10px] text-purple-300/80 font-medium">New Folders</span>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-blue-400">{rescanDiff.retainedChapters.length}</span>
                      <span className="text-[10px] text-blue-300/80 font-medium">Existing Kept</span>
                    </div>

                    <div className="bg-red-500/10 border border-red-500/25 rounded-xl p-2.5 text-center">
                      <span className="block text-xl font-black text-red-400">-{rescanDiff.removedChapters.length}</span>
                      <span className="text-[10px] text-red-300/80 font-medium">Missing / Removed</span>
                    </div>
                  </div>

                  {/* Sync Mode Selection Options */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block flex items-center gap-1.5">
                      <SlidersHorizontal size={13} className="text-neonPurple" />
                      Select Sync Behavior:
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Update Normally (Full Sync) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('normal')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'normal'
                            ? 'bg-gradient-to-br from-purple-500/25 to-pink-600/25 border-purple-400/80 shadow-[0_0_15px_rgba(168,85,247,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <RefreshCw size={14} className={rescanSyncMode === 'normal' ? 'text-neonPurple animate-spin-slow' : 'text-gray-400'} />
                            Update Normally
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Full Sync
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newChapters.length}</span> new chapters and clean <span className="text-red-400 font-bold">-{rescanDiff.removedChapters.length}</span> missing items.
                        </p>
                      </button>

                      {/* Option 2: Only Update New Chapters (Safe Add) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('new_only')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'new_only'
                            ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <PlusCircle size={14} className={rescanSyncMode === 'new_only' ? 'text-emerald-400' : 'text-gray-400'} />
                            Only New Chapters
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Safe Add
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newChapters.length}</span> new files. Keeps all <span className="text-gray-200 font-bold">{rescanDiff.removedChapters.length}</span> missing items untouched.
                        </p>
                      </button>

                      {/* Option 3: Only Update Deleted Items */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('deleted_only')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'deleted_only'
                            ? 'bg-gradient-to-br from-red-500/20 to-rose-600/20 border-red-400/80 shadow-[0_0_15px_rgba(239,68,68,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <Trash2 size={14} className={rescanSyncMode === 'deleted_only' ? 'text-red-400' : 'text-gray-400'} />
                            Only Deleted Items
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 border border-red-500/30">
                            Clean Only
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Remove <span className="text-red-400 font-bold">-{rescanDiff.removedChapters.length}</span> deleted items. Will <span className="text-gray-400 font-semibold">skip</span> adding new chapters.
                        </p>
                      </button>

                      {/* Option 4: Custom Granular Checkboxes */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('custom')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden flex flex-col justify-between ${
                          rescanSyncMode === 'custom'
                            ? 'bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border-purple-400/80 shadow-[0_0_15px_rgba(168,85,247,0.25)] text-white'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="font-black text-xs flex items-center gap-1.5 text-white">
                            <CheckSquare size={14} className={rescanSyncMode === 'custom' ? 'text-purple-400' : 'text-gray-400'} />
                            Custom Selection
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Checkboxes
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Manually select / unselect individual chapters and folders below.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Summary Live Calculation Pill */}
                  <div className="bg-black/50 border border-white/10 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">Action Plan:</span>
                      <span className="text-emerald-400 font-bold">+{selectedNewChIds.size} to add</span>
                      <span className="text-red-400 font-bold">-{selectedRemovedChIds.size} to remove</span>
                    </div>
                    <div className="text-gray-300 font-medium">
                      Library Total: <span className="text-neonPurple font-bold">{chapters.length}</span> → <span className="text-white font-black">{chapters.length - selectedRemovedChIds.size + selectedNewChIds.size}</span> chs
                    </div>
                  </div>

                  {/* Interactive Details Filter Tabs */}
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between border-b border-white/10 pb-2">
                      <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('all')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                            rescanActiveTab === 'all' ? 'bg-white/20 text-white shadow-sm' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          All Items
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('new')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                            rescanActiveTab === 'new' ? 'bg-emerald-500/30 text-emerald-300 shadow-sm' : 'text-gray-400 hover:text-emerald-400'
                          }`}
                        >
                          <Sparkles size={12} />
                          New ({rescanDiff.newChapters.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setRescanActiveTab('removed')}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                            rescanActiveTab === 'removed' ? 'bg-red-500/30 text-red-300 shadow-sm' : 'text-gray-400 hover:text-red-400'
                          }`}
                        >
                          <Trash2 size={12} />
                          Missing ({rescanDiff.removedChapters.length})
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        {rescanActiveTab === 'new' && rescanDiff.newChapters.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectAllNew(true)}
                              className="text-[10px] text-emerald-400 hover:underline font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => handleSelectAllNew(false)}
                              className="text-[10px] text-gray-400 hover:text-white font-semibold cursor-pointer"
                            >
                              Deselect All
                            </button>
                          </>
                        )}
                        {rescanActiveTab === 'removed' && rescanDiff.removedChapters.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSelectAllRemoved(true)}
                              className="text-[10px] text-red-400 hover:underline font-semibold cursor-pointer"
                            >
                              Select All (Delete)
                            </button>
                            <span className="text-gray-600">|</span>
                            <button
                              type="button"
                              onClick={() => handleSelectAllRemoved(false)}
                              className="text-[10px] text-gray-400 hover:text-white font-semibold cursor-pointer"
                            >
                              Keep All (Don't Delete)
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Scrollable Item Breakdown List */}
                    <div className="max-h-[220px] overflow-y-auto bg-black/60 rounded-xl border border-white/10 p-3 space-y-3">
                      {/* Section: New Chapters */}
                      {(rescanActiveTab === 'all' || rescanActiveTab === 'new') && rescanDiff.newChapters.length > 0 && (
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400">
                            <span className="flex items-center gap-1.5">
                              <Sparkles size={13} /> New Chapters Discovered ({rescanDiff.newChapters.length}):
                            </span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleSelectAllNew(true)}
                                className="text-emerald-400 hover:underline cursor-pointer"
                              >
                                Check All
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllNew(false)}
                                className="text-gray-400 hover:text-white cursor-pointer"
                              >
                                Uncheck All
                              </button>
                            </div>
                          </div>

                          {/* New Folders Badges */}
                          {rescanDiff.addedFolders.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {rescanDiff.addedFolders.map(folder => (
                                <span key={folder} className="text-[10px] bg-purple-500/20 text-neonPurple border border-purple-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                                  <FolderPlus size={10} /> New Folder: {folder}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            {rescanDiff.newChapters.map(ch => {
                              const isChecked = selectedNewChIds.has(ch.id);
                              const subf = getSubfolder(ch.filePath, manga?.folderPath || '');
                              return (
                                <div
                                  key={ch.id}
                                  onClick={() => handleToggleNewChapter(ch.id)}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none text-[11px] ${
                                    isChecked
                                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                                      : 'bg-white/5 border-white/5 text-gray-500 opacity-60 hover:opacity-90'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="accent-emerald-500 w-4 h-4 rounded cursor-pointer shrink-0"
                                    />
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white shrink-0">
                                      CH {ch.chapterNumber || '?'}
                                    </span>
                                    {subf && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 truncate max-w-[120px]">
                                        📁 {subf}
                                      </span>
                                    )}
                                    <span className="truncate font-mono text-gray-200" title={ch.name || ch.fileName}>
                                      {ch.name || ch.fileName}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-bold text-emerald-400 shrink-0 ml-2">
                                    {isChecked ? '+ Will Add' : 'Skipped'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Section: Missing / Removed Chapters */}
                      {(rescanActiveTab === 'all' || rescanActiveTab === 'removed') && rescanDiff.removedChapters.length > 0 && (
                        <div className="space-y-1.5 pt-2 border-t border-white/5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-red-400">
                            <span className="flex items-center gap-1.5">
                              <Trash2 size={13} /> Missing / Deleted Items on PC ({rescanDiff.removedChapters.length}):
                            </span>
                            <div className="flex items-center gap-2 text-[10px]">
                              <button
                                type="button"
                                onClick={() => handleSelectAllRemoved(true)}
                                className="text-red-400 hover:underline cursor-pointer"
                              >
                                Select All (Delete)
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSelectAllRemoved(false)}
                                className="text-gray-400 hover:text-white cursor-pointer"
                              >
                                Keep All
                              </button>
                            </div>
                          </div>

                          {/* Removed Folders Badges */}
                          {rescanDiff.removedFolders.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 py-1">
                              {rescanDiff.removedFolders.map(folder => (
                                <span key={folder} className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                                  <FolderMinus size={10} /> Deleted Folder: {folder}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="space-y-1">
                            {rescanDiff.removedChapters.map(ch => {
                              const isChecked = selectedRemovedChIds.has(ch.id);
                              const subf = getSubfolder(ch.filePath, manga?.folderPath || '');
                              const isRead = Boolean(ch.isRead || ch.isWatched || (ch.progress && ch.progress >= 95));
                              return (
                                <div
                                  key={ch.id}
                                  onClick={() => handleToggleRemovedChapter(ch.id)}
                                  className={`flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer select-none text-[11px] ${
                                    isChecked
                                      ? 'bg-red-500/10 border-red-500/30 text-red-200'
                                      : 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300/80'
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                    <input
                                      type="checkbox"
                                      checked={isChecked}
                                      onChange={() => {}}
                                      className="accent-red-500 w-4 h-4 rounded cursor-pointer shrink-0"
                                    />
                                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white shrink-0">
                                      CH {ch.chapterNumber || '?'}
                                    </span>
                                    {subf && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 truncate max-w-[120px]">
                                        📁 {subf}
                                      </span>
                                    )}
                                    <span className="truncate font-mono text-gray-300" title={ch.name || ch.fileName}>
                                      {ch.name || ch.fileName}
                                    </span>
                                    {isRead && (
                                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-semibold shrink-0">
                                        Read
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-[10px] font-bold shrink-0 ml-2">
                                    {isChecked ? (
                                      <span className="text-red-400">- Will Delete</span>
                                    ) : (
                                      <span className="text-emerald-400">🛡️ Keep in Library</span>
                                    )}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Clean state / No changes */}
                      {rescanDiff.newChapters.length === 0 && rescanDiff.removedChapters.length === 0 && (
                        <div className="text-center py-6 text-gray-400 text-xs space-y-1">
                          <CheckCircle2 size={24} className="text-emerald-400 mx-auto mb-1" />
                          <p className="font-bold text-gray-200">No file or folder changes detected.</p>
                          <p className="text-[11px] text-gray-500">Your WatchAnime manga library is 100% in sync with your local folder.</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Consent & Action Buttons */}
                  <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-white/10 shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowRescanModal(false)}
                      className="w-full sm:w-auto px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-bold cursor-pointer transition text-center"
                    >
                      Cancel
                    </button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={handleApplyRescanChanges}
                        disabled={selectedNewChIds.size === 0 && selectedRemovedChIds.size === 0 && (rescanDiff.newChapters.length > 0 || rescanDiff.removedChapters.length > 0)}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-neon-gradient hover:brightness-110 text-white text-xs font-black uppercase tracking-wider shadow-purple-glow cursor-pointer flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {rescanSyncMode === 'normal' && (
                          <>
                            <RefreshCw size={14} />
                            Update Normally (+{selectedNewChIds.size}, -{selectedRemovedChIds.size})
                          </>
                        )}
                        {rescanSyncMode === 'new_only' && (
                          <>
                            <PlusCircle size={14} />
                            Add {selectedNewChIds.size} New Only (Keep Missing)
                          </>
                        )}
                        {rescanSyncMode === 'deleted_only' && (
                          <>
                            <Trash2 size={14} />
                            Remove {selectedRemovedChIds.size} Missing Only
                          </>
                        )}
                        {rescanSyncMode === 'custom' && (
                          <>
                            <Check size={14} />
                            Apply Custom Selection (+{selectedNewChIds.size}, -{selectedRemovedChIds.size})
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Completed / Error State */}
              {(rescanStatus === 'completed' || rescanStatus === 'error') && (
                <div className="space-y-4 my-auto">
                  <div className="bg-black/40 border border-white/10 rounded-xl p-4 space-y-3 text-xs">
                    <div className="flex items-center gap-2">
                      {rescanStatus === 'completed' ? (
                        <CheckCircle2 className="text-emerald-400" size={18} />
                      ) : (
                        <AlertTriangle className="text-red-400" size={18} />
                      )}
                      <span className="font-bold text-gray-100 text-sm">
                        {rescanStatus === 'completed' ? 'Rescan updates applied successfully!' : 'Rescan failed'}
                      </span>
                    </div>

                    <div className="p-3 bg-black/60 rounded-lg border border-white/5 font-mono text-[11px] text-gray-300">
                      {rescanMessage}
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRescanModal(false)}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-neon-gradient text-white text-xs font-black uppercase tracking-wider hover:brightness-110 shadow-purple-glow cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
