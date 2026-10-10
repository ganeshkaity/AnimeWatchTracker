import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Download } from 'lucide-react';

export default function SettingsModal({
  showSettings,
  setShowSettings,
  handleSaveSettings,
  customVlc,
  setCustomVlc,
  defaultPlayer,
  setDefaultPlayer,
  exportFormat,
  setExportFormat,
  handleExportData,
  exporting,
  isOffline,
}) {
  return (
    <AnimatePresence>
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-md glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl modal-scroll space-y-4"
          >
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h2 className="text-lg font-extrabold flex items-center gap-2 text-white">
                <Settings className="text-[#a855f7]" size={20} />
                Settings & Data Backup
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-gray-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Custom VLC Path
                </label>
                <input
                  type="text"
                  placeholder="e.g. C:\Program Files\VideoLAN\VLC\vlc.exe"
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white"
                  value={customVlc}
                  onChange={(e) => setCustomVlc(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-bold">
                  Default Media Player
                </label>
                <select
                  value={defaultPlayer}
                  onChange={(e) => setDefaultPlayer(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl glass-input text-xs text-white bg-[#111827]"
                >
                  <option value="ask">Ask every time</option>
                  <option value="mediaserver">
                    Media Server Player (Windows Host)
                  </option>
                  <option value="vlc">VLC Player (Local Desktop)</option>
                </select>
              </div>

              {/* Export Data Box */}
              <div className="p-4 rounded-2xl bg-[#111827]/80 border border-white/10 space-y-3">
                <h3 className="text-xs font-bold text-[#7c5cff] flex items-center gap-2">
                  <Download size={14} className="text-cyan-400" />
                  Export Viewing History
                </h3>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-400 text-[11px]">Format</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setExportFormat('csv')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                        exportFormat === 'csv'
                          ? 'bg-[#7c5cff] text-white'
                          : 'text-gray-400'
                      }`}
                    >
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => setExportFormat('json')}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold ${
                        exportFormat === 'json'
                          ? 'bg-[#7c5cff] text-white'
                          : 'text-gray-400'
                      }`}
                    >
                      JSON
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleExportData}
                  disabled={exporting || isOffline}
                  className="w-full py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50"
                >
                  {exporting
                    ? 'Exporting...'
                    : `Download Backup (.${exportFormat})`}
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-xs text-gray-400 hover:text-white"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={isOffline}
                  className="px-5 py-2.5 rounded-xl btn-accent text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                >
                  Save Settings
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
