"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Play, Bookmark, Star, Clock, Calendar, Globe,
  CheckCircle2, AlertTriangle, Trash2, Edit3, HardDrive,
  Sparkles, ExternalLink, RefreshCw, Share2, Server,
  ChevronDown, Check, Tv, Users, Video, Image as ImageIcon,
  ChevronRight, X, Maximize2, Loader2, Copy, CheckCheck,
  Info, MoreVertical, DollarSign, CreditCard, Eye, Plus, Film
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalWatchlistItem, upsertLocalWatchlist, deleteLocalWatchlist,
  getUserId
} from '../utils/localStore';
import { toFanartBigPreview, toFanartFull } from '../lib/fanartUtils';
import EditWatchlistModal from '../components/EditWatchlistModal';
import TransferWatchlistModal from '../components/TransferWatchlistModal';

function GalleryImageCard({
  img,
  type,
  title,
  onClick,
  onOpenArtworkModal,
  isCurrentPoster,
  isCurrentBackdrop,
  isCurrentLogo,
}) {
  const [loaded, setLoaded] = useState(false);
  const isPoster = type === 'posters' || img.mediaType === 'poster';
  const isLogo = type === 'logos' || img.mediaType === 'logo';
  const isBackdrop = type === 'backdrops' || img.mediaType === 'backdrop' || (!isPoster && !isLogo);
  const canSetArtwork = isPoster || isBackdrop || isLogo;

  const displaySrc = img.url?.includes('fanart.tv')
    ? (isLogo ? toFanartBigPreview(img.url) : img.url)
    : img.url;

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-2xl bg-[#0e131f] border border-white/10 group cursor-pointer transition-all duration-300 hover:border-amber-500/50 hover:shadow-xl hover:shadow-black/70 ${
        isPoster ? 'aspect-[2/3]' : isLogo ? 'aspect-[16/9] p-3 flex items-center justify-center bg-black/40' : 'aspect-[16/9]'
      }`}
    >
      {!loaded && (
        <div className="absolute inset-0 bg-white/[0.04] animate-pulse flex items-center justify-center">
          <Loader2 size={16} className="text-gray-600 animate-spin" />
        </div>
      )}
      <img
        src={displaySrc}
        alt={title}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full h-full ${isLogo ? 'object-contain' : 'object-cover'} group-hover:scale-105 transition-all duration-500 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Active Badges */}
      {isCurrentPoster && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-emerald-400/30">
          <Check size={10} /> Active Poster
        </div>
      )}
      {isCurrentBackdrop && !isCurrentPoster && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-amber-500/90 text-black text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-amber-300/30">
          <Check size={10} /> Active Backdrop
        </div>
      )}
      {isCurrentLogo && !isCurrentPoster && !isCurrentBackdrop && (
        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-md bg-purple-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow-lg backdrop-blur-sm border border-purple-400/30">
          <Check size={10} /> Active Logo
        </div>
      )}

      {/* Hover bottom gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

      {/* Bottom Left Dimensions Badge */}
      <div className="absolute bottom-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] text-gray-200 font-mono flex items-center gap-1 border border-white/10 shadow">
          <Maximize2 size={10} className="text-amber-400" />
          {img.width && img.height ? `${img.width}×${img.height}` : 'Preview'}
        </span>
      </div>

      {/* 3-Dot Action Button */}
      {canSetArtwork && onOpenArtworkModal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenArtworkModal({ ...img, isPoster, isBackdrop, isLogo });
          }}
          className="absolute bottom-2 right-2 z-20 p-1.5 rounded-lg bg-black/75 hover:bg-amber-500 hover:text-black border border-white/20 text-gray-200 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-95 group-hover:scale-105"
          title="Set Artwork..."
        >
          <MoreVertical size={13} />
        </button>
      )}
    </div>
  );
}

export default function WatchlistDetail({ watchlistId, onBack }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || getUserId();

  const [item, setItem] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWatchlistItem(watchlistId);
    }
    return null;
  });
  const [loading, setLoading] = useState(!item);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [artworkTargetImage, setArtworkTargetImage] = useState(null);
  const [imageTab, setImageTab] = useState('all');

  // Horizontal scroll refs
  const castScrollRef = useRef(null);
  const videosScrollRef = useRef(null);

  const scrollCast = (direction) => {
    if (castScrollRef.current) {
      const { scrollLeft, clientWidth } = castScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      castScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  const scrollVideos = (direction) => {
    if (videosScrollRef.current) {
      const { scrollLeft, clientWidth } = videosScrollRef.current;
      const scrollAmount = direction === 'left' ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75;
      videosScrollRef.current.scrollTo({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Load / Sync Item
  useEffect(() => {
    let isMounted = true;
    async function loadItem() {
      // 1. Local
      const local = getLocalWatchlistItem(watchlistId);
      if (local && isMounted) {
        setItem(local);
        setLoading(false);
      }

      // 2. Firestore
      if (db && userId) {
        try {
          const docRef = doc(db, 'users', userId, 'watchlist', watchlistId);
          const snap = await getDoc(docRef);
          if (snap.exists() && isMounted) {
            const data = { id: snap.id, userId, ...snap.data() };
            setItem(data);
            upsertLocalWatchlist(data);
            setLoading(false);
          }
        } catch (err) {
          console.warn('Watchlist fetch error:', err);
          if (isMounted) setLoading(false);
        }
      } else {
        if (isMounted) setLoading(false);
      }
    }

    loadItem();
    return () => { isMounted = false; };
  }, [watchlistId, userId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#07090f] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 size={32} className="text-amber-400 animate-spin" />
        <span className="text-xs text-gray-400 font-mono">Loading Watchlist Item...</span>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#07090f] text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
          <Bookmark size={32} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white">Watchlist Item Not Found</h2>
          <p className="text-xs text-gray-400 mt-1 max-w-sm">
            This item may have been transferred to your active library or deleted.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack || (() => router.push('/watchlist'))}
          className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
        >
          Back to Watchlist
        </button>
      </div>
    );
  }

  const isCompleted = item.status === 'Completed';
  const backdrop = item.backdropUrl || item.posterUrl || null;

  // Artwork assignment
  const handleSetArtwork = async (target, type) => {
    if (!item || !target?.url) return;
    const updated = { ...item };
    if (type === 'poster') updated.posterUrl = target.url;
    if (type === 'backdrop') updated.backdropUrl = target.url;
    if (type === 'logo') updated.logoUrl = target.url;

    setItem(updated);
    upsertLocalWatchlist(updated);
    if (db && userId) {
      try {
        await updateDoc(doc(db, 'users', userId, 'watchlist', item.id), {
          posterUrl: updated.posterUrl,
          backdropUrl: updated.backdropUrl,
          logoUrl: updated.logoUrl,
          updatedAt: new Date().toISOString(),
        });
      } catch (e) {
        console.error(e);
      }
    }
    setArtworkTargetImage(null);
  };

  // Toggle status
  const handleToggleCompleted = async () => {
    const newStatus = isCompleted ? 'Plan to Watch' : 'Completed';
    const updated = { ...item, status: newStatus, updatedAt: new Date().toISOString() };
    setItem(updated);
    upsertLocalWatchlist(updated);
    if (db && userId) {
      try {
        await updateDoc(doc(db, 'users', userId, 'watchlist', item.id), { status: newStatus });
      } catch (e) {
        console.error(e);
      }
    }
  };

  // Delete
  const handleDelete = async () => {
    deleteLocalWatchlist(item.id);
    if (db && userId) {
      try {
        await deleteDoc(doc(db, 'users', userId, 'watchlist', item.id));
      } catch (e) {
        console.error(e);
      }
    }
    router.push('/watchlist');
  };

  // Images list
  const allImages = useMemo(() => {
    const list = [];
    (item.images?.backdrops || []).forEach(b => list.push({ ...b, mediaType: 'backdrop' }));
    (item.images?.posters || []).forEach(p => list.push({ ...p, mediaType: 'poster' }));
    (item.images?.logos || []).forEach(l => list.push({ ...l, mediaType: 'logo' }));
    (item.images?.artworks || []).forEach(a => list.push({ ...a, mediaType: 'artwork' }));
    return list;
  }, [item.images]);

  const displayedImages = useMemo(() => {
    if (imageTab === 'backdrops') return item.images?.backdrops || [];
    if (imageTab === 'posters') return item.images?.posters || [];
    if (imageTab === 'logos') return item.images?.logos || [];
    if (imageTab === 'artworks') return item.images?.artworks || [];
    return allImages;
  }, [imageTab, allImages, item.images]);

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col relative pb-20 overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* ── Ambient Backdrop Image Layer ── */}
      {backdrop && (
        <div className="absolute top-0 inset-x-0 h-[480px] sm:h-[560px] pointer-events-none overflow-hidden z-0">
          <img
            src={backdrop}
            alt={item.title}
            className="w-full h-full object-cover object-top filter brightness-[0.38] blur-[1px] scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07090f] via-[#07090f]/75 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#07090f]/80" />
        </div>
      )}

      {/* ── Transparent Top Header ── */}
      <header className="relative z-30 h-14 md:h-16 px-4 md:px-8 flex items-center justify-between bg-transparent">
        <button
          type="button"
          onClick={onBack || (() => router.push('/watchlist'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-200 hover:text-white text-xs font-semibold backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          <ChevronLeft size={16} />
          <span>Watchlist</span>
        </button>

        <div className="flex items-center gap-2">
          {/* Transfer to Main Library Button */}
          <button
            type="button"
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black text-xs font-extrabold shadow-lg cursor-pointer transition active:scale-95"
            title="Link PC media and transfer to main library"
          >
            <HardDrive size={14} />
            <span>Transfer to Library</span>
          </button>

          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-300 hover:text-white text-xs font-bold backdrop-blur-md transition cursor-pointer shadow-lg"
          >
            <Edit3 size={14} />
            <span className="hidden sm:inline">Edit</span>
          </button>

          <button
            type="button"
            onClick={handleToggleCompleted}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md transition cursor-pointer shadow-lg ${
              isCompleted
                ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/35'
                : 'bg-black/40 border-white/15 text-gray-300 hover:text-white'
            }`}
          >
            <CheckCircle2 size={14} className={isCompleted ? 'text-emerald-400' : ''} />
            <span>{isCompleted ? 'Completed' : 'Mark Completed'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 transition cursor-pointer shadow-lg"
            title="Remove from Watchlist"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* ── Hero Banner (Poster + Details) ── */}
      <div className="relative z-10 max-w-6xl w-full mx-auto px-4 md:px-6 pt-2 pb-8 sm:pb-10 border-b border-white/5">
        <div className="flex flex-col sm:flex-row gap-6 md:gap-8 items-start">
          {/* Poster Card */}
          <div className="hidden sm:block relative w-44 sm:w-52 md:w-60 shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden glass-card border border-white/15 shadow-2xl bg-[#0d1117] group">
            {item.posterUrl ? (
              <img
                src={item.posterUrl}
                alt={item.title}
                className="w-full h-auto aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full aspect-[2/3] flex flex-col items-center justify-center text-amber-400/80 bg-gradient-to-br from-amber-950/30 to-black gap-2">
                <Bookmark size={44} />
                <span className="text-[10px] font-mono uppercase tracking-wider">No Poster</span>
              </div>
            )}

            {/* Poster Badges */}
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
              {item.rating > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-amber-300 font-bold text-xs flex items-center gap-1 shadow">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {item.rating}
                </span>
              )}
            </div>

            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-black font-extrabold text-[9px] shadow uppercase tracking-wider">
              {item.contentType}
            </div>
          </div>

          {/* Details & Actions Area */}
          <div className="flex-1 space-y-4 w-full">
            <div>
              {/* Type / Year / Rating pills */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  {item.contentType}
                </span>
                {item.rating > 0 && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-black/60 border border-white/15 text-amber-300 text-[10px] font-bold flex items-center gap-1 sm:hidden">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    {item.rating}
                  </span>
                )}
                {item.year && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/10 border border-white/10 text-gray-300 text-[10px] font-mono font-bold">
                    {item.year}
                  </span>
                )}
                {item.releaseDate && (
                  <span className="px-2.5 py-0.5 rounded-lg bg-white/10 border border-white/10 text-gray-300 text-[10px] font-mono font-bold flex items-center gap-1">
                    <Calendar size={11} className="text-gray-400" />
                    {item.releaseDate}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-[10px] font-bold uppercase">
                  {item.status || 'Plan to Watch'}
                </span>
              </div>

              {/* Title Art / Logo OR Text Title */}
              {item.logoUrl ? (
                <div className="py-1 max-w-md">
                  <img
                    src={toFanartBigPreview(item.logoUrl)}
                    alt={item.title}
                    className="max-h-20 w-auto object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]"
                  />
                  <h2 className="text-xs text-gray-400 mt-1 font-semibold">{item.title}</h2>
                </div>
              ) : (
                <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-white tracking-tight drop-shadow-md">
                  {item.title}
                </h1>
              )}

              {item.originalTitle && item.originalTitle !== item.title && (
                <p className="text-xs sm:text-sm text-gray-400 mt-1 italic">
                  {item.originalTitle}
                </p>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Transfer to Main Library Primary Button */}
                <button
                  type="button"
                  onClick={() => setShowTransferModal(true)}
                  className="px-5 py-2.5 sm:px-6 sm:py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-black font-black text-sm flex items-center gap-2 cursor-pointer shadow-lg active:scale-95 transition"
                >
                  <HardDrive size={18} />
                  <span>Transfer to Local Library</span>
                </button>

                {/* Trailer Button */}
                {item.videos?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveVideo(item.videos[0])}
                    className="px-4 py-2.5 sm:py-3 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 hover:text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition"
                  >
                    <Play size={15} fill="currentColor" />
                    <span>Watch Trailer</span>
                  </button>
                )}

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="px-4 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                >
                  <Edit3 size={14} />
                  <span>Edit Details</span>
                </button>
              </div>

              {/* Streaming Availability Quick Indicator */}
              {item.streamProviders && (
                <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                  <span className="text-gray-400 font-semibold flex items-center gap-1">
                    <Globe size={13} className="text-cyan-400" /> Available on:
                  </span>
                  {/* Need Plan */}
                  {item.streamProviders.needPlan?.map((p, idx) => (
                    <span key={`plan-${idx}`} className="px-2 py-0.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 font-bold text-[11px] flex items-center gap-1">
                      {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-3.5 h-3.5 rounded object-cover" />}
                      <span>{p.name}</span>
                    </span>
                  ))}
                  {/* Free */}
                  {item.streamProviders.free?.map((p, idx) => (
                    <span key={`free-${idx}`} className="px-2 py-0.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 font-bold text-[11px] flex items-center gap-1">
                      {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-3.5 h-3.5 rounded object-cover" />}
                      <span>{p.name} (Free)</span>
                    </span>
                  ))}
                  {/* Rent */}
                  {item.streamProviders.rent?.map((p, idx) => (
                    <span key={`rent-${idx}`} className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 font-bold text-[11px] flex items-center gap-1">
                      {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-3.5 h-3.5 rounded object-cover" />}
                      <span>{p.name} (Rent)</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Genres */}
            {Array.isArray(item.genres) && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {item.genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300 text-xs font-semibold"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Detail Sections ── */}
      <div className="relative z-20 max-w-6xl w-full mx-auto px-4 md:px-6 pt-6 sm:pt-8 pb-16 space-y-10">
        
        {/* 1. Overview & Storyline */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles size={17} className="text-amber-400" /> Overview & Storyline
            </h2>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="text-xs text-gray-400 hover:text-amber-300 transition flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 cursor-pointer"
            >
              <Edit3 size={12} />
              <span>Edit Details</span>
            </button>
          </div>
          <p className="text-sm sm:text-base md:text-lg text-gray-200/90 leading-relaxed font-normal max-w-4xl selection:bg-amber-500/30">
            {item.overview || item.description || "No overview available for this watchlist item yet."}
          </p>
        </section>

        {/* 2. WHERE TO WATCH & STREAM (Detailed Categorized Panel as requested) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Globe size={17} className="text-cyan-400" /> Where to Watch & Stream
            </h2>
            <button
              type="button"
              onClick={() => setShowEditModal(true)}
              className="text-xs text-cyan-400 hover:text-cyan-300 transition flex items-center gap-1 cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Stream Links</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            {/* Category 1: Need Plan / Subscription */}
            <div className="p-4 rounded-2xl bg-purple-500/5 border border-purple-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-purple-300 flex items-center gap-1.5">
                  <CreditCard size={14} /> Need Plan (Sub)
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
                  {item.streamProviders?.needPlan?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {(!item.streamProviders?.needPlan || item.streamProviders.needPlan.length === 0) ? (
                  <p className="text-gray-500 text-[11px] italic">No subscription services listed</p>
                ) : (
                  item.streamProviders.needPlan.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded-lg object-cover shrink-0" />}
                        <span className="font-bold text-white text-xs truncate">{p.name}</span>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-purple-400 hover:text-purple-300 p-1">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Category 2: Rent */}
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-amber-300 flex items-center gap-1.5">
                  <DollarSign size={14} /> Rent
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold">
                  {item.streamProviders?.rent?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {(!item.streamProviders?.rent || item.streamProviders.rent.length === 0) ? (
                  <p className="text-gray-500 text-[11px] italic">No rental platforms listed</p>
                ) : (
                  item.streamProviders.rent.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded-lg object-cover shrink-0" />}
                        <span className="font-bold text-white text-xs truncate">{p.name}</span>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-amber-400 hover:text-amber-300 p-1">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Category 3: Buy */}
            <div className="p-4 rounded-2xl bg-blue-500/5 border border-blue-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-blue-300 flex items-center gap-1.5">
                  <DollarSign size={14} /> Buy
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 font-bold">
                  {item.streamProviders?.buy?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {(!item.streamProviders?.buy || item.streamProviders.buy.length === 0) ? (
                  <p className="text-gray-500 text-[11px] italic">No buy platforms listed</p>
                ) : (
                  item.streamProviders.buy.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded-lg object-cover shrink-0" />}
                        <span className="font-bold text-white text-xs truncate">{p.name}</span>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 p-1">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Category 4: Free to Watch */}
            <div className="p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/20 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-emerald-300 flex items-center gap-1.5">
                  <Eye size={14} /> Free to Watch
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                  {item.streamProviders?.free?.length || 0}
                </span>
              </div>
              <div className="space-y-2">
                {(!item.streamProviders?.free || item.streamProviders.free.length === 0) ? (
                  <p className="text-gray-500 text-[11px] italic">No free streams listed</p>
                ) : (
                  item.streamProviders.free.map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-black/40 border border-white/5">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.logoUrl && <img src={p.logoUrl} alt={p.name} className="w-5 h-5 rounded-lg object-cover shrink-0" />}
                        <span className="font-bold text-white text-xs truncate">{p.name}</span>
                      </div>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:text-emerald-300 p-1">
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 3. Cast & Actors / Voice Cast (Photos w300 for TMDB, bigpreview for Fanart) */}
        {item.cast && item.cast.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Users size={17} className="text-amber-400" /> Cast & Actors
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollCast('left')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollCast('right')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div
              ref={castScrollRef}
              className="flex items-stretch gap-3 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
            >
              {item.cast.map((actor, idx) => {
                // Ensure profile photo uses w300 for TMDB and bigpreview for Fanart as requested
                let photo = actor.profileUrl;
                if (photo && photo.includes('fanart.tv')) {
                  photo = toFanartBigPreview(photo);
                } else if (photo && photo.includes('image.tmdb.org') && !photo.includes('/w300')) {
                  photo = photo.replace(/\/p\/(?:w500|original|w185)\//, '/p/w300/');
                }

                return (
                  <div
                    key={`actor-${actor.id || idx}`}
                    className="w-28 sm:w-32 shrink-0 group flex flex-col cursor-default"
                  >
                    <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-[#111827] border border-white/10 group-hover:border-amber-500/50 shadow-lg relative transition-all duration-300 group-hover:scale-[1.03]">
                      {photo ? (
                        <img
                          src={photo}
                          alt={actor.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-tr from-[#1f1b2e] to-[#0f172a] text-amber-400/60 p-2 text-center">
                          <Users size={28} className="mb-1 text-gray-500" />
                          <span className="text-[9px] font-bold text-gray-400">No Photo</span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 px-1 text-left">
                      <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={actor.name}>
                        {actor.name}
                      </h4>
                      {actor.character && (
                        <p className="text-[10px] text-amber-300/80 truncate mt-0.5 font-medium" title={actor.character}>
                          {actor.character}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 4. Videos & Trailers (Click to play in modal) */}
        {item.videos && item.videos.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Video size={17} className="text-rose-400" /> Videos & Trailers
              </h2>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => scrollVideos('left')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollVideos('right')}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 transition cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div
              ref={videosScrollRef}
              className="flex items-stretch gap-4 overflow-x-auto no-scrollbar scroll-smooth py-1 px-0.5"
            >
              {item.videos.map((vid, idx) => (
                <div
                  key={vid.id || vid.key || idx}
                  onClick={() => setActiveVideo(vid)}
                  className="w-64 sm:w-72 shrink-0 group cursor-pointer rounded-2xl overflow-hidden bg-[#0e131f] border border-white/10 hover:border-amber-500/50 shadow-xl transition-all duration-300 hover:scale-[1.02]"
                >
                  <div className="aspect-[16/9] relative overflow-hidden bg-black/60">
                    <img
                      src={`https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`}
                      alt={vid.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition-colors flex items-center justify-center">
                      <div className="w-11 h-11 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-2xl group-hover:scale-110 group-hover:bg-red-500 transition-all">
                        <Play size={18} fill="currentColor" className="ml-0.5" />
                      </div>
                    </div>
                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-300 border border-white/15">
                        {vid.type || 'Trailer'}
                      </span>
                    </div>
                  </div>
                  <div className="p-3">
                    <h4 className="text-xs font-bold text-white truncate group-hover:text-amber-300 transition-colors" title={vid.name}>
                      {vid.name}
                    </h4>
                    <p className="text-[10px] text-gray-400 mt-0.5">Click to play video</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. More Images & Artwork (Posters, Backdrops, Logos, Artworks) */}
        {allImages.length > 0 && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <ImageIcon size={17} className="text-cyan-400" /> More Images & Artwork
              </h2>

              {/* Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'All Images', count: allImages.length },
                  { id: 'backdrops', label: 'Backdrops', count: item.images?.backdrops?.length || 0 },
                  { id: 'posters', label: 'Posters', count: item.images?.posters?.length || 0 },
                  { id: 'logos', label: 'Logos', count: item.images?.logos?.length || 0 },
                  { id: 'artworks', label: 'Artworks', count: item.images?.artworks?.length || 0 },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setImageTab(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                      imageTab === tab.id
                        ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20'
                        : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${imageTab === tab.id ? 'bg-black/20 text-black' : 'bg-white/10 text-gray-300'}`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Images Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {displayedImages.map((img, idx) => (
                <GalleryImageCard
                  key={`${img.url}-${idx}`}
                  img={img}
                  type={imageTab}
                  title={item.title}
                  onClick={() => setPreviewImage(img)}
                  onOpenArtworkModal={(targetImg) => setArtworkTargetImage(targetImg)}
                  isCurrentPoster={item.posterUrl === img.url}
                  isCurrentBackdrop={item.backdropUrl === img.url}
                  isCurrentLogo={item.logoUrl === img.url}
                />
              ))}
            </div>
          </section>
        )}

        {/* 6. Media Information & Credits Grid */}
        <section className="space-y-4 pt-2">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-400 flex items-center gap-2">
            <Info size={15} className="text-amber-400" /> Media Information
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Content Type</span>
              <span className="font-semibold text-white uppercase">{item.contentType}</span>
            </div>
            {item.releaseDate && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Release Date</span>
                <span className="font-semibold text-white">{item.releaseDate}</span>
              </div>
            )}
            <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
              <span className="text-[10px] uppercase font-bold text-gray-400 block">Watchlist Status</span>
              <span className="font-semibold text-amber-400">{item.status || 'Plan to Watch'}</span>
            </div>
            {item.rating > 0 && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Rating</span>
                <span className="font-semibold text-white">★ {item.rating} / 10</span>
              </div>
            )}
            {item.genres && item.genres.length > 0 && (
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-white/5 space-y-1 col-span-2">
                <span className="text-[10px] uppercase font-bold text-gray-400 block">Genres</span>
                <span className="font-semibold text-gray-200">{item.genres.join(', ')}</span>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── Modals ── */}
      <EditWatchlistModal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        item={item}
        onSave={(updated) => {
          setItem(updated);
          upsertLocalWatchlist(updated);
        }}
      />

      <TransferWatchlistModal
        isOpen={showTransferModal}
        onClose={() => setShowTransferModal(false)}
        item={item}
        onTransferred={() => {
          // Navigated to library inside transfer modal
        }}
      />

      {/* YouTube Player Modal */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-4xl bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/10">
            <div className="p-3 bg-[#111827] flex items-center justify-between border-b border-white/10">
              <span className="text-xs font-bold text-white truncate max-w-md">{activeVideo.name}</span>
              <button onClick={() => setActiveVideo(null)} className="p-1 rounded-lg text-gray-400 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${activeVideo.key}?autoplay=1`}
                title={activeVideo.name}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <div
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md cursor-pointer"
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <img src={previewImage.fullUrl || previewImage.url} alt="Artwork" className="max-w-full max-h-[85vh] object-contain rounded-2xl" />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/70 text-white hover:bg-black"
            >
              <X size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Artwork 3-Dot Action Modal */}
      {artworkTargetImage && (
        <div
          onClick={() => setArtworkTargetImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm bg-[#0e1320] border border-white/15 rounded-2xl p-5 space-y-4 shadow-2xl"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <ImageIcon size={16} className="text-amber-400" />
              Set Artwork as...
            </h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleSetArtwork(artworkTargetImage, 'poster')}
                className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center justify-between transition cursor-pointer"
              >
                <span>Set as Poster</span>
                {item.posterUrl === artworkTargetImage.url && <Check size={14} className="text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => handleSetArtwork(artworkTargetImage, 'backdrop')}
                className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center justify-between transition cursor-pointer"
              >
                <span>Set as Backdrop Banner</span>
                {item.backdropUrl === artworkTargetImage.url && <Check size={14} className="text-emerald-400" />}
              </button>
              <button
                type="button"
                onClick={() => handleSetArtwork(artworkTargetImage, 'logo')}
                className="w-full p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-left text-xs font-bold text-white flex items-center justify-between transition cursor-pointer"
              >
                <span>Set as Title Logo Art</span>
                {item.logoUrl === artworkTargetImage.url && <Check size={14} className="text-emerald-400" />}
              </button>
            </div>
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setArtworkTargetImage(null)}
                className="px-3 py-1.5 rounded-xl bg-white/10 text-gray-300 text-xs font-bold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="bg-[#0f1422] border border-white/10 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-400" /> Remove from Watchlist?
            </h3>
            <p className="text-xs text-gray-300">
              Are you sure you want to remove <span className="text-white font-bold">{item.title}</span> from your watchlist?
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
