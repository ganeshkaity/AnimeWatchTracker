import React from 'react';

export default function TopRatedSkeleton({ count = 7 }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`top-skeleton-${i}`}
          className="relative flex-none pl-6 sm:pl-8 py-2"
        >
          {/* Poster Skeleton */}
          <div className="relative w-32 sm:w-36 md:w-40 aspect-[2/3] rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 animate-pulse">
            <div className="w-full h-full bg-white/[0.04]" />
            <div className="absolute top-2 right-2 w-10 h-4 rounded-full bg-white/10" />
          </div>

          {/* Giant Number Skeleton */}
          <div className="absolute left-0 -bottom-1 sm:-bottom-2 z-20 font-black text-6xl sm:text-7xl md:text-8xl select-none leading-none text-white/[0.08] pointer-events-none">
            {i + 1}
          </div>
        </div>
      ))}
    </div>
  );
}
