"use client";

import React, { useState } from 'react';
import {
  MousePointer, Highlighter, PenTool, Edit2, Minus, ArrowRight,
  Square, Circle, Type, Underline, Strikethrough, Eraser,
  Undo2, Redo2, Palette, Sliders, ChevronDown, ChevronUp, X
} from 'lucide-react';

const COLORS = [
  { label: 'Yellow', hex: '#ffeb3b' },
  { label: 'Green', hex: '#4caf50' },
  { label: 'Blue', hex: '#2196f3' },
  { label: 'Pink', hex: '#e91e63' },
  { label: 'Red', hex: '#f44336' },
  { label: 'Purple', hex: '#9c27b0' },
  { label: 'White', hex: '#ffffff' },
];

export default function AnnotationToolbar({
  activeTool,
  setActiveTool,
  toolColor,
  setToolColor,
  toolThickness,
  setToolThickness,
  toolOpacity,
  setToolOpacity,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClose,
  saveStatus, // 'clean' | 'dirty' | 'saving' | 'saved'
}) {
  const [expandedSettings, setExpandedSettings] = useState(false);

  const tools = [
    { id: 'select', label: 'Pointer / Pan', icon: MousePointer },
    { id: 'highlight', label: 'Highlighter', icon: Highlighter },
    { id: 'pen', label: 'Fine Pen', icon: PenTool },
    { id: 'marker', label: 'Marker', icon: Edit2 },
    { id: 'line', label: 'Line', icon: Minus },
    { id: 'arrow', label: 'Arrow', icon: ArrowRight },
    { id: 'rect', label: 'Rectangle', icon: Square },
    { id: 'circle', label: 'Circle', icon: Circle },
    { id: 'text', label: 'Text Note', icon: Type },
    { id: 'underline', label: 'Underline', icon: Underline },
    { id: 'strikethrough', label: 'Strikethrough', icon: Strikethrough },
    { id: 'eraser', label: 'Eraser', icon: Eraser },
  ];

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] flex flex-col items-center gap-2">
      {/* Save indicator pill */}
      {saveStatus && (
        <div className="px-3 py-1 rounded-full bg-black/80 backdrop-blur-md border border-white/10 text-[10px] font-bold tracking-wider flex items-center gap-1.5 shadow-lg">
          {saveStatus === 'saving' ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              <span className="text-amber-300">Saving annotations...</span>
            </>
          ) : saveStatus === 'saved' ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-emerald-400">✓ All Saved</span>
            </>
          ) : null}
        </div>
      )}

      {/* Expanded properties tray (Color, Thickness, Opacity) */}
      {expandedSettings && (
        <div className="glass-panel p-3 rounded-2xl border border-white/10 shadow-2xl flex flex-wrap items-center gap-4 bg-black/90 text-white backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2">
          {/* Color palette */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-400 font-bold uppercase mr-1">Color</span>
            {COLORS.map((c) => (
              <button
                key={c.hex}
                type="button"
                onClick={() => setToolColor(c.hex)}
                style={{ backgroundColor: c.hex }}
                className={`w-6 h-6 rounded-full transition transform cursor-pointer border ${
                  toolColor === c.hex
                    ? 'ring-2 ring-white scale-110 border-white'
                    : 'border-white/20 opacity-80 hover:opacity-100 hover:scale-105'
                }`}
                title={c.label}
              />
            ))}
          </div>

          {/* Thickness Slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Size</span>
            <input
              type="range"
              min="1"
              max="24"
              value={toolThickness}
              onChange={(e) => setToolThickness(parseInt(e.target.value, 10))}
              className="w-20 accent-purple-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono w-4">{toolThickness}px</span>
          </div>

          {/* Opacity Slider */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 font-bold uppercase">Opacity</span>
            <input
              type="range"
              min="10"
              max="100"
              value={Math.round(toolOpacity * 100)}
              onChange={(e) => setToolOpacity(parseInt(e.target.value, 10) / 100)}
              className="w-16 accent-purple-500 cursor-pointer"
            />
            <span className="text-[10px] font-mono w-6">{Math.round(toolOpacity * 100)}%</span>
          </div>
        </div>
      )}

      {/* Main Toolbar Dock */}
      <div className="glass-panel px-3 py-2 rounded-2xl border border-white/15 shadow-2xl flex items-center gap-1 bg-[#10141d]/90 text-white backdrop-blur-xl overflow-x-auto max-w-full custom-scrollbar">
        {/* Undo / Redo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={16} />
        </button>

        <div className="w-[1px] h-6 bg-white/15 mx-1" />

        {/* Tools list */}
        {tools.map((t) => {
          const Icon = t.icon;
          const isActive = activeTool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTool(t.id)}
              className={`p-2 rounded-xl flex items-center justify-center transition cursor-pointer ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
              title={t.label}
            >
              <Icon size={16} />
            </button>
          );
        })}

        <div className="w-[1px] h-6 bg-white/15 mx-1" />

        {/* Active Color Preview & Settings toggle */}
        <button
          type="button"
          onClick={() => setExpandedSettings(!expandedSettings)}
          className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 transition cursor-pointer"
          title="Adjust stroke & color"
        >
          <div
            className="w-3.5 h-3.5 rounded-full border border-white/40"
            style={{ backgroundColor: toolColor }}
          />
          {expandedSettings ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>

        {/* Close toolbar */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition cursor-pointer ml-1"
            title="Hide Annotation Tools"
          >
            <X size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
