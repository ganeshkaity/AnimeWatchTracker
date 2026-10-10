"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal, X, Search, Check, CheckCircle2,
  AlertTriangle, Loader2, Sparkles, Tv, FileVideo,
  Layers, RefreshCw, ChevronDown, RotateCcw, Link2, Info
} from 'lucide-react';

/**
 * Searchable Combobox Dropdown for selecting online fetched episode
 */
function SearchableEpisodeSelect({
  value, // { seasonNumber, episodeNumber, title, code, label }
  options, // allFetchedEpisodes list
  onSelect,
  placeholder = "Select Episode",
  isOpen: controlledIsOpen,
  onToggle: controlledOnToggle,
}) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = typeof controlledIsOpen === 'boolean';
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;
  const setIsOpen = (next) => {
    if (isControlled) {
      if (controlledOnToggle) controlledOnToggle(next);
    } else {
      setInternalIsOpen(next);
    }
  };

  const [query, setQuery] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Check available space below to decide if opening upward
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < 320 && rect.top > 260) {
        setOpenUpward(true);
      } else {
        setOpenUpward(false);
      }
    }
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(opt =>
      opt.code.toLowerCase().includes(q) ||
      opt.title.toLowerCase().includes(q) ||
      opt.label.toLowerCase().includes(q) ||
      String(opt.episodeNumber).includes(q)
    );
  }, [options, query]);

  const handleChoose = (opt) => {
    onSelect(opt);
    setIsOpen(false);
    setQuery('');
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  const handleUnassign = (e) => {
    e.stopPropagation();
    onSelect(null);
    setIsOpen(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1200);
  };

  return (
    <div
      className={`relative min-w-[200px] sm:min-w-[260px] max-w-full ${isOpen ? 'z-[999999]' : 'z-auto'}`}
      style={{ zIndex: isOpen ? 999999 : 'auto' }}
      ref={containerRef}
    >
      {/* Trigger Button */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 cursor-pointer transition select-none ${
          isOpen
            ? 'bg-purple-500/20 border-purple-400 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)]'
            : value
              ? 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-white'
              : 'bg-white/[0.02] hover:bg-white/[0.05] border-dashed border-white/15 text-gray-400'
        }`}
      >
        <div className="flex items-center gap-2 truncate">
          {savedFlash ? (
            <span className="text-emerald-400 font-bold flex items-center gap-1 animate-pulse">
              <CheckCircle2 size={13} /> Saved
            </span>
          ) : value ? (
            <>
              <span className="px-2 py-0.5 rounded-md bg-purple-500/25 border border-purple-500/35 text-purple-300 font-mono font-bold text-[10px] shrink-0">
                {value.code}
              </span>
              <span className="truncate font-medium text-gray-200">
                {value.title}
              </span>
            </>
          ) : (
            <span className="text-gray-400 italic text-[11px]">{placeholder}</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-gray-400">
          {value && (
            <button
              type="button"
              onClick={handleUnassign}
              className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-red-400 transition"
              title="Unassign"
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-180 text-purple-400' : ''}`} />
        </div>
      </div>

      {/* Dropdown Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: openUpward ? 6 : -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: openUpward ? 6 : -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            style={{ zIndex: 999999 }}
            className={`absolute right-0 left-auto w-[290px] sm:w-[360px] max-w-[calc(100vw-3rem)] z-[999999] bg-[#0c101d] border border-white/25 rounded-2xl shadow-[0_25px_80px_rgba(0,0,0,0.98)] overflow-hidden backdrop-blur-2xl ${
              openUpward ? 'bottom-full mb-2' : 'top-full mt-2'
            }`}
          >
            {/* Search Input */}
            <div className="p-2.5 border-b border-white/10 bg-white/[0.04] relative z-[999999]">
              <div className="relative z-[999999]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Type S02E12, number, or name..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-8 pr-7 py-2 rounded-xl bg-black/70 border border-white/15 text-xs text-white placeholder-gray-400 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400 relative z-[999999]"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white z-20 p-1"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto p-1.5 space-y-0.5 custom-scrollbar text-xs relative z-[999999]">
              <button
                type="button"
                onClick={() => handleChoose(null)}
                className="w-full px-3 py-2 rounded-lg text-left text-gray-400 hover:text-red-300 hover:bg-red-500/10 flex items-center gap-2 transition cursor-pointer"
              >
                <X size={12} className="text-red-400" />
                <span>Unassign (Leave empty)</span>
              </button>

              {filtered.length === 0 ? (
                <div className="py-4 text-center text-gray-500 text-xs">
                  No matching episodes found
                </div>
              ) : (
                filtered.map((opt) => {
                  const isSelected = value && value.code === opt.code;
                  return (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => handleChoose(opt)}
                      className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2 transition cursor-pointer ${
                        isSelected
                          ? 'bg-purple-500/20 text-white font-bold border border-purple-500/30'
                          : 'hover:bg-white/5 text-gray-300 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-white/10 text-purple-300 shrink-0">
                          {opt.code}
                        </span>
                        <span className="truncate">{opt.title}</span>
                      </div>
                      {isSelected && <Check size={14} className="text-purple-400 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function AssignEpisodesModal({
  isOpen,
  onClose,
  media, // anime or webseries
  localEpisodes = [],
  onlineSeasons = [],
  onSaveAssignments,
  onFetchOnlineSeasons,
  fetchingOnline = false,
}) {
  const [assignMode, setAssignMode] = useState('auto');
  const [assignments, setAssignments] = useState({});
  const [searchFilter, setSearchFilter] = useState('');
  const [openDropdownEpId, setOpenDropdownEpId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // 1. Flatten all online fetched episodes
  const allFetchedEpisodes = useMemo(() => {
    const list = [];
    (onlineSeasons || []).forEach((s) => {
      const sNum = Number(s.seasonNumber || 1);
      (s.episodes || []).forEach((ep) => {
        const eNum = Number(ep.episodeNumber || 1);
        const sPadded = String(sNum).padStart(2, '0');
        const ePadded = String(eNum).padStart(2, '0');
        const code = `S${sPadded}E${ePadded}`;
        const title = ep.name || ep.title || `Episode ${eNum}`;
        list.push({
          seasonNumber: sNum,
          episodeNumber: eNum,
          code,
          title,
          label: `${code} : ${title}`,
          stillUrl: ep.stillUrl || (ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : null),
        });
      });
    });
    return list;
  }, [onlineSeasons]);

  // 2. Initialize assignments on open
  useEffect(() => {
    if (!isOpen) return;

    const initialMode = media?.assignMode || 'auto';
    setAssignMode(initialMode);

    const initialMap = {};
    (localEpisodes || []).forEach((ep) => {
      const sNum = ep.seasonNumber || 1;
      const eNum = ep.episodeNumber || 1;
      const sPadded = String(sNum).padStart(2, '0');
      const ePadded = String(eNum).padStart(2, '0');
      const code = `S${sPadded}E${ePadded}`;

      // Find if matches an online episode
      const matched = allFetchedEpisodes.find(
        (o) => o.seasonNumber === sNum && o.episodeNumber === eNum
      );

      if (ep.customAssigned || initialMode === 'custom') {
        initialMap[ep.id] = matched || {
          seasonNumber: sNum,
          episodeNumber: eNum,
          code,
          title: ep.assignedName || ep.episodeTitle || ep.fileName,
          label: `${code} : ${ep.assignedName || ep.episodeTitle || ep.fileName}`,
        };
      } else if (matched) {
        initialMap[ep.id] = matched;
      }
    });

    setAssignments(initialMap);
  }, [isOpen, media, localEpisodes, allFetchedEpisodes]);

  if (!isOpen) return null;

  // Filter local files for display
  const filteredLocalEpisodes = (localEpisodes || []).filter((ep) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.trim().toLowerCase();
    return (
      (ep.fileName || '').toLowerCase().includes(q) ||
      (ep.filePath || '').toLowerCase().includes(q)
    );
  });

  const assignedCount = Object.values(assignments).filter(Boolean).length;

  // Handle single item change
  const handleSelectEpisode = (epId, selectedOpt) => {
    setAssignments((prev) => {
      const next = { ...prev };
      if (!selectedOpt) {
        delete next[epId];
      } else {
        next[epId] = selectedOpt;
      }
      return next;
    });

    // Auto-sync immediately
    if (assignMode === 'custom' && onSaveAssignments) {
      const updatedEpisodes = localEpisodes.map((ep) => {
        if (ep.id === epId) {
          if (!selectedOpt) {
            return {
              ...ep,
              customAssigned: false,
              assignedName: '',
            };
          }
          return {
            ...ep,
            customAssigned: true,
            seasonNumber: selectedOpt.seasonNumber,
            episodeNumber: selectedOpt.episodeNumber,
            assignedName: selectedOpt.title,
            episodeTitle: selectedOpt.title,
            stillUrl: selectedOpt.stillUrl || ep.stillUrl,
          };
        }
        return ep;
      });

      onSaveAssignments('custom', updatedEpisodes, false);
    }
  };

  // Save All
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      const updatedEpisodes = localEpisodes.map((ep) => {
        const assigned = assignments[ep.id];
        if (assignMode === 'custom') {
          if (assigned) {
            return {
              ...ep,
              customAssigned: true,
              seasonNumber: assigned.seasonNumber,
              episodeNumber: assigned.episodeNumber,
              assignedName: assigned.title,
              episodeTitle: assigned.title,
              stillUrl: assigned.stillUrl || ep.stillUrl,
            };
          } else {
            return {
              ...ep,
              customAssigned: false,
              assignedName: '',
            };
          }
        } else {
          // Auto assign mode: clear custom override flag
          return {
            ...ep,
            customAssigned: false,
          };
        }
      });

      if (onSaveAssignments) {
        await onSaveAssignments(assignMode, updatedEpisodes, true);
      }
      setToastMessage('Assignments saved successfully!');
      setTimeout(() => setToastMessage(''), 2500);
      onClose();
    } catch (err) {
      console.error('Save assignments error:', err);
      alert('Failed to save assignments: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-4xl bg-[#0c101a] border border-white/15 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-neonCyan/20 to-purple-500/20 border border-white/10 text-neonCyan">
              <SlidersHorizontal size={20} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <span>Assign Episodes</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-white/10 text-purple-300 font-bold">
                  {media?.title || 'Media'}
                </span>
              </h2>
              <p className="text-[11px] text-gray-400">
                Match local files on your PC to fetched online episode titles & metadata
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toggle Assign Mode: Auto vs Custom */}
        <div className="p-5 border-b border-white/10 bg-white/[0.01] space-y-4">
          <div className="flex items-center justify-center sm:justify-start">
            <div className="inline-flex p-1 rounded-2xl bg-black/50 border border-white/10">
              <button
                type="button"
                onClick={() => setAssignMode('auto')}
                className={`px-5 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                  assignMode === 'auto'
                    ? 'bg-gradient-to-r from-neonCyan to-blue-600 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <Sparkles size={14} />
                <span>Auto Assign</span>
              </button>
              <button
                type="button"
                onClick={() => setAssignMode('custom')}
                className={`px-5 py-2 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-2 ${
                  assignMode === 'custom'
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <SlidersHorizontal size={14} />
                <span>Custom Assign</span>
              </button>
            </div>
          </div>

          {assignMode === 'auto' ? (
            <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-200 text-xs flex items-start gap-3">
              <Sparkles size={18} className="text-cyan-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <span className="font-bold text-white block">Automatic Mode Active</span>
                <p className="text-gray-300 leading-relaxed text-[11px]">
                  Local episode files are automatically matched by filenames, season numbers, and folder names. No manual override is applied.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-200 text-xs flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <SlidersHorizontal size={18} className="text-purple-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-white block">Custom Assignment Active</span>
                  <p className="text-gray-300 leading-relaxed text-[11px]">
                    Assign every local file to any fetched online episode. You can search or select from the dropdown for each file below.
                  </p>
                </div>
              </div>
              {allFetchedEpisodes.length === 0 && onFetchOnlineSeasons && (
                <button
                  type="button"
                  onClick={onFetchOnlineSeasons}
                  disabled={fetchingOnline}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw size={12} className={fetchingOnline ? 'animate-spin' : ''} />
                  <span>{fetchingOnline ? 'Fetching...' : 'Fetch Online Episodes'}</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content Body: Local Files List */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar space-y-3 pb-60">
          {/* Search bar & Stats */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-2">
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search local file name..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400"
              />
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-400">
              <span>{localEpisodes.length} local files</span>
              <span>•</span>
              <span className="text-purple-300 font-bold">{assignedCount} assigned</span>
              <span>•</span>
              <span className="text-gray-300">{allFetchedEpisodes.length} online episodes</span>
            </div>
          </div>

          {filteredLocalEpisodes.length === 0 ? (
            <div className="p-8 text-center text-gray-500 text-xs italic bg-white/[0.01] rounded-2xl border border-white/5 space-y-2">
              <FileVideo size={28} className="mx-auto text-gray-600" />
              <p>No local episode files found matching search</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredLocalEpisodes.map((ep, idx) => {
                const assigned = assignments[ep.id];
                const isDropdownOpen = openDropdownEpId === ep.id;
                return (
                  <div
                    key={ep.id}
                    style={{ zIndex: isDropdownOpen ? 99999 : 1 }}
                    className={`relative p-3 sm:p-3.5 rounded-2xl bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isDropdownOpen ? 'z-[99999]' : 'z-[1]'
                    }`}
                  >
                    {/* Left: Local file details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 shrink-0 mt-0.5">
                        <FileVideo size={16} />
                      </div>
                      <div className="min-w-0 space-y-0.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-gray-500 font-bold">
                            #{idx + 1}
                          </span>
                          <h4 className="text-xs font-bold text-white truncate max-w-md" title={ep.fileName}>
                            {ep.fileName}
                          </h4>
                        </div>
                        <p className="text-[10px] font-mono text-gray-400 truncate max-w-sm">
                          {ep.filePath || ep.fileName}
                        </p>
                      </div>
                    </div>

                    {/* Right: Dropdown for Custom Assign or Label for Auto Assign */}
                    <div className="shrink-0 flex items-center justify-end gap-2">
                      {assignMode === 'custom' ? (
                        <SearchableEpisodeSelect
                          value={assigned}
                          options={allFetchedEpisodes}
                          isOpen={isDropdownOpen}
                          onToggle={(nextOpen) => setOpenDropdownEpId(nextOpen ? ep.id : null)}
                          onSelect={(opt) => {
                            handleSelectEpisode(ep.id, opt);
                            setOpenDropdownEpId(null);
                          }}
                          placeholder="Select Online Episode ⌵"
                        />
                      ) : (
                        <div className="px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-gray-300 font-mono text-[11px] flex items-center gap-1.5">
                          <Sparkles size={11} className="text-neonCyan" />
                          <span>
                            S{String(ep.seasonNumber || 1).padStart(2, '0')}E{String(ep.episodeNumber || 1).padStart(2, '0')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] flex items-center justify-between">
          <div className="text-xs text-gray-400">
            {toastMessage && (
              <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                <CheckCircle2 size={14} /> {toastMessage}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-neonCyan hover:from-purple-400 hover:to-neonCyan/90 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg transition cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={14} />
                  <span>Save Assignments</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
