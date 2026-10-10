import React from 'react';

export default function TopRatedOnlineSkeleton({ count = 7 }) {
  return (
    <div
      aria-hidden="true"
      className="flex gap-3 overflow-x-auto no-scrollbar py-2"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={`top-rated-skeleton-${idx}`}
          className="flex-none w-40 sm:w-44 md:w-48 h-56 sm:h-60 md:h-64 rounded-2xl bg-[#0d121f] border border-white/10 animate-pulse relative overflow-hidden"
        >
          {/* Rank Badge Placeholder */}
          <div className="absolute top-2 left-2 w-10 h-5 rounded-lg bg-white/10 border border-white/5 z-20" />

          {/* Bottom vignette & title placeholder */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0b0d12] via-[#0b0d12]/30 to-transparent opacity-90" />
          <div className="absolute bottom-3 left-3 right-3 space-y-1.5 z-10">
            <div className="h-3 bg-white/20 rounded w-3/4" />
            <div className="flex justify-between items-center pt-1">
              <div className="h-2.5 bg-white/10 rounded w-10" />
              <div className="h-2.5 bg-white/10 rounded w-12" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
