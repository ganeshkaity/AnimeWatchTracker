import React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, ChevronRight, ChevronLeft, Star, Film, Tv, BookOpen,
  Headphones, Clock, Calendar
} from 'lucide-react';
import { toFanartBigPreview, toFanartFull } from '../../../lib/fanartUtils';
import HeroSkeleton from '../skeletons/HeroSkeleton';

export default function DashboardHero({
  heroSlides = [],
  currentSlide = 0,
  setCurrentSlide,
  slideDirection = 1,
  setSlideDirection,
  currentHero,
  animesCount = 0,
  onSelectAnime,
  setShowAddModal,
  isLoading = false,
}) {
  const router = useRouter();

  if (isLoading || !currentHero) {
    return <HeroSkeleton />;
  }

  return (
    <>
      <section
        id="hero"
        className="relative w-full overflow-hidden shadow-2xl bg-[#07090f] h-[98vh] min-h-[580px] max-h-[98vh] flex items-end"
        style={{ aspectRatio: '16 / 9' }}
      >
        {/* Hidden Eager Prefetcher for Hero Logos & Banners so they are 0ms ready before slide transitions */}
        <div className="hidden pointer-events-none opacity-0 select-none -z-50 absolute w-0 h-0 overflow-hidden" aria-hidden="true">
          {heroSlides.map((slide, idx) => (
            <React.Fragment key={`hero-preload-${slide.id || idx}`}>
              {slide.logoUrl && (
                <img
                  src={toFanartBigPreview(slide.logoUrl)}
                  alt=""
                  loading="eager"
                  decoding="async"
                />
              )}
              {slide.banner && (
                <img
                  src={toFanartFull(slide.banner)}
                  alt=""
                  loading="eager"
                  decoding="async"
                />
              )}
              {slide.poster && (
                <img
                  src={toFanartFull(slide.poster)}
                  alt=""
                  loading="eager"
                  decoding="async"
                />
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Animated Slide Content - Slides Horizontally without empty gap */}
        <AnimatePresence custom={slideDirection} mode="popLayout">
          <motion.div
            key={currentHero.id}
            custom={slideDirection}
            initial={(dir) => ({
              opacity: 0,
              x: dir > 0 ? '100%' : '-100%'
            })}
            animate={{
              opacity: 1,
              x: 0
            }}
            exit={(dir) => ({
              opacity: 0,
              x: dir > 0 ? '-100%' : '100%'
            })}
            transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-10 flex items-end justify-between"
          >
            {/* Background Image: Crisp vertical cover poster on mobile devices; crisp sharp wide banner on desktop for all media types */}
            {/* Mobile Devices: Show poster cover as background */}
            <div
              className="md:hidden absolute inset-0 z-0 bg-cover bg-top filter blur-none scale-100 brightness-105 saturate-[1.1] transition-all duration-700"
              style={{
                backgroundImage: `url(${toFanartFull(currentHero.poster || currentHero.banner)})`,
                backgroundPosition: 'center top',
              }}
            />
            {/* Desktop Devices: Show crisp wide banner with top alignment on widescreen */}
            <div
              className="hidden md:block absolute inset-0 z-0 bg-cover bg-top filter blur-none scale-100 brightness-105 saturate-[1.1] transition-all duration-700"
              style={{
                backgroundImage: `url(${toFanartFull(currentHero.banner)})`,
                backgroundPosition: 'center top',
              }}
            />

            {/* Top Dark Vignette (Prime Video Style - deep dark gradient behind fixed navbar) */}
            <div
              className="absolute top-0 inset-x-0 h-44 sm:h-52 md:h-64 z-20 pointer-events-none"
              style={{
                background: 'linear-gradient(180deg, rgba(7, 9, 15, 0.98) 0%, rgba(7, 9, 15, 0.85) 30%, rgba(7, 9, 15, 0.45) 70%, transparent 100%)'
              }}
            />

            {/* Left Vignette Overlay - ensures title, genres and description are crystal clear */}
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

            {/* Hero Content Overlay (Positioned in lower two-thirds with comfortable breathing room) */}
            <div className="relative z-30 w-full max-w-7xl mx-auto px-4 md:px-8 pt-36 sm:pt-40 md:pt-48 pb-16 md:pb-24">
              <div className="w-full md:max-w-2xl lg:max-w-3xl space-y-3 md:space-y-4">
                {/* Title or Custom Movie Logo */}
                <div>
                  {currentHero.logoUrl ? (
                    <div className="mb-3 max-w-[280px] sm:max-w-[380px] md:max-w-[480px] max-h-16 sm:max-h-20 md:max-h-28 flex items-center">
                      <img
                        src={toFanartBigPreview(currentHero.logoUrl)}
                        alt={currentHero.title}
                        fetchPriority="high"
                        decoding="async"
                        className="max-h-16 sm:max-h-20 md:max-h-28 w-auto max-w-full object-contain object-left drop-shadow-[0_4px_24px_rgba(0,0,0,0.95)]"
                      />
                    </div>
                  ) : (
                    <h1 className="text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-extrabold uppercase tracking-tight text-amber-300 leading-tight drop-shadow-lg">
                      {currentHero.title}
                    </h1>
                  )}
                  {/* Genres Tag Pills */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    {currentHero.isManga && (
                      <span className="px-2.5 py-0.5 text-purple-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <BookOpen size={10} />| Manga
                      </span>
                    )}
                    {currentHero.isAudio && (
                      <span className="px-2.5 py-0.5 text-cyan-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <Headphones size={10} />| Audio Story
                      </span>
                    )}
                    {currentHero.isWebseries && (
                      <span className="px-2.5 py-0.5 text-emerald-200 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <Tv size={10} />| Web Series
                      </span>
                    )}
                    {currentHero.genres && currentHero.genres.slice(0, 2).map((genre, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-0.5 text-cyan text-[10px] font-black uppercase tracking-wider"
                      >
                        | {genre}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Metadata Section */}
                <div className="flex flex-wrap items-center gap-2.5 md:gap-4 text-xs font-bold text-gray-400">
                  <span className="flex items-center gap-1">
                    <Star size={14} className="fill-amber-400 text-amber-400" />
                    <span className="text-amber-400 font-extrabold">{currentHero.rating}</span>
                  </span>
                  {currentHero.isMovie ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-amber-300">
                      <Film size={13} className="text-amber-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : currentHero.isWebseries ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-emerald-300">
                      <Tv size={13} className="text-emerald-400" />
                      <span>{currentHero.totalSeasons ? (currentHero.totalSeasons > 1 ? `${currentHero.totalSeasons} Seasons` : 'Season 1') : 'TV'}</span>
                    </span>
                  ) : currentHero.isManga ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-purple-300">
                      <BookOpen size={13} className="text-purple-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : currentHero.isAudio ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-cyan-300">
                      <Headphones size={13} className="text-cyan-400" />
                      <span>{currentHero.episodes}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[#c084fc]">
                      <Tv size={13} className="text-[#a855f7]" />
                      {currentHero.totalSeasons ? (currentHero.totalSeasons > 1 ? `${currentHero.totalSeasons} Seasons` : 'Season 1') : 'TV'}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-pink-300">
                    <Clock size={13} className="text-pink-400" /> {currentHero.isManga || currentHero.isAudio || currentHero.isMovie ? currentHero.quality : currentHero.episodes}
                  </span>
                  <span className="flex items-center gap-1.5 text-cyan-300">
                    <Calendar size={14} className="text-cyan-400" /> {currentHero.year}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs md:text-sm text-gray-400 leading-relaxed line-clamp-2 md:line-clamp-3 max-w-xl">
                  {currentHero.description}
                </p>

                {/* CTA Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  {currentHero.isMovie ? (
                    <button
                      onClick={() => router.push(`/movies/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-black font-extrabold flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/30 transition-all duration-300"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Watch Movie</span>
                    </button>
                  ) : currentHero.isWebseries ? (
                    <button
                      onClick={() => router.push(`/webseries/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-600 hover:brightness-110 text-white font-extrabold flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-500/30 transition-all duration-300"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Watch Series</span>
                    </button>
                  ) : currentHero.isAudio ? (
                    <button
                      onClick={() => router.push(`/audio-story/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-purple-600 hover:brightness-110 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/30 transition-all duration-300"
                    >
                      <Headphones size={14} />
                      <span>Listen Now</span>
                    </button>
                  ) : currentHero.isManga ? (
                    <button
                      onClick={() => router.push(`/manga/${currentHero.id}`)}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-amber-500 to-rose-600 hover:brightness-110 text-black font-extrabold flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/30 transition-all duration-300"
                    >
                      <BookOpen size={14} />
                      <span>Read Manga</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        if (animesCount > 0 && currentHero?.id !== 'placeholder') onSelectAnime(currentHero.id);
                        else setShowAddModal(true);
                      }}
                      className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-gradient-to-r from-pink-500 to-[#a855f7] hover:brightness-110 text-white flex items-center gap-2 cursor-pointer shadow-lg shadow-pink-500/20 transition-all duration-300"
                    >
                      <Play size={14} fill="currentColor" />
                      <span>Watch Now</span>
                    </button>
                  )}

                  <button
                    onClick={() => {
                      if (currentHero.isMovie) {
                        router.push(`/movies/${currentHero.id}`);
                      } else if (currentHero.isWebseries) {
                        router.push(`/webseries/${currentHero.id}`);
                      } else if (currentHero.isAudio) {
                        router.push(`/audio-story/${currentHero.id}`);
                      } else if (currentHero.isManga) {
                        router.push(`/manga/${currentHero.id}`);
                      } else if (animesCount > 0 && currentHero?.id !== 'placeholder') {
                        onSelectAnime(currentHero.id);
                      }
                    }}
                    className="px-5 py-2.5 md:px-6 md:py-2.5 rounded-full font-bold text-xs uppercase tracking-wider bg-white/10 hover:bg-white/20 border border-white/10 text-white transition flex items-center gap-1 cursor-pointer"
                  >
                    <span>Detail</span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Slider Navigation Chevron Controls (Liquid Glass Effect, No Dots) */}
        <div className="absolute right-4 bottom-6 md:right-8 md:bottom-8 lg:right-12 lg:bottom-10 z-30 flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setSlideDirection(-1);
              setCurrentSlide((prev) => (prev === 0 ? heroSlides.length - 1 : prev - 1));
            }}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full liquid-glass-chevron text-white flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all"
            title="Previous Slide"
            aria-label="Previous Slide"
          >
            <ChevronLeft size={20} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
          </button>
          <button
            type="button"
            onClick={() => {
              setSlideDirection(1);
              setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
            }}
            className="w-10 h-10 md:w-11 md:h-11 rounded-full liquid-glass-chevron text-white flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all"
            title="Next Slide"
            aria-label="Next Slide"
          >
            <ChevronRight size={20} className="drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]" />
          </button>
        </div>
      </section>

      {/* Outside Bottom Black Vignette / Fade Transition (Outside the banner) */}
      <div
        className="w-full h-16 sm:h-24 pointer-events-none -mb-16 sm:-mb-24 relative z-10"
        style={{
          background: 'linear-gradient(180deg, #07090f 0%, rgba(7, 9, 15, 0.75) 40%, rgba(7, 9, 15, 0.25) 75%, transparent 100%)'
        }}
      />
    </>
  );
}
