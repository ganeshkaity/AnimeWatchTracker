"use client";

import React, { useState, useEffect } from 'react';
import { Search, Loader2, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Trophy, DollarSign, Star, Film } from 'lucide-react';
import { cleanTitleForOmdb, fetchOmdbData } from '../utils/omdbUtils';

export default function OmdbRefetchSection({
  title = '',
  year = '',
  imdbId = '',
  type = 'movie',
  currentOmdb = null,
  onOmdbUpdated,
}) {
  const [customTitle, setCustomTitle] = useState(() => cleanTitleForOmdb(title));
  const [customYear, setCustomYear] = useState(year ? String(year).trim() : '');
  const [customImdbId, setCustomImdbId] = useState(imdbId ? String(imdbId).trim() : '');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [fetchedData, setFetchedData] = useState(() => currentOmdb || null);

  // Sync customTitle when title prop changes if field was untouched
  useEffect(() => {
    if (title) {
      setCustomTitle(cleanTitleForOmdb(title));
    }
  }, [title]);

  useEffect(() => {
    if (year) {
      setCustomYear(String(year).trim());
    }
  }, [year]);

  useEffect(() => {
    if (imdbId) {
      setCustomImdbId(String(imdbId).trim());
    }
  }, [imdbId]);

  useEffect(() => {
    if (currentOmdb) {
      setFetchedData(currentOmdb);
    }
  }, [currentOmdb]);

  const handleFetch = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const result = await fetchOmdbData({
        title: customTitle,
        year: customYear,
        imdbId: customImdbId,
        type,
      });

      if (result.success && result.omdb) {
        setFetchedData(result.omdb);
        setSuccessMsg(`Fetched OMDB data for "${result.omdb.title || customTitle}" successfully!`);
        if (onOmdbUpdated) {
          onOmdbUpdated({
            omdb: result.omdb,
            imdbId: result.omdb.imdbId || customImdbId || null,
            imdbRating: result.omdb.imdbRating || null,
            imdbVotes: result.omdb.imdbVotes || null,
            rottenTomatoes: result.omdb.rottenTomatoes || null,
            metacritic: result.omdb.metacritic || null,
            awards: result.omdb.awards || null,
            boxOffice: result.omdb.boxOffice || null,
          });
        }
      } else {
        setErrorMsg(result.error || `No OMDB data found for "${customTitle}". Try editing title.`);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Error fetching OMDB data.');
    } finally {
      setLoading(false);
    }
  };

  const imdbScore = fetchedData?.imdbRating || currentOmdb?.imdbRating;
  const imdbVoteCount = fetchedData?.imdbVotes || currentOmdb?.imdbVotes;
  const rottenScore = fetchedData?.rottenTomatoes || currentOmdb?.rottenTomatoes;
  const metaScore = fetchedData?.metacritic || currentOmdb?.metacritic;
  const awardsText = fetchedData?.awards || currentOmdb?.awards;
  const boxOfficeText = fetchedData?.boxOffice || currentOmdb?.boxOffice;

  return (
    <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <label className="text-xs uppercase tracking-wider text-amber-400 font-extrabold flex items-center gap-2">
          <Trophy size={14} className="text-amber-400" />
          <span>OMDB Metadata & Ratings (IMDb, Rotten Tomatoes, Box Office)</span>
        </label>
        {imdbScore || rottenScore || boxOfficeText || awardsText ? (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <CheckCircle2 size={11} /> Connected
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-gray-400 border border-white/10">
            Optional
          </span>
        )}
      </div>

      <p className="text-[11px] text-gray-400">
        Refetch critic scores, box-office gross, and awards from OMDB. You can customize the title below without special characters (e.g. <span className="text-amber-300 font-mono">bahubali the conclusion</span> instead of <span className="text-gray-500 font-mono">bahubali: the conclusion</span>).
      </p>

      {/* Query Customization Form */}
      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          {/* Title Input */}
          <div className="relative flex-1">
            <input
              type="text"
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="Search title for OMDB (e.g. Inception, Bahubali 2)..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/15 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/60 transition"
            />
          </div>

          {/* Optional Year */}
          <div className="w-full sm:w-24">
            <input
              type="text"
              value={customYear}
              onChange={(e) => setCustomYear(e.target.value)}
              placeholder="Year"
              className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/15 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/60 transition text-center"
            />
          </div>

          {/* Optional IMDb ID */}
          <div className="w-full sm:w-32">
            <input
              type="text"
              value={customImdbId}
              onChange={(e) => setCustomImdbId(e.target.value)}
              placeholder="IMDb ID (tt...)"
              className="w-full px-3 py-2 text-xs rounded-xl bg-black/40 border border-white/15 text-white placeholder-gray-500 focus:outline-none focus:border-amber-400/60 transition"
            />
          </div>

          {/* Refetch Button */}
          <button
            type="button"
            onClick={handleFetch}
            disabled={loading || (!customTitle.trim() && !customImdbId.trim())}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-black font-extrabold text-xs flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer shrink-0 shadow-md"
          >
            {loading ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                <span>Fetching...</span>
              </>
            ) : (
              <>
                <RefreshCw size={13} />
                <span>Refetch OMDB</span>
              </>
            )}
          </button>
        </div>

        {/* Status Messages */}
        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0 text-rose-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 size={14} className="shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Fetched Ratings Preview Card */}
        {(imdbScore || rottenScore || boxOfficeText || awardsText) && (
          <div className="mt-2 p-3 rounded-xl bg-black/50 border border-white/10 space-y-2.5">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-bold flex items-center gap-1.5">
              <Sparkles size={11} className="text-amber-400" />
              <span>Current OMDB Data Summary</span>
            </div>

            {/* Badges Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {/* IMDb Rating */}
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[9px] text-gray-400 uppercase font-semibold">IMDb Rating</span>
                <span className="text-xs font-black text-amber-300 flex items-center gap-1 mt-0.5">
                  <Star size={11} className="fill-amber-400 text-amber-400" />
                  {imdbScore ? `${imdbScore}/10` : 'N/A'}
                </span>
                {imdbVoteCount && <span className="text-[9px] text-gray-500 mt-0.5">{imdbVoteCount} votes</span>}
              </div>

              {/* Rotten Tomatoes */}
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[9px] text-gray-400 uppercase font-semibold">Rotten Tomatoes</span>
                <span className="text-xs font-black text-rose-400 flex items-center gap-1 mt-0.5">
                  🍅 {rottenScore || 'N/A'}
                </span>
                <span className="text-[9px] text-gray-500 mt-0.5">Tomatometer</span>
              </div>

              {/* Metacritic */}
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[9px] text-gray-400 uppercase font-semibold">Metacritic</span>
                <span className="text-xs font-black text-cyan-300 flex items-center gap-1 mt-0.5">
                  Ⓜ️ {metaScore || 'N/A'}
                </span>
                <span className="text-[9px] text-gray-500 mt-0.5">Metascore</span>
              </div>

              {/* Box Office / Collection */}
              <div className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col">
                <span className="text-[9px] text-gray-400 uppercase font-semibold">Box Office</span>
                <span className="text-xs font-black text-emerald-400 flex items-center gap-1 mt-0.5 truncate">
                  <DollarSign size={11} className="text-emerald-400 shrink-0" />
                  <span className="truncate">{boxOfficeText || 'N/A'}</span>
                </span>
                <span className="text-[9px] text-gray-500 mt-0.5">Gross Collection</span>
              </div>
            </div>

            {/* Awards Preview */}
            {awardsText && awardsText !== 'N/A' && (
              <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-200 text-xs flex items-center gap-2">
                <Trophy size={13} className="shrink-0 text-amber-400" />
                <span className="text-[11px] font-medium leading-tight">{awardsText}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

