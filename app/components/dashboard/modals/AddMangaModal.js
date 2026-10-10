import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  X,
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  Check,
  ImagePlus,
  ImageIcon,
} from 'lucide-react';
import MangaCoverSearch from '../../MangaCoverSearch';
import { toFanartPreview, toFanartFull } from '../../../lib/fanartUtils';
import { GENRES_LIST } from '../utils/dashboardHelpers';

export default function AddMangaModal({
  showAddMangaModal,
  setShowAddMangaModal,
  handleAddManga,
  mangaSearchQuery,
  setMangaSearchQuery,
  handleSearchMangaOnline,
  mangaSearching,
  mangaFetchingDetails,
  mangaSearchError,
  selectedMangaOnline,
  setSelectedMangaOnline,
  mangaSearchResults,
  handleSelectMangaOnline,
  mangaFolderPath,
  setMangaFolderPath,
  handleBrowseMangaFolder,
  handleScanManga,
  mangaScanning,
  mangaScanResult,
  mangaTitle,
  setMangaTitle,
  mangaRomajiTitle,
  setMangaRomajiTitle,
  mangaTotalVolumes,
  setMangaTotalVolumes,
  mangaTotalChapters,
  setMangaTotalChapters,
  mangaYear,
  setMangaYear,
  mangaDescription,
  setMangaDescription,
  showMangaCoverSearch,
  setShowMangaCoverSearch,
  handleMangaCoverUpload,
  mangaCoverUrl,
  setMangaCoverUrl,
  mangaImages,
  handleMangaBannerUpload,
  mangaBannerUrl,
  setMangaBannerUrl,
  enableMangaLogo,
  setEnableMangaLogo,
  handleMangaLogoUpload,
  mangaLogoUrl,
  setMangaLogoUrl,
  mangaGenres,
  setMangaGenres,
  uploadToImgBB,
}) {
  return (
    <>
      <AnimatePresence>
        {showAddMangaModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <BookOpen className="text-purple-400" size={20} />
                  <span>Track Local Manga / Webtoon Folder</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddMangaModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddManga} className="space-y-4">
                {/* ── 1. Search Manga Online & Auto-Fill (AniList & Fanart.tv) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" />
                      <span>1. Search Manga Online (AniList & Fanart.tv)</span>
                    </label>
                    <span className="text-[10px] text-purple-300 font-mono">
                      Online Metadata
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        placeholder="Search manga / webtoon title (e.g. Solo Leveling, Berserk, One Piece)..."
                        className="w-full px-3 py-2 pl-8 rounded-xl glass-input text-xs text-white"
                        value={mangaSearchQuery}
                        onChange={(e) => setMangaSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchMangaOnline();
                          }
                        }}
                      />
                      <Search
                        size={14}
                        className="absolute left-2.5 top-2.5 text-gray-400"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSearchMangaOnline}
                      disabled={
                        mangaSearching ||
                        !(mangaSearchQuery || mangaTitle).trim()
                      }
                      className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {mangaSearching ? (
                        <>
                          <Loader2 size={13} className="animate-spin" />
                          <span>Searching...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} />
                          <span>Search Online</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Searching & Fetching status */}
                  {mangaSearching && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Searching AniList...</span>
                    </p>
                  )}
                  {mangaFetchingDetails && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>
                        Fetching details, wide banners & Fanart.tv logos...
                      </span>
                    </p>
                  )}
                  {mangaSearchError && (
                    <p className="text-[11px] text-purple-300 font-medium">
                      {mangaSearchError}
                    </p>
                  )}

                  {/* Active Selected Manga Pill */}
                  {selectedMangaOnline && (
                    <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2
                          size={14}
                          className="text-emerald-400 shrink-0"
                        />
                        <span className="text-xs font-bold text-white truncate">
                          Auto-filling: {selectedMangaOnline.title}
                        </span>
                        {selectedMangaOnline.year && (
                          <span className="text-[10px] text-purple-300 font-mono shrink-0">
                            ({selectedMangaOnline.year})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedMangaOnline(null)}
                        className="text-gray-400 hover:text-white p-1"
                        title="Clear online selection"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Selectable Results Dropdown List */}
                  {mangaSearchResults.length > 0 && (
                    <div className="mt-2 p-2 rounded-2xl bg-black/40 border border-white/10 max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-0.5">
                        Select match to auto-populate metadata & artwork:
                      </div>
                      {mangaSearchResults.map((item) => {
                        const isSelected = selectedMangaOnline?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectMangaOnline(item)}
                            className={`flex items-center gap-3 p-2 rounded-xl cursor-pointer transition ${
                              isSelected
                                ? 'bg-purple-600/30 border border-purple-500/50 text-white'
                                : 'bg-white/[0.02] hover:bg-white/[0.08] text-gray-300 hover:text-white border border-transparent'
                            }`}
                          >
                            {item.posterUrl ? (
                              <img
                                src={item.posterUrl}
                                alt={item.title}
                                className="w-9 h-12 rounded-lg object-cover shrink-0 border border-white/10"
                              />
                            ) : (
                              <div className="w-9 h-12 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                <BookOpen
                                  size={14}
                                  className="text-gray-500"
                                />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate">
                                {item.title}
                              </div>
                              {item.romajiTitle &&
                                item.romajiTitle !== item.title && (
                                  <div className="text-[10px] text-gray-400 truncate">
                                    {item.romajiTitle}
                                  </div>
                                )}
                              <div className="flex items-center gap-2 text-[10px] text-purple-300 font-mono mt-0.5">
                                {item.year && <span>{item.year}</span>}
                                {item.chapters && (
                                  <span>• {item.chapters} chs</span>
                                )}
                                {item.volumes && (
                                  <span>• {item.volumes} vols</span>
                                )}
                                {item.format && (
                                  <span className="uppercase">
                                    • {item.format}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1 shrink-0">
                                <Check size={12} /> Selected
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── 2. Directory Path ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    2. Select Manga Folder Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste manga directory path..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaFolderPath}
                      onChange={(e) => setMangaFolderPath(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseMangaFolder}
                      disabled={mangaScanning}
                      className="px-3 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      {mangaScanning ? 'Scanning...' : 'Browse PC Folder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleScanManga}
                      disabled={mangaScanning || !mangaFolderPath}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                {/* Scanned files alert */}
                {mangaScanResult.length > 0 && (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>Found {mangaScanResult.length} PDF chapters</span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">
                      Ready to track
                    </span>
                  </div>
                )}

                {/* ── 3. Title, Romaji & Counts ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Manga / Webtoon Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Berserk, Solo Leveling, One Piece..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaTitle}
                      onChange={(e) => setMangaTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Romaji / Alternate Title (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Na Honjaman Rebeleob"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaRomajiTitle}
                      onChange={(e) => setMangaRomajiTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Volumes, Total Chapters & Year */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Volumes Count
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 12 (optional)"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaTotalVolumes}
                      onChange={(e) => setMangaTotalVolumes(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Chapters
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={
                        mangaScanResult.length > 0
                          ? `Scanned: ${mangaScanResult.length}`
                          : 'e.g. 100'
                      }
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaTotalChapters}
                      onChange={(e) => setMangaTotalChapters(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Release Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2018"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaYear}
                      onChange={(e) => setMangaYear(e.target.value)}
                    />
                  </div>
                </div>

                {/* ── 4. Description / Synopsis ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter manga description, synopsis, or auto-fetch from online..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={mangaDescription}
                    onChange={(e) => setMangaDescription(e.target.value)}
                  />
                </div>

                {/* ── 5. Cover Picture Artwork (2:3) ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Cover Picture Artwork (2:3)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMangaCoverSearch(true)}
                        className="px-3 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
                      >
                        <Sparkles size={12} />
                        <span>Search Covers (AniList / Fanart.tv)</span>
                      </button>
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMangaCoverUpload}
                        />
                      </label>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Direct cover image URL (AniList / Fanart.tv)..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={mangaCoverUrl}
                    onChange={(e) => setMangaCoverUrl(e.target.value)}
                  />

                  {/* Cover Preview & Fetched Posters List */}
                  <div className="flex flex-wrap items-start gap-3 mt-1">
                    {mangaCoverUrl && (
                      <div className="relative w-24 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 shadow-lg shrink-0">
                        <img
                          src={mangaCoverUrl}
                          alt="Cover Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setMangaCoverUrl('')}
                          className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                          title="Remove Cover Image"
                        >
                          <X size={10} />
                        </button>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/75 text-[9px] font-bold text-emerald-400">
                          Active
                        </span>
                      </div>
                    )}

                    {/* Quick Select from Fetched AniList & Fanart.tv Posters */}
                    {Array.isArray(mangaImages?.covers) &&
                      mangaImages.covers.length > 1 && (
                        <div className="flex-1 min-w-[200px]">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                            Fetched Online Posters ({mangaImages.covers.length}
                            ):
                          </span>
                          <div className="flex gap-2 overflow-x-auto pb-1 max-h-36 custom-scrollbar">
                            {mangaImages.covers.map((cov, idx) => {
                              const isSelected = mangaCoverUrl === cov.url;
                              return (
                                <div
                                  key={cov.url || idx}
                                  onClick={() =>
                                    setMangaCoverUrl(toFanartFull(cov.url))
                                  }
                                  className={`relative w-16 h-24 rounded-lg overflow-hidden shrink-0 border cursor-pointer transition ${
                                    isSelected
                                      ? 'border-purple-400 ring-2 ring-purple-500/50'
                                      : 'border-white/10 hover:border-white/30 opacity-75 hover:opacity-100'
                                  }`}
                                >
                                  <img
                                    src={toFanartPreview(cov.url)}
                                    alt="Cover option"
                                    className="w-full h-full object-cover"
                                  />
                                  <span className="absolute bottom-0 inset-x-0 bg-black/80 text-[8px] text-center text-gray-300 truncate px-0.5">
                                    {cov.source || 'Poster'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                  </div>
                </div>

                {/* ── 6. Backdrop Banner Artwork (16:9) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-purple-400" />
                      <span>Backdrop Banner Artwork (16:9)</span>
                    </label>
                    <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                      <ImagePlus size={13} />
                      <span>Upload File</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleMangaBannerUpload}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Wide 16:9 background image displayed on the top hero slider
                    and manga details.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={mangaBannerUrl}
                      onChange={(e) => setMangaBannerUrl(e.target.value)}
                    />
                    {mangaBannerUrl && (
                      <button
                        type="button"
                        onClick={() => setMangaBannerUrl('')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                        title="Clear banner"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Active Banner Preview */}
                  {mangaBannerUrl && (
                    <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                      <img
                        src={mangaBannerUrl}
                        alt="Backdrop Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                          <Check size={11} /> Active 16:9 Banner
                        </span>
                        <button
                          type="button"
                          onClick={() => setMangaBannerUrl('')}
                          className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Banner Picker from AniList & Fanart.tv */}
                  {Array.isArray(mangaImages?.banners) &&
                    mangaImages.banners.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Choose from Fetched Online Banners (
                          {mangaImages.banners.length} from AniList &
                          Fanart.tv):
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                          {mangaImages.banners.map((ban, idx) => {
                            const isSelected = mangaBannerUrl === ban.url;
                            return (
                              <div
                                key={ban.url || idx}
                                onClick={() =>
                                  setMangaBannerUrl(toFanartFull(ban.url))
                                }
                                className={`relative h-20 rounded-xl overflow-hidden border cursor-pointer transition ${
                                  isSelected
                                    ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)]'
                                    : 'border-white/10 hover:border-white/30 opacity-80 hover:opacity-100'
                                }`}
                              >
                                <img
                                  src={toFanartPreview(ban.url)}
                                  alt={`Banner ${idx + 1}`}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-black/80 p-1 flex items-center justify-between text-[9px] text-gray-300">
                                  <span className="truncate">
                                    {ban.source || 'Banner'}
                                  </span>
                                  {isSelected && (
                                    <span className="text-emerald-400 font-bold shrink-0 flex items-center gap-0.5">
                                      <Check size={10} />
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                </div>

                {/* ── 7. Custom Manga Logo / Title Art (Transparent PNG) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableMangaLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableMangaLogo(checked);
                          if (
                            checked &&
                            !mangaLogoUrl &&
                            mangaImages?.logos?.length > 0
                          ) {
                            setMangaLogoUrl(mangaImages.logos[0].url);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-purple-400" />
                        Custom Manga Logo / Title Art
                      </span>
                    </label>
                    {enableMangaLogo && (
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload Local Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleMangaLogoUpload}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Displays the manga's official transparent logo in the home
                    page sliding banner instead of simple text title.
                  </p>

                  {enableMangaLogo && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Select below, upload, or paste transparent logo URL..."
                          value={mangaLogoUrl}
                          onChange={(e) => setMangaLogoUrl(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                        />
                        {mangaLogoUrl && (
                          <button
                            type="button"
                            onClick={() => setMangaLogoUrl('')}
                            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                            title="Clear logo"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Current Selected Logo Preview */}
                      {mangaLogoUrl && (
                        <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                          <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                            <img
                              src={mangaLogoUrl}
                              alt="Selected Logo"
                              className="max-h-12 w-auto max-w-full object-contain"
                            />
                          </div>
                          <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                            <Check size={12} /> Active Logo
                          </span>
                        </div>
                      )}

                      {/* Fetched Logos Picker from Fanart.tv */}
                      {Array.isArray(mangaImages?.logos) &&
                      mangaImages.logos.length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Fetched Manga Logos ({mangaImages.logos.length}{' '}
                            available from Fanart.tv):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                            {mangaImages.logos.map((logo, idx) => {
                              const isSelected = mangaLogoUrl === logo.url;
                              return (
                                <div
                                  key={logo.url || idx}
                                  onClick={() =>
                                    setMangaLogoUrl(toFanartFull(logo.url))
                                  }
                                  className={`p-2 rounded-xl border flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                                    isSelected
                                      ? 'bg-purple-500/20 border-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                                      : 'bg-white/[0.04] border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                  }`}
                                >
                                  <div className="w-full h-12 flex items-center justify-center overflow-hidden">
                                    <img
                                      src={toFanartPreview(logo.url)}
                                      alt="Logo"
                                      className="max-h-10 w-auto max-w-full object-contain"
                                    />
                                  </div>
                                  <span className="text-[9px] font-mono text-gray-400 truncate">
                                    {logo.type || `Logo ${idx + 1}`}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[10px] text-gray-500 italic">
                          No online logos found for this manga. You can upload
                          a local PNG logo image above.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 8. Select Genres ── */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Select Genres (Max 5)
                    </label>
                    {mangaGenres.length > 0 && (
                      <span className="text-[10px] text-purple-300 font-mono">
                        {mangaGenres.length}/5 selected
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {GENRES_LIST.filter((g) => g !== 'All').map((g) => {
                      const isSel = mangaGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel)
                              setMangaGenres(
                                mangaGenres.filter((item) => item !== g)
                              );
                            else if (mangaGenres.length < 5)
                              setMangaGenres([...mangaGenres, g]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                            isSel
                              ? 'bg-purple-600 border-purple-500 text-white shadow-md'
                              : 'bg-white/5 border-white/10 text-gray-400 hover:text-white'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Submit / Cancel buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAddMangaModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      mangaScanning ||
                      (!mangaFolderPath && mangaScanResult.length === 0)
                    }
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 text-white text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    {mangaScanning ? 'Processing...' : 'Track Manga Folder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Online Manga Cover Search Modal */}
      <AnimatePresence>
        {showMangaCoverSearch && (
          <MangaCoverSearch
            initialQuery={mangaTitle}
            uploadToImgBB={uploadToImgBB}
            onSelectCover={(url) => {
              setMangaCoverUrl(url);
              setShowMangaCoverSearch(false);
            }}
            onClose={() => setShowMangaCoverSearch(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
