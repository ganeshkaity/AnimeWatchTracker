"use client";

import React, { useState } from 'react';
import { Search, ChevronUp, ChevronDown, X, Loader2, Info } from 'lucide-react';

export default function SearchPanel({
  pdfDoc,
  totalPages,
  onNavigateToMatch,
  onClose,
  searchQuery,
  setSearchQuery,
}) {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState([]); // Array of { pageNum, matchIndex }
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [isImageOnly, setIsImageOnly] = useState(false);

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q || !pdfDoc) return;

    setLoading(true);
    setHasSearched(true);
    setMatches([]);
    setCurrentMatchIdx(0);
    setIsImageOnly(false);

    try {
      const foundMatches = [];
      let totalTextLength = 0;

      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageStr = textContent.items.map((it) => it.str).join(' ').toLowerCase();
        totalTextLength += pageStr.trim().length;

        let index = pageStr.indexOf(q);
        while (index !== -1) {
          foundMatches.push({
            pageNumber: i,
            charIndex: index,
          });
          index = pageStr.indexOf(q, index + q.length);
        }
      }

      setMatches(foundMatches);

      if (totalTextLength < 20) {
        setIsImageOnly(true);
      }

      if (foundMatches.length > 0) {
        setCurrentMatchIdx(0);
        onNavigateToMatch(foundMatches[0].pageNumber);
      }
    } catch (err) {
      console.error('[SearchPanel] Search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (matches.length === 0) return;
    const nextIdx = (currentMatchIdx + 1) % matches.length;
    setCurrentMatchIdx(nextIdx);
    onNavigateToMatch(matches[nextIdx].pageNumber);
  };

  const handlePrev = () => {
    if (matches.length === 0) return;
    const prevIdx = (currentMatchIdx - 1 + matches.length) % matches.length;
    setCurrentMatchIdx(prevIdx);
    onNavigateToMatch(matches[prevIdx].pageNumber);
  };

  return (
    <div className="fixed top-16 right-4 z-50 w-80 glass-panel p-3.5 rounded-2xl border border-white/10 shadow-2xl bg-[#0d1117]/95 backdrop-blur-xl animate-in fade-in slide-in-from-top-2">
      <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2.5">
        <div className="flex items-center gap-2 text-white font-bold text-xs">
          <Search size={14} className="text-purple-400" />
          <span>Find in Document</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search dialogue, chapter text..."
          className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading || !searchQuery.trim()}
          className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white text-xs transition cursor-pointer"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
        </button>
      </form>

      {hasSearched && (
        <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-xs">
          {matches.length > 0 ? (
            <>
              <span className="text-gray-300 font-mono text-[11px]">
                {currentMatchIdx + 1} of {matches.length} matches
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handlePrev}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition cursor-pointer"
                  title="Previous match"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 transition cursor-pointer"
                  title="Next match"
                >
                  <ChevronDown size={14} />
                </button>
              </div>
            </>
          ) : (
            <span className="text-gray-400 text-[11px]">No matches found</span>
          )}
        </div>
      )}

      {isImageOnly && (
        <div className="mt-2 p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300/90 text-[10px] flex items-start gap-1.5 leading-relaxed">
          <Info size={13} className="shrink-0 mt-0.5" />
          <span>
            This appears to be an image-only scanned manga PDF. Standard text search only finds selectable text layers.
          </span>
        </div>
      )}
    </div>
  );
}
