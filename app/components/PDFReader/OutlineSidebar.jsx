"use client";

import React, { useEffect, useState } from 'react';
import { X, BookOpen, ChevronRight } from 'lucide-react';

export default function OutlineSidebar({
  pdfDoc,
  onSelectPage,
  onClose,
}) {
  const [outline, setOutline] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isCancelled = false;
    if (!pdfDoc) return;

    const fetchOutline = async () => {
      try {
        setLoading(true);
        const rawOutline = await pdfDoc.getOutline();
        if (isCancelled) return;

        if (rawOutline && Array.isArray(rawOutline)) {
          // Resolve destinations to page indexes
          const resolved = await Promise.all(
            rawOutline.map(async (item) => {
              let pageNum = null;
              try {
                if (typeof item.dest === 'string') {
                  const dest = await pdfDoc.getDestination(item.dest);
                  if (dest) {
                    const pageIndex = await pdfDoc.getPageIndex(dest[0]);
                    pageNum = pageIndex + 1;
                  }
                } else if (Array.isArray(item.dest)) {
                  const pageIndex = await pdfDoc.getPageIndex(item.dest[0]);
                  pageNum = pageIndex + 1;
                }
              } catch {}
              return {
                title: item.title,
                pageNum,
                items: item.items || [],
              };
            })
          );
          setOutline(resolved);
        } else {
          setOutline([]);
        }
      } catch (err) {
        console.warn('[OutlineSidebar] Error loading outline:', err);
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchOutline();

    return () => {
      isCancelled = true;
    };
  }, [pdfDoc]);

  return (
    <div className="fixed inset-y-0 left-0 z-50 w-72 glass-panel border-r border-white/10 bg-[#0d1117]/95 shadow-2xl flex flex-col backdrop-blur-xl animate-in slide-in-from-left duration-200">
      <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2 text-white font-extrabold text-sm">
          <BookOpen size={17} className="text-purple-400" />
          <span>Table of Contents</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X size={17} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-1.5 custom-scrollbar text-xs">
        {loading ? (
          <div className="py-12 text-center text-gray-400">Loading document outline...</div>
        ) : outline.length === 0 ? (
          <div className="py-12 text-center text-gray-500 px-4">
            No embedded table of contents found in this PDF.
          </div>
        ) : (
          outline.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (item.pageNum) onSelectPage(item.pageNum);
              }}
              disabled={!item.pageNum}
              className="w-full px-3 py-2.5 rounded-xl text-left font-medium transition cursor-pointer flex items-center justify-between text-gray-300 hover:text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-white/10"
            >
              <span className="truncate pr-2">{item.title}</span>
              {item.pageNum && (
                <span className="text-[10px] font-mono text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-md border border-purple-500/20">
                  p.{item.pageNum}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
