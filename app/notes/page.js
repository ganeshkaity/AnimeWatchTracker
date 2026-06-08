"use client";

import React, { useState, useEffect } from 'react';
import { collection, collectionGroup, query, onSnapshot, addDoc, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import {
  getLocalNotes, setLocalNotes, upsertLocalNote, deleteLocalNote, addToDirtyQueue, getUserId
} from '../utils/localStore';
import { 
  Plus, Search, ArrowLeft, Star, AlertTriangle, Trash2, 
  Bookmark, Calendar, FileText, ChevronRight
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const FLAG_TAGS = ['General', 'Review', 'Ideas', 'To-Do', 'Plot Info', 'Anime List', 'Important'];

// Utility helper to extract the first inline image source from HTML content
const getFirstImageSrc = (html) => {
  if (!html) return null;
  const match = html.match(/<img[^>]+src="([^">]+)"/);
  return match ? match[1] : null;
};

// Utility helper to strip HTML tags for clean card text previews
const stripHtml = (html) => {
  if (!html) return '';
  // Remove HTML tags and clean up whitespace
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
};

export default function NotesPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const { isOffline } = useOffline();
  const router = useRouter();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('all');
  const [filterStarred, setFilterStarred] = useState(false);
  const [filterImportant, setFilterImportant] = useState(false);

  // Load notes: localStorage first, then Firestore if online
  useEffect(() => {
    if (authLoading) return;

    // Load from local cache immediately
    const localNotes = getLocalNotes();
    if (localNotes.length > 0) {
      localNotes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setNotes(localNotes);
      setLoading(false);
    }

    if (!currentUser) {
      setLoading(false);
      return;
    }

    if (isOffline || !db) {
      setLoading(false);
      return;
    }

    const targetUserId = getUserId();
    const notesRef = collection(db, 'users', targetUserId, 'notes');
    const q = query(notesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach((d) => {
        const noteUserId = targetUserId;
        list.push({ id: d.id, userId: noteUserId, ...d.data() });
      });
      list.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      setNotes(list);
      setLocalNotes(list);
      setLoading(false);
    }, (err) => {
      console.error('Notes Firestore subscription error:', err);
      setLoading(false);
    });
    return unsubscribe;
  }, [currentUser, authLoading, isOffline]);

  // Create Note — local first, Firestore if online
  const handleCreateNote = async () => {
    if (!currentUser) return;
    const noteId = `note_${Date.now()}`;
    const noteData = {
      title: 'Untitled Note',
      content: '',
      tag: 'General',
      isStarred: false,
      isImportant: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      userId: getUserId(),
    };
    upsertLocalNote({ id: noteId, ...noteData });

    if (!isOffline && db) {
      try {
        const notesRef = collection(db, 'users', getUserId(), 'notes');
        const docRef = await addDoc(notesRef, {
          title: noteData.title,
          content: noteData.content,
          tag: noteData.tag,
          isStarred: noteData.isStarred,
          isImportant: noteData.isImportant,
          createdAt: noteData.createdAt,
          updatedAt: noteData.updatedAt
        });
        // Update local with real Firestore id
        deleteLocalNote(noteId);
        upsertLocalNote({ id: docRef.id, ...noteData });
        router.push(`/notes/${docRef.id}`);
      } catch (err) {
        console.error('Failed to create note:', err);
        addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${noteId}`, payload: { id: noteId, ...noteData } });
        router.push(`/notes/${noteId}`);
      }
    } else {
      addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${noteId}`, payload: { id: noteId, ...noteData } });
      router.push(`/notes/${noteId}`);
    }
  };

  // Toggle Star Status — local first
  const handleToggleStar = async (note, e) => {
    e.stopPropagation();
    e.preventDefault();
    const targetUserId = note.userId || currentUser.uid;
    const update = { id: note.id, isStarred: !note.isStarred, updatedAt: new Date().toISOString(), userId: targetUserId };
    upsertLocalNote(update);
    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', targetUserId, 'notes', note.id), {
          isStarred: update.isStarred,
          updatedAt: update.updatedAt
        });
      } catch (err) { console.error(err); addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${note.id}`, payload: update }); }
    } else {
      addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${note.id}`, payload: update });
    }
  };

  // Toggle Important Status — local first
  const handleToggleImportant = async (note, e) => {
    e.stopPropagation();
    e.preventDefault();
    const targetUserId = note.userId || currentUser.uid;
    const update = { id: note.id, isImportant: !note.isImportant, updatedAt: new Date().toISOString(), userId: targetUserId };
    upsertLocalNote(update);
    if (!isOffline && db && currentUser) {
      try {
        await updateDoc(doc(db, 'users', targetUserId, 'notes', note.id), {
          isImportant: update.isImportant,
          updatedAt: update.updatedAt
        });
      } catch (err) { console.error(err); addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${note.id}`, payload: update }); }
    } else {
      addToDirtyQueue({ type: 'SET_NOTE', dedupeKey: `SET_NOTE_${note.id}`, payload: update });
    }
  };

  // Delete Note — local first
  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm('Are you sure you want to delete this note? This action cannot be undone.')) return;
    deleteLocalNote(noteId);
    const noteObj = notes.find(n => n.id === noteId);
    const targetUserId = noteObj?.userId || currentUser.uid;
    if (!isOffline && db && currentUser) {
      try {
        await deleteDoc(doc(db, 'users', targetUserId, 'notes', noteId));
      } catch (err) { console.error(err); addToDirtyQueue({ type: 'DELETE_NOTE', dedupeKey: `DELETE_NOTE_${noteId}`, payload: { id: noteId, userId: targetUserId } }); }
    } else {
      addToDirtyQueue({ type: 'DELETE_NOTE', dedupeKey: `DELETE_NOTE_${noteId}`, payload: { id: noteId, userId: targetUserId } });
    }
  };

  // Filtering Logic
  const filteredNotes = notes.filter(note => {
    const plainContent = stripHtml(note.content);
    const matchSearch = note.title.toLowerCase().includes(search.toLowerCase()) || 
                        plainContent.toLowerCase().includes(search.toLowerCase());
    const matchTag = filterTag === 'all' || note.tag === filterTag;
    const matchStarred = !filterStarred || note.isStarred;
    const matchImportant = !filterImportant || note.isImportant;

    return matchSearch && matchTag && matchStarred && matchImportant;
  });

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-[#03030d] flex flex-col justify-center items-center gap-3">
        <div className="animate-spin h-8 w-8 border-4 border-neonCyan border-t-transparent rounded-full" />
        <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Loading Notes Dashboard...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 text-white">
      {/* Top Navbar */}
      <header className="sticky top-0 z-20 glass-panel border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            href="/"
            className="p-2 rounded-lg bg-white/5 border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-wider">
              ANIME<span className="text-neonPurple font-extrabold text-shadow-neon">NOTES</span>
            </h1>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest font-semibold">Workspace Notepad</p>
          </div>
        </div>

        <button
          onClick={handleCreateNote}
          className="px-4 py-2 bg-neon-gradient hover:brightness-110 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-purple-glow transition-all cursor-pointer"
        >
          <Plus size={16} />
          Create Note
        </button>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 md:px-12 mt-8">
        {/* Search, Filter & Toggles Bar */}
        <div className="flex flex-col lg:flex-row gap-4 justify-between items-center mb-8 bg-white/[0.02] border border-white/5 p-4 rounded-2xl glass-panel">
          <div className="relative w-full lg:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 z-10 pointer-events-none" size={16} />
            <input
              type="text"
              placeholder="Search note contents..."
              className="w-full pl-9 pr-4 py-2 rounded-lg glass-input text-xs text-white"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {/* Tags Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Tag</span>
              <select
                value={filterTag}
                onChange={(e) => setFilterTag(e.target.value)}
                className="bg-[#0b0b18] border border-white/5 rounded-lg px-2 py-1.5 text-xs text-gray-300 focus:outline-none"
              >
                <option value="all">All Tags</option>
                {FLAG_TAGS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="h-6 w-px bg-white/10 hidden sm:inline" />

            {/* Quick Filter Buttons */}
            <button
              onClick={() => setFilterStarred(!filterStarred)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition flex items-center gap-1.5 ${
                filterStarred 
                  ? 'bg-amber-500/10 border-amber-500 text-amber-400' 
                  : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <Star size={14} fill={filterStarred ? "currentColor" : "none"} />
              Starred
            </button>

            <button
              onClick={() => setFilterImportant(!filterImportant)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border transition flex items-center gap-1.5 ${
                filterImportant 
                  ? 'bg-red-500/10 border-red-500 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.1)]' 
                  : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
              }`}
            >
              <AlertTriangle size={14} />
              Important
            </button>
          </div>
        </div>

        {/* Notes Grid */}
        {filteredNotes.length === 0 ? (
          <div className="text-center py-20 bg-white/[0.01] border border-dashed border-white/10 rounded-3xl max-w-xl mx-auto">
            <FileText className="mx-auto text-neonPurple/60 mb-4 animate-pulse" size={48} />
            <h3 className="text-lg font-bold mb-2">No Notes Found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
              Create your first notepad entry! Document details, catalog your wishlist, write character analysis, or list episode notes.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredNotes.map((note) => {
              const firstImage = getFirstImageSrc(note.content);
              const cardImage = note.imagePath 
                ? `/api/image?path=${encodeURIComponent(note.imagePath)}` 
                : firstImage;

              return (
                <Link
                  key={note.id}
                  href={`/notes/${note.id}`}
                  className="group relative glass-card rounded-2xl flex flex-col justify-between overflow-hidden cursor-pointer"
                >
                  {/* Note Banner/Image */}
                  <div className="h-32 relative overflow-hidden bg-gradient-to-tr from-purple-900/20 to-indigo-900/20 border-b border-white/5 flex items-center justify-center">
                    {cardImage ? (
                      <img 
                        src={cardImage} 
                        alt={note.title}
                        className="absolute inset-0 w-full h-full object-cover transform group-hover:scale-105 transition duration-500"
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-tr from-[#bd00ff]/5 to-[#00f0ff]/5 opacity-60 group-hover:opacity-100 transition duration-300" />
                    )}

                    {/* Badges / Overlay Tags */}
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-[#0b0b18]/80 border border-white/10 text-[9px] font-bold text-neonCyan uppercase tracking-wider">
                        {note.tag}
                      </span>
                    </div>

                    {/* Actions overlay */}
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10">
                      <button
                        onClick={(e) => handleToggleStar(note, e)}
                        className={`p-1.5 rounded-lg border transition ${
                          note.isStarred 
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' 
                            : 'bg-black/50 border-white/5 text-gray-400 hover:text-white'
                        }`}
                        title="Star Note"
                      >
                        <Star size={13} fill={note.isStarred ? "currentColor" : "none"} />
                      </button>
                      <button
                        onClick={(e) => handleToggleImportant(note, e)}
                        className={`p-1.5 rounded-lg border transition ${
                          note.isImportant 
                            ? 'bg-red-500/20 border-red-500/40 text-red-400' 
                            : 'bg-black/50 border-white/5 text-gray-400 hover:text-white'
                        }`}
                        title="Important Note"
                      >
                        <AlertTriangle size={13} />
                      </button>
                      <button
                        onClick={(e) => handleDeleteNote(note.id, e)}
                        className="p-1.5 rounded-lg bg-red-950/60 border border-red-500/30 text-red-400 hover:bg-red-600 hover:text-white transition"
                        title="Delete Note"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Content details */}
                  <div className="p-5 flex flex-col justify-between flex-grow bg-[#0b0b1a]/40">
                    <div className="space-y-2">
                      <h3 className="font-extrabold text-base text-white group-hover:text-neonCyan transition duration-200 line-clamp-1">
                        {note.title}
                      </h3>
                      <p className="text-xs text-gray-400 line-clamp-3 leading-relaxed">
                        {stripHtml(note.content) || "No content..."}
                      </p>
                    </div>

                    <div className="flex items-center justify-between mt-5 pt-3 border-t border-white/5 text-[10px] text-gray-500">
                      <div className="flex items-center gap-1">
                        <Calendar size={10} />
                        <span>{new Date(note.updatedAt || note.createdAt).toLocaleDateString()}</span>
                      </div>
                      <span className="text-neonPurple flex items-center gap-0.5 group-hover:translate-x-1 transition duration-200 font-bold uppercase tracking-wider">
                        Open <ChevronRight size={10} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
