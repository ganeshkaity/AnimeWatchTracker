import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Youtube,
  FolderOpen,
  X,
  Sparkles,
  Search,
  Loader2,
  CheckCircle2,
  Film,
  Check,
  ImagePlus,
  ImageIcon,
  RefreshCw,
  CheckSquare,
  Square,
  Video,
} from 'lucide-react';
import AnimeCoverSearch from '../../AnimeCoverSearch';
import { NAMING_PATTERNS } from '../../../utils/parser';
import { toFanartPreview, toFanartFull } from '../../../lib/fanartUtils';
import { GENRES_LIST } from '../utils/dashboardHelpers';

export default function AddAnimeModal({
  showAddModal,
  setShowAddModal,
  addModalTab,
  setAddModalTab,
  handleAddAnime,
  animeSearchQuery,
  setAnimeSearchQuery,
  handleSearchAnimeOnline,
  animeSearching,
  animeFetchingDetails,
  animeSearchError,
  selectedAnimeOnline,
  setSelectedAnimeOnline,
  animeSearchResults,
  handleSelectAnimeOnline,
  folderPath,
  setFolderPath,
  handleBrowseFolder,
  handleScan,
  scanResult,
  parsedEpsCount,
  namingPattern,
  setNamingPattern,
  animeTitle,
  setAnimeTitle,
  animeRomajiTitle,
  setAnimeRomajiTitle,
  addTotalSeasons,
  setAddTotalSeasons,
  addTotalEpisodes,
  setAddTotalEpisodes,
  animeYear,
  setAnimeYear,
  animeOverview,
  setAnimeOverview,
  showOnlineSearchAdd,
  setShowOnlineSearchAdd,
  handleAnimeCoverUpload,
  coverUrl,
  setCoverUrl,
  animeImages,
  handleAnimeBannerUpload,
  animeBannerUrl,
  setAnimeBannerUrl,
  enableAnimeLogo,
  setEnableAnimeLogo,
  handleAnimeLogoUpload,
  animeLogoUrl,
  setAnimeLogoUrl,
  addGenres,
  setAddGenres,
  setAlertMessage,
  scanning,
  ytPlaylistUrl,
  setYtPlaylistUrl,
  handleFetchYouTubePlaylist,
  ytFetching,
  ytError,
  ytPlaylistData,
  ytQualitiesFetching,
  ytSelectedQuality,
  setYtSelectedQuality,
  ytAvailableQualities,
  fetchYouTubeQualities,
  ytSelectedVideoIds,
  toggleSelectAllYt,
  toggleVideoSelection,
  handleImportYouTubePlaylist,
}) {
  return (
    <AnimatePresence>
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                {addModalTab === 'youtube' ? (
                  <Youtube className="text-red-500" size={20} />
                ) : (
                  <FolderOpen className="text-[#7c5cff]" size={20} />
                )}
                {addModalTab === 'youtube'
                  ? 'Add YouTube Playlist'
                  : 'Track Local Anime Folder'}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex border-b border-white/10">
              <button
                type="button"
                onClick={() => setAddModalTab('local')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${
                  addModalTab === 'local'
                    ? 'border-[#7c5cff] text-white bg-white/5 rounded-t-xl'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <FolderOpen size={15} /> Local Folder
              </button>
              <button
                type="button"
                onClick={() => setAddModalTab('youtube')}
                className={`flex-1 py-2 text-xs font-bold flex items-center justify-center gap-2 border-b-2 transition cursor-pointer ${
                  addModalTab === 'youtube'
                    ? 'border-red-500 text-white bg-white/5 rounded-t-xl'
                    : 'border-transparent text-gray-400 hover:text-white'
                }`}
              >
                <Youtube size={15} className="text-red-500" /> Add YouTube
                Playlist
              </button>
            </div>

            {addModalTab === 'local' ? (
              <form onSubmit={handleAddAnime} className="space-y-4">
                {/* ── 1. Search Anime Online & Auto-Fill (AniList & Fanart.tv) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-purple-400 font-bold flex items-center gap-1.5">
                      <Sparkles size={13} className="text-purple-400" />
                      <span>1. Search Anime Online (AniList & Fanart.tv)</span>
                    </label>
                    <span className="text-[10px] text-purple-300 font-mono">
                      Online Metadata
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        placeholder="Search anime title (e.g. Bleach, Attack on Titan, Solo Leveling)..."
                        className="w-full px-3 py-2 pl-8 rounded-xl glass-input text-xs text-white"
                        value={animeSearchQuery}
                        onChange={(e) => setAnimeSearchQuery(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchAnimeOnline();
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
                      onClick={handleSearchAnimeOnline}
                      disabled={
                        animeSearching ||
                        !(animeSearchQuery || animeTitle).trim()
                      }
                      className="px-3.5 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/40 text-purple-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {animeSearching ? (
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
                  {animeSearching && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Searching AniList...</span>
                    </p>
                  )}
                  {animeFetchingDetails && (
                    <p className="text-[11px] text-purple-400 font-medium flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      <span>
                        Fetching details, wide banners & Fanart.tv logos...
                      </span>
                    </p>
                  )}
                  {animeSearchError && (
                    <p className="text-[11px] text-purple-300 font-medium">
                      {animeSearchError}
                    </p>
                  )}

                  {/* Active Selected Anime Pill */}
                  {selectedAnimeOnline && (
                    <div className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 overflow-hidden">
                        <CheckCircle2
                          size={14}
                          className="text-emerald-400 shrink-0"
                        />
                        <span className="text-xs font-bold text-white truncate">
                          Auto-filling: {selectedAnimeOnline.title}
                        </span>
                        {selectedAnimeOnline.year && (
                          <span className="text-[10px] text-purple-300 font-mono shrink-0">
                            ({selectedAnimeOnline.year})
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedAnimeOnline(null)}
                        className="text-gray-400 hover:text-white p-1"
                        title="Clear online selection"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}

                  {/* Selectable Results Dropdown List */}
                  {animeSearchResults.length > 0 && (
                    <div className="mt-2 p-2 rounded-2xl bg-black/40 border border-white/10 max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                      <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-2 py-0.5">
                        Select match to auto-populate metadata & artwork:
                      </div>
                      {animeSearchResults.map((item) => {
                        const isSelected = selectedAnimeOnline?.id === item.id;
                        return (
                          <div
                            key={item.id}
                            onClick={() => handleSelectAnimeOnline(item)}
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
                                <Film size={14} className="text-gray-500" />
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
                                {item.episodes && (
                                  <span>• {item.episodes} eps</span>
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

                {/* ── 2. Local Folder Directory Path ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    2. Select Folder Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste local directory path..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleBrowseFolder}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer text-white flex items-center gap-1.5 transition"
                    >
                      Browse
                    </button>
                    {folderPath && (
                      <button
                        type="button"
                        onClick={handleScan}
                        className="px-4 py-2 bg-[#7c5cff]/20 border border-[#7c5cff]/40 text-[#7c5cff] hover:bg-[#7c5cff] hover:text-white rounded-xl text-xs font-bold transition cursor-pointer"
                      >
                        Scan Folder
                      </button>
                    )}
                  </div>
                </div>

                {/* Scanned files alert */}
                {scanResult.length > 0 && (
                  <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>
                        Found {parsedEpsCount || scanResult.length} video
                        episode files
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">
                      Ready to track
                    </span>
                  </div>
                )}

                {/* ── 3. Naming Pattern ── */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Naming Pattern
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                    {NAMING_PATTERNS.map((pat) => (
                      <button
                        key={pat.id}
                        type="button"
                        onClick={() => setNamingPattern(pat.id)}
                        className={`px-3 py-2 rounded-xl text-left text-[11px] border transition cursor-pointer ${
                          namingPattern === pat.id
                            ? 'bg-[#7c5cff]/20 border-[#7c5cff] text-white'
                            : 'bg-white/5 border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        <span className="font-bold block">{pat.label}</span>
                        <span className="text-[9px] opacity-60 block truncate">
                          {pat.example}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── 4. Title & Counts ── */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Anime Display Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bleach TYBW"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeTitle}
                      onChange={(e) => setAnimeTitle(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Romaji / Japanese Title (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Bleach: Sennen Kessen-hen"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeRomajiTitle}
                      onChange={(e) => setAnimeRomajiTitle(e.target.value)}
                    />
                  </div>
                </div>

                {/* Season Count & Total Episodes Inputs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Seasons
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder="e.g. 1"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={addTotalSeasons}
                      onChange={(e) => setAddTotalSeasons(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Total Episodes
                    </label>
                    <input
                      type="number"
                      min="1"
                      placeholder={
                        parsedEpsCount
                          ? `Scanned: ${parsedEpsCount}`
                          : 'e.g. 24'
                      }
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={addTotalEpisodes}
                      onChange={(e) => setAddTotalEpisodes(e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                      Release Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2024"
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeYear}
                      onChange={(e) => setAnimeYear(e.target.value)}
                    />
                  </div>
                </div>

                {/* Synopsis / Overview */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Overview / Synopsis
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter anime synopsis or auto-fetch from online above..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={animeOverview}
                    onChange={(e) => setAnimeOverview(e.target.value)}
                  />
                </div>

                {/* ── 5. Poster Artwork (2:3) ── */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Cover Picture Artwork (2:3)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowOnlineSearchAdd((prev) => !prev)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                          showOnlineSearchAdd
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30'
                        }`}
                      >
                        <Sparkles size={12} className="text-purple-300" />
                        {showOnlineSearchAdd
                          ? 'Hide Cover Search'
                          : 'Search Covers (AniList / Fanart.tv)'}
                      </button>
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload File</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAnimeCoverUpload}
                        />
                      </label>
                    </div>
                  </div>

                  <input
                    type="text"
                    placeholder="Direct cover image URL (AniList / Fanart.tv)..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={coverUrl}
                    onChange={(e) => setCoverUrl(e.target.value)}
                  />

                  {/* Dedicated Online Cover Search Tab */}
                  {showOnlineSearchAdd && (
                    <div className="mt-2">
                      <AnimeCoverSearch
                        initialQuery={animeTitle || animeSearchQuery}
                        onSelectCover={(url) => {
                          setCoverUrl(url);
                          setShowOnlineSearchAdd(false);
                        }}
                        onClose={() => setShowOnlineSearchAdd(false)}
                      />
                    </div>
                  )}

                  {/* Cover Preview & Fetched Posters List */}
                  <div className="flex flex-wrap items-start gap-3 mt-1">
                    {coverUrl && (
                      <div className="relative w-24 h-36 rounded-xl overflow-hidden border border-white/20 bg-black/40 shadow-lg shrink-0">
                        <img
                          src={coverUrl}
                          alt="Cover Preview"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setCoverUrl('')}
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
                    {Array.isArray(animeImages?.covers) &&
                      animeImages.covers.length > 1 && (
                        <div className="flex-1 min-w-[200px]">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1">
                            Fetched Online Posters ({animeImages.covers.length}
                            ):
                          </span>
                          <div className="flex gap-2 overflow-x-auto pb-1 max-h-36 custom-scrollbar">
                            {animeImages.covers.map((cov, idx) => {
                              const isSelected = coverUrl === cov.url;
                              return (
                                <div
                                  key={cov.url || idx}
                                  onClick={() =>
                                    setCoverUrl(toFanartFull(cov.url))
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
                        onChange={handleAnimeBannerUpload}
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Wide 16:9 background image displayed on the top hero slider
                    and anime detail backdrops.
                  </p>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                      className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={animeBannerUrl}
                      onChange={(e) => setAnimeBannerUrl(e.target.value)}
                    />
                    {animeBannerUrl && (
                      <button
                        type="button"
                        onClick={() => setAnimeBannerUrl('')}
                        className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                        title="Clear banner"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Active Banner Preview */}
                  {animeBannerUrl && (
                    <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                      <img
                        src={animeBannerUrl}
                        alt="Backdrop Preview"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                          <Check size={11} /> Active 16:9 Banner
                        </span>
                        <button
                          type="button"
                          onClick={() => setAnimeBannerUrl('')}
                          className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Visual Banner Picker from AniList & Fanart.tv */}
                  {Array.isArray(animeImages?.banners) &&
                    animeImages.banners.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                          Choose from Fetched Online Banners (
                          {animeImages.banners.length} from AniList &
                          Fanart.tv):
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                          {animeImages.banners.map((ban, idx) => {
                            const isSelected = animeBannerUrl === ban.url;
                            return (
                              <div
                                key={ban.url || idx}
                                onClick={() =>
                                  setAnimeBannerUrl(toFanartFull(ban.url))
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

                {/* ── 7. Custom Anime Logo / Title Art (Transparent PNG) ── */}
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={enableAnimeLogo}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setEnableAnimeLogo(checked);
                          if (
                            checked &&
                            !animeLogoUrl &&
                            animeImages?.logos?.length > 0
                          ) {
                            setAnimeLogoUrl(animeImages.logos[0].url);
                          }
                        }}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <ImageIcon size={14} className="text-purple-400" />
                        Custom Anime Logo / Title Art
                      </span>
                    </label>
                    {enableAnimeLogo && (
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload Local Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAnimeLogoUpload}
                        />
                      </label>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-400">
                    Displays the anime's official transparent logo in the home
                    page sliding banner in place of plain text title (just like
                    movies).
                  </p>

                  {enableAnimeLogo && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Select below, upload, or paste transparent logo URL..."
                          value={animeLogoUrl}
                          onChange={(e) => setAnimeLogoUrl(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                        />
                        {animeLogoUrl && (
                          <button
                            type="button"
                            onClick={() => setAnimeLogoUrl('')}
                            className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                            title="Clear logo"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>

                      {/* Current Selected Logo Preview */}
                      {animeLogoUrl && (
                        <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                          <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                            <img
                              src={animeLogoUrl}
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
                      {Array.isArray(animeImages?.logos) &&
                      animeImages.logos.length > 0 ? (
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Fetched Anime Logos ({animeImages.logos.length}{' '}
                            available from Fanart.tv):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                            {animeImages.logos.map((logo, idx) => {
                              const isSelected = animeLogoUrl === logo.url;
                              return (
                                <div
                                  key={logo.url || idx}
                                  onClick={() =>
                                    setAnimeLogoUrl(toFanartFull(logo.url))
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
                          No online logos found for this anime. You can upload
                          a local PNG logo image above.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 8. Select Categories / Genres ── */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Select Categories / Genres (Max 5)
                    </label>
                    {addGenres.length > 0 && (
                      <span className="text-[10px] text-purple-300 font-mono">
                        {addGenres.length}/5 selected
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 p-1 border border-white/5 rounded-xl bg-black/20 max-h-28 overflow-y-auto custom-scrollbar">
                    {GENRES_LIST.map((genre) => {
                      if (genre === 'All') return null;
                      const isSelected = addGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => {
                            setAddGenres((prev) => {
                              const alreadySelected = prev.includes(genre);
                              if (alreadySelected)
                                return prev.filter((g) => g !== genre);
                              if (prev.length >= 5) {
                                setAlertMessage(
                                  'You can select a maximum of 5 genres.'
                                );
                                return prev;
                              }
                              return [...prev, genre];
                            });
                          }}
                          className={`px-3 py-1.5 rounded-full text-[10px] font-semibold transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#7c5cff] text-white shadow-md'
                              : 'bg-white/5 border border-white/5 text-gray-400 hover:text-white'
                          }`}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={scanning || (!folderPath && parsedEpsCount === 0)}
                    className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer shadow-lg"
                  >
                    {scanning ? 'Processing...' : 'Track Anime'}
                  </button>
                </div>
              </form>
            ) : (
              /* YouTube Playlist Tab Content */
              <div className="space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    YouTube Playlist URL *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/playlist?list=..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={ytPlaylistUrl}
                      onChange={(e) => setYtPlaylistUrl(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleFetchYouTubePlaylist}
                      disabled={ytFetching || !ytPlaylistUrl.trim()}
                      className="px-4 py-2 bg-red-600/20 border border-red-500/40 text-red-400 hover:bg-red-600 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {ytFetching ? (
                        <Loader2 className="animate-spin" size={14} />
                      ) : (
                        <Youtube size={14} />
                      )}
                      Fetch Playlist
                    </button>
                  </div>
                  {ytError && (
                    <p className="text-xs text-red-400 mt-1.5 font-medium">
                      {ytError}
                    </p>
                  )}
                </div>

                {ytPlaylistData && (
                  <div className="space-y-4 border-t border-white/10 pt-3">
                    {/* Playlist Header Summary */}
                    <div className="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/10">
                      {ytPlaylistData.thumbnail && (
                        <img
                          src={ytPlaylistData.thumbnail}
                          alt={ytPlaylistData.title}
                          className="w-16 h-16 object-cover rounded-xl border border-white/10 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-extrabold text-sm text-white truncate">
                          {ytPlaylistData.title}
                        </h3>
                        <p className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                          <span className="bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold text-[10px]">
                            YouTube Playlist
                          </span>
                          <span>{ytPlaylistData.totalVideos} Videos Total</span>
                        </p>
                      </div>
                    </div>

                    {/* Quality Options Control */}
                    <div className="bg-black/30 p-3 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-bold text-gray-300">
                          Default Playback Quality:
                        </label>
                        {ytQualitiesFetching ? (
                          <span className="text-xs text-[#7c5cff] flex items-center gap-1">
                            <Loader2 className="animate-spin" size={12} />{' '}
                            Fetching options...
                          </span>
                        ) : (
                          <select
                            value={ytSelectedQuality}
                            onChange={(e) =>
                              setYtSelectedQuality(e.target.value)
                            }
                            className="bg-white/10 border border-white/15 text-xs text-white rounded-xl px-2.5 py-1 font-semibold focus:outline-none focus:border-[#7c5cff]"
                          >
                            {ytAvailableQualities.map((q) => (
                              <option
                                key={q.id}
                                value={q.id}
                                className="bg-gray-900 text-white"
                              >
                                {q.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          ytPlaylistData.videos.length > 0 &&
                          fetchYouTubeQualities(ytPlaylistData.videos[0].id)
                        }
                        className="text-[11px] text-[#7c5cff] hover:underline font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw size={12} /> Refresh Quality Options
                      </button>
                    </div>

                    {/* Video Selection List */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs font-bold uppercase tracking-wider text-gray-400">
                          Select Videos ({ytSelectedVideoIds.size} /{' '}
                          {ytPlaylistData.videos.length})
                        </label>
                        <button
                          type="button"
                          onClick={toggleSelectAllYt}
                          className="text-[11px] text-gray-300 hover:text-white font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          {ytSelectedVideoIds.size ===
                          ytPlaylistData.videos.length ? (
                            <CheckSquare size={14} className="text-[#7c5cff]" />
                          ) : (
                            <Square size={14} />
                          )}
                          {ytSelectedVideoIds.size ===
                          ytPlaylistData.videos.length
                            ? 'Deselect All'
                            : 'Select All'}
                        </button>
                      </div>

                      <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                        {ytPlaylistData.videos.map((vid) => {
                          const isChecked = ytSelectedVideoIds.has(vid.id);
                          return (
                            <div
                              key={vid.id}
                              onClick={() => toggleVideoSelection(vid.id)}
                              className={`flex items-center gap-3 p-2 rounded-xl border transition cursor-pointer ${
                                isChecked
                                  ? 'bg-[#7c5cff]/10 border-[#7c5cff]/40'
                                  : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}}
                                className="rounded border-white/20 text-[#7c5cff] focus:ring-0 cursor-pointer"
                              />
                              {vid.thumbnail ? (
                                <img
                                  src={vid.thumbnail}
                                  alt={vid.title}
                                  className="w-14 h-9 object-cover rounded-lg shrink-0 border border-white/10"
                                />
                              ) : (
                                <div className="w-14 h-9 bg-black/40 rounded-lg shrink-0 flex items-center justify-center">
                                  <Video size={16} className="text-gray-500" />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="text-xs font-bold text-white truncate">
                                  {vid.title}
                                </h4>
                                <span className="text-[10px] text-gray-400 font-mono">
                                  {vid.durationFormatted}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Import Button */}
                    <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setShowAddModal(false)}
                        className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleImportYouTubePlaylist}
                        disabled={scanning || ytSelectedVideoIds.size === 0}
                        className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer transition flex items-center gap-1.5"
                      >
                        {scanning ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <Youtube size={14} />
                        )}
                        {scanning
                          ? 'Importing...'
                          : `Import ${ytSelectedVideoIds.size} Videos`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
