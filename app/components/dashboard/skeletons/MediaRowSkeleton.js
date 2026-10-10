import React from 'react';
import MediaCardSkeleton from './MediaCardSkeleton';

export default function MediaRowSkeleton({ count = 6, className = '' }) {
  return (
    <div
      aria-hidden="true"
      className={`flex items-start gap-4 overflow-x-auto no-scrollbar py-2 ${className}`}
    >
      {Array.from({ length: count }).map((_, i) => (
        <MediaCardSkeleton key={`row-skeleton-${i}`} />
      ))}
    </div>
  );
}
