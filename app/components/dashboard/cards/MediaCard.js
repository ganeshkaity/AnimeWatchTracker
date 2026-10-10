import React from 'react';
import { Star, Check, MoreVertical, Play, Film, Tv, BookOpen, Headphones } from 'lucide-react';
import CachedImage from '../../../utils/imageCache';
import { YoutubeLogo } from '../utils/dashboardHelpers';

export default function MediaCard({
  item,
  type = 'anime',
  coverImg,
  rating,
  isCompleted,
  pct = 0,
  subLeft,
  subRight,
  badgeMediaType,
  fallbackIcon,
  isYouTube = false,
  accentBorder = 'hover:border-amber-400/50',
  onClick,
  onMouseEnter,
  onMouseLeave,
  onMobileMenuToggle,
}) {
  const defaultFallbackIcon = () => {
    if (fallbackIcon) return fallbackIcon;
    switch (type) {
      case 'movie': return <Film size={36} />;
      case 'webseries': return <Tv size={36} />;
      case 'manga': return <BookOpen size={36} />;
      case 'audioStory': return <Headphones size={36} />;
      default: return <Play size={36} />;
    }
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex-none w-44 sm:w-48 md:w-52 rounded-2xl overflow-hidden bg-[#0d121f] border border-white/10 ${accentBorder} hover:shadow-2xl hover:shadow-black/70 transition-all duration-300 cursor-pointer flex flex-col`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
        {coverImg ? (
          <CachedImage
            src={coverImg}
            alt={item?.title || 'Media poster'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 gap-1.5 p-3">
            {defaultFallbackIcon()}
            <span className="text-[10px] font-bold text-white/90 line-clamp-2 text-center">{item?.title}</span>
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
          {rating ? (
            <div className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-bold text-amber-400 flex items-center gap-0.5 border border-white/10 shadow">
              <Star size={10} className="fill-amber-400" />
              <span>{parseFloat(rating).toFixed(1)}</span>
            </div>
          ) : badgeMediaType ? (
            <div className="px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-[9px] font-extrabold uppercase tracking-wider text-gray-300 border border-white/10 shadow">
              {badgeMediaType}
            </div>
          ) : (
            <span />
          )}

          {isCompleted ? (
            <div className="px-1.5 py-0.5 rounded-md bg-emerald-600/90 text-white text-[9px] font-extrabold uppercase tracking-wider flex items-center gap-1 shadow">
              <Check size={9} /> DONE
            </div>
          ) : pct > 0 ? (
            <div className="px-1.5 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-amber-400 text-[9px] font-extrabold tracking-wider border border-white/10 shadow">
              {Math.round(pct)}%
            </div>
          ) : null}
        </div>

        {/* Red YouTube Logo Badge if YouTube folder */}
        {isYouTube && (
          <div className="absolute top-8 right-2 z-10 p-1 bg-black/60 rounded-xl flex items-center justify-center shadow-lg border border-red-500/40 backdrop-blur-md pointer-events-none">
            <YoutubeLogo size={16} />
          </div>
        )}

        {/* Mobile 3-Dot Options Button */}
        {onMobileMenuToggle && (
          <div className="md:hidden absolute top-2 right-2 z-20">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMobileMenuToggle(e);
              }}
              className="p-1.5 rounded-lg bg-black/80 text-white border border-white/20 shadow-lg active:scale-95 transition-transform"
            >
              <MoreVertical size={13} />
            </button>
          </div>
        )}

        {/* Bottom Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity pointer-events-none" />

        {/* Bottom Info inside Card */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 space-y-0.5 pointer-events-none">
          <h3 className="text-xs sm:text-sm font-bold text-white line-clamp-1 group-hover:text-amber-300 transition" title={item?.title}>
            {item?.title}
          </h3>
          <div className="flex items-center justify-between text-[10px] text-gray-400 font-mono">
            <span>{subLeft}</span>
            <span>{subRight}</span>
          </div>
        </div>

        {/* Watch progress bar at the very bottom inside the poster card */}
        {pct > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20 z-20 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
