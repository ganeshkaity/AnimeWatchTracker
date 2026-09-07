"use client";

import React, { useEffect, useRef } from 'react';
import { X, Layers } from 'lucide-react';

function ThumbnailItem({ pdfDoc, pageNum, isActive, onSelect }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc || !canvasRef.current) return;

    const renderThumb = async () => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        if (isCancelled) return;

        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch {}
    };

    renderThumb();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc, pageNum]);

  return (
    <div
      onClick={() => onSelect(pageNum)}
      className={`p-2 rounded-xl transition cursor-pointer flex flex-col items-center gap-1.5 border ${
        isActive
          ? 'bg-purple-600/20 border-purple-500 shadow-lg shadow-purple-500/20'
          : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
      }`}
    >
      <div className="w-28 h-36 bg-black/60 rounded-lg overflow-hidden flex items-center justify-center border border-white/10">
        <canvas ref={canvasRef} className="max-w-full max-h-full object-contain" />
      </div>
      <span className={`text-[11px] font-mono font-bold ${isActive ? 'text-purple-300' : 'text-gray-400'}`}>
        Page {pageNum}
      </span>
    </div>
  );
}

export default function ThumbnailSidebar({
  pdfDoc,
  totalPages,
  currentPage,
  onSelectPage,
  onClose,
}) {
  const listRef = useRef(null);

  // Scroll active thumbnail into view
  useEffect(() => {
    if (!listRef.current) return;
    const activeEl = listRef.current.querySelector('[data-active="true"]');
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPage]);

  const pagesArray = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-64 glass-panel border-r border-white/10 bg-[#0d1117]/95 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-left duration-200">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-extrabold text-sm">
          <Layers size={17} className="text-purple-400" />
          <span>Thumbnails</span>
          <span className="text-xs text-gray-500 font-mono font-normal">({totalPages})</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X size={17} />
        </button>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
        {pagesArray.map((num) => (
          <div key={num} data-active={num === currentPage}>
            <ThumbnailItem
              pdfDoc={pdfDoc}
              pageNum={num}
              isActive={num === currentPage}
              onSelect={(p) => {
                onSelectPage(p);
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
