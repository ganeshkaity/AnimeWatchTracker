"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft, Play, Bookmark, Star, Clock, Calendar, Globe,
  CheckCircle2, AlertTriangle, Trash2, Edit3, HardDrive,
  Sparkles, ExternalLink, RefreshCw, Share2, Server,
  ChevronDown, ChevronUp, Check, Tv, Users, Video, Image as ImageIcon,
  ChevronRight, X, Maximize2, Loader2, Copy, CheckCheck,
  Info, MoreVertical, DollarSign, CreditCard, Eye, Plus, Film,
  FolderTree, FolderPlus, Folder, SlidersHorizontal, PlusCircle, CheckSquare,
  Download, Menu
} from 'lucide-react';
import { doc, getDoc, updateDoc, deleteDoc, setDoc, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  getLocalWebseriesItem, upsertLocalWebseries, deleteLocalWebseries,
  getLocalWebseriesEpisodes, setLocalWebseriesEpisodes,
  getUserId
} from '../utils/localStore';
import { toFanartBigPreview, toFanartFull } from '../lib/fanartUtils';
import EditWebseriesModal from '../components/EditWebseriesModal';
import {
  processScannedFiles, sortEpisodes, getSubfolder, extractSeasonNumber,
  NAMING_PATTERNS
} from '../utils/parser';

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const sec = Math.floor(seconds);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatAirDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

function formatRating(rating) {
  if (!rating || rating <= 0) return null;
  return Number(rating).toFixed(1);
}

/**
 * Gallery Image Card (Posters, Backdrops, Logos)
 */
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
        src={img.url}
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

      {/* Bottom Left Dimensions / Preview Badge */}
      <div className="absolute bottom-2 left-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <span className="px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] text-gray-200 font-mono flex items-center gap-1 border border-white/10 shadow">
          <Maximize2 size={10} className="text-amber-400" />
          {img.width && img.height ? `${img.width}×${img.height}` : 'Preview'}
        </span>
      </div>

      {/* Bottom Right 3-Dot Artwork Action Button */}
      {canSetArtwork && onOpenArtworkModal && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onOpenArtworkModal({ ...img, isPoster, isBackdrop, isLogo });
          }}
          className="absolute bottom-2 right-2 z-20 p-1.5 rounded-lg bg-black/75 hover:bg-amber-500 hover:text-black border border-white/20 text-gray-200 shadow-xl backdrop-blur-md transition-all duration-200 cursor-pointer active:scale-95 group-hover:scale-105"
          title={isPoster ? "Set as Poster..." : isLogo ? "Set as Logo..." : "Set as Backdrop..."}
        >
          <MoreVertical size={13} />
        </button>
      )}
    </div>
  );
}

export default function WebseriesDetail({ seriesId, onBack }) {
  const router = useRouter();
  const { currentUser } = useAuth();
  const userId = currentUser?.uid || getUserId();

  const [series, setSeries] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWebseriesItem(seriesId);
    }
    return null;
  });

  const [episodes, setEpisodes] = useState(() => {
    if (typeof window !== 'undefined') {
      return getLocalWebseriesEpisodes(seriesId) || [];
    }
    return [];
  });

  const [loading, setLoading] = useState(!series);

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeVideo, setActiveVideo] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [imageTab, setImageTab] = useState('all');

  // Artwork selection small modal state & saving (Image 2)
  const [artworkTargetImage, setArtworkTargetImage] = useState(null);
  const [artworkSaving, setArtworkSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [showDropdownResume, setShowDropdownResume] = useState(false);

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

  // Overview 400 chars expansion state
  const [isOverviewExpanded, setIsOverviewExpanded] = useState(false);

  // Seasons & Episodes states
  const [activeSeasonNumber, setActiveSeasonNumber] = useState(1);
  const [expandedSeasons, setExpandedSeasons] = useState({});
  const [fetchingSeasons, setFetchingSeasons] = useState(false);
  const [fetchSeasonsSuccess, setFetchSeasonsSuccess] = useState(false);

  // ── MANAGE FOLDER & RESCAN STATES (Images 1 & 2) ──────────────────────────
  const [manageFolderExpanded, setManageFolderExpanded] = useState(true);
  const [selectedNamingPattern, setSelectedNamingPattern] = useState(series?.namingPattern || 'Auto');
  const [showFileManagerModal, setShowFileManagerModal] = useState(false);
  const [fmTree, setFmTree] = useState(null);
  const [fmCurrentPath, setFmCurrentPath] = useState('');
  const [fmLoading, setFmLoading] = useState(false);

  // Rescan Modal (Image 2)
  const [showRescanModal, setShowRescanModal] = useState(false);
  const [rescanStatus, setRescanStatus] = useState('idle'); // idle | scanning | preview | applying | completed | error
  const [rescanMessage, setRescanMessage] = useState('');
  const [rescanDiff, setRescanDiff] = useState(null);
  const [rescanSyncMode, setRescanSyncMode] = useState('normal'); // 'normal' | 'new_only' | 'deleted_only' | 'custom'
  const [rescanDetailsFilter, setRescanDetailsFilter] = useState('all'); // 'all' | 'new' | 'removed'
  const [selectedNewEpIds, setSelectedNewEpIds] = useState(new Set());
  const [selectedRemovedEpIds, setSelectedRemovedEpIds] = useState(new Set());

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  };

  // Artwork Changers (Poster, Backdrop, Logo)
  const handleSetBackdrop = async (imageUrl) => {
    if (!series || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...series,
        backdropUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setSeries(updated);
      upsertLocalWebseries(updated);
      if (db && userId) {
        await updateDoc(doc(db, 'users', userId, 'webseries', series.id), {
          backdropUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => console.warn('Firestore update backdrop error:', err));
      }
      setArtworkTargetImage(null);
      showToast('Web-series backdrop updated!');
    } catch (err) {
      console.error('[WebseriesDetail] handleSetBackdrop error:', err);
      alert('Failed to set backdrop: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleSetPoster = async (imageUrl) => {
    if (!series || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...series,
        posterUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setSeries(updated);
      upsertLocalWebseries(updated);
      if (db && userId) {
        await updateDoc(doc(db, 'users', userId, 'webseries', series.id), {
          posterUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => console.warn('Firestore update poster error:', err));
      }
      setArtworkTargetImage(null);
      showToast('Web-series poster updated!');
    } catch (err) {
      console.error('[WebseriesDetail] handleSetPoster error:', err);
      alert('Failed to set poster: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleSetLogo = async (imageUrl) => {
    if (!series || !imageUrl) return;
    setArtworkSaving(true);
    try {
      const updated = {
        ...series,
        logoUrl: imageUrl,
        updatedAt: new Date().toISOString(),
      };
      setSeries(updated);
      upsertLocalWebseries(updated);
      if (db && userId) {
        await updateDoc(doc(db, 'users', userId, 'webseries', series.id), {
          logoUrl: imageUrl,
          updatedAt: updated.updatedAt,
        }).catch(err => console.warn('Firestore update logo error:', err));
      }
      setArtworkTargetImage(null);
      showToast('Web-series logo updated!');
    } catch (err) {
      console.error('[WebseriesDetail] handleSetLogo error:', err);
      alert('Failed to set logo: ' + err.message);
    } finally {
      setArtworkSaving(false);
    }
  };

  const handleDownloadImage = (url) => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.download = `webseries-artwork-${Date.now()}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast('Downloading image...');
  };

  const handleToggleCompleted = async () => {
    if (!series) return;
    const isCurrentlyCompleted = Boolean(
      series.watched || series.isWatched || series.watchStatus === 'Completed' || (series.progressPercent && series.progressPercent >= 100)
    );
    const shouldComplete = !isCurrentlyCompleted;

    const updated = {
      ...series,
      watched: shouldComplete,
      isWatched: shouldComplete,
      watchStatus: shouldComplete ? 'Completed' : 'Watching',
      progressPercent: shouldComplete ? 100 : 0,
      updatedAt: new Date().toISOString(),
    };

    setSeries(updated);
    upsertLocalWebseries(updated);

    if (db && userId) {
      try {
        await setDoc(doc(db, 'users', userId, 'webseries', series.id), updated, { merge: true });
      } catch (err) {
        console.warn('Firestore update webseries completed error:', err);
      }
    }
    showToast(shouldComplete ? 'Marked as Completed!' : 'Marked as Watching');
  };

  // Background auto-enrich if missing images or cast and has tmdbId
  useEffect(() => {
    if (!seriesId) return;
    const currentItem = series || getLocalWebseriesItem(seriesId);
    if (currentItem?.tmdbId && (!currentItem.images || !currentItem.images.posters?.length || !currentItem.cast?.length)) {
      fetch(`/api/watchlist/details?type=web-series&id=${encodeURIComponent(currentItem.tmdbId)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.details) {
            const d = data.details;
            setSeries(prev => {
              if (!prev) return prev;
              const enriched = {
                ...prev,
                images: d.images || prev.images || { posters: [], backdrops: [], logos: [] },
                cast: d.cast || prev.cast || [],
                crew: d.crew || prev.crew || [],
                overview: prev.overview || d.overview || '',
                videos: d.videos || prev.videos || [],
                logoUrl: prev.logoUrl || d.logoUrl || '',
              };
              upsertLocalWebseries(enriched);
              return enriched;
            });
          }
        })
        .catch(err => console.warn('Background webseries enrich error:', err));
    }
  }, [seriesId]);

  // Gallery Memos
  const allImages = useMemo(() => {
    if (!series?.images) return [];
    const backdrops = (series.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    const posters = (series.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    const logos = (series.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));
    return [...backdrops, ...posters, ...logos];
  }, [series?.images]);

  const randomMixedImages = useMemo(() => {
    if (!series?.images) return [];
    const backdrops = (series.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    const posters = (series.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    const logos = (series.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));

    const shuffle = (list) => {
      const arr = [...list];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const sBackdrops = shuffle(backdrops);
    const sPosters = shuffle(posters);
    const sLogos = shuffle(logos);

    const mixed = [];
    const maxItems = 10;
    let b = 0, p = 0, l = 0;

    while (mixed.length < maxItems && (b < sBackdrops.length || p < sPosters.length || l < sLogos.length)) {
      if (p < sPosters.length && mixed.length < maxItems) mixed.push(sPosters[p++]);
      if (b < sBackdrops.length && mixed.length < maxItems) mixed.push(sBackdrops[b++]);
      if (l < sLogos.length && mixed.length < maxItems) mixed.push(sLogos[l++]);
    }

    return mixed.slice(0, 10);
  }, [series?.images, series?.id]);

  const displayedImages = useMemo(() => {
    if (!series?.images) return [];
    if (imageTab === 'backdrops') return (series.images.backdrops || []).map(img => ({ ...img, mediaType: 'backdrop' }));
    if (imageTab === 'posters') return (series.images.posters || []).map(img => ({ ...img, mediaType: 'poster' }));
    if (imageTab === 'logos') return (series.images.logos || []).map(img => ({ ...img, mediaType: 'logo' }));
    return randomMixedImages;
  }, [series?.images, imageTab, randomMixedImages]);

  const totalGalleryCount = allImages.length;
  const galleryHasImages = totalGalleryCount > 0;

  const isCompleted = Boolean(
    series?.watched || series?.isWatched || series?.watchStatus === 'Completed' || (series?.progressPercent && series.progressPercent >= 100)
  );

  const watchedEpsCount = useMemo(() => {
    return episodes.filter(e => e.watched || e.isWatched || (e.progressPercent && e.progressPercent >= 90)).length;
  }, [episodes]);

  const totalEpsCount = episodes.length;
  const overallProgressPercent = isCompleted ? 100 : (totalEpsCount > 0 ? Math.round((watchedEpsCount / totalEpsCount) * 100) : (series?.progressPercent || 0));

  const resumeEp = useMemo(() => {
    return episodes.find(e => (Number(e.lastPositionSeconds || 0) > 5) && !(e.watched || e.isWatched));
  }, [episodes]);

  const nextPlayableEp = useMemo(() => {
    if (resumeEp) return resumeEp;
    return episodes.find(e => !(e.watched || e.isWatched)) || episodes[0] || null;
  }, [episodes, resumeEp]);

  const watchStatusText = useMemo(() => {
    if (isCompleted) {
      return `Completed (100%) • ${totalEpsCount} / ${totalEpsCount} eps`;
    }
    if (resumeEp && resumeEp.lastPositionSeconds > 0) {
      const cur = formatTime(resumeEp.lastPositionSeconds);
      const dur = formatTime(resumeEp.durationSeconds || resumeEp.duration || 0);
      const epLabel = `S${resumeEp.seasonNumber || 1}:E${resumeEp.episodeNumber || 1}`;
      return `Watching (${overallProgressPercent}%) • ${cur} / ${dur} (${epLabel})`;
    }
    if (watchedEpsCount > 0) {
      return `Watching (${overallProgressPercent}%) • ${watchedEpsCount} / ${totalEpsCount} eps`;
    }
    return `Plan to Watch (0%) • 0 / ${totalEpsCount} eps`;
  }, [isCompleted, resumeEp, watchedEpsCount, totalEpsCount, overallProgressPercent]);

  const getLogoSrc = (url) => {
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:')) return toFanartBigPreview(url);
    return `/api/image?path=${encodeURIComponent(url)}`;
  };

  const backdrop = series?.backdropUrl || series?.posterUrl || null;
  const seriesLogo = series?.logoUrl || series?.images?.logos?.[0]?.url || null;

  // Load from local storage & Firestore
  useEffect(() => {
    const loadData = async () => {
      let currentSeries = getLocalWebseriesItem(seriesId);
      let currentEps = getLocalWebseriesEpisodes(seriesId) || [];

      if ((!currentSeries || currentEps.length === 0) && db && currentUser) {
        try {
          const sSnap = await getDoc(doc(db, 'users', userId, 'webseries', seriesId));
          if (sSnap.exists()) {
            currentSeries = { id: sSnap.id, ...sSnap.data() };
            upsertLocalWebseries(currentSeries);
          }
          const epSnap = await getDocs(collection(db, 'users', userId, 'webseries', seriesId, 'episodes'));
          const dbEps = [];
          epSnap.forEach(d => dbEps.push({ id: d.id, ...d.data() }));
          if (dbEps.length > 0) {
            currentEps = sortEpisodes(dbEps);
            setLocalWebseriesEpisodes(seriesId, currentEps);
          }
        } catch (err) {
          console.error('[WebseriesDetail] Error fetching from firestore:', err);
        }
      }

      if (currentSeries) setSeries(currentSeries);
      if (currentEps) setEpisodes(currentEps);
      setLoading(false);
    };

    loadData();
  }, [seriesId, userId, currentUser]);

  // Derive seasons structure
  const seasons = useMemo(() => {
    // 1. If series has detailed TMDB seasons, use them
    if (Array.isArray(series?.seasons) && series.seasons.length > 0) {
      // Merge with local episodes if any
      return series.seasons.map(s => {
        const seasonEps = episodes.filter(e => Number(e.seasonNumber || 1) === Number(s.seasonNumber));
        const mergedEps = s.episodes?.map(tep => {
          const localMatch = seasonEps.find(le => Number(le.episodeNumber) === Number(tep.episodeNumber));
          return localMatch ? { ...tep, ...localMatch, hasLocalFile: true } : tep;
        }) || seasonEps;
        return {
          ...s,
          episodes: mergedEps.length > 0 ? mergedEps : (s.episodes || [])
        };
      });
    }

    // 2. Otherwise group local episodes by seasonNumber
    const grouped = {};
    episodes.forEach(ep => {
      const sNum = ep.seasonNumber || 1;
      if (!grouped[sNum]) grouped[sNum] = [];
      grouped[sNum].push(ep);
    });

    const seasonNums = Object.keys(grouped).map(Number).sort((a, b) => a - b);
    if (seasonNums.length === 0) {
      return [{ seasonNumber: 1, name: 'Season 1', episodes: [] }];
    }

    return seasonNums.map(sNum => ({
      seasonNumber: sNum,
      name: `Season ${sNum}`,
      episodes: grouped[sNum]
    }));
  }, [series, episodes]);

  // Ensure active season exists
  const activeSeason = useMemo(() => {
    if (seasons.length === 0) return null;
    return seasons.find(s => s.seasonNumber === activeSeasonNumber) || seasons[0];
  }, [seasons, activeSeasonNumber]);

  // First playable episode
  const firstPlayableEp = useMemo(() => {
    if (episodes.length === 0) return null;
    const unwatched = episodes.find(e => !e.isWatched);
    return unwatched || episodes[0];
  }, [episodes]);

  // Launch default video player (Media Server Player)
  const handlePlayEpisode = (ep) => {
    if (!ep) return;
    router.push(`/player/mediaserver/${seriesId}?ep=${ep.id}&type=webseries`);
  };

  // Fetch updated season breakdown from TMDB
  const handleFetchSeasonsAndEpisodes = async () => {
    const tmdbId = series?.tmdbId || series?.id;
    if (!tmdbId) return;

    setFetchingSeasons(true);
    setFetchSeasonsSuccess(false);

    try {
      const res = await fetch(`/api/watchlist/details?type=web-series&id=${encodeURIComponent(tmdbId)}`);
      const data = await res.json();

      if (data.success && data.details?.seasons) {
        const updated = {
          ...series,
          seasons: data.details.seasons,
          images: data.details.images || series.images,
          cast: data.details.cast || series.cast,
          videos: data.details.videos || series.videos,
          updatedAt: new Date().toISOString(),
        };
        setSeries(updated);
        upsertLocalWebseries(updated);
        if (db && userId) {
          await setDoc(doc(db, 'users', userId, 'webseries', seriesId), updated, { merge: true });
        }
        setFetchSeasonsSuccess(true);
        setTimeout(() => setFetchSeasonsSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Fetch seasons error:', err);
    } finally {
      setFetchingSeasons(false);
    }
  };

  // ── 1. RESCAN FOLDER LOGIC (Image 2) ──────────────────────────────────────
  const handleRescan = async (pattern = 'Auto') => {
    const folderToScan = series?.folderPath;
    if (!folderToScan) {
      alert("No local folder configured for this web-series. Please click 'Edit Details' to set the folder path.");
      return;
    }

    setShowRescanModal(true);
    setRescanStatus('scanning');
    setRescanMessage(`Scanning directory "${folderToScan}" with pattern "${pattern}"...`);

    try {
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath: folderToScan })
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to scan folder');
      }

      const scannedRawFiles = data.episodes || [];
      const processedFiles = processScannedFiles(scannedRawFiles, folderToScan, pattern);

      // Compare scanned files with existing episodes
      const existingByPath = new Map();
      episodes.forEach(e => {
        const norm = (e.filePath || '').replace(/\\/g, '/').toLowerCase();
        if (norm) existingByPath.set(norm, e);
      });

      const newEpisodes = [];
      const retainedEpisodes = [];
      const scannedPathsSet = new Set();

      processedFiles.forEach((f, idx) => {
        const norm = (f.filePath || '').replace(/\\/g, '/').toLowerCase();
        scannedPathsSet.add(norm);

        const existing = existingByPath.get(norm);
        if (existing) {
          retainedEpisodes.push(existing);
        } else {
          const sNum = extractSeasonNumber(f.filePath, f.fileName);
          const epNum = f.episodeNumber || (idx + 1);

          let matchedTmdbEp = null;
          if (Array.isArray(series?.seasons)) {
            const targetSeason = series.seasons.find(s => s.seasonNumber === sNum) || series.seasons[0];
            if (targetSeason?.episodes) {
              matchedTmdbEp = targetSeason.episodes.find(e => e.episodeNumber === epNum);
            }
          }

          newEpisodes.push({
            id: f.docId || `ep_${sNum}_${epNum}_${Date.now()}_${idx}`,
            episodeNumber: epNum,
            seasonNumber: sNum,
            title: matchedTmdbEp?.name || f.fileName?.replace(/\.[^/.]+$/, '') || `Episode ${epNum}`,
            name: matchedTmdbEp?.name || f.fileName?.replace(/\.[^/.]+$/, '') || `Episode ${epNum}`,
            fileName: f.fileName,
            filePath: f.filePath,
            overview: matchedTmdbEp?.overview || '',
            airDate: matchedTmdbEp?.airDate || '',
            runtime: matchedTmdbEp?.runtime || 0,
            voteAverage: matchedTmdbEp?.voteAverage || 0,
            stillUrl: matchedTmdbEp?.stillUrl || series?.backdropUrl || series?.posterUrl || '',
            durationSeconds: matchedTmdbEp?.runtime ? matchedTmdbEp.runtime * 60 : 0,
            lastPositionSeconds: 0,
            watchedSeconds: 0,
            isWatched: false,
            isOffPattern: !!f.isOffPattern,
            createdAt: new Date().toISOString(),
          });
        }
      });

      const removedEpisodes = episodes.filter(e => {
        const norm = (e.filePath || '').replace(/\\/g, '/').toLowerCase();
        return norm && !scannedPathsSet.has(norm);
      });

      // Calculate added folders
      const existingFolders = new Set(episodes.map(e => getSubfolder(e.filePath, folderToScan)).filter(Boolean));
      const scannedFolders = new Set(processedFiles.map(f => getSubfolder(f.filePath, folderToScan)).filter(Boolean));
      const addedFolders = Array.from(scannedFolders).filter(f => !existingFolders.has(f));

      const diff = {
        newEpisodes,
        retainedEpisodes,
        removedEpisodes,
        addedFolders,
        pattern,
      };

      setRescanDiff(diff);
      setSelectedNewEpIds(new Set(newEpisodes.map(e => e.id)));
      setSelectedRemovedEpIds(new Set(removedEpisodes.map(e => e.id)));
      setRescanSyncMode('normal');
      setRescanStatus('preview');
      setRescanMessage(`Found ${newEpisodes.length} new episodes and ${removedEpisodes.length} missing items.`);
    } catch (err) {
      console.error('[WebseriesDetail] Rescan error:', err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Error scanning folder');
    }
  };

  // Select sync mode in modal
  const handleSelectSyncMode = (mode) => {
    if (!rescanDiff) return;
    setRescanSyncMode(mode);

    if (mode === 'normal') {
      setSelectedNewEpIds(new Set(rescanDiff.newEpisodes.map(e => e.id)));
      setSelectedRemovedEpIds(new Set(rescanDiff.removedEpisodes.map(e => e.id)));
    } else if (mode === 'new_only') {
      setSelectedNewEpIds(new Set(rescanDiff.newEpisodes.map(e => e.id)));
      setSelectedRemovedEpIds(new Set());
    } else if (mode === 'deleted_only') {
      setSelectedNewEpIds(new Set());
      setSelectedRemovedEpIds(new Set(rescanDiff.removedEpisodes.map(e => e.id)));
    }
  };

  // Apply rescan diff
  const handleApplyRescanChanges = async () => {
    if (!rescanDiff || !series) return;
    setRescanStatus('applying');
    setRescanMessage('Applying rescan changes to library and database...');

    try {
      const { newEpisodes, removedEpisodes, pattern } = rescanDiff;

      const episodesToAdd = newEpisodes.filter(e => selectedNewEpIds.has(e.id));
      const episodesToRemove = removedEpisodes.filter(e => selectedRemovedEpIds.has(e.id));
      const removedIdSet = new Set(episodesToRemove.map(e => e.id));

      const retained = episodes.filter(e => !removedIdSet.has(e.id));
      const mergedEpisodes = sortEpisodes([...retained, ...episodesToAdd]);

      const total = mergedEpisodes.length;
      const watched = mergedEpisodes.filter(e => !!e.isWatched).length;
      const newProgressPercent = total > 0 ? Math.round((watched / total) * 100) : 0;

      const updatedSeriesDoc = {
        ...series,
        namingPattern: pattern,
        episodeCount: total,
        progressPercent: newProgressPercent,
        updatedAt: new Date().toISOString(),
      };

      // 1. LocalStore
      setEpisodes(mergedEpisodes);
      setLocalWebseriesEpisodes(seriesId, mergedEpisodes);
      upsertLocalWebseries(updatedSeriesDoc);
      setSeries(updatedSeriesDoc);

      // 2. Firestore Sync
      if (db && currentUser) {
        const batch = writeBatch(db);

        episodesToAdd.forEach(ep => {
          const epRef = doc(db, 'users', userId, 'webseries', seriesId, 'episodes', ep.id);
          batch.set(epRef, ep, { merge: true });
        });

        episodesToRemove.forEach(ep => {
          const epRef = doc(db, 'users', userId, 'webseries', seriesId, 'episodes', ep.id);
          batch.delete(epRef);
        });

        const sRef = doc(db, 'users', userId, 'webseries', seriesId);
        batch.set(sRef, updatedSeriesDoc, { merge: true });

        await batch.commit();
      }

      setRescanStatus('completed');
      setRescanMessage(`Rescan complete! Library updated with ${total} total episodes.`);
      setTimeout(() => {
        setShowRescanModal(false);
      }, 1500);
    } catch (err) {
      console.error('Error applying rescan:', err);
      setRescanStatus('error');
      setRescanMessage(err.message || 'Failed to apply rescan updates');
    }
  };

  // ── 2. IN-MEMORY FILE MANAGER (Image 1 Button) ───────────────────────────
  const buildTreeFromEpisodes = useCallback((epList, rootFolder, currentPath) => {
    const root = (rootFolder || 'Root').replace(/\\/g, '/').replace(/\/$/, '');
    const current = (currentPath || root).replace(/\\/g, '/').replace(/\/$/, '');

    const children = [];
    const folderSet = new Map();

    epList.forEach((ep) => {
      const rawPath = (ep.filePath || ep.fileName || ep.name || ep.title || '').replace(/\\/g, '/');
      let relPath = rawPath;

      if (current && rawPath.startsWith(current)) {
        relPath = rawPath.slice(current.length).replace(/^\//, '');
      } else if (root && rawPath.startsWith(root)) {
        relPath = rawPath.slice(root.length).replace(/^\//, '');
      }

      const parts = relPath.split('/').filter(Boolean);
      if (parts.length === 0) return;

      if (parts.length === 1) {
        children.push({
          name: ep.fileName || ep.name || parts[0],
          isDirectory: false,
          path: ep.filePath || `${current}/${parts[0]}`,
          relativePath: parts[0],
          id: ep.id,
          episode: ep
        });
      } else {
        const subFolderName = parts[0];
        const subFolderPath = `${current}/${subFolderName}`;
        if (!folderSet.has(subFolderName)) {
          folderSet.set(subFolderName, subFolderPath);
        }
      }
    });

    folderSet.forEach((fPath, fName) => {
      children.push({
        name: fName,
        isDirectory: true,
        path: fPath,
        relativePath: fName,
        children: []
      });
    });

    children.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      name: current.split('/').pop() || 'Root',
      isDirectory: true,
      path: current,
      children
    };
  }, []);

  const openFileManagerModal = () => {
    setShowFileManagerModal(true);
    setFmLoading(true);
    const tree = buildTreeFromEpisodes(episodes, series?.folderPath, series?.folderPath);
    setFmTree(tree);
    setFmCurrentPath(tree.path);
    setFmLoading(false);
  };

  // ── 3. DELETE WEBSERIES HANDLER ──────────────────────────────────────────
  const handleDeleteFolderFromDb = async () => {
    try {
      deleteLocalWebseries(seriesId);
      if (db && currentUser) {
        await deleteDoc(doc(db, 'users', userId, 'webseries', seriesId));
      }
      setShowDeleteModal(false);
      router.push('/webseries');
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete: ' + err.message);
    }
  };

  // Save edit callback
  const handleSaveEdit = async (updatedDoc) => {
    setSeries(updatedDoc);
    upsertLocalWebseries(updatedDoc);
    if (db && currentUser) {
      await setDoc(doc(db, 'users', userId, 'webseries', seriesId), updatedDoc, { merge: true });
    }
  };

  if (loading || !series) {
    return (
      <div className="min-h-screen bg-[#07090f] text-white flex flex-col items-center justify-center gap-3">
        <Loader2 size={36} className="animate-spin text-amber-500" />
        <span className="text-xs uppercase tracking-widest text-gray-400 font-bold">
          Loading Web-series Details...
        </span>
      </div>
    );
  }

  // Artwork lists
  const galleryPosters = series.images?.posters || [];
  const galleryBackdrops = series.images?.backdrops || [];
  const galleryLogos = series.images?.logos || [];

  return (
    <div className="min-h-screen bg-[#07090f] text-white flex flex-col relative pb-20 overflow-x-hidden selection:bg-amber-500 selection:text-black">
      {/* ── Ambient Backdrop Image Layer (Extends from top-0 behind transparent header & hero) ── */}
      {backdrop && (
        <div className="absolute top-0 inset-x-0 h-[480px] sm:h-[560px] pointer-events-none overflow-hidden z-0">
          <img
            src={backdrop}
            alt={series.title}
            className="w-full h-full object-cover object-top filter brightness-[0.40] blur-[1px] scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#07090f] via-[#07090f]/70 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-[#07090f]/80" />
        </div>
      )}

      {/* ── Top Navigation Header (Completely Transparent - Background Visible Behind) ── */}
      <header className="relative z-30 h-14 md:h-16 px-4 md:px-8 flex items-center justify-between bg-transparent">
        <button
          type="button"
          onClick={onBack || (() => router.push('/webseries'))}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-200 hover:text-white text-xs font-semibold backdrop-blur-md transition cursor-pointer shadow-lg"
        >
          <ChevronLeft size={16} />
          <span>Dashboard</span>
        </button>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/15 text-gray-300 hover:text-white text-xs font-bold backdrop-blur-md transition cursor-pointer shadow-lg"
            title="Edit web-series information"
          >
            <Edit3 size={14} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={handleToggleCompleted}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border backdrop-blur-md transition cursor-pointer shadow-lg ${
              isCompleted
                ? 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300 hover:bg-emerald-500/35 shadow-[0_0_15px_rgba(16,185,129,0.25)]'
                : 'bg-black/40 border-white/15 text-gray-300 hover:text-white hover:bg-black/60'
            }`}
          >
            <CheckCircle2 size={14} className={isCompleted ? 'text-emerald-400' : ''} />
            <span>{isCompleted ? 'Completed' : 'Mark Completed'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowDeleteModal(true)}
            className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-bold backdrop-blur-md transition cursor-pointer shadow-lg"
            title="Remove web-series"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </header>

      {/* ── Hero Content (Poster + Details - Image 1 exact UI) ── */}
      <div className="relative z-10 max-w-6xl w-full mx-auto px-4 md:px-6 pt-2 pb-8 sm:pb-10 border-b border-white/5">
        <div className="flex flex-col sm:flex-row gap-6 md:gap-8 items-start">
          {/* Poster Card */}
          <div className="hidden sm:block relative w-44 sm:w-52 md:w-60 shrink-0 rounded-2xl sm:rounded-3xl overflow-hidden glass-card border border-white/15 shadow-2xl bg-[#0d1117] group">
            {series.posterUrl ? (
              <img
                src={series.posterUrl}
                alt={series.title}
                className="w-full h-auto aspect-[2/3] object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <div className="w-full aspect-[2/3] flex flex-col items-center justify-center text-amber-400/80 bg-gradient-to-br from-amber-950/30 to-black gap-2">
                <Tv size={44} />
                <span className="text-[10px] font-mono uppercase tracking-wider">No Poster</span>
              </div>
            )}

            {/* Poster Badges */}
            <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5">
              {series.rating > 0 && (
                <span className="px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/15 text-amber-300 font-bold text-xs flex items-center gap-1 shadow">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {formatRating(series.rating)}
                </span>
              )}
            </div>

            <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded-md bg-amber-500 text-black font-extrabold text-[9px] shadow uppercase tracking-wider">
              TMDB
            </div>
          </div>

          {/* Details & Action Header */}
          <div className="flex-1 space-y-4 w-full">
            <div>
              {/* Badges / Chips Row with pipe dividers */}
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                  | WEBSERIES
                </span>
                {series.rating > 0 && (
                  <span className="px-2.5 py-0.5 text-amber-300 text-[10px] font-bold flex items-center gap-1 sm:hidden">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    | {formatRating(series.rating)}
                  </span>
                )}
                {series.year && (
                  <span className="px-2.5 py-0.5 text-gray-300 text-[10px] font-mono font-bold flex items-center gap-1">
                    <Calendar size={11} className="text-gray-400" />
                    | {series.year}
                  </span>
                )}
                <span className="px-2.5 py-0.5 text-gray-300 text-[10px] font-mono font-bold flex items-center gap-1 uppercase">
                  <Clock size={11} className="text-gray-400" />
                  | {episodes.length} EPS
                </span>
                {series.language && (
                  <span className="px-2.5 py-0.5 text-gray-300 text-[10px] uppercase font-bold">
                    | {series.language.toUpperCase()}
                  </span>
                )}
              </div>

              {/* Series Logo Art */}
              {seriesLogo && (
                <div className="py-1 max-w-[180px] sm:max-w-[220px] md:max-w-[280px]">
                  <img
                    src={getLogoSrc(seriesLogo)}
                    alt={series.title}
                    className="max-h-12 sm:max-h-14 md:max-h-16 w-auto object-contain filter drop-shadow-[0_3px_12px_rgba(0,0,0,0.9)]"
                  />
                </div>
              )}

              {/* Main Series Title */}
              <h1 className={`${seriesLogo ? 'text-lg sm:text-md md:text-sm' : 'text-xl sm:text-2xl md:text-3xl'} font-bold text-white tracking-tight drop-shadow-md`}>
                {series.title}
              </h1>

              {/* Original / Native Title */}
              {(series.originalTitle || series.romajiTitle) && (series.originalTitle !== series.title) && (
                <p className="text-xs sm:text-sm text-gray-400 mt-1 italic">
                  {series.originalTitle || series.romajiTitle}
                </p>
              )}
            </div>

            {/* Genres with pipes */}
            {Array.isArray(series.genres) && series.genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {series.genres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-0.5 text-gray-300 text-xs font-semibold"
                  >
                    | {g}
                  </span>
                ))}
              </div>
            )}

            {/* ── Action Buttons Area (Matching Image 1) ── */}
            <div className="space-y-3 pt-1">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Primary Button */}
                <div className="flex items-center rounded-2xl overflow-hidden shadow-lg shadow-amber-500/20 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 transition">
                  <button
                    type="button"
                    onClick={() => handlePlayEpisode(nextPlayableEp || episodes[0])}
                    className="px-5 py-2.5 sm:px-6 sm:py-3 text-black font-extrabold text-sm flex items-center gap-2 cursor-pointer active:scale-95 transition"
                  >
                    <Play size={18} fill="currentColor" />
                    <span>
                      {resumeEp
                        ? `Resume from ${formatTime(resumeEp.lastPositionSeconds)}`
                        : isCompleted
                        ? 'Watch Again'
                        : nextPlayableEp
                        ? `Play Next (${nextPlayableEp.title || `Episode ${nextPlayableEp.episodeNumber}`})`
                        : 'Play Series'}
                    </span>
                  </button>

                  {/* Dropdown Chevron */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowDropdownResume(prev => !prev)}
                      className="px-2.5 py-2.5 sm:py-3 border-l border-black/20 text-black/80 hover:text-black hover:bg-black/10 transition cursor-pointer"
                      title="Episode quick jump"
                    >
                      <ChevronDown size={17} />
                    </button>

                    {showDropdownResume && (
                      <div className="absolute top-full left-0 mt-2 w-64 bg-[#0d121f] border border-white/15 rounded-2xl shadow-2xl p-2 z-40 space-y-1">
                        <div className="text-[10px] font-bold text-gray-400 px-2 py-1 uppercase">
                          Quick Jump
                        </div>
                        {episodes.slice(0, 6).map((ep) => (
                          <button
                            key={ep.id}
                            type="button"
                            onClick={() => {
                              setShowDropdownResume(false);
                              handlePlayEpisode(ep);
                            }}
                            className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-white/10 text-xs text-white truncate flex items-center justify-between"
                          >
                            <span className="truncate">S{ep.seasonNumber || 1}:E{ep.episodeNumber} {ep.title || ep.name}</span>
                            <Play size={10} className="shrink-0 text-amber-400 ml-1" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Play from Start */}
                {episodes.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handlePlayEpisode(episodes[0])}
                    className="px-4 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer border border-white/10"
                  >
                    Play From Start
                  </button>
                )}

                {/* Watch Trailer */}
                {series.videos?.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveVideo(series.videos[0])}
                    className="px-4 py-2.5 sm:py-3 rounded-2xl bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 hover:text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Play size={13} fill="currentColor" />
                    <span>Watch Trailer</span>
                  </button>
                )}

                {/* Manage Folder Quick Button */}
                {series.folderPath && (
                  <button
                    type="button"
                    onClick={() => handleRescan(selectedNamingPattern)}
                    className="px-4 py-2.5 sm:py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-gray-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <RefreshCw size={13} />
                    <span>Rescan Folder</span>
                  </button>
                )}
              </div>

              {/* Watch Status Bar (Exact matching Image 1) */}
              <div className="space-y-1.5 pt-2 max-w-xl">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 font-medium">Watch Status:</span>
                  <span className="text-amber-400 font-bold">
                    {watchStatusText}
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-rose-500 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, overallProgressPercent))}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN DETAIL SECTIONS ────────────────────────────────────────────── */}
      <div className="relative z-20 max-w-6xl w-full mx-auto px-4 md:px-6 pt-4 pb-20 space-y-10">

        {/* 1. Overview & Storyline */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
              <Sparkles size={17} className="text-amber-400" /> Overview & Storyline
            </h2>
          </div>

          {(() => {
            const overviewText = series.overview || "No overview available for this web-series yet.";
            const isLong = overviewText.length > 400;

            if (!isLong || isOverviewExpanded) {
              return (
                <div className="space-y-2">
                  <p className="text-sm sm:text-base text-gray-200/90 leading-relaxed max-w-4xl">
                    {overviewText}
                  </p>
                  {isLong && (
                    <button
                      onClick={() => setIsOverviewExpanded(false)}
                      className="text-amber-400 hover:text-amber-300 text-xs font-bold cursor-pointer"
                    >
                      Show less
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="relative max-w-4xl">
                <p className="text-sm sm:text-base text-gray-200/90 leading-relaxed">
                  {overviewText.slice(0, 240).trim()}...
                  <button
                    onClick={() => setIsOverviewExpanded(true)}
                    className="text-amber-400 hover:text-amber-300 font-bold ml-2 text-xs cursor-pointer inline-flex items-center"
                  >
                    Show more
                  </button>
                </p>
              </div>
            );
          })()}
        </section>

        {/* 2. SEASONS & EPISODES SECTION ───────────────────────────────────── */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div className="flex items-center gap-6 overflow-x-auto custom-scrollbar select-none">
              {seasons.map((s) => {
                const isActive = activeSeason?.seasonNumber === s.seasonNumber;
                return (
                  <button
                    key={s.seasonNumber}
                    type="button"
                    onClick={() => setActiveSeasonNumber(s.seasonNumber)}
                    className={`relative pb-2 font-bold transition-all duration-200 cursor-pointer text-base sm:text-lg whitespace-nowrap ${
                      isActive ? 'text-white font-extrabold' : 'text-gray-400 hover:text-gray-200 font-semibold'
                    }`}
                  >
                    <span>{s.name || `Season ${s.seasonNumber}`}</span>
                    {isActive && (
                      <motion.div
                        layoutId="activeSeasonTabIndicator"
                        className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-400 rounded-full"
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {fetchSeasonsSuccess && (
                <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                  <CheckCircle2 size={13} /> Synced!
                </span>
              )}
              <button
                type="button"
                onClick={handleFetchSeasonsAndEpisodes}
                disabled={fetchingSeasons}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title="Fetch detailed episode titles & stills from TMDB"
              >
                <RefreshCw size={13} className={fetchingSeasons ? 'animate-spin' : ''} />
                <span>{fetchingSeasons ? 'Fetching...' : 'Fetch Details from TMDB'}</span>
              </button>
            </div>
          </div>

          {/* Episode Cards for Active Season */}
          {(() => {
            const currentEpisodes = activeSeason?.episodes || [];
            const isExpanded = Boolean(expandedSeasons[activeSeason?.seasonNumber]);
            const visibleEpisodes = isExpanded ? currentEpisodes : currentEpisodes.slice(0, 8);

            if (currentEpisodes.length === 0) {
              return (
                <div className="p-8 text-center text-xs text-gray-500 italic bg-white/[0.01] rounded-2xl border border-white/5 space-y-2">
                  <Tv size={28} className="mx-auto text-gray-600" />
                  <p>No episodes discovered for this season yet.</p>
                  {series.folderPath && (
                    <button
                      onClick={() => handleRescan(selectedNamingPattern)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 text-xs font-bold cursor-pointer"
                    >
                      Rescan Folder
                    </button>
                  )}
                </div>
              );
            }

            return (
              <div className="space-y-2.5">
                <div className="space-y-2">
                  {visibleEpisodes.map((ep) => {
                    const ratingStr = formatRating(ep.voteAverage);
                    const durationStr = formatDuration(ep.runtime || Math.round(ep.durationSeconds / 60));
                    const dateStr = formatAirDate(ep.airDate);
                    const stillImage = ep.stillUrl || series.backdropUrl || series.posterUrl;

                    return (
                      <div
                        key={ep.id || ep.episodeNumber}
                        onClick={() => handlePlayEpisode(ep)}
                        className="group flex items-start gap-4 p-3 rounded-2xl hover:bg-white/[0.05] border border-transparent hover:border-white/10 transition-all duration-200 cursor-pointer"
                      >
                        {/* Thumbnail */}
                        <div className="relative w-32 sm:w-40 md:w-44 aspect-video rounded-xl overflow-hidden bg-black/60 shrink-0 border border-white/10 group-hover:border-amber-500/40 transition shadow-md">
                          {stillImage ? (
                            <img
                              src={stillImage}
                              alt={ep.name || ep.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-600">
                              <Tv size={20} />
                            </div>
                          )}
                          <div className="absolute bottom-2 left-2 w-6 h-6 rounded-full bg-black/75 backdrop-blur-sm flex items-center justify-center text-white shadow">
                            <Play size={10} className="fill-white translate-x-0.5" />
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0 pt-0.5 space-y-1">
                          <h3 className="text-sm sm:text-base font-bold text-white group-hover:text-amber-300 transition truncate">
                            {ep.name || ep.title || `Episode ${ep.episodeNumber}`}
                          </h3>
                          <div className="text-xs text-gray-400 font-medium flex flex-wrap items-center gap-1.5 sm:gap-2">
                            <span>S{ep.seasonNumber || activeSeason?.seasonNumber} E{ep.episodeNumber}</span>
                            {dateStr && (
                              <>
                                <span>•</span>
                                <span>{dateStr}</span>
                              </>
                            )}
                            {durationStr && (
                              <>
                                <span>•</span>
                                <span>{durationStr}</span>
                              </>
                            )}
                            {ratingStr && (
                              <>
                                <span>•</span>
                                <span className="text-amber-400 flex items-center gap-0.5 font-semibold">
                                  ★ {ratingStr}
                                </span>
                              </>
                            )}
                          </div>
                          {ep.overview && (
                            <p className="text-[11px] text-gray-500 line-clamp-2 max-w-2xl pt-0.5">
                              {ep.overview}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {currentEpisodes.length > 8 && (
                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => {
                        const sNum = activeSeason?.seasonNumber;
                        setExpandedSeasons(prev => ({ ...prev, [sNum]: !prev[sNum] }));
                      }}
                      className="px-5 py-2 rounded-full hover:bg-white/10 border border-white/10 text-xs font-bold text-gray-200 transition inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>{isExpanded ? 'Show Less' : `Show All (${currentEpisodes.length})`}</span>
                      <ChevronDown size={14} className={isExpanded ? 'rotate-180 transition' : 'transition'} />
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </section>

        {/* ── 3. MANAGE FOLDER ACCORDION (IMAGE 1 EXACT IMPLEMENTATION) ───────── */}
        <section className="glass-panel p-6 rounded-2xl border border-white/10 space-y-4 bg-white/[0.02]">
          <button
            type="button"
            onClick={() => setManageFolderExpanded(!manageFolderExpanded)}
            className="w-full flex items-center justify-between font-bold text-white uppercase tracking-wider text-[11px] text-left hover:text-cyan-300 transition cursor-pointer"
          >
            <span className="flex items-center gap-2 text-cyan-400">
              <FolderTree size={16} />
              MANAGE FOLDER
            </span>
            {manageFolderExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {manageFolderExpanded && (
            <div className="space-y-5 pt-3 border-t border-white/10 text-xs text-gray-400">
              {/* Button 1: Manage Folder Files & Subfolders */}
              <button
                type="button"
                onClick={openFileManagerModal}
                className="w-full py-3 px-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 hover:bg-cyan-500/20 text-cyan-300 hover:text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg"
              >
                <FolderPlus size={16} />
                MANAGE FOLDER FILES & SUBFOLDERS
              </button>

              {/* Section 2: Rescan with Naming Pattern */}
              <div className="space-y-2.5 pt-2 border-t border-white/10">
                <h4 className="font-bold text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw size={13} className="text-purple-400" />
                  RESCAN WITH NAMING PATTERN
                </h4>
                <div className="space-y-2">
                  <select
                    value={selectedNamingPattern}
                    onChange={(e) => setSelectedNamingPattern(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 text-xs text-white rounded-xl p-2.5 font-semibold focus:outline-none focus:border-cyan-400 cursor-pointer"
                  >
                    <option value="Auto" className="bg-gray-900 text-white">Auto-Detect Pattern (Recommended)</option>
                    <option value="S01E01" className="bg-gray-900 text-white">Season / Episode (S01E01, S1E1)</option>
                    <option value="Episode 01" className="bg-gray-900 text-white">Episode Tag (Episode 01, Ep 01)</option>
                    <option value="01 - Title" className="bg-gray-900 text-white">Prefix Number (01 - Title, 01.Title)</option>
                    <option value="Numeric" className="bg-gray-900 text-white">Pure Numeric (1, 2, 3)</option>
                  </select>

                  <button
                    type="button"
                    onClick={() => handleRescan(selectedNamingPattern)}
                    className="w-full py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition"
                  >
                    <RefreshCw size={14} />
                    RESCAN FOLDER
                  </button>
                </div>
              </div>

              {/* Section 3: Delete Folder */}
              <div className="space-y-2 pt-2 border-t border-rose-500/10">
                <h4 className="font-bold text-rose-400 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <Trash2 size={13} />
                  DELETE FOLDER
                </h4>
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Delete this folder from your library. This will permanently remove this web-series and its episodes from Firestore (database).
                </p>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="w-full py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 hover:text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer transition shadow-sm"
                >
                  <Trash2 size={14} />
                  DELETE THIS FOLDER FROM DB
                </button>
              </div>
            </div>
          )}
        </section>

        {/* 4. Cast Carousel */}
        {Array.isArray(series.cast) && series.cast.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Users size={17} className="text-amber-400" /> Cast & Crew
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scrollCast('left')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => scrollCast('right')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div ref={castScrollRef} className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
              {series.cast.slice(0, 20).map((actor) => (
                <div
                  key={actor.id}
                  className="w-28 sm:w-32 shrink-0 p-2 rounded-2xl bg-white/[0.02] border border-white/5 text-center space-y-1.5"
                >
                  <div className="w-20 h-20 mx-auto rounded-full overflow-hidden bg-black/60 border border-white/10">
                    {actor.profileUrl ? (
                      <img src={actor.profileUrl} alt={actor.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <Users size={20} />
                      </div>
                    )}
                  </div>
                  <h4 className="text-xs font-bold text-white truncate">{actor.name}</h4>
                  <p className="text-[10px] text-gray-400 truncate">{actor.character || 'Cast'}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 5. Trailers Carousel */}
        {Array.isArray(series.videos) && series.videos.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                <Video size={17} className="text-red-400" /> Trailers & Teasers
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => scrollVideos('left')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => scrollVideos('right')}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 transition cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div ref={videosScrollRef} className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
              {series.videos.map((vid) => (
                <div
                  key={vid.id || vid.key}
                  onClick={() => setActiveVideo(vid)}
                  className="w-64 sm:w-72 aspect-video shrink-0 rounded-2xl overflow-hidden bg-black/60 border border-white/10 relative group cursor-pointer"
                >
                  <img
                    src={`https://img.youtube.com/vi/${vid.key}/hqdefault.jpg`}
                    alt={vid.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition"
                  />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <div className="w-10 h-10 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition">
                      <Play size={18} fill="currentColor" className="translate-x-0.5" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 left-2 right-2 px-2 py-1 rounded-lg bg-black/70 backdrop-blur-sm text-xs font-bold text-white truncate">
                    {vid.name}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 6. More Images & Artwork Section (Image 2 exact UI) */}
        {galleryHasImages && (
          <section className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-wider text-white flex items-center gap-2">
                  <ImageIcon size={17} className="text-cyan-400" /> More Images & Artwork
                </h2>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'Images', count: randomMixedImages.length },
                  { id: 'backdrops', label: 'Backdrops', count: series.images?.backdrops?.length || 0 },
                  { id: 'posters', label: 'Posters', count: series.images?.posters?.length || 0 },
                  { id: 'logos', label: 'Logos', count: series.images?.logos?.length || 0 },
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

            {/* Images Grid / Masonry Layout (Eliminates gaps when aspect ratios differ) */}
            {imageTab === 'all' ? (
              <div className="columns-2 sm:columns-3 md:columns-4 lg:columns-5 gap-3 [column-fill:_balance]">
                {displayedImages.map((img, idx) => (
                  <div key={`${img.filePath || img.url}-${idx}`} className="mb-3 break-inside-avoid">
                    <GalleryImageCard
                      img={img}
                      type={imageTab}
                      title={series.title}
                      onClick={() => setPreviewImage(img)}
                      onOpenArtworkModal={(targetImg) => setArtworkTargetImage(targetImg)}
                      isCurrentPoster={series.posterUrl === img.url}
                      isCurrentBackdrop={series.backdropUrl === img.url}
                      isCurrentLogo={series.logoUrl === img.url}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {displayedImages.map((img, idx) => (
                  <GalleryImageCard
                    key={`${img.filePath || img.url}-${idx}`}
                    img={img}
                    type={imageTab}
                    title={series.title}
                    onClick={() => setPreviewImage(img)}
                    onOpenArtworkModal={(targetImg) => setArtworkTargetImage(targetImg)}
                    isCurrentPoster={series.posterUrl === img.url}
                    isCurrentBackdrop={series.backdropUrl === img.url}
                    isCurrentLogo={series.logoUrl === img.url}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* ── RESCAN RESULTS MODAL (IMAGE 2 EXACT IMPLEMENTATION) ──────────────── */}
      {showRescanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#090d16] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <RefreshCw size={20} className="text-cyan-400" />
                <div>
                  <h2 className="text-base sm:text-lg font-black text-white">
                    Folder Rescan Results & Sync Options
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    Review discovered changes and choose how your library should be updated.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowRescanModal(false)}
                className="p-1.5 rounded-xl hover:bg-white/10 text-gray-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 custom-scrollbar text-xs">
              {rescanStatus === 'scanning' ? (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 size={32} className="animate-spin text-cyan-400" />
                  <span className="text-xs font-bold">{rescanMessage}</span>
                </div>
              ) : rescanDiff ? (
                <>
                  {/* Summary Metric Cards (Exact matching Image 2 top cards) */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-2xl p-3 text-center">
                      <span className="block text-2xl font-black text-emerald-400">
                        +{rescanDiff.newEpisodes.length}
                      </span>
                      <span className="text-[10px] text-emerald-300/80 font-bold uppercase tracking-wider">
                        New Episodes
                      </span>
                    </div>

                    <div className="bg-cyan-500/10 border border-cyan-500/25 rounded-2xl p-3 text-center">
                      <span className="block text-2xl font-black text-cyan-400">
                        +{rescanDiff.addedFolders.length}
                      </span>
                      <span className="text-[10px] text-cyan-300/80 font-bold uppercase tracking-wider">
                        New Folders
                      </span>
                    </div>

                    <div className="bg-blue-500/10 border border-blue-500/25 rounded-2xl p-3 text-center">
                      <span className="block text-2xl font-black text-blue-400">
                        {rescanDiff.retainedEpisodes.length}
                      </span>
                      <span className="text-[10px] text-blue-300/80 font-bold uppercase tracking-wider">
                        Existing Kept
                      </span>
                    </div>

                    <div className="bg-rose-500/10 border border-rose-500/25 rounded-2xl p-3 text-center">
                      <span className="block text-2xl font-black text-rose-400">
                        -{rescanDiff.removedEpisodes.length}
                      </span>
                      <span className="text-[10px] text-rose-300/80 font-bold uppercase tracking-wider">
                        Missing / Removed
                      </span>
                    </div>
                  </div>

                  {/* Sync Behavior Options (Image 2) */}
                  <div className="space-y-2">
                    <label className="text-[11px] font-bold text-gray-300 uppercase tracking-wider block flex items-center gap-1.5">
                      <SlidersHorizontal size={13} className="text-purple-400" />
                      SELECT SYNC BEHAVIOR:
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {/* Option 1: Update Normally (Full Sync) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('normal')}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          rescanSyncMode === 'normal'
                            ? 'bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border-cyan-400 text-white shadow-lg'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black text-xs flex items-center gap-1.5">
                            <RefreshCw size={14} className={rescanSyncMode === 'normal' ? 'text-cyan-400' : 'text-gray-400'} />
                            Update Normally
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            FULL SYNC
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newEpisodes.length}</span> new episodes and clean <span className="text-rose-400 font-bold">-{rescanDiff.removedEpisodes.length}</span> missing items.
                        </p>
                      </button>

                      {/* Option 2: Only New Episodes (Safe Add) */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('new_only')}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          rescanSyncMode === 'new_only'
                            ? 'bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border-emerald-400 text-white shadow-lg'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black text-xs flex items-center gap-1.5">
                            <PlusCircle size={14} className={rescanSyncMode === 'new_only' ? 'text-emerald-400' : 'text-gray-400'} />
                            Only New Episodes
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            SAFE ADD
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Add <span className="text-emerald-400 font-bold">+{rescanDiff.newEpisodes.length}</span> new files. Keeps all <span className="text-gray-200 font-bold">{rescanDiff.removedEpisodes.length}</span> missing items untouched.
                        </p>
                      </button>

                      {/* Option 3: Only Deleted Items */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('deleted_only')}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          rescanSyncMode === 'deleted_only'
                            ? 'bg-gradient-to-br from-rose-500/20 to-red-600/20 border-rose-400 text-white shadow-lg'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black text-xs flex items-center gap-1.5">
                            <Trash2 size={14} className={rescanSyncMode === 'deleted_only' ? 'text-rose-400' : 'text-gray-400'} />
                            Only Deleted Items
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            CLEAN ONLY
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Remove <span className="text-rose-400 font-bold">-{rescanDiff.removedEpisodes.length}</span> deleted items. Will skip adding new episodes.
                        </p>
                      </button>

                      {/* Option 4: Custom Selection */}
                      <button
                        type="button"
                        onClick={() => handleSelectSyncMode('custom')}
                        className={`p-3 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                          rescanSyncMode === 'custom'
                            ? 'bg-gradient-to-br from-purple-500/20 to-indigo-600/20 border-purple-400 text-white shadow-lg'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 text-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-black text-xs flex items-center gap-1.5">
                            <CheckSquare size={14} className={rescanSyncMode === 'custom' ? 'text-purple-400' : 'text-gray-400'} />
                            Custom Selection
                          </span>
                          <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            CHECKBOXES
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-300/90 leading-tight">
                          Manually select / unselect individual episodes and folders below.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Action Plan Pill (Image 2) */}
                  <div className="bg-black/50 border border-white/10 rounded-2xl p-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400">Action Plan:</span>
                      <span className="text-emerald-400 font-bold">+{selectedNewEpIds.size} to add</span>
                      <span className="text-rose-400 font-bold">-{selectedRemovedEpIds.size} to remove</span>
                    </div>
                    <div className="text-gray-300 font-medium">
                      Library Total: <span className="text-cyan-400 font-bold">{episodes.length}</span> →{' '}
                      <span className="text-white font-black">{episodes.length - selectedRemovedEpIds.size + selectedNewEpIds.size}</span> eps
                    </div>
                  </div>

                  {/* Filter Tabs & Detailed list */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setRescanDetailsFilter('all')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                          rescanDetailsFilter === 'all'
                            ? 'bg-white/20 text-white'
                            : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        All Items
                      </button>
                      <button
                        type="button"
                        onClick={() => setRescanDetailsFilter('new')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                          rescanDetailsFilter === 'new'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        ✨ New ({rescanDiff.newEpisodes.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRescanDetailsFilter('removed')}
                        className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                          rescanDetailsFilter === 'removed'
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        🗑️ Missing ({rescanDiff.removedEpisodes.length})
                      </button>
                    </div>

                    <div className="max-h-48 overflow-y-auto space-y-1.5 p-1 custom-scrollbar">
                      {(rescanDetailsFilter === 'all' || rescanDetailsFilter === 'new') &&
                        rescanDiff.newEpisodes.map((ep) => {
                          const isChecked = selectedNewEpIds.has(ep.id);
                          return (
                            <div
                              key={ep.id}
                              onClick={() => {
                                setRescanSyncMode('custom');
                                setSelectedNewEpIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(ep.id)) next.delete(ep.id);
                                  else next.add(ep.id);
                                  return next;
                                });
                              }}
                              className="p-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex items-center justify-between gap-2 cursor-pointer hover:bg-emerald-500/10"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded text-emerald-500"
                                />
                                <span className="font-bold text-white text-xs truncate">
                                  {ep.fileName}
                                </span>
                              </div>
                              <span className="text-[10px] text-emerald-400 font-bold shrink-0">
                                +New
                              </span>
                            </div>
                          );
                        })}

                      {(rescanDetailsFilter === 'all' || rescanDetailsFilter === 'removed') &&
                        rescanDiff.removedEpisodes.map((ep) => {
                          const isChecked = selectedRemovedEpIds.has(ep.id);
                          return (
                            <div
                              key={ep.id}
                              onClick={() => {
                                setRescanSyncMode('custom');
                                setSelectedRemovedEpIds(prev => {
                                  const next = new Set(prev);
                                  if (next.has(ep.id)) next.delete(ep.id);
                                  else next.add(ep.id);
                                  return next;
                                });
                              }}
                              className="p-2 rounded-xl bg-rose-500/5 border border-rose-500/20 flex items-center justify-between gap-2 cursor-pointer hover:bg-rose-500/10"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => {}}
                                  className="rounded text-rose-500"
                                />
                                <span className="font-bold text-white text-xs truncate">
                                  {ep.fileName || ep.name}
                                </span>
                              </div>
                              <span className="text-[10px] text-rose-400 font-bold shrink-0">
                                -Missing
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setShowRescanModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyRescanChanges}
                disabled={rescanStatus === 'scanning' || rescanStatus === 'applying'}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-black font-extrabold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50 shadow-lg"
              >
                {rescanStatus === 'applying' ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    <span>Applying Changes...</span>
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    <span>Apply Sync Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FILE MANAGER MODAL (Tree view) ─────────────────────────────────── */}
      {showFileManagerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-2xl bg-[#090d16] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <FolderPlus size={18} className="text-cyan-400" />
                <h3 className="text-sm font-bold text-white">
                  Manage Folder Files & Subfolders — {series.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFileManagerModal(false)}
                className="p-1 rounded-xl text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-3 flex-1 custom-scrollbar text-xs">
              <p className="text-gray-400 font-mono text-[11px] bg-black/40 p-2.5 rounded-xl border border-white/5 truncate">
                Folder: {series.folderPath || 'Not configured'}
              </p>

              {fmTree?.children?.length > 0 ? (
                <div className="space-y-1.5 pt-2">
                  {fmTree.children.map((child, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-white/[0.03] border border-white/5 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {child.isDirectory ? (
                          <Folder size={15} className="text-amber-400 shrink-0" />
                        ) : (
                          <Film size={15} className="text-cyan-400 shrink-0" />
                        )}
                        <span className="font-bold text-white text-xs truncate">
                          {child.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 font-mono">
                        {child.isDirectory ? 'Directory' : 'Video Episode'}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-8 text-center text-gray-500">
                  No files or subfolders found.
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 border-t border-white/10 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFileManagerModal(false)}
                className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── YOUTUBE TRAILER MODAL ───────────────────────────────────────────── */}
      {activeVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/90 backdrop-blur-md">
          <div className="relative w-full max-w-4xl aspect-video rounded-3xl overflow-hidden bg-black border border-white/15 shadow-2xl flex flex-col">
            <button
              onClick={() => setActiveVideo(null)}
              className="absolute top-3 right-3 z-20 p-2 rounded-full bg-black/80 hover:bg-black text-white border border-white/20 transition cursor-pointer"
            >
              <X size={18} />
            </button>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${activeVideo.key}?autoplay=1`}
              title={activeVideo.name}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── EDIT WEBSERIES MODAL ────────────────────────────────────────────── */}
      {showEditModal && (
        <EditWebseriesModal
          isOpen={showEditModal}
          webseries={series}
          onClose={() => setShowEditModal(false)}
          onSaveWebseries={handleSaveEdit}
        />
      )}

      {/* ── DELETE CONFIRMATION MODAL ───────────────────────────────────────── */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="max-w-md w-full bg-[#0d121f] border border-rose-500/30 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <AlertTriangle size={24} />
              <h3 className="text-base font-bold text-white">Delete Web-series?</h3>
            </div>
            <p className="text-xs text-gray-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-white">"{series.title}"</span> from your library? This will remove all episode records from Firestore and local storage.
            </p>
            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteFolderFromDb}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-lg"
              >
                Delete Web-series
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Set Artwork Small Modal (Poster, Backdrop & Logo Changer - Image 2) ── */}
      <AnimatePresence>
        {artworkTargetImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md select-none"
            onClick={() => !artworkSaving && setArtworkTargetImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-sm bg-[#0e131f] border border-white/15 rounded-3xl p-5 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 border border-amber-500/20">
                    <Sparkles size={16} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Set Web-series Artwork</h3>
                    <p className="text-[10px] text-gray-400 capitalize">
                      {artworkTargetImage.isPoster ? 'Poster Image' : artworkTargetImage.isLogo ? 'Logo Artwork' : artworkTargetImage.isBackdrop ? 'Backdrop Image' : 'Artwork Image'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setArtworkTargetImage(null)}
                  disabled={artworkSaving}
                  className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Artwork Preview Thumbnail */}
              <div className="relative rounded-2xl overflow-hidden bg-black/60 border border-white/10 flex items-center justify-center p-2">
                <img
                  src={artworkTargetImage.url}
                  alt="Artwork Preview"
                  className={`max-h-48 rounded-xl object-contain ${
                    artworkTargetImage.isPoster ? 'aspect-[2/3] max-w-[130px]' : artworkTargetImage.isLogo ? 'max-w-[200px] py-2' : 'w-full aspect-[16/9] object-cover'
                  }`}
                />
                {artworkTargetImage.width && (
                  <span className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 border border-white/15 text-[10px] font-mono text-gray-300">
                    {artworkTargetImage.width} × {artworkTargetImage.height} px
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {artworkTargetImage.isBackdrop && (
                  <button
                    type="button"
                    disabled={artworkSaving || series.backdropUrl === artworkTargetImage.url}
                    onClick={() => handleSetBackdrop(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                      series.backdropUrl === artworkTargetImage.url
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-300 cursor-default'
                        : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black active:scale-98'
                    }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-black" />
                    ) : series.backdropUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Backdrop
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Set as Web-series Backdrop
                      </>
                    )}
                  </button>
                )}

                {artworkTargetImage.isPoster && (
                  <button
                    type="button"
                    disabled={artworkSaving || series.posterUrl === artworkTargetImage.url}
                    onClick={() => handleSetPoster(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                      series.posterUrl === artworkTargetImage.url
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 cursor-default'
                        : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black active:scale-98'
                    }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-black" />
                    ) : series.posterUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Poster
                      </>
                    ) : (
                      <>
                        <Film size={14} /> Set as Web-series Poster
                      </>
                    )}
                  </button>
                )}

                {artworkTargetImage.isLogo && (
                  <button
                    type="button"
                    disabled={artworkSaving || series.logoUrl === artworkTargetImage.url}
                    onClick={() => handleSetLogo(artworkTargetImage.url)}
                    className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                      series.logoUrl === artworkTargetImage.url
                        ? 'bg-purple-500/15 border border-purple-500/30 text-purple-300 cursor-default'
                        : 'bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white active:scale-98'
                    }`}
                  >
                    {artworkSaving ? (
                      <Loader2 size={15} className="animate-spin text-white" />
                    ) : series.logoUrl === artworkTargetImage.url ? (
                      <>
                        <Check size={14} /> Current Logo
                      </>
                    ) : (
                      <>
                        <Sparkles size={14} /> Set as Web-series Logo
                      </>
                    )}
                  </button>
                )}

                {/* Secondary flexible options */}
                {artworkTargetImage.isBackdrop && series.posterUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetPoster(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Film size={13} />
                    <span>Set as Poster Instead</span>
                  </button>
                )}
                {artworkTargetImage.isPoster && series.backdropUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetBackdrop(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles size={13} />
                    <span>Set as Backdrop Instead</span>
                  </button>
                )}
                {!artworkTargetImage.isLogo && series.logoUrl !== artworkTargetImage.url && (
                  <button
                    type="button"
                    disabled={artworkSaving}
                    onClick={() => handleSetLogo(artworkTargetImage.url)}
                    className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-purple-300 hover:text-white border border-white/10 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <Sparkles size={13} className="text-purple-400" />
                    <span>Set as Logo Instead</span>
                  </button>
                )}

                {/* Download Image Button */}
                <button
                  type="button"
                  onClick={() => handleDownloadImage(artworkTargetImage.url)}
                  className="w-full py-2.5 px-3 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer shadow-md"
                >
                  <Download size={14} />
                  <span>Download Image</span>
                </button>

                <button
                  type="button"
                  onClick={() => setArtworkTargetImage(null)}
                  disabled={artworkSaving}
                  className="w-full py-2 px-3 rounded-xl bg-transparent hover:bg-white/5 text-gray-400 hover:text-gray-200 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── IMAGE PREVIEW LIGHTBOX ── */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-10 right-0 p-2 rounded-full bg-black/60 text-white hover:bg-black/90 transition cursor-pointer"
            >
              <X size={20} />
            </button>
            <img
              src={previewImage.url}
              alt="Preview"
              className="max-h-[82vh] w-auto rounded-2xl object-contain shadow-2xl border border-white/10"
            />
            {previewImage.width && previewImage.height && (
              <span className="mt-2 text-xs font-mono text-gray-400">
                {previewImage.width} × {previewImage.height} px
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── TOAST NOTIFICATION ── */}
      <AnimatePresence>
        {toastMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-2xl bg-amber-500 text-black font-bold text-xs shadow-2xl flex items-center gap-2"
          >
            <Sparkles size={16} />
            <span>{toastMsg}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
