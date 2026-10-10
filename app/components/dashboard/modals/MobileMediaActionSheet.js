import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film,
  X,
  Play,
  CheckCircle2,
  Edit3,
  HardDrive,
  Trash2,
  Eye,
} from 'lucide-react';

export default function MobileMediaActionSheet({
  activeMobileMenu,
  onClose,
  router,
  onSelectAnime,
  handleOpenEditModal,
  handleDeleteAnime,
  handleDeleteMovie,
  handleDeleteWebseries,
  handleDeleteManga,
  handleDeleteAudioStory,
  handleDeleteWatchlist,
  handleToggleAnimeComplete,
  setMovieCompleteConfirm,
  setWebseriesCompleteConfirm,
  setMangaCompleteConfirm,
  setAudioStoryCompleteConfirm,
  setWatchlistCompleteConfirm,
  setMovieEditing,
  setWebseriesEditing,
  setEditingWatchlistItem,
  setTransferringWatchlistItem,
}) {
  if (!activeMobileMenu) return null;

  const { item, type } = activeMobileMenu;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: '100%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl bg-[#111622] border-t sm:border border-white/20 p-5 shadow-2xl space-y-3 text-white pb-8 sm:pb-5"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b border-white/10 pb-3">
            {item?.posterUrl ||
            item?.posterPath ||
            item?.coverUrl ||
            item?.thumbnailBase64 ||
            item?.thumbnailPath ? (
              <img
                src={
                  item.posterUrl ||
                  item.posterPath ||
                  item.coverUrl ||
                  item.thumbnailBase64 ||
                  (item.thumbnailPath
                    ? `/api/image?path=${encodeURIComponent(item.thumbnailPath)}`
                    : '')
                }
                alt={item.title}
                className="w-10 h-14 object-cover rounded-lg shadow"
              />
            ) : (
              <div className="w-10 h-14 bg-white/10 rounded-lg flex items-center justify-center">
                <Film size={18} className="text-amber-400" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h4 className="font-bold text-sm text-white truncate">
                {item?.title}
              </h4>
              <p className="text-xs text-gray-400">
                {item?.totalEpisodes
                  ? `${item.totalEpisodes} Ep`
                  : item?.year || ''}{' '}
                •{' '}
                {type === 'movie'
                  ? 'Movie'
                  : type === 'webseries'
                  ? 'Web-series'
                  : type === 'anime'
                  ? 'Anime'
                  : type === 'manga'
                  ? 'Manga'
                  : type === 'audioStory'
                  ? 'Audio'
                  : 'Watchlist'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="space-y-1 pt-1">
            {/* Play / Open Details */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  router.push(`/movies/${item.id}`);
                } else if (type === 'webseries') {
                  router.push(`/webseries/${item.id}`);
                } else if (type === 'anime') {
                  onSelectAnime(item.id);
                } else if (type === 'manga') {
                  router.push(`/manga/${item.id}`);
                } else if (type === 'audioStory') {
                  router.push(`/audio-story/${item.id}`);
                } else {
                  router.push(`/watchlist/${item.id}`);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl bg-[#7c5cff]/20 hover:bg-[#7c5cff]/30 text-[#a855f7] flex items-center gap-3 text-sm font-bold transition active:scale-98 cursor-pointer"
            >
              <Play size={18} fill="currentColor" />
              <span>
                {type === 'anime'
                  ? 'Open Anime'
                  : type === 'movie'
                  ? 'Play Movie'
                  : type === 'webseries'
                  ? 'Play Series'
                  : type === 'manga'
                  ? 'Read Manga'
                  : type === 'audioStory'
                  ? 'Listen Audio'
                  : 'Open Details'}
              </span>
            </button>

            {/* Complete / Incomplete */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  setMovieCompleteConfirm(item);
                } else if (type === 'webseries') {
                  setWebseriesCompleteConfirm(item);
                } else if (type === 'anime') {
                  handleToggleAnimeComplete(item);
                } else if (type === 'manga') {
                  setMangaCompleteConfirm(item);
                } else if (type === 'audioStory') {
                  setAudioStoryCompleteConfirm(item);
                } else {
                  setWatchlistCompleteConfirm(item);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
            >
              <CheckCircle2
                size={18}
                className={
                  item?.watched ||
                  item?.isWatched ||
                  item?.status === 'Completed' ||
                  (item?.progressPercent && item?.progressPercent >= 100)
                    ? 'text-emerald-400'
                    : 'text-gray-400'
                }
              />
              <span>
                {item?.watched ||
                item?.isWatched ||
                item?.status === 'Completed' ||
                (item?.progressPercent && item?.progressPercent >= 100)
                  ? 'Mark Incomplete'
                  : 'Mark as Completed'}
              </span>
            </button>

            {/* Edit */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  setMovieEditing(item);
                } else if (type === 'webseries') {
                  setWebseriesEditing(item);
                } else if (type === 'anime') {
                  handleOpenEditModal(item);
                } else {
                  setEditingWatchlistItem(item);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
            >
              <Edit3 size={18} className="text-amber-400" />
              <span>Edit Details</span>
            </button>

            {/* Transfer (if watchlist) */}
            {type === 'watchlist' && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setTransferringWatchlistItem(item);
                }}
                className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-white transition active:scale-98 cursor-pointer"
              >
                <HardDrive size={18} className="text-cyan-400" />
                <span>Transfer to Active Library</span>
              </button>
            )}

            {/* Delete */}
            <button
              type="button"
              onClick={(e) => {
                onClose();
                if (type === 'movie') {
                  handleDeleteMovie(item, e);
                } else if (type === 'webseries') {
                  handleDeleteWebseries(item, e);
                } else if (type === 'anime') {
                  handleDeleteAnime(item, e);
                } else if (type === 'manga') {
                  handleDeleteManga(item, e);
                } else if (type === 'audioStory') {
                  handleDeleteAudioStory(item, e);
                } else {
                  handleDeleteWatchlist(item, e);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-rose-500/20 text-rose-300 flex items-center gap-3 text-sm font-semibold transition active:scale-98 cursor-pointer"
            >
              <Trash2 size={18} className="text-rose-400" />
              <span>Delete</span>
            </button>

            {/* View Details */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (type === 'movie') {
                  router.push(`/movies/${item.id}`);
                } else if (type === 'webseries') {
                  router.push(`/webseries/${item.id}`);
                } else if (type === 'anime') {
                  onSelectAnime(item.id);
                } else if (type === 'manga') {
                  router.push(`/manga/${item.id}`);
                } else if (type === 'audioStory') {
                  router.push(`/audio-story/${item.id}`);
                } else {
                  router.push(`/watchlist/${item.id}`);
                }
              }}
              className="w-full text-left px-3.5 py-3 rounded-2xl hover:bg-white/10 flex items-center gap-3 text-sm font-semibold text-gray-300 transition active:scale-98 cursor-pointer"
            >
              <Eye size={18} className="text-indigo-400" />
              <span>View Full Details</span>
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
