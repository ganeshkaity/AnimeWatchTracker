"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useOffline } from '../../context/OfflineContext';
import {
  getLocalNote,
  upsertLocalNote,
  deleteLocalNote,
  addToDirtyQueue,
  getUserId
} from '../../utils/localStore';
import {
  ArrowLeft, Star, AlertTriangle, Trash2, Calendar,
  Bold, Italic, Underline, List, ListOrdered, CheckSquare,
  Image, FileImage, Cloud, CloudOff, RefreshCw, Copy, X, Download
} from 'lucide-react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';

const FLAG_TAGS = ['General', 'Review', 'Ideas', 'To-Do', 'Plot Info', 'Anime List', 'Important'];

export default function NoteDetailPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const { isOffline } = useOffline();
  const router = useRouter();
  const params = useParams();
  const noteId = params.id;

  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);

  // Use a REF (not state) for the init flag so it never re-triggers the snapshot effect
  const isInitializedRef = useRef(false);
  // Track whether we've committed init to state (gates auto-save)
  const [readyToSave, setReadyToSave] = useState(false);
  // Store initial content in a ref so the "after-mount" effect can read it synchronously
  const initialContentRef = useRef('');

  // Editable fields
  const [editTitle, setEditTitle]       = useState('');
  const [editContent, setEditContent]   = useState('');
  const [editTag, setEditTag]           = useState('General');
  const [editStarred, setEditStarred]   = useState(false);
  const [editImportant, setEditImportant] = useState(false);
  const [savingState, setSavingState]   = useState('saved'); // 'saved' | 'saving' | 'error'
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);

  // Refs
  const editorRef          = useRef(null);
  const editorContainerRef = useRef(null);
  const fileInputRef       = useRef(null);

  // Image selection & resize
  const [selectedImg, setSelectedImg]   = useState(null);
  const [overlayStyle, setOverlayStyle] = useState(null);
  const resizingRef = useRef(null); // { startX, startWidth, corner }

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState(null); // { x, y, img }

  /* ─────────────────────────────────────────────
     Reset on noteId change
  ───────────────────────────────────────────── */
  useEffect(() => {
    isInitializedRef.current = false;
    initialContentRef.current = '';
    setReadyToSave(false);
    setLoading(true);
    setNote(null);
    setEditTitle('');
    setEditContent('');
    setEditTag('General');
    setEditStarred(false);
    setEditImportant(false);
    setSavingState('saved');
    setSelectedImg(null);
    setOverlayStyle(null);
    setContextMenu(null);
  }, [noteId]);

  /* ─────────────────────────────────────────────
     Realtime listener + Local Cache Loader
  ───────────────────────────────────────────── */
  useEffect(() => {
    if (authLoading) return;
    if (!noteId) return;

    // Load from local storage immediately to make it instant/offline-compatible
    const cachedNote = getLocalNote(noteId);
    if (cachedNote) {
      setNote(cachedNote);
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        const content = cachedNote.content || '';
        initialContentRef.current = content;

        setEditTitle(cachedNote.title || 'Untitled Note');
        setEditContent(content);
        setEditTag(cachedNote.tag || 'General');
        setEditStarred(cachedNote.isStarred || false);
        setEditImportant(cachedNote.isImportant || false);
      }
      setLoading(false);
    }

    if (isOffline || !db) {
      setLoading(false);
      return;
    }

    const noteRef = doc(db, 'users', getUserId(), 'notes', noteId);
    const unsub = onSnapshot(noteRef, (snap) => {
      if (!snap.exists()) {
        // Only redirect to notes if we don't have it locally either
        if (!cachedNote) {
          router.push('/notes');
        }
        return;
      }

      const data = snap.data();
      const updatedNote = { id: snap.id, ...data };
      setNote(updatedNote);
      upsertLocalNote(updatedNote);

      // Only initialise state ONCE per noteId
      if (!isInitializedRef.current) {
        isInitializedRef.current = true;
        const content = data.content || '';
        initialContentRef.current = content;

        setEditTitle(data.title || 'Untitled Note');
        setEditContent(content);
        setEditTag(data.tag || 'General');
        setEditStarred(data.isStarred || false);
        setEditImportant(data.isImportant || false);
      }

      setLoading(false);
    }, (err) => {
      console.error('Note snapshot error:', err);
      setLoading(false);
    });

    return unsub;
  }, [currentUser, authLoading, noteId, isOffline, router]);

  /* ─────────────────────────────────────────────
     Set editor innerHTML AFTER the editor div is
     actually in the DOM (i.e. after loading = false)
  ───────────────────────────────────────────── */
  useEffect(() => {
    if (!loading && editorRef.current) {
      editorRef.current.innerHTML = initialContentRef.current;
      // Allow auto-save only after we've set the initial content
      setReadyToSave(true);
    }
  }, [loading]);

  /* ─────────────────────────────────────────────
     Debounced auto-save
  ───────────────────────────────────────────── */
  useEffect(() => {
    if (!readyToSave || !noteId) return;
    setSavingState('saving');
    
    const targetUserId = getUserId();
    // Save locally first
    const localUpdate = {
      id: noteId,
      title: editTitle,
      content: editContent,
      tag: editTag,
      isStarred: editStarred,
      isImportant: editImportant,
      updatedAt: new Date().toISOString(),
      userId: targetUserId,
    };
    upsertLocalNote(localUpdate);

    const t = setTimeout(async () => {
      if (!isOffline && db && currentUser) {
        try {
          const ref = doc(db, 'users', targetUserId, 'notes', noteId);
          await updateDoc(ref, {
            title:       editTitle,
            content:     editContent,
            tag:         editTag,
            isStarred:   editStarred,
            isImportant: editImportant,
            updatedAt:   localUpdate.updatedAt,
          });
          setSavingState('saved');
        } catch (err) {
          console.error('Auto-save error:', err);
          addToDirtyQueue({
            type: 'SET_NOTE',
            dedupeKey: `SET_NOTE_${noteId}`,
            payload: localUpdate
          });
          setSavingState('saved'); // Show saved to user since it's cached locally
        }
      } else {
        addToDirtyQueue({
          type: 'SET_NOTE',
          dedupeKey: `SET_NOTE_${noteId}`,
          payload: localUpdate
        });
        setSavingState('saved');
      }
    }, 1200);
    return () => clearTimeout(t);
  }, [editTitle, editContent, editTag, editStarred, editImportant, noteId, currentUser, readyToSave, isOffline, note]);

  /* ─────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────── */
  const saveImmediately = async (extra = {}) => {
    if (!noteId) return;
    setSavingState('saving');
    const targetUserId = getUserId();
    const localUpdate = {
      id: noteId,
      title: editTitle,
      content: editContent,
      tag: editTag,
      isStarred: editStarred,
      isImportant: editImportant,
      updatedAt: new Date().toISOString(),
      userId: targetUserId,
      ...extra
    };
    upsertLocalNote(localUpdate);

    if (!isOffline && db && currentUser) {
      try {
        const ref = doc(db, 'users', targetUserId, 'notes', noteId);
        await updateDoc(ref, {
          title: editTitle, content: editContent, tag: editTag,
          isStarred: editStarred, isImportant: editImportant,
          updatedAt: localUpdate.updatedAt, ...extra,
        });
        setSavingState('saved');
      } catch (err) {
        console.error('Save error:', err);
        addToDirtyQueue({
          type: 'SET_NOTE',
          dedupeKey: `SET_NOTE_${noteId}`,
          payload: localUpdate
        });
        setSavingState('saved');
      }
    } else {
      addToDirtyQueue({
        type: 'SET_NOTE',
        dedupeKey: `SET_NOTE_${noteId}`,
        payload: localUpdate
      });
      setSavingState('saved');
    }
  };

  const handleTitleChange   = (v) => setEditTitle(v);
  const handleContentChange = (v) => setEditContent(v);

  const handleToggleStar = async () => {
    const next = !editStarred;
    setEditStarred(next);
    await saveImmediately({ isStarred: next });
  };
  const handleToggleImportant = async () => {
    const next = !editImportant;
    setEditImportant(next);
    await saveImmediately({ isImportant: next });
  };
  const handleTagChange = async (e) => {
    const next = e.target.value;
    setEditTag(next);
    await saveImmediately({ tag: next });
  };

  const handleDeleteNote = async () => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    const targetUserId = getUserId();
    deleteLocalNote(noteId);
    
    if (!isOffline && db && currentUser) {
      try {
        await deleteDoc(doc(db, 'users', targetUserId, 'notes', noteId));
        router.push('/notes');
      } catch (err) {
        console.error(err);
        addToDirtyQueue({
          type: 'DELETE_NOTE',
          dedupeKey: `DELETE_NOTE_${noteId}`,
          payload: { id: noteId, userId: targetUserId }
        });
        router.push('/notes');
      }
    } else {
      addToDirtyQueue({
        type: 'DELETE_NOTE',
        dedupeKey: `DELETE_NOTE_${noteId}`,
        payload: { id: noteId, userId: targetUserId }
      });
      router.push('/notes');
    }
  };

  const handleBack = async () => {
    if (savingState === 'saving') await saveImmediately();
    router.push('/notes');
  };

  const handleDownloadMarkdown = () => {
    const contentHtml = editorRef.current ? editorRef.current.innerHTML : editContent;
    let md = `# ${editTitle || 'Untitled Note'}\n\n`;
    
    let temp = contentHtml;
    
    // Replace checkboxes
    temp = temp.replace(/<input[^>]*type="checkbox"[^>]*checked="checked"[^>]*>/gi, '- [x] ');
    temp = temp.replace(/<input[^>]*type="checkbox"[^>]*checked[^>]*>/gi, '- [x] ');
    temp = temp.replace(/<input[^>]*type="checkbox"[^>]*>/gi, '- [ ] ');
  
    // Replace list items
    temp = temp.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
    temp = temp.replace(/<\/ul>/gi, '\n').replace(/<ul>/gi, '');
    temp = temp.replace(/<\/ol>/gi, '\n').replace(/<ol>/gi, '');

    // Format newlines and paragraphs
    temp = temp.replace(/<br\s*\/?>/gi, '\n');
    temp = temp.replace(/<\/p>/gi, '\n\n').replace(/<p>/gi, '');
    temp = temp.replace(/<\/div>/gi, '\n').replace(/<div>/gi, '');
  
    // Inline stylings
    temp = temp.replace(/<(b|strong)>(.*?)<\/\1>/gi, '**$2**');
    temp = temp.replace(/<(i|em)>(.*?)<\/\1>/gi, '*$2*');
    temp = temp.replace(/<u>(.*?)<\/u>/gi, '<u>$1</u>');
  
    // Images
    temp = temp.replace(/<img[^>]+src="([^">]+)"[^>]*>/gi, (match, src) => {
      const dataPathMatch = match.match(/data-path="([^">]+)"/);
      if (dataPathMatch) {
        return `![Image](${dataPathMatch[1]})`;
      }
      return `![Image](${src})`;
    });
  
    // Decode HTML entities
    temp = temp.replace(/&nbsp;/g, ' ')
               .replace(/&lt;/g, '<')
               .replace(/&gt;/g, '>')
               .replace(/&amp;/g, '&')
               .replace(/&quot;/g, '"')
               .replace(/&#39;/g, "'");
  
    temp = temp.replace(/\n{3,}/g, '\n\n');
    md += temp.trim();

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeTitle = (editTitle || 'Untitled Note').replace(/[^a-zA-Z0-9]/g, '_');
    link.href = url;
    link.download = `${safeTitle}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const contentHtml = editorRef.current ? editorRef.current.innerHTML : editContent;
    const formattedDate = new Date(note?.updatedAt || note?.createdAt || new Date()).toLocaleString();
    
    printWindow.document.write(`
      <html>
        <head>
          <title>${editTitle || 'Note'}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap');
            body {
              background-color: #03030d;
              color: #e2e8f0;
              font-family: 'Outfit', sans-serif;
              padding: 40px;
              margin: 0;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            h1 {
              font-size: 28px;
              font-weight: 800;
              margin-top: 0;
              margin-bottom: 5px;
              color: #ffffff;
              border-bottom: 2px solid rgba(255,255,255,0.1);
              padding-bottom: 15px;
            }
            .meta {
              font-size: 11px;
              color: #94a3b8;
              margin-bottom: 30px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .content {
              font-size: 14px;
              line-height: 1.8;
            }
            .content ul { list-style-type: disc !important; padding-left: 20px !important; margin-bottom: 15px !important; }
            .content ol { list-style-type: decimal !important; padding-left: 20px !important; margin-bottom: 15px !important; }
            .content li { margin-bottom: 5px !important; }
            .content b, .content strong { color: #ffffff !important; font-weight: 600; }
            .content u { text-decoration: underline; }
            .note-img {
              max-width: 100% !important;
              height: auto !important;
              border-radius: 12px !important;
              margin: 20px 0 !important;
              border: 1px solid rgba(255,255,255,0.1) !important;
              display: block !important;
              box-shadow: 0 10px 20px rgba(0,0,0,0.35) !important;
            }
            input[type="checkbox"].note-checkbox {
              margin-right: 8px !important;
              width: 14px !important; height: 14px !important;
              accent-color: #bd00ff !important;
              vertical-align: middle !important;
            }
            @media print {
              body {
                background-color: #03030d !important;
                color: #e2e8f0 !important;
              }
            }
          </style>
        </head>
        <body>
          <h1>${editTitle || 'Untitled Note'}</h1>
          <div class="meta">Tag: ${editTag} | Last Modified: ${formattedDate}</div>
          <div class="content">${contentHtml}</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  /* ─────────────────────────────────────────────
     Formatting toolbar
  ───────────────────────────────────────────── */
  const handleFormat = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
  };

  const handleInsertCheckbox = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false,
      `<input type="checkbox" class="note-checkbox" />&nbsp;`);
    if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
  };

  /* ─────────────────────────────────────────────
     Image compression + insertion
  ───────────────────────────────────────────── */
  const compressAndInsert = (file) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (!ev.target?.result) return;
      if (file.size < 300 * 1024) {
        doInsertImage(ev.target.result);
        return;
      }
      const img = new window.Image();
      img.onload = () => {
        const MAX = 1000;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = h * MAX / w; w = MAX; } }
        else        { if (h > MAX) { w = w * MAX / h; h = MAX; } }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        doInsertImage(canvas.toDataURL('image/jpeg', 0.72));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };

  const doInsertImage = (src) => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false,
      `<img src="${src}" alt="note image" class="note-img" />`);
    if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file?.type.startsWith('image/')) compressAndInsert(file);
    e.target.value = '';
  };

  const handleInsertLocalImage = async () => {
    try {
      const res  = await fetch('/api/select-image');
      const data = await res.json();
      if (data.success && data.path) {
        const src = `/api/image?path=${encodeURIComponent(data.path)}`;
        editorRef.current?.focus();
        document.execCommand('insertHTML', false,
          `<img src="${src}" alt="local image" data-path="${data.path}" class="note-img" />`);
        if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
      }
    } catch (err) {
      console.error(err);
      alert('Failed to insert local image.');
    }
  };

  /* ─────────────────────────────────────────────
     Image selection overlay helpers
  ───────────────────────────────────────────── */
  const calcOverlay = useCallback((img) => {
    if (!img || !editorContainerRef.current) { setOverlayStyle(null); return; }
    const cr  = editorContainerRef.current.getBoundingClientRect();
    const ir  = img.getBoundingClientRect();
    setOverlayStyle({
      top:    ir.top  - cr.top,
      left:   ir.left - cr.left,
      width:  ir.width,
      height: ir.height,
    });
  }, []);

  const selectImage = useCallback((img) => {
    setSelectedImg(img);
    calcOverlay(img);
  }, [calcOverlay]);

  const deselectImage = useCallback(() => {
    setSelectedImg(null);
    setOverlayStyle(null);
  }, []);

  // Recalc overlay on scroll/resize
  useEffect(() => {
    if (!selectedImg) return;
    const update = () => calcOverlay(selectedImg);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [selectedImg, calcOverlay]);

  // Deselect when clicking outside editor container
  useEffect(() => {
    if (!selectedImg) return;
    const onDown = (e) => {
      if (!editorContainerRef.current?.contains(e.target)) deselectImage();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [selectedImg, deselectImage]);

  /* ─────────────────────────────────────────────
     Corner resize handles
  ───────────────────────────────────────────── */
  const startResize = (corner) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!selectedImg) return;

    resizingRef.current = {
      startX:     e.clientX,
      startWidth: selectedImg.offsetWidth,
      corner,
    };

    const onMove = (ev) => {
      if (!resizingRef.current) return;
      let delta = ev.clientX - resizingRef.current.startX;
      if (corner === 'nw' || corner === 'sw') delta = -delta;
      const newW = Math.max(60, resizingRef.current.startWidth + delta);
      selectedImg.style.width  = `${newW}px`;
      selectedImg.style.height = 'auto';
      calcOverlay(selectedImg);
    };

    const onUp = () => {
      resizingRef.current = null;
      if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  /* ─────────────────────────────────────────────
     Context menu
  ───────────────────────────────────────────── */
  // Dismiss context menu on any click
  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    document.addEventListener('click', dismiss);
    return () => document.removeEventListener('click', dismiss);
  }, [contextMenu]);

  const handleCopyImage = async () => {
    const img = contextMenu?.img;
    if (!img) return;
    try {
      if (img.src.startsWith('data:')) {
        const blob = await (await fetch(img.src)).blob();
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      } else {
        await navigator.clipboard.writeText(img.src);
      }
    } catch (err) { console.error('Copy failed', err); }
    setContextMenu(null);
  };

  const handleDeleteImage = () => {
    contextMenu?.img?.remove();
    if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
    deselectImage();
    setContextMenu(null);
  };

  /* ─────────────────────────────────────────────
     Editor event handlers
  ───────────────────────────────────────────── */
  const handleEditorInput = () => {
    if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
  };

  const handleEditorClick = (e) => {
    if (e.target?.tagName === 'IMG') {
      selectImage(e.target);
      return;
    }
    // Deselect image when clicking text
    if (selectedImg) deselectImage();
    // Toggle checkbox
    if (e.target?.type === 'checkbox') {
      e.target.checked
        ? e.target.setAttribute('checked', 'checked')
        : e.target.removeAttribute('checked');
      if (editorRef.current) handleContentChange(editorRef.current.innerHTML);
    }
  };

  const handleEditorContextMenu = (e) => {
    if (e.target?.tagName === 'IMG') {
      e.preventDefault();
      selectImage(e.target);
      setContextMenu({ x: e.clientX, y: e.clientY, img: e.target });
    } else {
      setContextMenu(null);
    }
  };

  const handleEditorDragOver = (e) => e.preventDefault();

  const handleEditorDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file?.type.startsWith('image/')) {
      // Place caret at drop point
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      }
      compressAndInsert(file);
    }
  };

  const handleEditorPaste = (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) { e.preventDefault(); compressAndInsert(blob); break; }
      }
    }
  };

  /* ─────────────────────────────────────────────
     Render: loading / not-found guards
  ───────────────────────────────────────────── */
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center gap-3">
        <div className="animate-spin h-8 w-8 border-4 border-neonPurple border-t-transparent rounded-full" />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Retrieving Note…</span>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="min-h-screen flex flex-col justify-center items-center text-gray-400 gap-4">
        <p>Note not found.</p>
        <button onClick={handleBack} className="text-neonCyan hover:underline">← Back to notes</button>
      </div>
    );
  }

  /* ─────────────────────────────────────────────
     Corner handle positions
  ───────────────────────────────────────────── */
  const CORNERS = [
    { id: 'nw', style: { top: -6, left:  -6, cursor: 'nw-resize' } },
    { id: 'ne', style: { top: -6, right: -6, cursor: 'ne-resize' } },
    { id: 'sw', style: { bottom: -6, left:  -6, cursor: 'sw-resize' } },
    { id: 'se', style: { bottom: -6, right: -6, cursor: 'se-resize' } },
  ];

  /* ─────────────────────────────────────────────
     Main render
  ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen pb-24 text-white">

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-30 glass-panel border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-sm font-bold tracking-wider max-w-xs md:max-w-md truncate">
              {editTitle || 'Untitled Note'}
            </h1>
            <p className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold">Workspace Notepad</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Save badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.02] border border-white/5">
            {savingState === 'saving' && (
              <span className="text-neonPurple flex items-center gap-1 text-[10px] uppercase tracking-wider">
                <RefreshCw className="animate-spin" size={11} /> Saving…
              </span>
            )}
            {savingState === 'saved' && (
              <span className="text-emerald-400 flex items-center gap-1 text-[10px] uppercase tracking-wider">
                <Cloud size={11} /> Saved
              </span>
            )}
            {savingState === 'error' && (
              <span className="text-red-400 flex items-center gap-1 text-[10px] uppercase tracking-wider">
                <CloudOff size={11} /> Error
              </span>
            )}
          </div>

          {/* Download Dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowDownloadMenu(prev => !prev)}
              className="p-2 bg-white/5 border border-white/5 hover:text-neonCyan hover:bg-white/10 hover:border-neonCyan/20 text-gray-400 rounded-lg transition cursor-pointer flex items-center gap-1"
              title="Download Note"
            >
              <Download size={16} />
            </button>

            <AnimatePresence>
              {showDownloadMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowDownloadMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 z-50 glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 min-w-[180px]"
                  >
                    <button
                      onClick={() => {
                        setShowDownloadMenu(false);
                        handleDownloadMarkdown();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-200 hover:bg-white/10 hover:text-neonCyan transition text-left cursor-pointer font-semibold"
                    >
                      Download Markdown (.md)
                    </button>
                    <div className="h-px bg-white/5 mx-2" />
                    <button
                      onClick={() => {
                        setShowDownloadMenu(false);
                        handleDownloadPdf();
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-200 hover:bg-white/10 hover:text-neonPurple transition text-left cursor-pointer font-semibold"
                    >
                      Download PDF (.pdf)
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={handleDeleteNote}
            className="p-2 bg-red-950/20 border border-red-500/10 hover:bg-red-950/50 hover:text-white text-red-400 rounded-lg transition cursor-pointer"
            title="Delete Note"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-4xl mx-auto px-6 md:px-12 mt-8">
        <div className="glass-panel border border-white/10 rounded-2xl overflow-visible shadow-neon-border p-6 md:p-10 space-y-6">

          {/* Metadata header */}
          <div className="border-b border-white/5 pb-6 space-y-4">
            <input
              type="text"
              value={editTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="bg-transparent text-white font-extrabold text-2xl md:text-3xl focus:outline-none w-full border-b border-transparent focus:border-white/15 pb-1 transition-all placeholder-gray-600"
              placeholder="Untitled Note"
            />

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Tag</span>
                <select
                  value={editTag}
                  onChange={handleTagChange}
                  className="bg-[#0b0b18] border border-white/10 rounded-lg px-2.5 py-1 text-xs text-gray-300 focus:outline-none"
                >
                  {FLAG_TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="h-4 w-px bg-white/10" />

              <button
                type="button" onClick={handleToggleStar}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                  editStarred ? 'bg-amber-500/10 border-amber-500 text-amber-400' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <Star size={12} fill={editStarred ? 'currentColor' : 'none'} /> Star
              </button>

              <button
                type="button" onClick={handleToggleImportant}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer ${
                  editImportant ? 'bg-red-500/10 border-red-500 text-red-400' : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                }`}
              >
                <AlertTriangle size={12} /> Important
              </button>

              <div className="h-4 w-px bg-white/10" />

              <div className="flex items-center gap-1 text-[10px] text-gray-500 font-semibold">
                <Calendar size={11} />
                <span>Modified: {new Date(note.updatedAt || note.createdAt).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Formatting toolbar */}
          <div className="sticky top-[73px] z-20 py-2.5 px-4 bg-[#0a0a14]/95 backdrop-blur border border-white/10 rounded-xl flex flex-wrap items-center gap-1.5 shadow-md">
            <input type="file" ref={fileInputRef} onChange={handleFileInputChange} accept="image/*" className="hidden" />

            {[
              { cmd: 'bold',      Icon: Bold,         title: 'Bold' },
              { cmd: 'italic',    Icon: Italic,       title: 'Italic' },
              { cmd: 'underline', Icon: Underline,    title: 'Underline' },
            ].map(({ cmd, Icon, title }) => (
              <button key={cmd}
                onMouseDown={(e) => { e.preventDefault(); handleFormat(cmd); }}
                className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition"
                title={title}
              >
                <Icon size={15} />
              </button>
            ))}

            <div className="h-4 w-px bg-white/10 mx-1" />

            {[
              { cmd: 'insertUnorderedList', Icon: List,         title: 'Bullet List' },
              { cmd: 'insertOrderedList',   Icon: ListOrdered,  title: 'Numbered List' },
            ].map(({ cmd, Icon, title }) => (
              <button key={cmd}
                onMouseDown={(e) => { e.preventDefault(); handleFormat(cmd); }}
                className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition"
                title={title}
              >
                <Icon size={15} />
              </button>
            ))}

            <button
              onMouseDown={(e) => { e.preventDefault(); handleInsertCheckbox(); }}
              className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition"
              title="Checkbox"
            >
              <CheckSquare size={15} />
            </button>

            <div className="h-4 w-px bg-white/10 mx-1" />

            <button
              onMouseDown={(e) => { e.preventDefault(); fileInputRef.current?.click(); }}
              className="px-2 py-1 rounded hover:bg-white/10 text-neonCyan hover:text-cyan-300 transition text-[11px] font-bold flex items-center gap-1"
              title="Embed image as base64 (never lost)"
            >
              <Image size={14} /> Inline File
            </button>

            <button
              onMouseDown={(e) => { e.preventDefault(); handleInsertLocalImage(); }}
              className="px-2 py-1 rounded hover:bg-white/10 text-neonPurple hover:text-purple-300 transition text-[11px] font-bold flex items-center gap-1"
              title="Insert local path image"
            >
              <FileImage size={14} /> Local Path
            </button>
          </div>

          {/* Editor + selection overlay wrapper */}
          <div className="relative" ref={editorContainerRef}>

            {/* contentEditable editor */}
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleEditorInput}
              onClick={handleEditorClick}
              onContextMenu={handleEditorContextMenu}
              onDragOver={handleEditorDragOver}
              onDrop={handleEditorDrop}
              onPaste={handleEditorPaste}
              className="rich-note-editor min-h-[520px] w-full bg-white/[0.01] border border-white/5 rounded-2xl p-6 md:p-8 text-sm text-gray-200 leading-relaxed font-sans focus:outline-none focus:ring-1 focus:ring-neonPurple/30 focus:border-neonPurple/30 transition-all"
              data-placeholder="Start typing your note… Drag & drop images or paste screenshots directly!"
            />

            {/* Image selection overlay */}
            {selectedImg && overlayStyle && (
              <div
                style={{
                  position: 'absolute',
                  top:    overlayStyle.top,
                  left:   overlayStyle.left,
                  width:  overlayStyle.width,
                  height: overlayStyle.height,
                  pointerEvents: 'none',
                  zIndex: 15,
                }}
              >
                {/* Dashed neon border */}
                <div style={{
                  position: 'absolute', inset: 0,
                  border: '2px dashed #00f0ff',
                  borderRadius: 12,
                  boxShadow: '0 0 12px rgba(0,240,255,0.25)',
                  pointerEvents: 'none',
                }} />

                {/* Corner resize handles */}
                {CORNERS.map(({ id, style }) => (
                  <div
                    key={id}
                    onMouseDown={startResize(id)}
                    style={{
                      position: 'absolute',
                      width: 13, height: 13,
                      borderRadius: '50%',
                      background: '#00f0ff',
                      border: '2px solid #03030d',
                      boxShadow: '0 0 8px rgba(0,240,255,0.8)',
                      pointerEvents: 'auto',
                      zIndex: 16,
                      ...style,
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* CSS */}
          <style>{`
            .rich-note-editor:empty:before,
            .rich-note-editor[data-placeholder]:not(:focus):empty::before {
              content: attr(data-placeholder);
              color: rgba(156,163,175,0.35);
              pointer-events: none;
            }
            .rich-note-editor ul  { list-style-type: disc    !important; padding-left: 2rem !important; margin-bottom: .75rem !important; }
            .rich-note-editor ol  { list-style-type: decimal !important; padding-left: 2rem !important; margin-bottom: .75rem !important; }
            .rich-note-editor li  { margin-bottom: .2rem !important; }
            .rich-note-editor b, .rich-note-editor strong { color: #fff !important; }
            .note-img {
              max-width: 100% !important;
              height: auto !important;
              border-radius: .75rem !important;
              margin: 1.25rem 0 !important;
              border: 1px solid rgba(255,255,255,0.1) !important;
              display: block !important;
              box-shadow: 0 10px 20px rgba(0,0,0,0.35) !important;
              cursor: pointer !important;
            }
            .note-img.selected { outline: 2px dashed #00f0ff !important; }
            .rich-note-editor input[type="checkbox"].note-checkbox {
              margin-right: .5rem !important;
              width: 1rem !important; height: 1rem !important;
              cursor: pointer !important;
              accent-color: #bd00ff !important;
              vertical-align: middle !important;
            }
          `}</style>

        </div>
      </main>

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 glass-panel border border-white/10 rounded-xl shadow-2xl overflow-hidden py-1 min-w-[160px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleCopyImage}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-200 hover:bg-white/10 hover:text-neonCyan transition cursor-pointer"
          >
            <Copy size={13} /> Copy Image
          </button>
          <div className="h-px bg-white/5 mx-2" />
          <button
            onClick={handleDeleteImage}
            className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 transition cursor-pointer"
          >
            <X size={13} /> Delete Image
          </button>
        </div>
      )}
    </div>
  );
}
