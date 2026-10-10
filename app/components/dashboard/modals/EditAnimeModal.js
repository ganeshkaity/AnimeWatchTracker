import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal,
  X,
  Sparkles,
  Loader2,
  Search,
  ImagePlus,
  FolderOpen,
  Check,
  ImageIcon,
} from 'lucide-react';
import AnimeCoverSearch from '../../AnimeCoverSearch';
import { toFanartPreview, toFanartFull } from '../../../lib/fanartUtils';
import { GENRES_LIST } from '../utils/dashboardHelpers';

export default function EditAnimeModal({
  editingAnime,
  setEditingAnime,
  handleSaveEdit,
  editTitle,
  setEditTitle,
  editTotalSeasons,
  setEditTotalSeasons,
  editTotalEpisodes,
  setEditTotalEpisodes,
  editGenres,
  setEditGenres,
  setAlertMessage,
  showOnlineSearchEdit,
  setShowOnlineSearchEdit,
  handleEditCoverUpload,
  handleEditCoverBrowse,
  editCoverUrl,
  setEditCoverUrl,
  uploadingEditCover,
  uploadToImgBB,
  searchingEditArtwork,
  editArtworkSearchQuery,
  setEditArtworkSearchQuery,
  fetchEditAnimeArtwork,
  handleEditBannerUpload,
  handleEditBannerBrowse,
  editBannerUrl,
  setEditBannerUrl,
  editAnimeImages,
  enableEditAnimeLogo,
  setEnableEditAnimeLogo,
  handleEditLogoUpload,
  handleEditLogoBrowse,
  editLogoUrl,
  setEditLogoUrl,
}) {
  return (
    <AnimatePresence>
      {editingAnime && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar"
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                <SlidersHorizontal className="text-[#a855f7]" size={20} />
                Edit Anime Details
              </h2>
              <button
                onClick={() => setEditingAnime(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Anime Display Title *
                </label>
                <input
                  type="text"
                  required
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                />
              </div>

              {/* Season Count & Total Episodes Inputs */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Total Seasons
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="e.g. 1"
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editTotalSeasons}
                    onChange={(e) => setEditTotalSeasons(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Total Episodes
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder={`Current: ${editingAnime?.episodeCount || 0}`}
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editTotalEpisodes}
                    onChange={(e) => setEditTotalEpisodes(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Select Categories / Genres (Max 5)
                </label>
                <div className="flex flex-wrap gap-2 mt-1 max-h-32 overflow-y-auto p-1 border border-white/5 rounded-xl bg-black/20 no-scrollbar">
                  {GENRES_LIST.map((genre) => {
                    if (genre === 'All') return null;
                    const isSelected = editGenres.includes(genre);
                    return (
                      <button
                        key={genre}
                        type="button"
                        onClick={() => {
                          setEditGenres((prev) => {
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
                            ? 'bg-[#7c5cff] text-white'
                            : 'bg-white/5 border border-white/5 text-gray-400 hover:text-white'
                        }`}
                      >
                        {genre}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Cover Image (Optional)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowOnlineSearchEdit((prev) => !prev)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                      showOnlineSearchEdit
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-gradient-to-r from-purple-600/30 to-indigo-600/30 hover:from-purple-600/50 hover:to-indigo-600/50 text-purple-200 border border-purple-500/30'
                    }`}
                  >
                    <Sparkles size={12} className="text-purple-300" />
                    {showOnlineSearchEdit
                      ? 'Hide Cover Search'
                      : 'Search Covers Online'}
                  </button>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleEditCoverUpload}
                      className="flex-grow text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-white/10 file:text-white hover:file:bg-white/20 file:cursor-pointer"
                    />
                    <button
                      type="button"
                      onClick={handleEditCoverBrowse}
                      className="px-4 py-2 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl text-xs font-semibold cursor-pointer text-white transition whitespace-nowrap"
                    >
                      Choose Local PC Image
                    </button>
                  </div>

                  {showOnlineSearchEdit && (
                    <AnimeCoverSearch
                      initialQuery={editTitle}
                      onSelectCover={(url) => {
                        setEditCoverUrl(url);
                        setShowOnlineSearchEdit(false);
                      }}
                      onClose={() => setShowOnlineSearchEdit(false)}
                      uploadToImgBB={uploadToImgBB}
                    />
                  )}

                  {uploadingEditCover && (
                    <div className="flex items-center gap-2 text-xs text-[#7c5cff]">
                      <Loader2 className="animate-spin" size={14} />
                      Uploading to ImgBB...
                    </div>
                  )}

                  {editCoverUrl && (
                    <div className="relative w-28 h-40 rounded-xl overflow-hidden border border-white/15 bg-black/25 flex items-center justify-center">
                      <img
                        src={
                          editCoverUrl.startsWith('http') ||
                          editCoverUrl.startsWith('data:')
                            ? editCoverUrl
                            : `/api/image?path=${encodeURIComponent(
                                editCoverUrl
                              )}`
                        }
                        alt="Cover Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setEditCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 hover:bg-red-700 text-white transition cursor-pointer"
                        title="Remove Cover Image"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Online Artwork Search (Fanart.tv & AniList) ── */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-900/20 via-indigo-900/20 to-black/30 border border-purple-500/20 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles size={14} className="text-purple-400" />
                    Search Artwork Online (AniList & Fanart.tv)
                  </span>
                  {searchingEditArtwork && (
                    <span className="text-[11px] text-purple-300 flex items-center gap-1 font-semibold">
                      <Loader2 size={12} className="animate-spin" /> Searching...
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Enter title to search online banners and logos..."
                    value={editArtworkSearchQuery}
                    onChange={(e) => setEditArtworkSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        fetchEditAnimeArtwork(editArtworkSearchQuery);
                      }
                    }}
                    className="flex-1 px-3 py-1.5 rounded-xl glass-input text-xs text-white"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      fetchEditAnimeArtwork(editArtworkSearchQuery)
                    }
                    disabled={
                      searchingEditArtwork || !editArtworkSearchQuery.trim()
                    }
                    className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition"
                  >
                    {searchingEditArtwork ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Search size={12} />
                    )}
                    Search
                  </button>
                </div>
              </div>

              {/* ── Backdrop Banner Artwork (16:9) ── */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Backdrop Banner Artwork (16:9)
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                      <ImagePlus size={13} />
                      <span>Upload Local</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleEditBannerUpload}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={handleEditBannerBrowse}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <FolderOpen size={13} />
                      <span>Browse PC</span>
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400">
                  Wide 16:9 background banner displayed on top hero carousel and
                  anime detail backdrops.
                </p>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Paste wide banner URL or select below from AniList / Fanart.tv..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={editBannerUrl}
                    onChange={(e) => setEditBannerUrl(e.target.value)}
                  />
                  {editBannerUrl && (
                    <button
                      type="button"
                      onClick={() => setEditBannerUrl('')}
                      className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer"
                      title="Clear banner"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Active Banner Preview */}
                {editBannerUrl && (
                  <div className="relative w-full h-24 sm:h-28 rounded-xl overflow-hidden border border-white/20 shadow-lg group">
                    <img
                      src={
                        editBannerUrl.startsWith('http') ||
                        editBannerUrl.startsWith('data:')
                          ? editBannerUrl
                          : `/api/image?path=${encodeURIComponent(
                              editBannerUrl
                            )}`
                      }
                      alt="Backdrop Preview"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex items-end justify-between p-2">
                      <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 bg-black/60 px-2 py-0.5 rounded">
                        <Check size={11} /> Active 16:9 Banner
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditBannerUrl('')}
                        className="p-1 rounded-full bg-red-600 text-white hover:bg-red-700 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Visual Banner Picker from AniList & Fanart.tv */}
                {Array.isArray(editAnimeImages?.banners) &&
                  editAnimeImages.banners.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                        Choose from Fetched Online Banners (
                        {editAnimeImages.banners.length} from AniList &
                        Fanart.tv):
                      </span>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1 rounded-xl bg-black/40 border border-white/5">
                        {editAnimeImages.banners.map((ban, idx) => {
                          const isSelected = editBannerUrl === ban.url;
                          return (
                            <div
                              key={ban.url || idx}
                              onClick={() =>
                                setEditBannerUrl(toFanartFull(ban.url))
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

              {/* ── Custom Anime Logo / Title Art (Transparent PNG) ── */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enableEditAnimeLogo}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setEnableEditAnimeLogo(checked);
                        if (
                          checked &&
                          !editLogoUrl &&
                          editAnimeImages?.logos?.length > 0
                        ) {
                          setEditLogoUrl(editAnimeImages.logos[0].url);
                        }
                      }}
                      className="h-4 w-4 rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <ImageIcon size={14} className="text-purple-400" />
                      Custom Anime Logo / Title Art
                    </span>
                  </label>
                  {enableEditAnimeLogo && (
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-purple-400 hover:text-purple-300 font-bold flex items-center gap-1 cursor-pointer">
                        <ImagePlus size={13} />
                        <span>Upload Local Logo</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleEditLogoUpload}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleEditLogoBrowse}
                        className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <FolderOpen size={13} />
                        <span>Browse PC</span>
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Displays the anime's official transparent logo in the home
                  page sliding banner in place of plain text title (just like
                  movies).
                </p>

                {enableEditAnimeLogo && (
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Select below, upload, or paste transparent logo URL..."
                        value={editLogoUrl}
                        onChange={(e) => setEditLogoUrl(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl glass-input text-xs text-white"
                      />
                      {editLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setEditLogoUrl('')}
                          className="p-2 rounded-xl bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-300 border border-white/10 transition cursor-pointer text-xs"
                          title="Clear logo"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>

                    {/* Current Selected Logo Preview */}
                    {editLogoUrl && (
                      <div className="p-3 rounded-xl bg-black/60 border border-white/15 flex items-center justify-between gap-3">
                        <div className="max-h-14 max-w-[200px] flex items-center justify-center p-1 bg-white/5 rounded-lg border border-white/5">
                          <img
                            src={
                              editLogoUrl.startsWith('http') ||
                              editLogoUrl.startsWith('data:')
                                ? editLogoUrl
                                : `/api/image?path=${encodeURIComponent(
                                    editLogoUrl
                                  )}`
                            }
                            alt="Selected Logo"
                            className="max-h-12 w-auto max-w-full object-contain"
                          />
                        </div>
                        <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                          <Check size={12} /> Active Logo
                        </span>
                      </div>
                    )}

                    {/* Visual Logo Picker from Fanart.tv */}
                    {Array.isArray(editAnimeImages?.logos) &&
                      editAnimeImages.logos.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block">
                            Choose from Fetched Transparent Logos (
                            {editAnimeImages.logos.length} from Fanart.tv /
                            TMDB):
                          </span>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto custom-scrollbar p-1.5 rounded-xl bg-black/50 border border-white/5">
                            {editAnimeImages.logos.map((logo, idx) => {
                              const isSelected = editLogoUrl === logo.url;
                              return (
                                <div
                                  key={logo.url || idx}
                                  onClick={() =>
                                    setEditLogoUrl(toFanartFull(logo.url))
                                  }
                                  className={`relative h-20 p-2 rounded-xl bg-white/[0.04] border flex items-center justify-center cursor-pointer transition ${
                                    isSelected
                                      ? 'border-purple-400 ring-2 ring-purple-500/50 shadow-[0_0_12px_rgba(168,85,247,0.4)] bg-purple-500/10'
                                      : 'border-white/10 hover:border-white/30 hover:bg-white/[0.08]'
                                  }`}
                                >
                                  <img
                                    src={toFanartPreview(logo.url)}
                                    alt={`Logo ${idx + 1}`}
                                    className="max-h-14 w-auto max-w-full object-contain filter drop-shadow-md"
                                  />
                                  <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                    {logo.lang && (
                                      <span className="text-[8px] uppercase font-bold px-1 rounded bg-black/70 text-gray-300">
                                        {logo.lang}
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className="text-emerald-400 p-0.5 rounded bg-black/70">
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
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingAnime(null)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
