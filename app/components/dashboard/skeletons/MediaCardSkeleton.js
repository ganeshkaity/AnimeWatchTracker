import React from 'react';

export default function MediaCardSkeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`group relative flex-none w-44 sm:w-48 md:w-52 rounded-2xl overflow-hidden bg-[#0d121f] border border-white/10 animate-pulse flex flex-col ${className}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-white/[0.04]">
        {/* Top Badges Placeholder */}
        <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10">
          <div className="w-11 h-4 rounded-md bg-white/10 border border-white/5" />
          <div className="w-9 h-4 rounded-md bg-white/10 border border-white/5" />
        </div>

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 pointer-events-none" />

        {/* Bottom Metadata Placeholder */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 z-10 space-y-1.5 pointer-events-none">
          <div className="h-3.5 bg-white/15 rounded-md w-3/4" />
          <div className="flex items-center justify-between pt-0.5">
            <div className="h-2.5 bg-white/10 rounded w-12" />
            <div className="h-2.5 bg-white/10 rounded w-10" />
          </div>
        </div>

        {/* Bottom Progress Bar Line Placeholder */}
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/10 z-20" />
      </div>
    </div>
  );
}
