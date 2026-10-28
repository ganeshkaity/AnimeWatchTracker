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
      case 'movie': return <Film size={28} />;
      case 'webseries': return <Tv size={28} />;
      case 'manga': return <BookOpen size={28} />;
      case 'audioStory': return <Headphones size={28} />;
      default: return <Play size={28} />;
    }
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`group relative flex-none w-32 sm:w-36 md:w-40 rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 ${accentBorder} hover:shadow-2xl hover:shadow-black/80 hover:-translate-y-1 transition-all duration-300 cursor-pointer flex flex-col`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-black/60">
        <CachedImage
          src={coverImg}
          alt={item?.title || 'Media poster'}
          title={item?.title || ''}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Liquid Glass Rating Badge (Top-Left) */}
        {rating && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 text-[10px] font-bold text-white flex items-center gap-1 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-saturate-150 pointer-events-none">
            <Star size={10} className="fill-amber-400 text-amber-400" />
            <span className="leading-none">{parseFloat(rating).toFixed(1)}</span>
          </div>
        )}

        {/* Red YouTube Logo Badge if YouTube folder */}
        {isYouTube && (
          <div className="absolute top-2 right-2 z-10 p-1 bg-black/60 rounded-md flex items-center justify-center shadow-lg border border-red-500/40 backdrop-blur-md pointer-events-none">
            <YoutubeLogo size={14} />
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
              className="p-1 rounded-md bg-black/70 backdrop-blur-md text-white border border-white/20 shadow-lg active:scale-95 transition-transform"
            >
              <MoreVertical size={12} />
            </button>
          </div>
        )}

        {/* Green Small Tick in Bottom-Left Side if watched (Request 2) */}
        {isCompleted && (
          <div className="absolute bottom-2 left-2 z-20 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-950/50 pointer-events-none">
            <Check size={10} strokeWidth={3} className="text-black" />
          </div>
        )}

        {/* Watch Track Bar at Bottom (Original gradient color, 100% width if completed) */}
        {(isCompleted || pct > 0) && (
          <div className="absolute bottom-0 inset-x-0 h-1 sm:h-1.5 bg-black/60 z-20 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 transition-all duration-300"
              style={{ width: `${isCompleted ? 100 : Math.min(100, Math.max(3, pct))}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
