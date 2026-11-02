"use client";

import React, { useState, useEffect } from 'react';
import { Shield, RefreshCw, Loader2, Check, Sparkles, AlertCircle, CheckCircle2 } from 'lucide-react';
import { cleanTitleForOmdb, fetchOmdbData } from '../utils/omdbUtils';
import { mapUsToIndianRating, normalizeIndianRating } from '../utils/ageRatingUtils';

const STANDARD_INDIAN_RATINGS = ['U', 'U/A 7+', 'U/A 13+', 'U/A 16+', 'A', 'S'];

export default function RatingSourceSelector({
  title = '',
  year = '',
  imdbId = '',
  tmdbId = '',
  type = 'movie', // 'movie' | 'series' | 'anime' | 'tv' | 'watchlist'
  ageRating = '',
  setAgeRating,
  tmdbAgeRating = '',
  setTmdbAgeRating,
  omdbAgeRating = '',
  setOmdbAgeRating,
  ageRatingSource = 'tmdb', // 'tmdb' | 'omdb'
  setAgeRatingSource,
  currentOmdb = null,
  onAgeRatingChanged = null,
}) {
  const [fetchingTmdb, setFetchingTmdb] = useState(false);
  const [fetchingOmdb, setFetchingOmdb] = useState(false);
  const [omdbRawRated, setOmdbRawRated] = useState(() => currentOmdb?.rated || null);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync raw rated from props if available
  useEffect(() => {
    if (currentOmdb?.rated) {
      setOmdbRawRated(currentOmdb.rated);
      const converted = mapUsToIndianRating(currentOmdb.rated) || normalizeIndianRating(currentOmdb.rated) || currentOmdb.rated;
      if (!omdbAgeRating && setOmdbAgeRating) {
        setOmdbAgeRating(converted);
      }
    }
  }, [currentOmdb]);

  // Fetch TMDB Indian Age Rating
  const handleFetchTmdb = async () => {
    setFetchingTmdb(true);
    setErrorMsg('');
    setStatusMsg('');

    try {
      const cleanTitle = cleanTitleForOmdb(title) || title.trim();
      const targetId = tmdbId || (imdbId && String(imdbId).startsWith('tt') ? imdbId : null);

      // 1. Try by tmdbId or imdbId
      if (targetId && !String(targetId).startsWith('watchlist-') && !String(targetId).startsWith('anilist-')) {
        if (type === 'movie') {
          const res = await fetch(`/api/movies/details?id=${encodeURIComponent(targetId)}`);
          const data = await res.json();
          if (data.success && data.movie?.ageRating) {
            const foundRating = normalizeIndianRating(data.movie.ageRating) || data.movie.ageRating;
            if (setTmdbAgeRating) setTmdbAgeRating(foundRating);
            if (ageRatingSource === 'tmdb' || !ageRating) {
              if (setAgeRating) setAgeRating(foundRating);
              if (onAgeRatingChanged) onAgeRatingChanged(foundRating);
            }
            setStatusMsg(`TMDB Indian Age Rating fetched: ${foundRating}`);
            setFetchingTmdb(false);
            return;
          }
        } else {
          const typeParam = type === 'anime' ? 'anime' : 'web-series';
          const res = await fetch(`/api/watchlist/details?type=${encodeURIComponent(typeParam)}&id=${encodeURIComponent(targetId)}`);
          const data = await res.json();
          if (data.success && data.details?.ageRating) {
            const foundRating = normalizeIndianRating(data.details.ageRating) || data.details.ageRating;
            if (setTmdbAgeRating) setTmdbAgeRating(foundRating);
            if (ageRatingSource === 'tmdb' || !ageRating) {
              if (setAgeRating) setAgeRating(foundRating);
              if (onAgeRatingChanged) onAgeRatingChanged(foundRating);
            }
            setStatusMsg(`TMDB Indian Age Rating fetched: ${foundRating}`);
            setFetchingTmdb(false);
            return;
          }
        }
      }

      // 2. Search by title for anime
      if (type === 'anime') {
        const res = await fetch(`/api/anime/details?q=${encodeURIComponent(cleanTitle)}`);
        const data = await res.json();
        if (data.success && data.anime?.ageRating) {
          const foundRating = normalizeIndianRating(data.anime.ageRating) || data.anime.ageRating;
          if (setTmdbAgeRating) setTmdbAgeRating(foundRating);
          if (ageRatingSource === 'tmdb' || !ageRating) {
            if (setAgeRating) setAgeRating(foundRating);
            if (onAgeRatingChanged) onAgeRatingChanged(foundRating);
          }
          setStatusMsg(`TMDB Indian Age Rating fetched: ${foundRating}`);
          setFetchingTmdb(false);
          return;
        }
      }

      // 3. Fallback search by title
      const searchType = type === 'movie' ? 'movie' : 'web-series';
      const searchRes = await fetch(`/api/watchlist/search?type=${encodeURIComponent(searchType)}&q=${encodeURIComponent(cleanTitle)}`);
      const searchData = await searchRes.json();
      if (searchData.success && Array.isArray(searchData.results) && searchData.results.length > 0) {
        const first = searchData.results[0];
        if (first.id) {
          const detailRes = await fetch(`/api/watchlist/details?type=${encodeURIComponent(searchType)}&id=${encodeURIComponent(first.id)}`);
          const detailData = await detailRes.json();
          if (detailData.success && detailData.details?.ageRating) {
            const foundRating = normalizeIndianRating(detailData.details.ageRating) || detailData.details.ageRating;
            if (setTmdbAgeRating) setTmdbAgeRating(foundRating);
            if (ageRatingSource === 'tmdb' || !ageRating) {
              if (setAgeRating) setAgeRating(foundRating);
              if (onAgeRatingChanged) onAgeRatingChanged(foundRating);
            }
            setStatusMsg(`TMDB Indian Age Rating fetched: ${foundRating}`);
            setFetchingTmdb(false);
            return;
          }
        }
      }

      setErrorMsg(`Could not find Indian age rating on TMDB for "${cleanTitle}".`);
    } catch (err) {
      console.error('Error fetching TMDB age rating:', err);
      setErrorMsg(err.message || 'Error fetching TMDB age rating');
    } finally {
      setFetchingTmdb(false);
    }
  };

  // Fetch OMDB / IMDb Age Rating using IMDb ID if available, otherwise search by title
  const handleFetchOmdb = async () => {
    setFetchingOmdb(true);
    setErrorMsg('');
    setStatusMsg('');

    try {
      const cleanTitle = cleanTitleForOmdb(title) || title.trim();
      const omdbType = (type === 'movie') ? 'movie' : 'series';

      // Check if IMDb ID is available from the OMDB section
      const validImdbId = imdbId && String(imdbId).trim().startsWith('tt') ? String(imdbId).trim() : '';

      const queryParams = {
        type: omdbType,
      };

      if (validImdbId) {
        // Query by IMDb ID
        queryParams.imdbId = validImdbId;
      } else {
        // Fall back to title + year search
        queryParams.title = cleanTitle;
        if (year) queryParams.year = String(year).trim();
      }

      const result = await fetchOmdbData(queryParams);

      if (result.success && result.omdb) {
        const rawRated = result.omdb.rated;
        if (rawRated && rawRated !== 'N/A') {
          const indianRated = mapUsToIndianRating(rawRated) || normalizeIndianRating(rawRated) || rawRated;
          setOmdbRawRated(rawRated);
          if (setOmdbAgeRating) setOmdbAgeRating(indianRated);
          if (ageRatingSource === 'omdb' || !ageRating) {
            if (setAgeRating) setAgeRating(indianRated);
            if (onAgeRatingChanged) onAgeRatingChanged(indianRated);
          }
          setStatusMsg(`OMDB Age Rating: ${indianRated}${rawRated !== indianRated ? ` (from ${rawRated})` : ''} via ${validImdbId ? `IMDb ID ${validImdbId}` : `title search`}`);
        } else {
          setErrorMsg(`OMDB found record (${validImdbId || cleanTitle}), but Rated is N/A.`);
        }
      } else {
        setErrorMsg(result.error || `No OMDB data found for "${validImdbId || cleanTitle}".`);
      }
    } catch (err) {
      console.error('Error fetching OMDB age rating:', err);
      setErrorMsg(err.message || 'Error fetching OMDB age rating');
    } finally {
      setFetchingOmdb(false);
    }
  };

  // Fetch Both Simultaneously
  const handleFetchBoth = async () => {
    setErrorMsg('');
    setStatusMsg('');
    await Promise.all([handleFetchTmdb(), handleFetchOmdb()]);
  };

  // Select which age rating is visible
  const selectSource = (source) => {
    if (setAgeRatingSource) setAgeRatingSource(source);
    if (source === 'tmdb') {
      if (tmdbAgeRating && setAgeRating) setAgeRating(tmdbAgeRating);
      if (tmdbAgeRating && onAgeRatingChanged) onAgeRatingChanged(tmdbAgeRating);
    } else {
      if (omdbAgeRating && setAgeRating) setAgeRating(omdbAgeRating);
      if (omdbAgeRating && onAgeRatingChanged) onAgeRatingChanged(omdbAgeRating);
    }
  };

  const isTmdbSelected = ageRatingSource === 'tmdb';
  const isOmdbSelected = ageRatingSource === 'omdb';
  const activeRatingValue = isTmdbSelected ? (tmdbAgeRating || ageRating) : (omdbAgeRating || ageRating);

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-xs uppercase tracking-wider text-pink-400 font-extrabold flex items-center gap-2">
          <Shield size={15} className="text-pink-400 fill-pink-400/20" />
          <span>Rating Display &amp; Source (TMDB &amp; OMDB / IMDb Indian Age Rating)</span>
        </label>

        {/* Current Active Badge */}
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border flex items-center gap-1.5 ${
          activeRatingValue
            ? (isTmdbSelected ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300' : 'bg-amber-500/15 border-amber-500/40 text-amber-300')
            : 'bg-white/5 border-white/10 text-gray-400'
        }`}>
          <CheckCircle2 size={11} />
          <span>
            Active Age Rating: {activeRatingValue || 'None'} ({isTmdbSelected ? 'TMDB' : 'OMDB / IMDb'})
          </span>
        </span>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        Fetch official Indian age ratings (<span className="text-white font-bold">U, U/A 7+, U/A 13+, U/A 16+, A, S</span>) from <span className="text-cyan-300 font-bold">TMDB</span> and <span className="text-amber-300 font-bold">OMDB / IMDb</span> (using IMDb ID if available). Click either card to set it as the active visible rating on card badges, slider banners, and details pages.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleFetchBoth}
          disabled={fetchingTmdb || fetchingOmdb || (!title.trim() && !imdbId.trim())}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 via-purple-600 to-cyan-500 hover:brightness-110 disabled:opacity-40 text-white font-extrabold text-xs flex items-center gap-1.5 transition shadow-lg cursor-pointer active:scale-95"
        >
          {fetchingTmdb || fetchingOmdb ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Fetching Age Ratings...</span>
            </>
          ) : (
            <>
              <Sparkles size={13} className="text-yellow-300" />
              <span>Fetch TMDB &amp; OMDB Age Ratings</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={handleFetchTmdb}
          disabled={fetchingTmdb || !title.trim()}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-cyan-500/30 text-cyan-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
        >
          {fetchingTmdb ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          <span>Fetch TMDB</span>
        </button>

        <button
          type="button"
          onClick={handleFetchOmdb}
          disabled={fetchingOmdb || (!title.trim() && !imdbId.trim())}
          className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-amber-500/30 text-amber-300 font-bold text-xs flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
          title={imdbId ? `Search using IMDb ID: ${imdbId}` : 'Search using title'}
        >
          {fetchingOmdb ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          <span>Fetch OMDB {imdbId ? '(by ID)' : ''}</span>
        </button>
      </div>

      {/* Status / Error Toast */}
      {statusMsg && (
        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 size={13} className="text-emerald-400 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle size={13} className="text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Dual Age Rating Selection Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Card 1: TMDB Indian Age Rating */}
        <div
          onClick={() => selectSource('tmdb')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
            isTmdbSelected
              ? 'bg-cyan-950/25 border-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.25)] ring-1 ring-cyan-400/50'
              : 'bg-black/40 border-white/10 hover:border-white/25 hover:bg-white/[0.04]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-[#01b4e4] text-[#0d253f] font-black text-[10px] tracking-wider">
                  TMDB
                </span>
                <span className="text-xs font-bold text-gray-300">Indian Certification</span>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                isTmdbSelected ? 'border-cyan-400 bg-cyan-400' : 'border-gray-500'
              }`}>
                {isTmdbSelected && <Check size={11} className="text-black stroke-[3]" />}
              </div>
            </div>

            {/* Age Rating Big Badge */}
            <div className="flex items-baseline gap-2 mt-1">
              <div className="flex items-center gap-1.5">
                <Shield size={18} className="text-cyan-400 fill-cyan-400/20" />
                <span className="text-2xl font-black text-white tracking-wide">
                  {tmdbAgeRating ? tmdbAgeRating : '--'}
                </span>
              </div>
            </div>

            {/* Quick Pick Standard Ratings */}
            <div className="flex flex-wrap gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
              {STANDARD_INDIAN_RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    if (setTmdbAgeRating) setTmdbAgeRating(r);
                    if (isTmdbSelected) {
                      if (setAgeRating) setAgeRating(r);
                      if (onAgeRatingChanged) onAgeRatingChanged(r);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition ${
                    tmdbAgeRating === r
                      ? 'bg-cyan-400 text-black border-cyan-300'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: Score manual tweak + Selection button */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-gray-400 font-semibold shrink-0">Custom:</span>
              <input
                type="text"
                value={tmdbAgeRating}
                onChange={(e) => {
                  const val = e.target.value;
                  if (setTmdbAgeRating) setTmdbAgeRating(val);
                  if (isTmdbSelected) {
                    if (setAgeRating) setAgeRating(val);
                    if (onAgeRatingChanged) onAgeRatingChanged(val);
                  }
                }}
                placeholder="e.g. U/A 16+"
                className="w-full px-2.5 py-1 rounded-lg bg-black/60 border border-white/15 text-xs text-cyan-300 font-bold focus:outline-none focus:border-cyan-400"
              />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectSource('tmdb');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                isTmdbSelected
                  ? 'bg-cyan-500 text-black font-black shadow-md shadow-cyan-500/30'
                  : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white border border-white/10'
              }`}
            >
              {isTmdbSelected ? '✓ Visible' : 'Set Visible'}
            </button>
          </div>
        </div>

        {/* Card 2: OMDB / IMDb Indian Age Rating */}
        <div
          onClick={() => selectSource('omdb')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative flex flex-col justify-between gap-3 ${
            isOmdbSelected
              ? 'bg-amber-950/25 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.25)] ring-1 ring-amber-400/50'
              : 'bg-black/40 border-white/10 hover:border-white/25 hover:bg-white/[0.04]'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md bg-[#f5c518] text-black font-black text-[10px] tracking-wider">
                  IMDb
                </span>
                <span className="text-xs font-bold text-gray-300">OMDB / Rated</span>
              </div>
              <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                isOmdbSelected ? 'border-amber-400 bg-amber-400' : 'border-gray-500'
              }`}>
                {isOmdbSelected && <Check size={11} className="text-black stroke-[3]" />}
              </div>
            </div>

            {/* Age Rating Big Badge */}
            <div className="flex items-baseline gap-2 mt-1">
              <div className="flex items-center gap-1.5">
                <Shield size={18} className="text-amber-400 fill-amber-400/20" />
                <span className="text-2xl font-black text-white tracking-wide">
                  {omdbAgeRating ? omdbAgeRating : '--'}
                </span>
              </div>
              {omdbRawRated && omdbRawRated !== omdbAgeRating && (
                <span className="text-[10px] text-gray-400 font-mono">
                  (from {omdbRawRated})
                </span>
              )}
            </div>

            {/* Quick Pick Standard Ratings */}
            <div className="flex flex-wrap gap-1 mt-2.5" onClick={(e) => e.stopPropagation()}>
              {STANDARD_INDIAN_RATINGS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => {
                    if (setOmdbAgeRating) setOmdbAgeRating(r);
                    if (isOmdbSelected) {
                      if (setAgeRating) setAgeRating(r);
                      if (onAgeRatingChanged) onAgeRatingChanged(r);
                    }
                  }}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold border transition ${
                    omdbAgeRating === r
                      ? 'bg-amber-400 text-black border-amber-300'
                      : 'bg-white/5 hover:bg-white/10 text-gray-300 border-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Bottom Row: Score manual tweak + Selection button */}
          <div className="flex items-center gap-2 pt-2 border-t border-white/5">
            <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
              <span className="text-[10px] text-gray-400 font-semibold shrink-0">Custom:</span>
              <input
                type="text"
                value={omdbAgeRating}
                onChange={(e) => {
                  const val = e.target.value;
                  if (setOmdbAgeRating) setOmdbAgeRating(val);
                  if (isOmdbSelected) {
                    if (setAgeRating) setAgeRating(val);
                    if (onAgeRatingChanged) onAgeRatingChanged(val);
                  }
                }}
                placeholder="e.g. U/A 16+"
                className="w-full px-2.5 py-1 rounded-lg bg-black/60 border border-white/15 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                selectSource('omdb');
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer ${
                isOmdbSelected
                  ? 'bg-amber-400 text-black font-black shadow-md shadow-amber-400/30'
                  : 'bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white border border-white/10'
              }`}
            >
              {isOmdbSelected ? '✓ Visible' : 'Set Visible'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
