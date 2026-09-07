"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { loadPDFDocument } from './pdfUtils';
import PDFDocument from './PDFDocument';
import ReaderToolbar from './ReaderToolbar';
import AnnotationToolbar from './AnnotationToolbar';
import ThumbnailSidebar from './ThumbnailSidebar';
import OutlineSidebar from './OutlineSidebar';
import BookmarkPanel from './BookmarkPanel';
import SearchPanel from './SearchPanel';
import SettingsPanel from './SettingsPanel';
import {
  saveReadingProgress, getReadingProgress,
  savePageAnnotations, getAllDocumentAnnotations,
  saveBookmarks, getBookmarks,
  savePageNotes, getPageNotes,
  saveReaderSettings, getReaderSettings
} from '../../utils/indexedDBStore';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import { addToDirtyQueue, getUserId } from '../../utils/localStore';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';

export default function PDFReader({
  sourceUrl,
  documentId,
  mangaId,
  title = 'Manga Reader',
  chapterTitle = '',
  onBack,
  onProgressUpdate,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter = false,
  hasNextChapter = false,
  prevChapterTitle = '',
  nextChapterTitle = '',
}) {
  const { currentUser } = useAuth();
  const { isOffline } = useOffline();

  // Document state
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [jumpTarget, setJumpTarget] = useState(null); // { page, ts } for programmatic scrolling

  // Resume prompt state
  const [resumePrompt, setResumePrompt] = useState(null); // { lastPage, progress }

  // Viewport & Transform state
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [centerAlign, setCenterAlign] = useState(true);

  // Auto-hide toolbar state
  const [showToolbars, setShowToolbars] = useState(true);
  const hideTimerRef = useRef(null);

  // Active sidebars / panels
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnnotationsToolbar, setShowAnnotationsToolbar] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');

  // Reader Preferences
  const [settings, setSettings] = useState({
    direction: 'rtl',
    readingMode: 'single',
    background: 'dark',
    zoomMode: 'fit-width',
    pageTransition: true,
    toolbarAutoHide: true,
    coverPageOffset: true,
  });

  // Annotations state
  const [annotationsMap, setAnnotationsMap] = useState({}); // { [pageNumber]: [annotations] }
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [activeTool, setActiveTool] = useState('select');
  const [toolColor, setToolColor] = useState('#ffeb3b');
  const [toolThickness, setToolThickness] = useState(4);
  const [toolOpacity, setToolOpacity] = useState(0.5);
  const [eraserType, setEraserType] = useState('object');
  const [saveStatus, setSaveStatus] = useState('clean'); // 'clean' | 'dirty' | 'saving' | 'saved'

  // Bookmarks & Notes state
  const [bookmarks, setBookmarks] = useState([]);
  const [pageNotes, setPageNotes] = useState([]);

  // Track when mouse is hovering any controls/buttons
  const isHoveringControlsRef = useRef(false);

  // Auto-hide toolbar timer reset
  const resetAutoHideTimer = useCallback(() => {
    setShowToolbars(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);

    // If hovering over any controls/buttons or if any panel is open, do NOT auto-hide
    if (isHoveringControlsRef.current) return;
    if (showThumbnails || showOutline || showBookmarks || showSearch || showSettings || showAnnotationsToolbar) return;

    // Only hide if settings enable it and annotation toolbar is not in use
    if (settings.toolbarAutoHide && activeTool === 'select') {
      hideTimerRef.current = setTimeout(() => {
        if (!isHoveringControlsRef.current) {
          setShowToolbars(false);
        }
      }, 3500);
    }
  }, [settings.toolbarAutoHide, showAnnotationsToolbar, activeTool, showThumbnails, showOutline, showBookmarks, showSearch, showSettings]);

  const handleControlsMouseEnter = useCallback(() => {
    isHoveringControlsRef.current = true;
    setShowToolbars(true);
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleControlsMouseLeave = useCallback(() => {
    isHoveringControlsRef.current = false;
    resetAutoHideTimer();
  }, [resetAutoHideTimer]);

  // ── 1. Initialize Document & Stored State ──────────────────────────────────
  useEffect(() => {
    let isCancelled = false;
    setLoading(true);
    setErrorMessage('');

    const init = async () => {
      try {
        // 1. Load Reader Settings
        const savedSettings = await getReaderSettings();
        if (!isCancelled && savedSettings) {
          setSettings(savedSettings);
        }

        // 2. Load Stored Reading Progress, Bookmarks, Notes, Annotations
        if (documentId) {
          const storedProgress = await getReadingProgress(documentId);
          const storedBookmarks = await getBookmarks(documentId);
          const storedNotes = await getPageNotes(documentId);
          const storedAnnots = await getAllDocumentAnnotations(documentId);

          if (!isCancelled) {
            if (storedBookmarks) setBookmarks(storedBookmarks);
            if (storedNotes) setPageNotes(storedNotes);
            if (storedAnnots) setAnnotationsMap(storedAnnots);

            if (storedProgress && storedProgress.lastPage > 1) {
              setResumePrompt({
                lastPage: storedProgress.lastPage,
                progress: storedProgress.progress || 0,
              });
            }
          }
        }

        // 3. Load PDF Document via streaming endpoint
        const docObj = await loadPDFDocument(sourceUrl);
        if (isCancelled) return;

        setPdfDoc(docObj);
        setTotalPages(docObj.numPages);
        setLoading(false);
      } catch (err) {
        console.error('[PDFReader] Load error:', err);
        if (!isCancelled) {
          setErrorMessage('Unable to load manga chapter. Please check network or file permissions.');
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isCancelled = true;
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [sourceUrl, documentId]);

  // ── 2. Debounced Auto-Save Reading Progress ─────────────────────────────────
  const saveProgressDebounced = useRef(null);

  const triggerSaveProgress = useCallback((newPage) => {
    if (!documentId || !totalPages) return;

    if (saveProgressDebounced.current) clearTimeout(saveProgressDebounced.current);

    saveProgressDebounced.current = setTimeout(async () => {
      const progressPct = Math.round((newPage / totalPages) * 100);
      const progressData = {
        documentId,
        lastPage: newPage,
        totalPages,
        progress: progressPct,
        zoom: scale,
        rotation,
        readingMode: settings.readingMode,
        direction: settings.direction,
      };

      // 1. Save locally via IndexedDB
      await saveReadingProgress(documentId, progressData);

      // 2. Report to parent callback
      if (onProgressUpdate) {
        onProgressUpdate({
          documentId,
          lastPage: newPage,
          totalPages,
          progress: progressPct,
        });
      }

      // 3. Sync to Firestore if logged-in user
      const uid = currentUser?.uid || getUserId();
      if (!isOffline && db && uid && mangaId) {
        try {
          const ref = doc(db, 'users', uid, 'mangas', mangaId, 'progress', documentId);
          await setDoc(ref, progressData, { merge: true });
        } catch (e) {
          addToDirtyQueue({
            type: 'SET_MANGA_PROGRESS',
            dedupeKey: `PROGRESS_${mangaId}_${documentId}`,
            payload: { mangaId, documentId, ...progressData },
          });
        }
      }
    }, 600);
  }, [documentId, totalPages, scale, rotation, settings.readingMode, settings.direction, currentUser, isOffline, mangaId, onProgressUpdate]);

  // ── 3. Page Navigation ───────────────────────────────────────────────────────
  const handlePageChange = useCallback((newPage, isExplicitJump = false) => {
    const clamped = Math.max(1, Math.min(totalPages || 1, newPage));
    setCurrentPage(clamped);
    triggerSaveProgress(clamped);
    if (isExplicitJump) {
      setJumpTarget({ page: clamped, ts: Date.now() });
    }
  }, [totalPages, triggerSaveProgress]);

  const handleExplicitJump = useCallback((newPage) => {
    handlePageChange(newPage, true);
  }, [handlePageChange]);

  // ── 4. Annotation Changes & Autosave ─────────────────────────────────────────
  const saveAnnotsDebounced = useRef(null);

  const handleAnnotationsChange = useCallback((pageNum, newPageAnnotations) => {
    setAnnotationsMap((prev) => {
      const oldList = prev[pageNum] || [];
      // Push undo state
      setUndoStack((u) => [...u, { pageNum, annotations: oldList }]);
      setRedoStack([]);

      const updated = {
        ...prev,
        [pageNum]: newPageAnnotations,
      };
      return updated;
    });

    setSaveStatus('saving');

    if (saveAnnotsDebounced.current) clearTimeout(saveAnnotsDebounced.current);
    saveAnnotsDebounced.current = setTimeout(async () => {
      await savePageAnnotations(documentId, pageNum, newPageAnnotations);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('clean'), 2000);
    }, 800);
  }, [documentId]);

  // Undo / Redo
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const lastOp = undoStack[undoStack.length - 1];
    const currentAnnots = annotationsMap[lastOp.pageNum] || [];

    setRedoStack((r) => [...r, { pageNum: lastOp.pageNum, annotations: currentAnnots }]);
    setUndoStack((u) => u.slice(0, -1));

    setAnnotationsMap((prev) => ({
      ...prev,
      [lastOp.pageNum]: lastOp.annotations,
    }));

    savePageAnnotations(documentId, lastOp.pageNum, lastOp.annotations);
  }, [undoStack, annotationsMap, documentId]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const nextOp = redoStack[redoStack.length - 1];
    const currentAnnots = annotationsMap[nextOp.pageNum] || [];

    setUndoStack((u) => [...u, { pageNum: nextOp.pageNum, annotations: currentAnnots }]);
    setRedoStack((r) => r.slice(0, -1));

    setAnnotationsMap((prev) => ({
      ...prev,
      [nextOp.pageNum]: nextOp.annotations,
    }));

    savePageAnnotations(documentId, nextOp.pageNum, nextOp.annotations);
  }, [redoStack, annotationsMap, documentId]);

  // ── 5. Bookmarks & Notes ────────────────────────────────────────────────────
  const handleAddBookmark = async (pageNum) => {
    const updated = [...bookmarks.filter((b) => b.page !== pageNum), { page: pageNum, createdAt: Date.now() }];
    setBookmarks(updated);
    await saveBookmarks(documentId, updated);
  };

  const handleRemoveBookmark = async (pageNum) => {
    const updated = bookmarks.filter((b) => b.page !== pageNum);
    setBookmarks(updated);
    await saveBookmarks(documentId, updated);
  };

  const handleSavePageNote = async (pageNum, text) => {
    const updated = [...pageNotes.filter((n) => n.page !== pageNum), { page: pageNum, content: text, createdAt: Date.now() }];
    setPageNotes(updated);
    await savePageNotes(documentId, updated);
  };

  const handleDeletePageNote = async (pageNum) => {
    const updated = pageNotes.filter((n) => n.page !== pageNum);
    setPageNotes(updated);
    await savePageNotes(documentId, updated);
  };

  // ── 6. Prevent Browser-level Window Zoom & Global Wheel/Gesture Handler ──
  useEffect(() => {
    const handleGlobalWheel = (e) => {
      // If user holds Ctrl or Cmd while wheeling anywhere on screen, zoom ONLY the PDF page
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setScale((prev) => {
          const change = -e.deltaY * 0.003 * prev;
          const next = Math.max(0.1, Math.min(1000, Number((prev + change).toFixed(2))));
          return next;
        });
      }
    };

    // Prevent Safari/Chrome multi-touch gesture from scaling the whole window/controls
    const handleGlobalGesture = (e) => {
      e.preventDefault();
    };

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    window.addEventListener('gesturestart', handleGlobalGesture, { passive: false });
    window.addEventListener('gesturechange', handleGlobalGesture, { passive: false });
    window.addEventListener('gestureend', handleGlobalGesture, { passive: false });

    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
      window.removeEventListener('gesturestart', handleGlobalGesture);
      window.removeEventListener('gesturechange', handleGlobalGesture);
      window.removeEventListener('gestureend', handleGlobalGesture);
    };
  }, []);

  // ── 7. Keyboard Shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ignore shortcut if user is typing in an input/textarea
      const tag = e.target.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      // Reset auto-hide timer on key activity
      resetAutoHideTimer();

      // Undo / Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Browser zoom prevention: Ctrl + (+ / - / 0 / =)
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0' || e.key === 'Add' || e.key === 'Subtract')) {
        e.preventDefault();
        if (e.key === '=' || e.key === '+' || e.key === 'Add') {
          setScale((s) => {
            if (s < 2) return Math.min(1000, Number((s + 0.25).toFixed(2)));
            if (s < 5) return Math.min(1000, Number((s + 0.5).toFixed(1)));
            if (s < 20) return Math.min(1000, Number((s * 1.5).toFixed(1)));
            if (s < 100) return Math.min(1000, Number((s * 2).toFixed(0)));
            return Math.min(1000, Number((s * 2.5).toFixed(0)));
          });
        } else if (e.key === '-' || e.key === 'Subtract') {
          setScale((s) => {
            if (s > 100) return Math.max(0.1, Number((s / 2.5).toFixed(0)));
            if (s > 20) return Math.max(0.1, Number((s / 2).toFixed(0)));
            if (s > 5) return Math.max(0.1, Number((s / 1.5).toFixed(1)));
            if (s > 2) return Math.max(0.1, Number((s - 0.5).toFixed(1)));
            return Math.max(0.1, Number((s - 0.25).toFixed(2)));
          });
        } else if (e.key === '0') {
          setScale(1.0);
        }
        return;
      }

      switch (e.key) {
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault();
          if (settings.direction === 'rtl') {
            handlePageChange(currentPage + 1);
          } else {
            handlePageChange(currentPage - 1);
          }
          break;

        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          if (settings.direction === 'rtl') {
            handlePageChange(currentPage - 1);
          } else {
            handlePageChange(currentPage + 1);
          }
          break;

        case ' ':
          e.preventDefault();
          if (e.shiftKey) {
            handlePageChange(currentPage - 1);
          } else {
            handlePageChange(currentPage + 1);
          }
          break;

        case 'Home':
          e.preventDefault();
          handlePageChange(1);
          break;

        case 'End':
          e.preventDefault();
          handlePageChange(totalPages);
          break;

        case 'f':
        case 'F':
          e.preventDefault();
          handleToggleFullscreen();
          break;

        case '+':
        case '=':
          e.preventDefault();
          setScale((s) => {
            if (s < 2) return Math.min(1000, Number((s + 0.25).toFixed(2)));
            if (s < 5) return Math.min(1000, Number((s + 0.5).toFixed(1)));
            if (s < 20) return Math.min(1000, Number((s * 1.5).toFixed(1)));
            if (s < 100) return Math.min(1000, Number((s * 2).toFixed(0)));
            return Math.min(1000, Number((s * 2.5).toFixed(0)));
          });
          break;

        case '-':
          e.preventDefault();
          setScale((s) => {
            if (s > 100) return Math.max(0.1, Number((s / 2.5).toFixed(0)));
            if (s > 20) return Math.max(0.1, Number((s / 2).toFixed(0)));
            if (s > 5) return Math.max(0.1, Number((s / 1.5).toFixed(1)));
            if (s > 2) return Math.max(0.1, Number((s - 0.5).toFixed(1)));
            return Math.max(0.1, Number((s - 0.25).toFixed(2)));
          });
          break;

        case '0':
          e.preventDefault();
          setScale(1.0);
          break;

        case 'r':
        case 'R':
          e.preventDefault();
          setRotation((r) => (r + 90) % 360);
          break;

        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, totalPages, settings.direction, handlePageChange, handleUndo, handleRedo, resetAutoHideTimer]);

  // ── 7. Fullscreen Toggle ────────────────────────────────────────────────────
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Update Settings
  const handleUpdateSettings = (newPartial) => {
    setSettings((prev) => {
      const updated = { ...prev, ...newPartial };
      saveReaderSettings(updated);
      return updated;
    });
  };

  // ── Loading & Error States ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col items-center justify-center text-white gap-4">
        <Loader2 className="animate-spin text-purple-500" size={42} />
        <div className="text-center space-y-1">
          <h2 className="text-sm font-extrabold uppercase tracking-widest text-purple-300">
            Streaming Manga PDF
          </h2>
          <p className="text-xs text-gray-500 font-mono">
            Optimizing high-resolution page buffers...
          </p>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="fixed inset-0 z-50 bg-[#0d1117] flex flex-col items-center justify-center text-white gap-4 p-6">
        <div className="p-4 rounded-full bg-red-500/10 border border-red-500/30 text-red-400">
          <AlertCircle size={36} />
        </div>
        <div className="text-center max-w-md space-y-2">
          <h2 className="text-base font-bold text-white">Unable to Open Chapter</h2>
          <p className="text-xs text-gray-400 leading-relaxed">{errorMessage}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw size={14} />
            <span>Retry</span>
          </button>
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-bold text-gray-300 transition cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      onMouseMove={resetAutoHideTimer}
      onTouchStart={resetAutoHideTimer}
      className="fixed inset-0 z-50 bg-[#0d1117] select-none flex flex-col overflow-hidden overscroll-none"
      style={{ overscrollBehavior: 'none', touchAction: 'pan-x pan-y' }}
    >
      {/* Resume Reading Modal Prompt */}
      {resumePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="max-w-sm w-full glass-panel p-6 rounded-3xl border border-white/15 shadow-2xl text-center space-y-4 bg-[#111622]/95">
            <h3 className="text-base font-extrabold text-white">Continue Reading?</h3>
            <p className="text-xs text-gray-300 leading-relaxed">
              You previously stopped at <span className="text-purple-400 font-bold font-mono">Page {resumePrompt.lastPage}</span> ({resumePrompt.progress}%).
            </p>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setResumePrompt(null);
                  setCurrentPage(1);
                }}
                className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold transition cursor-pointer"
              >
                From Beginning
              </button>
              <button
                type="button"
                onClick={() => {
                  handleExplicitJump(resumePrompt.lastPage);
                  setResumePrompt(null);
                }}
                className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold transition shadow-lg cursor-pointer"
              >
                Continue ({resumePrompt.lastPage})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Header Toolbar */}
      <div
        onMouseEnter={handleControlsMouseEnter}
        onMouseLeave={handleControlsMouseLeave}
        className={`transition-opacity duration-300 ${showToolbars ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <ReaderToolbar
          title={title}
          chapterTitle={chapterTitle}
          currentPage={currentPage}
          totalPages={totalPages}
          onNavigatePage={handleExplicitJump}
          scale={scale}
          onZoomIn={() => {
            setScale((s) => {
              if (s < 2) return Math.min(1000, Number((s + 0.25).toFixed(2)));
              if (s < 5) return Math.min(1000, Number((s + 0.5).toFixed(1)));
              if (s < 20) return Math.min(1000, Number((s * 1.5).toFixed(1)));
              if (s < 100) return Math.min(1000, Number((s * 2).toFixed(0)));
              return Math.min(1000, Number((s * 2.5).toFixed(0)));
            });
          }}
          onZoomOut={() => {
            setScale((s) => {
              if (s > 100) return Math.max(0.1, Number((s / 2.5).toFixed(0)));
              if (s > 20) return Math.max(0.1, Number((s / 2).toFixed(0)));
              if (s > 5) return Math.max(0.1, Number((s / 1.5).toFixed(1)));
              if (s > 2) return Math.max(0.1, Number((s - 0.5).toFixed(1)));
              return Math.max(0.1, Number((s - 0.25).toFixed(2)));
            });
          }}
          onZoomReset={() => setScale(1.0)}
          onSetScale={(z) => setScale(Math.max(0.1, Math.min(1000, z)))}
          centerAlign={centerAlign}
          onToggleCenterAlign={setCenterAlign}
          onFitWidth={() => setScale(1.0)}
          onFitPage={() => setScale(0.85)}
          onRotate={() => setRotation((r) => (r + 90) % 360)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={handleToggleFullscreen}
          onBack={onBack}
          onPrevChapter={onPrevChapter}
          onNextChapter={onNextChapter}
          hasPrevChapter={hasPrevChapter}
          hasNextChapter={hasNextChapter}
          prevChapterTitle={prevChapterTitle}
          nextChapterTitle={nextChapterTitle}
          onControlsMouseEnter={handleControlsMouseEnter}
          onControlsMouseLeave={handleControlsMouseLeave}
          onToggleThumbnails={() => {
            setShowThumbnails(!showThumbnails);
            setShowOutline(false);
            setShowBookmarks(false);
            setShowSearch(false);
            setShowSettings(false);
          }}
          onToggleOutline={() => {
            setShowOutline(!showOutline);
            setShowThumbnails(false);
            setShowBookmarks(false);
            setShowSearch(false);
            setShowSettings(false);
          }}
          onToggleBookmarks={() => {
            setShowBookmarks(!showBookmarks);
            setShowThumbnails(false);
            setShowOutline(false);
            setShowSearch(false);
            setShowSettings(false);
          }}
          onToggleSearch={() => {
            setShowSearch(!showSearch);
            setShowThumbnails(false);
            setShowOutline(false);
            setShowBookmarks(false);
            setShowSettings(false);
          }}
          onToggleSettings={() => {
            setShowSettings(!showSettings);
            setShowThumbnails(false);
            setShowOutline(false);
            setShowBookmarks(false);
            setShowSearch(false);
          }}
          onToggleAnnotations={() => {
            setShowAnnotationsToolbar(!showAnnotationsToolbar);
            if (activeTool === 'select') setActiveTool('pen');
            else setActiveTool('select');
          }}
          isAnnotationsOpen={showAnnotationsToolbar}
          isBookmarked={bookmarks.some((b) => b.page === currentPage)}
          readingMode={settings.readingMode}
          onChangeReadingMode={(mode) => handleUpdateSettings({ readingMode: mode })}
          downloadUrl={`/api/manga/download?path=${encodeURIComponent(sourceUrl)}`}
        />
      </div>

      {/* Main Canvas & PDF Document Workspace */}
      <div className="flex-1 relative w-full h-full">
        <PDFDocument
          pdfDoc={pdfDoc}
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={handlePageChange}
          scale={scale}
          onScaleChange={setScale}
          rotation={rotation}
          settings={settings}
          activeTool={activeTool}
          toolColor={toolColor}
          toolThickness={toolThickness}
          toolOpacity={toolOpacity}
          eraserType={eraserType}
          annotationsMap={annotationsMap}
          onChangeAnnotations={handleAnnotationsChange}
          searchQuery={searchQuery}
          centerAlign={centerAlign}
          jumpTarget={jumpTarget}
        />
      </div>

      {/* Floating Annotation Toolbar Dock */}
      {showAnnotationsToolbar && (
        <div onMouseEnter={handleControlsMouseEnter} onMouseLeave={handleControlsMouseLeave}>
          <AnnotationToolbar
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            toolColor={toolColor}
            setToolColor={setToolColor}
            toolThickness={toolThickness}
            setToolThickness={setToolThickness}
            toolOpacity={toolOpacity}
            setToolOpacity={setToolOpacity}
            canUndo={undoStack.length > 0}
            canRedo={redoStack.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onClose={() => {
              setShowAnnotationsToolbar(false);
              setActiveTool('select');
            }}
            saveStatus={saveStatus}
          />
        </div>
      )}

      {/* Sidebars & Overlays */}
      {showThumbnails && (
        <ThumbnailSidebar
          pdfDoc={pdfDoc}
          totalPages={totalPages}
          currentPage={currentPage}
          onSelectPage={(p) => {
            handleExplicitJump(p);
            setShowThumbnails(false);
          }}
          onClose={() => setShowThumbnails(false)}
        />
      )}

      {showOutline && (
        <OutlineSidebar
          pdfDoc={pdfDoc}
          onSelectPage={(p) => {
            handleExplicitJump(p);
            setShowOutline(false);
          }}
          onClose={() => setShowOutline(false)}
        />
      )}

      {showBookmarks && (
        <BookmarkPanel
          currentPage={currentPage}
          bookmarks={bookmarks}
          notes={pageNotes}
          onAddBookmark={handleAddBookmark}
          onRemoveBookmark={handleRemoveBookmark}
          onSaveNote={handleSavePageNote}
          onDeleteNote={handleDeletePageNote}
          onSelectPage={(p) => {
            handleExplicitJump(p);
            setShowBookmarks(false);
          }}
          onClose={() => setShowBookmarks(false)}
        />
      )}

      {showSearch && (
        <SearchPanel
          pdfDoc={pdfDoc}
          totalPages={totalPages}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onNavigateToMatch={(p) => handleExplicitJump(p)}
          onClose={() => setShowSearch(false)}
        />
      )}

      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
