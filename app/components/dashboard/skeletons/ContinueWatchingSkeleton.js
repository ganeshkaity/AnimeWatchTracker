import React from 'react';

export default function ContinueWatchingSkeleton({ count = 5 }) {
  return (
    <div
      aria-hidden="true"
      className="flex items-start gap-4 overflow-x-auto no-scrollbar py-2"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={`continue-skeleton-${i}`}
          className="group relative flex-none w-44 sm:w-52 md:w-60 lg:w-64 aspect-[16/9] rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 animate-pulse flex flex-col"
        >
          <div className="relative w-full h-full bg-white/[0.04]">
            {/* Top Rating Skeleton */}
            <div className="absolute top-2 left-2 z-10">
              <div className="w-9 h-4 rounded-full bg-white/10 border border-white/10" />
            </div>

            {/* Bottom-left logo/title placeholder */}
            <div className="absolute bottom-2.5 left-2.5 z-10 space-y-1 w-1/2">
              <div className="h-4 bg-white/15 rounded w-3/4" />
              <div className="h-2 bg-white/10 rounded w-1/2" />
            </div>

            {/* Bottom track bar placeholder */}
            <div className="absolute bottom-0 inset-x-0 h-1 sm:h-1.5 bg-white/10 z-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
