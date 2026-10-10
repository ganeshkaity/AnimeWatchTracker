import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';

export default function MediaCompleteConfirmModal({
  item,
  type,
  onClose,
  onConfirm,
}) {
  if (!item) return null;

  let iconBg = 'bg-amber-500/20 text-amber-400';
  let buttonStyle = 'bg-gradient-to-r from-amber-500 to-rose-600 text-black';
  let isComplete = false;
  let titleText = '';
  let descText = '';

  if (type === 'manga') {
    iconBg = 'bg-purple-500/20 border border-purple-500/30 text-purple-400';
    buttonStyle = 'bg-[#7c5cff] hover:bg-[#6b4eeb] text-white shadow-purple-600/30';
    isComplete = Boolean(item.isWatched || item.progressPercent === 100);
    titleText = isComplete ? 'Mark Manga as Unread?' : 'Mark Manga as Completed?';
    descText = (
      <>
        Are you sure you want to{' '}
        {isComplete
          ? 'reset reading progress for'
          : 'mark all chapters as watched/completed for'}{' '}
        <span className="text-purple-300 font-semibold font-mono">
          "{item.title}"
        </span>
        ?
      </>
    );
  } else if (type === 'audioStory') {
    iconBg = 'bg-cyan-500/20 text-cyan-400';
    buttonStyle = 'bg-gradient-to-r from-cyan-500 to-purple-600 text-black';
    isComplete = Boolean(item.isWatched);
    titleText = isComplete
      ? 'Mark Audio Story Unlistened?'
      : 'Mark Entire Story as Listened?';
    descText = isComplete
      ? `Reset "${item.title}" progress back to unlistened.`
      : `Mark all tracks in "${item.title}" as completed (100%).`;
  } else if (type === 'movie') {
    iconBg = 'bg-amber-500/20 text-amber-400';
    buttonStyle = 'bg-gradient-to-r from-amber-500 to-rose-600 text-black';
    isComplete = Boolean(
      item.watched || item.completed || item.watchStatus === 'Completed'
    );
    titleText = isComplete
      ? 'Mark Movie Incomplete?'
      : 'Mark Movie as Completed?';
    descText = isComplete
      ? `Reset "${item.title}" progress back to uncompleted.`
      : `Mark "${item.title}" as fully watched (100%).`;
  } else if (type === 'webseries') {
    iconBg = 'bg-cyan-500/20 text-cyan-400';
    buttonStyle = 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white';
    isComplete = Boolean(
      item.watched ||
        item.isWatched ||
        item.watchStatus === 'Completed' ||
        (item.progressPercent && item.progressPercent >= 100)
    );
    titleText = isComplete
      ? 'Mark Series Incomplete?'
      : 'Mark Series as Completed?';
    descText = isComplete
      ? `Reset "${item.title}" progress back to uncompleted.`
      : `Mark "${item.title}" as fully watched (100%).`;
  } else if (type === 'watchlist') {
    iconBg = 'bg-amber-500/20 text-amber-400';
    buttonStyle = 'bg-gradient-to-r from-amber-500 to-rose-600 text-black';
    isComplete = Boolean(item.status === 'Completed' || item.completed);
    titleText = isComplete
      ? 'Mark Item Incomplete?'
      : 'Mark Item as Completed?';
    descText = isComplete
      ? `Reset "${item.title}" back to Plan to Watch.`
      : `Mark "${item.title}" as Completed.`;
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl space-y-4 bg-[#0d1117]/95 text-white text-center"
        >
          <div
            className={`w-12 h-12 rounded-2xl flex items-center justify-center mx-auto ${iconBg}`}
          >
            <CheckCircle2 size={24} />
          </div>

          <div>
            <h3 className="text-sm font-black text-white uppercase tracking-wider">
              {titleText}
            </h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed">
              {descText}
            </p>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-gray-300 text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onConfirm(item);
              }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition cursor-pointer shadow-lg ${buttonStyle}`}
            >
              Yes, Confirm
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
