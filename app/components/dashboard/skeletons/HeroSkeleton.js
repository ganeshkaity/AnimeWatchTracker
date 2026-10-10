import React from 'react';

export default function HeroSkeleton() {
  return (
    <section
      aria-hidden="true"
      id="hero"
      className="relative w-full overflow-hidden shadow-2xl bg-[#07090f] h-[98vh] min-h-[580px] max-h-[98vh] flex items-end animate-pulse"
      style={{ aspectRatio: '16 / 9' }}
    >
      {/* Top Dark Vignette */}
      <div
        className="absolute top-0 inset-x-0 h-44 sm:h-52 md:h-64 z-20 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(7, 9, 15, 0.98) 0%, rgba(7, 9, 15, 0.85) 30%, rgba(7, 9, 15, 0.45) 70%, transparent 100%)'
        }}
      />

      {/* Left Vignette Overlay */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, rgba(7, 9, 15, 0.94) 0%, rgba(7, 9, 15, 0.78) 42%, rgba(7, 9, 15, 0.25) 75%, transparent 100%)'
        }}
      />

      {/* Subtle bottom edge blend */}
      <div
        className="absolute bottom-0 inset-x-0 h-16 z-10 pointer-events-none bg-gradient-to-t from-[#07090f]/40 to-transparent"
      />

      {/* Hero Content Overlay */}
      <div className="relative z-30 w-full max-w-7xl mx-auto px-4 md:px-8 pt-36 sm:pt-40 md:pt-48 pb-16 md:pb-24">
        <div className="w-full md:max-w-2xl lg:max-w-3xl space-y-3 md:space-y-4">
          {/* Title or Logo Placeholder */}
          <div className="w-64 sm:w-80 md:w-96 h-12 sm:h-16 rounded-2xl bg-white/10" />

          {/* Genre Tag Pills Placeholder */}
          <div className="flex items-center gap-2 mt-2">
            <div className="w-16 h-5 rounded-md bg-white/10" />
            <div className="w-20 h-5 rounded-md bg-white/10" />
            <div className="w-16 h-5 rounded-md bg-white/10" />
          </div>

          {/* Metadata Badges Placeholder */}
          <div className="flex items-center gap-3 pt-1">
            <div className="w-12 h-5 rounded-md bg-white/10" />
            <div className="w-14 h-5 rounded-md bg-white/10" />
            <div className="w-16 h-5 rounded-md bg-white/10" />
            <div className="w-14 h-5 rounded-md bg-white/10" />
          </div>

          {/* Description Lines Placeholder */}
          <div className="space-y-2 max-w-xl pt-1">
            <div className="h-3.5 bg-white/10 rounded w-full" />
            <div className="h-3.5 bg-white/10 rounded w-5/6" />
            <div className="h-3.5 bg-white/10 rounded w-2/3" />
          </div>

          {/* CTA Buttons Placeholder */}
          <div className="flex items-center gap-3 pt-2">
            <div className="w-32 h-10 rounded-full bg-white/15" />
            <div className="w-24 h-10 rounded-full bg-white/10" />
          </div>
        </div>
      </div>

      {/* Slider Navigation Chevron Controls Placeholder */}
      <div className="absolute right-4 bottom-6 md:right-8 md:bottom-8 lg:right-12 lg:bottom-10 z-30 flex items-center gap-2.5">
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/10" />
        <div className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-white/10" />
      </div>
    </section>
  );
}
