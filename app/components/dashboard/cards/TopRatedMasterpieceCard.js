import React from 'react';
import { Star } from 'lucide-react';
import CachedImage from '../../../utils/imageCache';

export default function TopRatedMasterpieceCard({
  show,
  index,
  onClick,
}) {
  return (
    <div
      onClick={onClick}
      className="flex-none w-44 sm:w-48 md:w-52 glass-card rounded-2xl p-3 flex flex-col justify-between group cursor-pointer relative overflow-hidden border border-white/10 hover:border-amber-500/30 transition-all duration-300"
    >
      <div className="relative h-44 sm:h-48 rounded-xl overflow-hidden mb-2 bg-[#181c24] flex items-center justify-center">
        <CachedImage
          src={show.image}
          alt={show.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-lg bg-amber-500 text-black font-black text-xs shadow-md">
          #{index + 1}
        </div>
        {show.isUploaded && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white font-extrabold text-[8px] uppercase tracking-wider backdrop-blur-md">
            In Library
          </div>
        )}
      </div>
      <div>
        <h4
          className="font-bold text-xs text-white line-clamp-1 group-hover:text-amber-400 transition-colors"
          title={show.seriesTitle || show.title}
        >
          {show.seriesTitle || show.title}
        </h4>
        <div className="flex items-center justify-between text-[10px] text-gray-400 mt-1">
          <span className="text-amber-400 font-bold flex items-center gap-1">
            <Star size={10} className="fill-amber-400" /> {show.rating}
          </span>
          <span className="truncate max-w-[50%] text-gray-400">{show.studio || show.episodes || ''}</span>
        </div>
      </div>
    </div>
  );
}
