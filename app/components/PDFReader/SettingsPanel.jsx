"use client";

import React from 'react';
import { X, Settings, ArrowLeftRight, BookOpen, Sun, Monitor, Sparkles, Eye } from 'lucide-react';

export default function SettingsPanel({
  settings,
  onUpdateSettings,
  onClose,
}) {
  return (
    <div className="fixed top-16 right-4 z-50 w-80 glass-panel p-4 rounded-2xl border border-white/10 shadow-2xl bg-[#0d1117]/95 backdrop-blur-xl animate-in fade-in slide-in-from-top-2 text-white">
      <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
        <div className="flex items-center gap-2 font-bold text-xs">
          <Settings size={15} className="text-purple-400" />
          <span>Reader Preferences</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
        >
          <X size={15} />
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {/* 1. Reading Direction */}
        <div className="space-y-1.5">
          <label className="text-gray-400 font-semibold text-[11px] block">
            Reading Direction
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onUpdateSettings({ direction: 'rtl' })}
              className={`py-2 px-3 rounded-xl font-bold transition cursor-pointer border ${
                settings.direction === 'rtl'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Right → Left (Manga)
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ direction: 'ltr' })}
              className={`py-2 px-3 rounded-xl font-bold transition cursor-pointer border ${
                settings.direction === 'ltr'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Left → Right (Comic)
            </button>
          </div>
        </div>

        {/* 2. Page Mode */}
        <div className="space-y-1.5">
          <label className="text-gray-400 font-semibold text-[11px] block">
            Page Layout Mode
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateSettings({ readingMode: 'single' })}
              className={`py-2 px-1 rounded-xl text-center font-bold text-[11px] transition cursor-pointer border ${
                settings.readingMode === 'single'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Single
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ readingMode: 'double' })}
              className={`py-2 px-1 rounded-xl text-center font-bold text-[11px] transition cursor-pointer border ${
                settings.readingMode === 'double'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Two Page
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ readingMode: 'vertical' })}
              className={`py-2 px-1 rounded-xl text-center font-bold text-[11px] transition cursor-pointer border ${
                settings.readingMode === 'vertical'
                  ? 'bg-purple-600/30 border-purple-500 text-purple-300'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
              }`}
            >
              Webtoon
            </button>
          </div>
        </div>

        {/* 3. Cover Page Offset (in Two Page mode) */}
        {settings.readingMode === 'double' && (
          <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
            <div>
              <span className="font-bold text-gray-300 block">Cover Page Offset</span>
              <span className="text-[10px] text-gray-500">First page stands alone</span>
            </div>
            <input
              type="checkbox"
              checked={!!settings.coverPageOffset}
              onChange={(e) => onUpdateSettings({ coverPageOffset: e.target.checked })}
              className="accent-purple-500 w-4 h-4 cursor-pointer"
            />
          </div>
        )}

        {/* 4. Canvas Background Theme */}
        <div className="space-y-1.5">
          <label className="text-gray-400 font-semibold text-[11px] block">
            Background Theme
          </label>
          <div className="grid grid-cols-4 gap-1.5 text-[10px] font-bold">
            {[
              { id: 'dark', label: 'Dark', bg: '#10141d', text: '#fff' },
              { id: 'black', label: 'OLED', bg: '#000000', text: '#fff' },
              { id: 'sepia', label: 'Sepia', bg: '#231d16', text: '#f3e5ab' },
              { id: 'light', label: 'Light', bg: '#2b313d', text: '#fff' },
            ].map((th) => (
              <button
                key={th.id}
                type="button"
                onClick={() => onUpdateSettings({ background: th.id })}
                className={`py-2 rounded-xl border transition cursor-pointer ${
                  settings.background === th.id
                    ? 'border-purple-500 ring-1 ring-purple-500 text-purple-300'
                    : 'border-white/10 text-gray-400 hover:text-white'
                }`}
                style={{ backgroundColor: th.bg }}
              >
                {th.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5. Toolbar Auto-hide Toggle */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
          <div>
            <span className="font-bold text-gray-300 block">Auto-hide Controls</span>
            <span className="text-[10px] text-gray-500">Hide toolbars after inactivity</span>
          </div>
          <input
            type="checkbox"
            checked={!!settings.toolbarAutoHide}
            onChange={(e) => onUpdateSettings({ toolbarAutoHide: e.target.checked })}
            className="accent-purple-500 w-4 h-4 cursor-pointer"
          />
        </div>

        {/* 6. Smooth Transition Toggle */}
        <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/10">
          <div>
            <span className="font-bold text-gray-300 block">Page Animations</span>
            <span className="text-[10px] text-gray-500">Smooth page flip transitions</span>
          </div>
          <input
            type="checkbox"
            checked={!!settings.pageTransition}
            onChange={(e) => onUpdateSettings({ pageTransition: e.target.checked })}
            className="accent-purple-500 w-4 h-4 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
