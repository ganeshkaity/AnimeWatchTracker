"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, DollarSign, ExternalLink, Users, Star, Award } from 'lucide-react';

export default function OmdbRatingsBlock({
  omdb,
  imdbId: propImdbId,
  imdbRating: propImdbRating,
  imdbVotes: propImdbVotes,
  rottenTomatoes: propRottenTomatoes,
  metacritic: propMetacritic,
  awards: propAwards,
  boxOffice: propBoxOffice,
  loading = false,
  showRatings = true,
  showAwards = true,
  className = "",
  compact = false
}) {
  const [showImdbTooltip, setShowImdbTooltip] = useState(false);

  // Normalize data from either omdb object or direct props
  const imdbId = omdb?.imdbId || propImdbId || null;
  const imdbRating = omdb?.imdbRating || propImdbRating || null;
  const imdbVotes = omdb?.imdbVotes || propImdbVotes || null;
  const rottenTomatoes = omdb?.rottenTomatoes || propRottenTomatoes || null;
  const metacritic = omdb?.metacritic || propMetacritic || null;
  const awards = omdb?.awards || propAwards || null;
  const boxOffice = omdb?.boxOffice || propBoxOffice || null;

  const hasAnyRating = Boolean(imdbRating || rottenTomatoes || metacritic);
  const hasAwards = Boolean(awards && awards !== 'N/A');
  const hasBoxOffice = Boolean(boxOffice && boxOffice !== 'N/A');

  if (loading) {
    if (showRatings && !showAwards) {
      return (
        <div className={`w-full flex flex-col gap-2 pt-1 animate-pulse ${className}`}>
          <div className="h-8 w-full bg-white/5 rounded-xl border border-white/5" />
          <div className="h-8 w-full bg-white/5 rounded-xl border border-white/5" />
        </div>
      );
    }
    if (showAwards && !showRatings) {
      return (
        <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 animate-pulse ${className}`}>
          <div className="h-16 w-full bg-white/5 rounded-2xl border border-white/5" />
          <div className="h-16 w-full bg-white/5 rounded-2xl border border-white/5" />
        </div>
      );
    }
    return (
      <div className={`p-4 rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse space-y-3 ${className}`}>
        <div className="h-8 w-full bg-white/10 rounded-xl" />
      </div>
    );
  }

  // If nothing to show for the selected section
  if (showRatings && !showAwards && !hasAnyRating) return null;
  if (showAwards && !showRatings && !hasAwards && !hasBoxOffice) return null;
  if (!hasAnyRating && !hasAwards && !hasBoxOffice) return null;

  return (
    <div className={`w-full ${className}`}>
      {/* ── 1. Critical & Audience Ratings (Placed below the content poster) ── */}
      {showRatings && hasAnyRating && (
        <div className="w-full flex items-center justify-center gap-2.5 pt-1.5 flex-wrap">
          {/* IMDb Rating */}
          {imdbRating && (
            <div
              className="relative flex items-center gap-1.5 cursor-pointer group"
              onMouseEnter={() => setShowImdbTooltip(true)}
              onMouseLeave={() => setShowImdbTooltip(false)}
              onClick={() => {
                if (imdbId) {
                  window.open(`https://www.imdb.com/title/${imdbId}/`, '_blank', 'noopener,noreferrer');
                }
              }}
              title={imdbVotes ? `IMDb: ${imdbRating}/10 (${imdbVotes} votes)` : `IMDb: ${imdbRating}/10`}
            >
              <img
                src="/imdb.jpg"
                alt="IMDb"
                className="w-5 h-5 rounded-md object-cover shadow-sm group-hover:scale-105 transition-transform shrink-0"
              />
              <span className="font-extrabold text-xs sm:text-sm text-amber-300 font-mono tracking-tight group-hover:text-amber-200 transition-colors">
                {imdbRating}/10
              </span>

              {/* Hover Tooltip for IMDb Votes */}
              <AnimatePresence>
                {showImdbTooltip && imdbVotes && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 6, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none w-max max-w-xs"
                  >
                    <div className="px-3 py-1.5 rounded-xl bg-[#141208] border border-amber-400/50 shadow-2xl shadow-black/95 text-center space-y-0.5 backdrop-blur-md">
                      <div className="flex items-center justify-center gap-1.5 text-amber-300 text-xs font-bold">
                        <Users size={12} className="text-amber-400" />
                        <span>{imdbVotes} Total Votes</span>
                      </div>
                      <p className="text-[10px] text-gray-300 font-medium">
                        Rating: <span className="text-amber-400 font-bold">{imdbRating} / 10</span> on IMDb
                      </p>
                      {imdbId && (
                        <p className="text-[9px] text-amber-400/80 underline pt-0.5">
                          Click to open IMDb page ↗
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Bold bar between IMDb and Rotten Tomatoes */}
          {imdbRating && rottenTomatoes && (
            <span className="font-black text-gray-400 text-sm select-none" aria-hidden="true">
              |
            </span>
          )}

          {/* Rotten Tomatoes */}
          {rottenTomatoes && (
            <div className="flex items-center gap-1.5" title='Rotten Tomatoes Score'>
              <img
                src="/rotten_tomatoes.jpg"
                alt="Rotten Tomatoes"
                className="w-5 h-5 rounded-md object-cover shadow-sm shrink-0"
              />
              <span className="font-extrabold text-xs sm:text-sm text-red-400 font-mono tracking-tight">
                {rottenTomatoes}
              </span>
            </div>
          )}

          {/* Bold bar between Rotten Tomatoes / IMDb and Metacritic */}
          {metacritic && (imdbRating || rottenTomatoes) && (
            <span className="font-black text-gray-400 text-sm select-none" aria-hidden="true">
              |
            </span>
          )}

          {/* Metacritic */}
          {metacritic && (
            <div className="flex items-center gap-1.5" title='Metacritic Score'>
              <img
                src="/meta_critic.png"
                alt="Metacritic"
                className="w-5 h-5 rounded-md object-contain shadow-sm shrink-0"
              />
              <span className="font-extrabold text-xs sm:text-sm text-emerald-400 font-mono tracking-tight">
                {String(metacritic).includes('/') ? metacritic : `${metacritic}/100`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Awards & Box Office (Placed below Overview & Storyline) ── */}
      {showAwards && (hasAwards || hasBoxOffice) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* Awards Badge */}
          {hasAwards && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-yellow-500/5 to-transparent border border-amber-500/30 shadow-lg shadow-black/30">
              <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/40 shadow-sm">
                <Trophy size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-400 block">
                  Awards &amp; Nominations
                </span>
                <p className="text-xs sm:text-sm text-amber-100/90 font-medium leading-relaxed mt-0.5">
                  {awards}
                </p>
              </div>
            </div>
          )}

          {/* Box Office Badge */}
          {hasBoxOffice && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/30 shadow-lg shadow-black/30">
              <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0 mt-0.5 border border-emerald-500/40 shadow-sm">
                <DollarSign size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">
                  Box Office Collection
                </span>
                <p className="text-sm font-extrabold text-emerald-200 font-mono tracking-wide mt-0.5">
                  {boxOffice}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
