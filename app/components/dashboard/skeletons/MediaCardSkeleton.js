import React from 'react';

export default function MediaCardSkeleton({ className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`group relative flex-none w-32 sm:w-36 md:w-40 rounded-lg overflow-hidden bg-[#0d121f] border border-white/10 animate-pulse flex flex-col ${className}`}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-white/[0.04]">
        {/* Liquid Glass Rating Skeleton Placeholder (Top-Left) */}
        <div className="absolute top-2 left-2 z-10">
          <div className="w-10 h-4 rounded-full bg-white/10 border border-white/10 backdrop-blur-md" />
        </div>

        {/* Bottom Progress Bar Line Placeholder */}
        <div className="absolute bottom-0 inset-x-0 h-1 sm:h-1.5 bg-white/10 z-20" />
      </div>
    </div>
  );
}
