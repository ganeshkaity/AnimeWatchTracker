import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Headphones,
  X,
  CheckCircle2,
  Sparkles,
  ImagePlus,
  HardDrive,
} from 'lucide-react';
import MangaCoverSearch from '../../MangaCoverSearch';
import { GENRES_LIST } from '../utils/dashboardHelpers';

export default function AddAudioStoryModal({
  showAddAudioStoryModal,
  setShowAddAudioStoryModal,
  handleAddAudioStory,
  audioStoryFolderPath,
  setAudioStoryFolderPath,
  handleBrowseAudioStoryFolder,
  handleScanAudioStory,
  audioStoryScanning,
  audioStoryScanResult,
  audioStoryTitle,
  setAudioStoryTitle,
  handleFetchAudioStoryOnline,
  fetchingAudioOnline,
  audioStoryOnlineMessage,
  audioStoryTotalTracks,
  setAudioStoryTotalTracks,
  audioStoryDescription,
  setAudioStoryDescription,
  showAudioCoverSearch,
  setShowAudioCoverSearch,
  handleNewAudioCoverUpload,
  handleAudioCoverBrowse,
  audioStoryCoverUrl,
  setAudioStoryCoverUrl,
  audioStoryGenres,
  setAudioStoryGenres,
  uploadToImgBB,
}) {
  return (
    <>
      <AnimatePresence>
        {showAddAudioStoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4 bg-[#0d1117]/95 text-white"
            >
              <div className="flex justify-between items-center border-b border-white/10 pb-3">
                <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                  <Headphones className="text-cyan-400" size={20} />
                  <span>Track Local Audio Story Folder</span>
                </h2>
                <button
                  type="button"
                  onClick={() => setShowAddAudioStoryModal(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-white transition cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddAudioStory} className="space-y-4">
                {/* 1. Directory Path */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Audio Story Folder Directory *
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Browse your PC or paste audio / video story directory path..."
                      className="flex-grow px-3 py-2 rounded-xl glass-input text-xs text-white"
                      value={audioStoryFolderPath}
                      onChange={(e) => setAudioStoryFolderPath(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={handleBrowseAudioStoryFolder}
                      disabled={audioStoryScanning}
                      className="px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-300 hover:text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      {audioStoryScanning ? 'Scanning...' : 'Browse PC Folder'}
                    </button>
                    <button
                      type="button"
                      onClick={handleScanAudioStory}
                      disabled={audioStoryScanning || !audioStoryFolderPath}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold whitespace-nowrap transition cursor-pointer disabled:opacity-50"
                    >
                      Scan
                    </button>
                  </div>
                </div>

                {/* Scanned files alert */}
                {audioStoryScanResult.length > 0 && (
                  <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>
                        Found {audioStoryScanResult.length} tracks (
                        {
                          audioStoryScanResult.filter((t) => !t.isVideo).length
                        }{' '}
                        audio,{' '}
                        {audioStoryScanResult.filter((t) => t.isVideo).length}{' '}
                        video)
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-gray-400">
                      Ready to track
                    </span>
                  </div>
                )}

                {/* 2. Story Title + Auto-Fetch Button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                      Audio Story Title *
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchAudioStoryOnline}
                      disabled={fetchingAudioOnline || !audioStoryTitle.trim()}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-cyan-600/30 to-purple-600/30 hover:from-cyan-600/50 hover:to-purple-600/50 text-cyan-200 border border-cyan-500/30 hover:border-cyan-400 text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Auto-fetch synopsis and artwork from online"
                    >
                      <Sparkles
                        size={12}
                        className={
                          fetchingAudioOnline
                            ? 'animate-spin text-cyan-400'
                            : 'text-cyan-300'
                        }
                      />
                      <span>
                        {fetchingAudioOnline
                          ? 'Fetching Online...'
                          : 'Auto-Fetch from Online'}
                      </span>
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Lord of the Mysteries, The Sandman, Welcome to Night Vale..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryTitle}
                    onChange={(e) => setAudioStoryTitle(e.target.value)}
                  />
                  {audioStoryOnlineMessage && (
                    <p
                      className={`text-[11px] mt-1 font-medium ${
                        audioStoryOnlineMessage.startsWith('✓')
                          ? 'text-emerald-400'
                          : 'text-cyan-300'
                      }`}
                    >
                      {audioStoryOnlineMessage}
                    </p>
                  )}
                </div>

                {/* 3. Total Tracks */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Total Tracks / Parts
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder={
                      audioStoryScanResult.length > 0
                        ? `Scanned: ${audioStoryScanResult.length} (or enter total)`
                        : 'e.g. 24'
                    }
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryTotalTracks}
                    onChange={(e) =>
                      setAudioStoryTotalTracks(e.target.value)
                    }
                  />
                </div>

                {/* 4. Description / Synopsis */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Description / Synopsis
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Enter audio story description, synopsis, narrator, or auto-fetch..."
                    className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                    value={audioStoryDescription}
                    onChange={(e) =>
                      setAudioStoryDescription(e.target.value)
                    }
                  />
                </div>

                {/* 5. Cover Picture */}
                <div className="space-y-2">
                  <label className="block text-xs uppercase tracking-wider text-gray-400 font-bold">
                    Cover Picture Artwork
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAudioCoverSearch(true)}
                      className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-black text-xs font-bold flex items-center gap-1.5 transition shadow-md cursor-pointer"
                    >
                      <Sparkles size={14} />
                      <span>Search Online Covers</span>
                    </button>

                    <label className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10">
                      <ImagePlus size={14} />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleNewAudioCoverUpload}
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleAudioCoverBrowse}
                      className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-gray-300 hover:text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-white/10"
                    >
                      <HardDrive size={14} />
                      <span>Browse PC</span>
                    </button>
                  </div>

                  {audioStoryCoverUrl && (
                    <div className="relative w-24 h-32 rounded-xl overflow-hidden border border-white/20 shadow-lg mt-2">
                      <img
                        src={audioStoryCoverUrl}
                        alt="Cover Preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setAudioStoryCoverUrl('')}
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/70 text-white hover:bg-red-500 transition cursor-pointer"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* 6. Genres */}
                <div>
                  <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                    Select Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar p-1">
                    {GENRES_LIST.filter((g) => g !== 'All').map((g) => {
                      const isSel = audioStoryGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => {
                            if (isSel)
                              setAudioStoryGenres(
                                audioStoryGenres.filter((item) => item !== g)
                              );
                            else
                              setAudioStoryGenres([...audioStoryGenres, g]);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition cursor-pointer border ${
                            isSel
                              ? 'bg-cyan-500 border-cyan-400 text-black'
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
                    onClick={() => setShowAddAudioStoryModal(false)}
                    className="px-4 py-2 text-xs text-gray-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={
                      audioStoryScanning ||
                      !audioStoryFolderPath ||
                      !audioStoryTitle ||
                      audioStoryScanResult.length === 0
                    }
                    className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 disabled:opacity-40 text-black text-xs font-bold uppercase tracking-wider transition shadow-lg cursor-pointer disabled:cursor-not-allowed"
                  >
                    {audioStoryScanning
                      ? 'Processing...'
                      : 'Track Audio Story Folder'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Online Audio Cover Search Modal */}
      <AnimatePresence>
        {showAudioCoverSearch && (
          <MangaCoverSearch
            initialQuery={audioStoryTitle}
            uploadToImgBB={uploadToImgBB}
            onSelectCover={(url) => {
              setAudioStoryCoverUrl(url);
              setShowAudioCoverSearch(false);
            }}
            onClose={() => setShowAudioCoverSearch(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
