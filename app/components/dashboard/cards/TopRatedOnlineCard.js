import React from 'react';
import {
  Star,
  Trophy,
  Award,
  CheckCircle2,
  ExternalLink,
  Play,
  Plus,
  Globe,
} from 'lucide-react';
import CachedImage from '../../../utils/imageCache';

export default function TopRatedOnlineCard({
  show,
  hasDragged = false,
  onSelectAnime,
  onAddAnime,
  onOpenExternal,
  onOpenMal,
}) {
  const isGold = show.rank === 1;
  const isSilver = show.rank === 2;
  const isBronze = show.rank === 3;

  return (
    <div
      onClick={() => {
        if (hasDragged) return;
        if (show.isUploaded && show.uploadedAnimeId && onSelectAnime) {
          onSelectAnime(show.uploadedAnimeId);
        }
      }}
      className="flex-none w-40 sm:w-44 md:w-48 group cursor-pointer"
    >
      <div className="relative h-56 sm:h-60 md:h-64 rounded-2xl overflow-hidden glass-card border border-white/10 hover:border-amber-500/40 transition-all duration-300 shadow-md">
        <CachedImage
          src={show.image}
          alt={show.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/30 to-transparent opacity-90 group-hover:opacity-95 transition-opacity" />

        {/* Rank Podium Badge */}
        <div className="absolute top-2 left-2 z-20">
          {isGold ? (
            <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-black text-[11px] tracking-wider shadow-[0_0_12px_rgba(245,158,11,0.6)] ring-1 ring-yellow-200 flex items-center gap-1">
              <Trophy size={10} fill="black" /> #1
            </div>
          ) : isSilver ? (
            <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-slate-200 to-gray-400 text-black font-black text-[11px] tracking-wider shadow-md ring-1 ring-white/50 flex items-center gap-1">
              <Award size={10} /> #2
            </div>
          ) : isBronze ? (
            <div className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-amber-700 to-amber-900 text-amber-100 font-black text-[11px] tracking-wider shadow-md ring-1 ring-amber-500/50 flex items-center gap-1">
              <Award size={10} /> #3
            </div>
          ) : (
            <div className="px-2 py-0.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-amber-400 font-black text-[11px] tracking-wider shadow-lg">
              #{show.rank}
            </div>
          )}
        </div>

        {/* In Library Badge / User Rated Tag */}
        <div className="absolute top-2 right-2 z-20">
          {show.isUploaded ? (
            <span className="px-1.5 py-0.5 rounded-full text-[8px] font-extrabold uppercase tracking-wider bg-emerald-500/90 text-white shadow-md flex items-center gap-0.5 backdrop-blur-md">
              <CheckCircle2 size={8} /> In Library
            </span>
          ) : onOpenExternal ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenExternal(e, show);
              }}
              className="p-1 rounded-lg bg-black/80 hover:bg-amber-500 text-amber-300 hover:text-black border border-white/10 hover:border-amber-500/40 transition shadow-md backdrop-blur-md cursor-pointer"
              title="Open Online Details (AniList / MAL)"
            >
              <ExternalLink size={10} />
            </button>
          ) : null}
        </div>

        {/* Rating & Format Badges */}
        <div className="absolute bottom-14 inset-x-2 flex items-center justify-between pointer-events-none">
          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider shadow-md backdrop-blur-md bg-purple-500/20 text-purple-300 border border-purple-500/40">
            {show.type} {show.year ? `· ${show.year}` : ''}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold flex items-center gap-0.5 border shadow-[0_0_8px_rgba(245,158,11,0.3)] backdrop-blur-md ${
              show.userCustomRating
                ? 'bg-amber-500 text-black border-amber-400 font-black ring-1 ring-yellow-200'
                : 'bg-black/70 text-amber-400 border-amber-500/20'
            }`}
          >
            <Star
              size={9}
              className={
                show.userCustomRating
                  ? 'fill-black text-black'
                  : 'fill-amber-400 text-amber-400'
              }
            />
            {show.rating}
            {show.userCustomRating && (
              <span className="text-[7px] uppercase font-black ml-0.5">
                My Rating
              </span>
            )}
          </span>
        </div>

        {/* Play / Add Hover Overlay */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-1.5 p-2 z-10 backdrop-blur-xs">
          {show.isUploaded ? (
            <div className="p-3 rounded-full bg-amber-500 text-black shadow-xl transform scale-75 group-hover:scale-100 transition-transform duration-300 flex items-center justify-center">
              <Play size={20} fill="black" />
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 w-full max-w-[130px]">
              {onAddAnime && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddAnime(e, show);
                  }}
                  className="w-full px-2 py-1.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-400 hover:to-yellow-500 text-black text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center justify-center gap-1 transition-all transform active:scale-95 cursor-pointer"
                >
                  <Plus size={12} /> Add to Library
                </button>
              )}
              <div className="flex items-center gap-1 w-full">
                {onOpenExternal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenExternal(e, show);
                    }}
                    className="flex-1 px-1 py-1 rounded-lg bg-white/15 hover:bg-white/25 border border-white/20 text-cyan-300 hover:text-white text-[9px] font-bold shadow-md flex items-center justify-center gap-0.5 transition cursor-pointer backdrop-blur-md"
                    title="View Details on AniList"
                  >
                    <Globe size={9} /> AniList
                  </button>
                )}
                {onOpenMal && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenMal(e, show);
                    }}
                    className="flex-1 px-1 py-1 rounded-lg bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/30 text-blue-300 hover:text-white text-[9px] font-bold shadow-md flex items-center justify-center gap-0.5 transition cursor-pointer backdrop-blur-md"
                    title="View Details on MyAnimeList"
                  >
                    <ExternalLink size={9} /> MAL
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Text */}
        <div className="absolute bottom-0 inset-x-0 p-2.5 space-y-0.5 bg-gradient-to-t from-black via-black/80 to-transparent">
          <h3
            className="font-extrabold text-xs text-white line-clamp-1 group-hover:text-amber-400 transition-colors"
            title={show.episodeName || show.title}
          >
            {show.episodeName || show.title}
          </h3>
          <div className="flex items-center justify-between text-[9px] text-gray-400">
            <span
              className="text-gray-300 font-medium truncate max-w-[68%]"
              title={
                show.seriesTitle ||
                show.animeTitle ||
                show.subTitle ||
                show.studio
              }
            >
              {show.seriesTitle ||
                show.animeTitle ||
                show.subTitle ||
                show.studio}
            </span>
            <span className="px-1 py-0.2 rounded bg-white/10 text-white font-mono text-[8px] shrink-0">
              {show.episodes || show.episodeLabel || 'Ep'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
