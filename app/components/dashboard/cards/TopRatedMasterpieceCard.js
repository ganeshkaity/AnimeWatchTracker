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
      className="relative flex-none pl-6 sm:pl-8 group cursor-pointer select-none transition-transform duration-300 hover:-translate-y-1 py-2"
    >
      {/* Poster Card */}
      <div className="relative w-32 sm:w-36 md:w-40 aspect-[2/3] rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 group-hover:border-amber-400/50 shadow-xl group-hover:shadow-2xl transition-all duration-300">
        <CachedImage
          src={show.image}
          alt={show.seriesTitle || show.title}
          title={show.seriesTitle || show.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />

        {/* Liquid Glass Rating Badge (Top-Right) */}
        {show.rating && (
          <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/30 text-[10px] font-bold text-white flex items-center gap-1 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-saturate-150 pointer-events-none">
            <Star size={10} className="fill-amber-400 text-amber-400" />
            <span className="leading-none">{parseFloat(show.rating).toFixed(1)}</span>
          </div>
        )}

        {/* In Library Badge if uploaded */}
        {show.isUploaded && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-emerald-500/90 text-white font-extrabold text-[8px] uppercase tracking-wider backdrop-blur-md shadow pointer-events-none">
            In Library
          </div>
        )}
      </div>

      {/* Giant Metallic Rank Number Overlapping Bottom-Left Corner (Image 5 style) */}
      <div
        className="absolute left-0 -bottom-1 sm:-bottom-2 z-20 font-black text-6xl sm:text-7xl md:text-8xl select-none leading-none pointer-events-none tracking-tighter"
        style={{
          background: 'linear-gradient(180deg, #ffffff 0%, #cbd5e1 50%, #64748b 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          filter: 'drop-shadow(0 4px 10px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 2px rgba(0, 0, 0, 0.9))',
          WebkitTextStroke: '1px rgba(255, 255, 255, 0.35)',
        }}
      >
        {index + 1}
      </div>
    </div>
  );
}
