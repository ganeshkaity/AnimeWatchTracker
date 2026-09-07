"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  getLocalManga, upsertLocalManga, deleteLocalManga,
  getLocalChapters, setLocalChapters, upsertLocalChapter, deleteLocalChapter,
  addToDirtyQueue, getUserId
} from '../utils/localStore';
import { getReadingProgress } from '../utils/indexedDBStore';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { doc, getDocs, collection, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import {
  ArrowLeft, BookOpen, Clock, Folder, CheckCircle2, Bookmark,
  StickyNote, Star, RefreshCw, FolderPlus, FolderTree, Search,
  ChevronDown, ChevronUp, Trash2, Edit3, Check, ExternalLink, HardDrive,
  FileText, Sparkles, Heart, SlidersHorizontal, ImagePlus, X, FilePlus,
  Move, CornerDownRight, ArrowRight, Layers, Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MangaCoverSearch from '../components/MangaCoverSearch';

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
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSubfolder, setSelectedSubfolder] = useState('ALL');

  // Note Modal state
  const [editingChapter, setEditingChapter] = useState(null);
  const [noteText, setNoteText] = useState('');

  // Rescan state
  const [manageFolderExpanded, setManageFolderExpanded] = useState(false);
  const [isRescanning, setIsRescanning] = useState(false);
  const [rescanMessage, setRescanMessage] = useState('');

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
  const [editGenres, setEditGenres] = useState([]);
  const [editDescription, setEditDescription] = useState('');
  const [editCoverUrl, setEditCoverUrl] = useState('');
  const [showOnlineSearchEdit, setShowOnlineSearchEdit] = useState(false);
  const [uploadingEditCover, setUploadingEditCover] = useState(false);

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
          const docId = ch.id || `manga_${mangaId}_${encodeURIComponent(ch.name)}`;
          const prog = await getReadingProgress(docId);
          if (prog) {
            return {
              ...ch,
              lastPage: prog.lastPage,
              totalPages: prog.totalPages,
              progress: prog.progress,
              isRead: prog.progress >= 95,
            };
          }
          return ch;
        })
      );

      // Sort in natural ascending order (small to big)
      enrichedChapters.sort((a, b) => naturalChapterSort(a, b, true));

      setManga(localManga);
      setChapters(enrichedChapters);
    } catch (err) {
      console.error('[MangaDetail] Error loading manga:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mangaId) loadData();
  }, [mangaId, currentUser]);

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

  // Filtered chapters (sorted small to big by default)
  const filteredChapters = useMemo(() => {
    const list = chapters.filter((c) => {
      const matchSearch = (c.name || c.title || '').toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;

      if (selectedSubfolder !== 'ALL') {
        const rel = (c.filePath || '').replace(manga?.folderPath || '', '').replace(/^[\\/]/, '');
        return rel.startsWith(selectedSubfolder);
      }
      return true;
    });

    return list.sort((a, b) => naturalChapterSort(a, b, sortAscending));
  }, [chapters, search, selectedSubfolder, manga, sortAscending]);

  // Handle open chapter in reader
  const handleOpenChapter = (chapter) => {
    if (onReadChapter) {
      onReadChapter(chapter);
    } else {
      router.push(`/reader/${mangaId}?chapter=${encodeURIComponent(chapter.id || chapter.name)}&path=${encodeURIComponent(chapter.filePath)}&title=${encodeURIComponent(manga?.title || '')}&chapterTitle=${encodeURIComponent(chapter.name || '')}`);
    }
  };

  // ── Rescan Folder ──────────────────────────────────────────────────────────
  const handleRescanFolder = async () => {
    if (!manga?.folderPath) return;
    setIsRescanning(true);
    setRescanMessage('Scanning folder for new PDF chapters...');

    try {
      const res = await fetch('/api/manga/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: manga.folderPath }),
      });
      const data = await res.json();

      if (data.success && Array.isArray(data.chapters)) {
        // Natural sort discovered files
        data.chapters.sort((a, b) => naturalChapterSort(a, b, true));

        const newChapters = data.chapters.map((ch, idx) => ({
          id: `chap_${idx + 1}_${encodeURIComponent(ch.name)}`,
          chapterNumber: extractChapterNumber(ch.name || ch.fileName),
          ...ch,
        }));

        setLocalChapters(mangaId, newChapters);
        setChapters(newChapters);

        // Update manga total chapters
        const updatedManga = {
          ...manga,
          chapterCount: newChapters.length,
          totalChapters: newChapters.length,
          updatedAt: new Date().toISOString(),
        };
        upsertLocalManga(updatedManga);
        setManga(updatedManga);

        setRescanMessage(`✓ Scanned successfully! Found ${newChapters.length} chapters.`);
      } else {
        setRescanMessage('Failed to scan folder: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      setRescanMessage('Scan error: ' + err.message);
    } finally {
      setIsRescanning(false);
      setTimeout(() => setRescanMessage(''), 4000);
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

      const updatedManga = { ...manga, chapterCount: updatedList.length, totalChapters: updatedList.length };
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
        totalChapters: updatedRemaining.length,
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
    setEditGenres(Array.isArray(manga?.genres) ? manga.genres : typeof manga?.genres === 'string' ? manga.genres.split(',').map(s => s.trim()) : []);
    setEditDescription(manga?.description || manga?.synopsis || '');
    setEditCoverUrl(manga?.thumbnailBase64 || manga?.thumbnailPath || '');
    setShowOnlineSearchEdit(false);
    setShowEditModal(true);
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

  const handleSaveEdit = async (e) => {
    if (e) e.preventDefault();
    if (!editTitle.trim()) return;

    try {
      const updatedManga = {
        ...manga,
        title: editTitle.trim(),
        totalChapters: editTotalChapters ? parseInt(editTotalChapters, 10) : chapters.length,
        chapterCount: editTotalChapters ? parseInt(editTotalChapters, 10) : chapters.length,
        genres: editGenres,
        description: editDescription,
        synopsis: editDescription,
        thumbnailBase64: editCoverUrl || manga?.thumbnailBase64,
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

  // Calculate Overall Progress
  const completedCount = chapters.filter((c) => c.isRead || (c.progress && c.progress >= 95)).length;
  const overallProgressPct = chapters.length > 0 ? Math.round((completedCount / chapters.length) * 100) : 0;
  const currentRatingNum = manga?.rating ? parseFloat(manga.rating) : 0;

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
      <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#0d1117]/90 backdrop-blur-md px-4 sm:px-8 flex items-center justify-between">
        <button
          onClick={onBack || (() => router.push('/'))}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-300 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft size={16} />
          <span>Back to Library</span>
        </button>

        <div className="flex items-center gap-2">
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
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* ── Hero Banner / Overview Card ────────────────────────────────────── */}
        <div className="relative rounded-3xl overflow-hidden glass-panel border border-white/10 p-6 sm:p-8 bg-gradient-to-br from-purple-900/20 via-[#10141d] to-[#0d1117] shadow-2xl flex flex-col md:flex-row gap-8 items-start">
          {/* Cover Poster */}
          <div className="w-48 sm:w-56 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-2xl border border-white/15 bg-black/50 relative group">
            {manga?.thumbnailBase64 ? (
              <img
                src={manga.thumbnailBase64.startsWith('http') || manga.thumbnailBase64.startsWith('data:') ? manga.thumbnailBase64 : `/api/image?path=${encodeURIComponent(manga.thumbnailBase64)}`}
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
          <div className="flex-1 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-wide text-white">
                  {manga?.title || 'Untitled Manga'}
                </h1>
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
                <span className="text-lg font-black text-white">{chapters.length}</span>
              </div>
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-[10px] text-gray-400 font-bold uppercase block">Completed</span>
                <span className="text-lg font-black text-emerald-400">{completedCount}</span>
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
              {chapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleOpenChapter(chapters[0])}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-xl shadow-purple-500/25 transition transform active:scale-95 cursor-pointer"
                >
                  <BookOpen size={16} />
                  <span>Start Reading (Ch. 1)</span>
                </button>
              )}

              <button
                type="button"
                onClick={openEditModal}
                className="px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
              >
                <SlidersHorizontal size={15} className="text-purple-400" />
                <span>Edit Manga</span>
              </button>

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
          </div>
        </div>

        {/* ── Rating Panel Dropdown ────────────────────────────────────────── */}
        <AnimatePresence>
          {showRatingPanel && (
            <motion.div
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
                Added new PDF files or chapters to this directory? Click rescan to automatically sync them into your library.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleRescanFolder}
                  disabled={isRescanning}
                  className="px-4 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white font-bold flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isRescanning ? 'animate-spin' : ''} />
                  <span>{isRescanning ? 'Scanning...' : 'Rescan Folder'}</span>
                </button>

                <button
                  type="button"
                  onClick={openFileManagerModal}
                  className="px-4 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 hover:text-white font-bold flex items-center gap-2 transition cursor-pointer"
                >
                  <FolderTree size={14} />
                  <span>Open Full File Manager</span>
                </button>

                {rescanMessage && (
                  <span className="text-xs font-semibold text-purple-300">{rescanMessage}</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Chapter Catalog Section ────────────────────────────────────────── */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                <span>Chapters</span>
                <span className="text-xs text-gray-500 font-mono font-normal">
                  ({filteredChapters.length} of {chapters.length})
                </span>
              </h2>
              <p className="text-xs text-gray-400">Select any chapter to launch the custom PDF viewer</p>
            </div>

            {/* Search filter and Sort Order toggle */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setSortAscending(!sortAscending)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer whitespace-nowrap"
                title={sortAscending ? "Sorting: Small to Big (1 → N). Click to reverse." : "Sorting: Big to Small (N → 1). Click to reverse."}
              >
                <SlidersHorizontal size={13} className="text-purple-400" />
                <span>{sortAscending ? '1 → N (Asc)' : 'N → 1 (Desc)'}</span>
              </button>

              <div className="relative w-full sm:w-60">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter chapters..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
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
            <div className="p-12 text-center text-gray-500 rounded-2xl border border-white/10 bg-white/[0.02]">
              No chapters found matching your filter.
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

                        {isRead && (
                          <div className="p-1 rounded-full bg-emerald-500/20 text-emerald-400" title="Completed">
                            <Check size={13} />
                          </div>
                        )}
                      </div>

                      {/* Reading Progress Indicator */}
                      <div className="space-y-1 pt-1">
                        <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
                          <span>
                            {hasStarted ? `Page ${chapter.lastPage}` : 'Unread'}
                          </span>
                          <span>{chapter.progress ? `${chapter.progress}%` : ''}</span>
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
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white"
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
                {/* 1. Manga Title */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Manga Title *
                  </label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                  />
                </div>

                {/* 2. Total Chapters Count */}
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

                {/* 3. Description / Synopsis */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter manga overview, plot or notes..."
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
    </div>
  );
}
