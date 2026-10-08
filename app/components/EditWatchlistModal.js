"use client";

import React, { useState, useEffect } from 'react';
import {
  X, Bookmark, Sparkles, Loader2, Image as ImageIcon,
  Globe, CreditCard, DollarSign, Eye, Plus, Check,
  Youtube, Play, Video
} from 'lucide-react';
import { motion } from 'framer-motion';

const extractYoutubeId = (urlOrId) => {
  if (!urlOrId) return '';
  const str = String(urlOrId).trim();
  if (str.startsWith('youtube://')) return str.replace('youtube://', '');
  const match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|live\/))([\w-]{11})/);
  if (match && match[1]) {
    return match[1];
  }
  if (/^[\w-]{11}$/.test(str)) {
    return str;
  }
  return '';
};

export default function EditWatchlistModal({
  isOpen,
  onClose,
  item,
  onSave,
}) {
  const [title, setTitle] = useState('');
  const [originalTitle, setOriginalTitle] = useState('');
  const [year, setYear] = useState('');
  const [rating, setRating] = useState('');
  const [status, setStatus] = useState('Plan to Watch');
  const [overview, setOverview] = useState('');
  const [posterUrl, setPosterUrl] = useState('');
  const [backdropUrl, setBackdropUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [streamProviders, setStreamProviders] = useState({
    needPlan: [],
    rent: [],
    buy: [],
    free: [],
  });

  const [availableVideos, setAvailableVideos] = useState([]);
  const [fetchingVideos, setFetchingVideos] = useState(false);
  const [videoFetchMsg, setVideoFetchMsg] = useState('');
  const [selectedVideoKey, setSelectedVideoKey] = useState('');
  const [customYoutubeInput, setCustomYoutubeInput] = useState('');

  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderPlan, setNewProviderPlan] = useState('needPlan');
  const [newProviderUrl, setNewProviderUrl] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (item && isOpen) {
      setTitle(item.title || '');
      setOriginalTitle(item.originalTitle || '');
      setYear(item.year || '');
      setRating(item.rating ? String(item.rating) : '');
      setStatus(item.status || 'Plan to Watch');
      setOverview(item.overview || item.description || '');
      setPosterUrl(item.posterUrl || '');
      setBackdropUrl(item.backdropUrl || '');
      setLogoUrl(item.logoUrl || '');
      setStreamProviders(item.streamProviders || { needPlan: [], rent: [], buy: [], free: [] });
      const initVideos = Array.isArray(item.videos) ? item.videos : [];
      setAvailableVideos(initVideos);
      const curYt = extractYoutubeId(item.youtubeId || item.youtubeUrl || item.trailerKey || item.trailerUrl || item.youtubeTrailer);
      setSelectedVideoKey(curYt || '');
      setCustomYoutubeInput(curYt ? `https://www.youtube.com/watch?v=${curYt}` : (item.trailerUrl || item.youtubeUrl || ''));
      setVideoFetchMsg('');
    }
  }, [item, isOpen]);

  if (!isOpen || !item) return null;

  const handleFetchVideos = async () => {
    setFetchingVideos(true);
    setVideoFetchMsg('');
    try {
      const q = encodeURIComponent(title.trim() || item.title || '');
      const mediaId = item.tmdbId || item.id || '';
      const cType = item.contentType || 'movie';
      const res = await fetch(`/api/watchlist/details?id=${encodeURIComponent(mediaId)}&type=${encodeURIComponent(cType)}&q=${q}`);
      const data = await res.json();
      if (data.success && Array.isArray(data.details?.videos) && data.details.videos.length > 0) {
        setAvailableVideos(data.details.videos);
        setVideoFetchMsg(`Found ${data.details.videos.length} YouTube video${data.details.videos.length > 1 ? 's' : ''}!`);
        if (!selectedVideoKey) {
          const topVid = data.details.videos.find(v => (v.type || '').toLowerCase() === 'teaser') || data.details.videos.find(v => (v.type || '').toLowerCase() === 'trailer') || data.details.videos[0];
          if (topVid?.key) {
            setSelectedVideoKey(topVid.key);
            setCustomYoutubeInput(`https://www.youtube.com/watch?v=${topVid.key}`);
          }
        }
      } else {
        setVideoFetchMsg('No YouTube videos found for this media.');
      }
    } catch (err) {
      console.error('Failed to fetch videos:', err);
      setVideoFetchMsg('Error connecting to media service.');
    } finally {
      setFetchingVideos(false);
    }
  };

  const handleSelectVideo = (vid) => {
    const key = extractYoutubeId(vid.key || vid.url || vid.id);
    if (key) {
      if (selectedVideoKey === key) {
        setSelectedVideoKey('');
        setCustomYoutubeInput('');
      } else {
        setSelectedVideoKey(key);
        setCustomYoutubeInput(`https://www.youtube.com/watch?v=${key}`);
      }
    }
  };

  const handleCustomYoutubeChange = (val) => {
    setCustomYoutubeInput(val);
    const key = extractYoutubeId(val);
    setSelectedVideoKey(key || '');
  };

  const handleAddStream = () => {
    if (!newProviderName.trim()) return;
    setStreamProviders(prev => ({
      ...prev,
      [newProviderPlan]: [
        ...(prev[newProviderPlan] || []),
        { id: `sp-${Date.now()}`, name: newProviderName.trim(), url: newProviderUrl.trim() }
      ]
    }));
    setNewProviderName('');
    setNewProviderUrl('');
  };

  const handleRemoveStream = (planKey, idx) => {
    setStreamProviders(prev => ({
      ...prev,
      [planKey]: prev[planKey].filter((_, i) => i !== idx),
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    try {
      const chosenKey = selectedVideoKey || extractYoutubeId(customYoutubeInput);
      const chosenUrl = chosenKey ? `https://www.youtube.com/watch?v=${chosenKey}` : (customYoutubeInput.trim() || '');

      let updatedVideos = [...availableVideos];
      if (chosenKey) {
        const existingIdx = updatedVideos.findIndex(v => (v.key === chosenKey || v.id === chosenKey));
        if (existingIdx >= 0) {
          const [matched] = updatedVideos.splice(existingIdx, 1);
          updatedVideos = [matched, ...updatedVideos];
        } else {
          updatedVideos = [
            {
              id: `custom-${chosenKey}`,
              name: `${title.trim()} Selected Video`,
              key: chosenKey,
              site: 'YouTube',
              type: 'Trailer',
              official: true,
            },
            ...updatedVideos
          ];
        }
      }

      const updated = {
        ...item,
        title: title.trim(),
        originalTitle: originalTitle.trim(),
        year: year.trim(),
        rating: rating ? Number(rating) : 0,
        status,
        overview: overview.trim(),
        posterUrl: posterUrl.trim(),
        backdropUrl: backdropUrl.trim(),
        logoUrl: logoUrl.trim(),
        streamProviders,
        trailerUrl: chosenUrl || item.trailerUrl || '',
        trailerKey: chosenKey || item.trailerKey || '',
        youtubeTrailer: chosenUrl || item.youtubeTrailer || '',
        youtubeUrl: chosenUrl || item.youtubeUrl || '',
        youtubeId: chosenKey || item.youtubeId || '',
        videos: updatedVideos,
        updatedAt: new Date().toISOString(),
      };

      await onSave(updated);
      onClose();
    } catch (err) {
      console.error('Save error:', err);
      alert('Failed to save changes: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-2xl bg-[#0c101a] border border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Bookmark size={18} className="text-amber-400" />
            Edit Watchlist Item
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-xs">
          {/* Status selector */}
          <div>
            <label className="block text-gray-400 font-bold mb-1.5">Watchlist Status</label>
            <div className="flex gap-2">
              {['Plan to Watch', 'Currently Watching', 'Completed'].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    status === s
                      ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                      : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Title & Year */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 font-bold mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-gray-400 font-bold mb-1">Release Year</label>
              <input
                type="text"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none"
              />
            </div>
          </div>

          {/* Overview */}
          <div>
            <label className="block text-gray-400 font-bold mb-1">Storyline / Overview</label>
            <textarea
              rows={3}
              value={overview}
              onChange={(e) => setOverview(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none custom-scrollbar"
            />
          </div>

          {/* Poster & Backdrop URLs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-gray-400 font-bold mb-1">Poster URL</label>
              <input
                type="text"
                value={posterUrl}
                onChange={(e) => setPosterUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-gray-400 font-bold mb-1">Backdrop Banner URL</label>
              <input
                type="text"
                value={backdropUrl}
                onChange={(e) => setBackdropUrl(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none font-mono"
              />
            </div>
          </div>

            {/* Logo URL */}
          <div>
            <label className="block text-gray-400 font-bold mb-1">Title Logo Art URL</label>
            <input
              type="text"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="Transparent PNG URL"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none font-mono"
            />
          </div>

          {/* Playable Video / YouTube Teaser & Trailer Picker */}
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs uppercase tracking-wider text-gray-300 font-bold flex items-center gap-1.5">
                <Youtube size={15} className="text-red-500" />
                <span>Playable Video / Teaser Trailer (YouTube)</span>
              </label>
              <button
                type="button"
                onClick={handleFetchVideos}
                disabled={fetchingVideos}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 hover:text-white font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
                title="Fetch trailers and teasers from media service"
              >
                {fetchingVideos ? (
                  <Loader2 size={12} className="animate-spin text-red-400" />
                ) : (
                  <Sparkles size={12} className="text-red-400" />
                )}
                <span>{fetchingVideos ? 'Fetching...' : 'Fetch Videos'}</span>
              </button>
            </div>

            <p className="text-[11px] text-gray-400 leading-relaxed">
              Select a fetched YouTube teaser/trailer below or paste any YouTube video link to play in the preview modal and player.
            </p>

            {videoFetchMsg && (
              <div className="text-[11px] p-2.5 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 flex items-center justify-between gap-2">
                <span>{videoFetchMsg}</span>
                <button
                  type="button"
                  onClick={() => setVideoFetchMsg('')}
                  className="text-gray-400 hover:text-white text-xs cursor-pointer"
                >
                  <X size={12} />
                </button>
              </div>
            )}

            {/* Custom YouTube Link Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Paste any YouTube video link (e.g. https://www.youtube.com/watch?v=... or ID)"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none"
                value={customYoutubeInput}
                onChange={(e) => handleCustomYoutubeChange(e.target.value)}
              />
              {selectedVideoKey && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedVideoKey('');
                    setCustomYoutubeInput('');
                  }}
                  className="px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs font-bold transition cursor-pointer"
                  title="Clear selected video"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Fetched Videos List */}
            {availableVideos.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  <span>Available Videos ({availableVideos.length})</span>
                  <span className="text-gray-500 font-normal">Click to set as playable video</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1.5 rounded-xl bg-black/40 border border-white/5 custom-scrollbar">
                  {availableVideos.map((vid, idx) => {
                    const vKey = extractYoutubeId(vid.key || vid.url || vid.id);
                    const isSelected = selectedVideoKey === vKey;
                    const isTeaser = (vid.type || '').toLowerCase() === 'teaser';
                    return (
                      <div
                        key={vid.id || `vid-${idx}`}
                        onClick={() => handleSelectVideo(vid)}
                        className={`p-2 rounded-xl border flex items-center gap-2.5 cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-red-500/20 border-red-500 shadow-md ring-1 ring-red-500/50'
                            : 'bg-white/5 border-white/10 hover:border-white/30 hover:bg-white/10'
                        }`}
                      >
                        {vKey ? (
                          <div className="relative w-16 h-10 rounded-lg overflow-hidden shrink-0 bg-black/60 border border-white/10">
                            <img
                              src={`https://img.youtube.com/vi/${vKey}/mqdefault.jpg`}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                              <Play size={10} className="text-white fill-white" />
                            </div>
                          </div>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                              isTeaser ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'
                            }`}>
                              {vid.type || 'Video'}
                            </span>
                            {isSelected && (
                              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-0.5">
                                <Check size={9} /> Selected
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-200 font-medium truncate mt-0.5">
                            {vid.name || `Video #${idx + 1}`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Stream Providers */}
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
            <span className="font-bold text-white flex items-center gap-1.5">
              <Globe size={14} className="text-cyan-400" /> Where to Stream
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              {['needPlan', 'rent', 'buy', 'free'].map((k) => (
                <div key={k} className="p-2 rounded-xl bg-black/40 border border-white/5 space-y-1">
                  <span className="font-bold text-gray-400 uppercase text-[9px] block">
                    {k === 'needPlan' ? 'Need Plan' : k}
                  </span>
                  {(streamProviders[k] || []).map((p, idx) => (
                    <div key={idx} className="flex items-center justify-between text-gray-200">
                      <span className="truncate">{p.name}</span>
                      <button type="button" onClick={() => handleRemoveStream(k, idx)} className="text-gray-500 hover:text-red-400">
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Provider name"
                value={newProviderName}
                onChange={(e) => setNewProviderName(e.target.value)}
                className="px-2.5 py-1.5 bg-white/5 border border-white/10 rounded-xl text-white flex-1"
              />
              <select
                value={newProviderPlan}
                onChange={(e) => setNewProviderPlan(e.target.value)}
                className="px-2 py-1.5 bg-[#151a28] border border-white/10 rounded-xl text-white"
              >
                <option value="needPlan">Need Plan</option>
                <option value="rent">Rent</option>
                <option value="buy">Buy</option>
                <option value="free">Free</option>
              </select>
              <button
                type="button"
                onClick={handleAddStream}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold"
              >
                Add
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold flex items-center gap-1.5 cursor-pointer"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
