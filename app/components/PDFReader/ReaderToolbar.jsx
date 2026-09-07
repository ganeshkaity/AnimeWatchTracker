"use client";

import React, { useState } from 'react';
import {
  ArrowLeft, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize, Minimize,
  RotateCw, Search, Bookmark, Layers, BookOpen, Settings, Download,
  Columns, Square, Rows, Edit3, Check, X
} from 'lucide-react';

export default function ReaderToolbar({
  title,
  chapterTitle,
  currentPage,
  totalPages,
  onNavigatePage,
  scale,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSetScale,
  onFitWidth,
  onFitPage,
  onRotate,
  isFullscreen,
  onToggleFullscreen,
  onBack,
  // Chapter (PDF) navigation
  onPrevChapter,
  onNextChapter,
  hasPrevChapter = false,
  hasNextChapter = false,
  prevChapterTitle = '',
  nextChapterTitle = '',
  // Hover & Panel controls
  onControlsMouseEnter,
  onControlsMouseLeave,
  // Alignment (Center vs Free Placement)
  centerAlign = true,
  onToggleCenterAlign,
  // Panels
  onToggleThumbnails,
  onToggleOutline,
  onToggleBookmarks,
  onToggleSearch,
  onToggleSettings,
  onToggleAnnotations,
  isAnnotationsOpen,
  isBookmarked,
  readingMode,
  onChangeReadingMode,
  downloadUrl,
}) {
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [customZoom, setCustomZoom] = useState('');
  const [pageInput, setPageInput] = useState(String(currentPage));
  const [isInputFocused, setIsInputFocused] = useState(false);

  React.useEffect(() => {
    if (!isInputFocused) {
      setPageInput(String(currentPage));
    }
  }, [currentPage, isInputFocused]);

  const handlePageCommit = (e) => {
    if (e) e.preventDefault();
    const val = parseInt(pageInput, 10);
    if (!isNaN(val) && val >= 1 && val <= (totalPages || 1)) {
      onNavigatePage(val);
    } else {
      setPageInput(String(currentPage));
    }
  };

  const percent = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

  return (
    <>
      {/* ── Top Header Toolbar ────────────────────────────────────────────── */}
      <header
        onMouseEnter={onControlsMouseEnter}
        onMouseLeave={onControlsMouseLeave}
        className="fixed top-0 inset-x-0 z-40 h-14 glass-panel border-b border-white/10 bg-[#0d1117]/85 backdrop-blur-md px-4 flex items-center justify-between text-white transition-opacity duration-300"
      >
        {/* Left Side: Back & Titles */}
        <div className="flex items-center gap-3 min-w-0 max-w-[35%] sm:max-w-[40%]">
          <button
            onClick={onBack}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer shrink-0"
            title="Back to Manga Overview"
          >
            <ArrowLeft size={18} />
          </button>

          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-extrabold text-white truncate">
              {title}
            </h1>
            {chapterTitle && (
              <span className="text-[10px] text-purple-400 font-semibold truncate block">
                {chapterTitle}
              </span>
            )}
          </div>
        </div>

        {/* Center: Page Counter Pill with Prev & Next PDF buttons */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-md shadow-sm text-xs font-mono">
          {/* Prev PDF Button (Left side of pill) */}
          <button
            type="button"
            onClick={onPrevChapter}
            disabled={!hasPrevChapter}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 disabled:opacity-25 disabled:hover:bg-transparent text-[11px] font-sans font-bold text-gray-300 hover:text-white transition cursor-pointer border border-white/5 disabled:cursor-not-allowed"
            title={prevChapterTitle ? `Previous PDF: ${prevChapterTitle}` : "Previous PDF / Chapter"}
          >
            <ChevronLeft size={13} />
            <span>Prev</span>
          </button>

          {/* Center Page Count with Jump-to-Page Input */}
          <form
            onSubmit={handlePageCommit}
            className="flex items-center gap-1.5 px-2 py-0.5 select-none"
          >
            <span className="text-purple-300 font-bold text-xs">Page</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pageInput}
              onFocus={() => setIsInputFocused(true)}
              onBlur={() => {
                setIsInputFocused(false);
                handlePageCommit();
              }}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePageCommit(e);
                  e.currentTarget.blur();
                }
              }}
              className="w-10 sm:w-12 text-center text-xs font-bold font-mono text-purple-200 bg-white/10 hover:bg-white/15 focus:bg-purple-900/60 border border-white/15 focus:border-purple-400 rounded-lg py-0.5 px-1 outline-none transition cursor-text select-text"
              title="Type page number and press Enter to jump"
            />
            <span className="text-gray-500 font-bold">/</span>
            <span className="text-gray-400 font-mono text-xs font-bold">{totalPages}</span>
            <span className="text-[10px] text-gray-500 ml-0.5 hidden sm:inline">({percent}%)</span>
          </form>

          {/* Next PDF Button (Right side of pill) */}
          <button
            type="button"
            onClick={onNextChapter}
            disabled={!hasNextChapter}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 disabled:opacity-25 disabled:hover:bg-transparent text-[11px] font-sans font-bold text-gray-300 hover:text-white transition cursor-pointer border border-white/5 disabled:cursor-not-allowed"
            title={nextChapterTitle ? `Next PDF: ${nextChapterTitle}` : "Next PDF / Chapter"}
          >
            <span>Next</span>
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Right Side: Tool Toggles */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/* Annotations Toggle */}
          <button
            onClick={onToggleAnnotations}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isAnnotationsOpen
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Annotation & Drawing Tools"
          >
            <Edit3 size={16} />
          </button>

          {/* Bookmark Toggle */}
          <button
            onClick={onToggleBookmarks}
            className={`p-2 rounded-xl transition cursor-pointer ${
              isBookmarked
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
            title="Bookmarks & Page Notes"
          >
            <Bookmark size={16} className={isBookmarked ? 'fill-amber-400' : ''} />
          </button>

          {/* Search Toggle */}
          <button
            onClick={onToggleSearch}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Search Text in PDF"
          >
            <Search size={16} />
          </button>

          {/* Thumbnails Sidebar Toggle */}
          <button
            onClick={onToggleThumbnails}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Page Thumbnails"
          >
            <Layers size={16} />
          </button>

          {/* Outline / TOC Sidebar Toggle */}
          <button
            onClick={onToggleOutline}
            className="hidden sm:flex p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Table of Contents"
          >
            <BookOpen size={16} />
          </button>

          {/* Download Button (Optional Backend Safe) */}
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="hidden sm:flex p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Download PDF"
            >
              <Download size={16} />
            </a>
          )}

          {/* Settings */}
          <button
            onClick={onToggleSettings}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Reader Settings"
          >
            <Settings size={16} />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={onToggleFullscreen}
            className="p-2 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen (F)'}
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </header>

      {/* ── Floating Bottom Navigation & Options (No Bar Background, No Scrollbar) ── */}
      <footer className="fixed bottom-4 inset-x-4 z-40 flex items-center justify-between pointer-events-none text-white transition-opacity duration-300">
        {/* Left: Previous / Next page buttons */}
        <div
          onMouseEnter={onControlsMouseEnter}
          onMouseLeave={onControlsMouseLeave}
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-auto"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const step = readingMode === 'double' ? 2 : 1;
              onNavigatePage(Math.max(1, currentPage - step));
            }}
            disabled={currentPage <= 1}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent text-xs font-bold transition cursor-pointer border border-white/10 active:scale-95"
            title="Previous Page (Left Arrow or A)"
          >
            <ChevronLeft size={16} />
            <span className="hidden sm:inline">Prev</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const step = readingMode === 'double' ? 2 : 1;
              onNavigatePage(Math.min(totalPages, currentPage + step));
            }}
            disabled={currentPage >= totalPages}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 disabled:opacity-30 disabled:hover:bg-transparent text-xs font-bold transition cursor-pointer border border-white/10 active:scale-95"
            title="Next Page (Right Arrow or D)"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Right: Floating Tool Options */}
        <div
          onMouseEnter={onControlsMouseEnter}
          onMouseLeave={onControlsMouseLeave}
          className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl pointer-events-auto"
        >
          {/* Center Align vs Free Placement Checkbox */}
          <label
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl transition cursor-pointer select-none border text-xs font-semibold ${
              centerAlign
                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
            }`}
            title={centerAlign ? "Page locked to center. Uncheck for Free Placement anywhere on screen." : "Free Placement active: scroll and place anywhere on screen."}
          >
            <input
              type="checkbox"
              checked={centerAlign}
              onChange={(e) => onToggleCenterAlign && onToggleCenterAlign(e.target.checked)}
              className="w-3.5 h-3.5 accent-purple-500 rounded cursor-pointer"
            />
            <span className="text-[11px] font-sans font-bold">{centerAlign ? 'Center' : 'Free'}</span>
          </label>

          {/* Zoom controls with presets up to 1000x */}
          <div className="relative flex items-center gap-0.5 bg-white/5 p-0.5 rounded-xl border border-white/10">
            <button
              onClick={onZoomOut}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={() => setShowZoomMenu(!showZoomMenu)}
              className="px-2 py-0.5 text-[11px] font-mono font-bold text-gray-200 hover:text-purple-300 transition cursor-pointer"
              title="Click for Zoom Options up to 1000x"
            >
              {scale >= 10 ? `${Math.round(scale)}x` : `${Math.round(scale * 100)}%`}
            </button>
            <button
              onClick={onZoomIn}
              className="p-1.5 rounded-lg text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn size={14} />
            </button>

            {/* Zoom Presets Menu up to 1000x */}
            {showZoomMenu && (
              <div
                className="absolute bottom-11 right-0 z-50 w-56 p-3 rounded-2xl glass-panel bg-[#0d1117]/95 border border-white/15 shadow-2xl text-white space-y-2.5 backdrop-blur-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider">Zoom up to 1000x</span>
                  <button onClick={() => setShowZoomMenu(false)} className="text-gray-400 hover:text-white p-0.5">
                    <X size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 text-[10px] font-mono font-bold">
                  {[0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0, 250.0, 500.0, 1000.0].map((z) => (
                    <button
                      key={z}
                      type="button"
                      onClick={() => {
                        onSetScale && onSetScale(z);
                        setShowZoomMenu(false);
                      }}
                      className={`py-1 rounded-lg border transition ${
                        Math.abs(scale - z) < 0.05
                          ? 'bg-purple-600 border-purple-500 text-white'
                          : 'bg-white/5 border-white/10 text-gray-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {z >= 10 ? `${z}x` : `${Math.round(z * 100)}%`}
                    </button>
                  ))}
                </div>

                {/* Custom numeric input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const num = parseFloat(customZoom);
                    if (!isNaN(num) && num > 0) {
                      const finalScale = num > 1000 ? 1000 : num;
                      onSetScale && onSetScale(finalScale);
                      setShowZoomMenu(false);
                      setCustomZoom('');
                    }
                  }}
                  className="flex items-center gap-1.5 pt-1.5 border-t border-white/10"
                >
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    max="1000"
                    placeholder="Enter (e.g. 500x)..."
                    value={customZoom}
                    onChange={(e) => setCustomZoom(e.target.value)}
                    className="w-full px-2 py-1 rounded-lg bg-black/60 border border-white/15 text-[10px] text-white focus:outline-none focus:border-purple-500 font-mono"
                  />
                  <button
                    type="submit"
                    className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-[10px] font-bold cursor-pointer transition"
                  >
                    Set
                  </button>
                </form>
              </div>
            )}
          </div>

          {/* Quick Fit Width / Page */}
          <button
            onClick={onFitWidth}
            className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-[10px] font-bold text-gray-200 hover:text-white border border-white/10 transition cursor-pointer"
            title="Fit to Width"
          >
            Fit W
          </button>
          <button
            onClick={onFitPage}
            className="hidden sm:flex px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 text-[10px] font-bold text-gray-200 hover:text-white border border-white/10 transition cursor-pointer"
            title="Fit to Page"
          >
            Fit Page
          </button>

          {/* Rotate Clockwise */}
          <button
            onClick={onRotate}
            className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Rotate Clockwise 90° (R)"
          >
            <RotateCw size={15} />
          </button>

          {/* Layout Mode quick toggle */}
          <button
            onClick={() => {
              const nextMode = readingMode === 'single' ? 'double' : readingMode === 'double' ? 'vertical' : 'single';
              onChangeReadingMode(nextMode);
            }}
            className="p-1.5 rounded-xl text-gray-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title={`Reading Mode: ${readingMode} (Click to toggle)`}
          >
            {readingMode === 'single' ? (
              <Square size={15} />
            ) : readingMode === 'double' ? (
              <Columns size={15} />
            ) : (
              <Rows size={15} />
            )}
          </button>
        </div>
      </footer>
    </>
  );
}
