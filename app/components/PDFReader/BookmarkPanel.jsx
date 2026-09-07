"use client";

import React, { useState } from 'react';
import { X, Bookmark, Trash2, Plus, StickyNote } from 'lucide-react';

export default function BookmarkPanel({
  currentPage,
  bookmarks = [],
  notes = [],
  onAddBookmark,
  onRemoveBookmark,
  onSaveNote,
  onDeleteNote,
  onSelectPage,
  onClose,
}) {
  const [activeTab, setActiveTab] = useState('bookmarks'); // 'bookmarks' | 'notes'
  const [newNoteText, setNewNoteText] = useState('');

  const isCurrentBookmarked = bookmarks.some((b) => b.page === currentPage);
  const currentNote = notes.find((n) => n.page === currentPage);

  const handleCreateNote = (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    onSaveNote(currentPage, newNoteText.trim());
    setNewNoteText('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-80 glass-panel border-l border-white/10 bg-[#0d1117]/95 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'bookmarks'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <Bookmark size={13} />
            <span>Bookmarks</span>
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            <StickyNote size={13} />
            <span>Notes</span>
          </button>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X size={17} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        {activeTab === 'bookmarks' ? (
          <>
            {/* Quick Add Bookmark for Current Page */}
            <div className="p-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-between">
              <div>
                <span className="text-xs text-white font-bold block">Current: Page {currentPage}</span>
                <span className="text-[10px] text-gray-400">
                  {isCurrentBookmarked ? 'Bookmarked' : 'Not bookmarked'}
                </span>
              </div>
              {isCurrentBookmarked ? (
                <button
                  type="button"
                  onClick={() => onRemoveBookmark(currentPage)}
                  className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-red-500/30"
                >
                  <Trash2 size={12} />
                  <span>Remove</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onAddBookmark(currentPage)}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-md"
                >
                  <Plus size={13} />
                  <span>Bookmark</span>
                </button>
              )}
            </div>

            {/* List of Bookmarks */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                Saved Bookmarks ({bookmarks.length})
              </h4>
              {bookmarks.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No bookmarks saved yet.</p>
              ) : (
                bookmarks.map((bm) => (
                  <div
                    key={bm.page}
                    className={`p-3 rounded-xl border flex items-center justify-between transition ${
                      bm.page === currentPage
                        ? 'bg-purple-600/20 border-purple-500/40 text-purple-200'
                        : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10'
                    }`}
                  >
                    <div
                      onClick={() => onSelectPage(bm.page)}
                      className="cursor-pointer flex-1"
                    >
                      <span className="text-xs font-bold flex items-center gap-1.5">
                        <Bookmark size={13} className="text-purple-400 fill-purple-400" />
                        Page {bm.page}
                      </span>
                      {bm.title && <span className="text-[10px] text-gray-400 block truncate">{bm.title}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveBookmark(bm.page)}
                      className="p-1.5 text-gray-400 hover:text-red-400 transition cursor-pointer"
                      title="Delete bookmark"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <>
            {/* Page Note for Current Page */}
            <form onSubmit={handleCreateNote} className="space-y-2.5">
              <label className="text-xs font-bold text-white block">
                Attach Note to Page {currentPage}
              </label>
              <textarea
                rows={3}
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Write a comment, translation note, or reaction..."
                className="w-full p-2.5 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
              />
              <button
                type="submit"
                disabled={!newNoteText.trim()}
                className="w-full py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition cursor-pointer"
              >
                <Plus size={14} />
                <span>Save Page Note</span>
              </button>
            </form>

            {/* List of Notes */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                All Notes ({notes.length})
              </h4>
              {notes.length === 0 ? (
                <p className="text-xs text-gray-500 py-6 text-center">No notes written for this chapter yet.</p>
              ) : (
                notes.map((n) => (
                  <div
                    key={n.page}
                    className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => onSelectPage(n.page)}
                        className="text-xs font-bold text-purple-300 hover:underline cursor-pointer"
                      >
                        Page {n.page}
                      </button>
                      <button
                        onClick={() => onDeleteNote(n.page)}
                        className="text-gray-400 hover:text-red-400 transition cursor-pointer"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <p className="text-xs text-gray-300 whitespace-pre-wrap leading-relaxed">
                      {n.content}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
