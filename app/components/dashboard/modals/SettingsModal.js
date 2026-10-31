import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, X, Download, Lock, KeyRound, Trophy, Check, AlertCircle, Shield } from 'lucide-react';
import { getVaultPin, setVaultPin } from '../../../utils/localStore';

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
  onOpenVault,
  onOpenAchievements,
}) {
  const [currentSavedPin, setCurrentSavedPin] = useState(() => (typeof window !== 'undefined' ? getVaultPin() : null));
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [showPinChange, setShowPinChange] = useState(false);
  const [oldPinInput, setOldPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [pinSuccessMsg, setPinSuccessMsg] = useState('');

  useEffect(() => {
    if (showSettings && typeof window !== 'undefined') {
      setCurrentSavedPin(getVaultPin());
      setPinInput('');
      setPinError('');
      setShowPinChange(false);
      setPinSuccessMsg('');
    }
  }, [showSettings]);

  // Handle Unlocking Secret Vault
  const handleUnlockVault = (e) => {
    if (e) e.preventDefault();
    setPinError('');

    if (!currentSavedPin) {
      // First-time setup: set this as the PIN and unlock
      if (!pinInput || pinInput.trim().length < 4) {
        setPinError('Passcode must be at least 4 digits');
        return;
      }
      setVaultPin(pinInput.trim());
      setCurrentSavedPin(pinInput.trim());
      setShowSettings(false);
      if (onOpenVault) onOpenVault();
      return;
    }

    if (pinInput.trim() === currentSavedPin) {
      setShowSettings(false);
      if (onOpenVault) onOpenVault();
    } else {
      setPinError('Incorrect passcode. Please try again.');
    }
  };

  // Handle Changing PIN
  const handleChangePin = (e) => {
    if (e) e.preventDefault();
    setPinError('');

    if (currentSavedPin && oldPinInput.trim() !== currentSavedPin) {
      setPinError('Current passcode is incorrect');
      return;
    }

    if (!newPinInput || newPinInput.trim().length < 4) {
      setPinError('New passcode must be at least 4 digits');
      return;
    }

    setVaultPin(newPinInput.trim());
    setCurrentSavedPin(newPinInput.trim());
    setOldPinInput('');
    setNewPinInput('');
    setShowPinChange(false);
    setPinSuccessMsg('Passcode updated successfully!');
    setTimeout(() => setPinSuccessMsg(''), 3000);
  };
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

              {/* Secret Vault / Hidden Shelf Box (Feature 15) */}
              <div className="p-4 rounded-2xl bg-[#111827]/80 border border-purple-500/30 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-purple-300 flex items-center gap-2">
                    <Lock size={14} className="text-purple-400" />
                    Secret Vault (Hidden Shelf)
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/25">
                    {currentSavedPin ? 'PIN Active' : 'No PIN'}
                  </span>
                </div>

                <p className="text-[11px] text-gray-400 leading-relaxed">
                  Open your private hidden shelf without leaving the home page. Enter your passcode below:
                </p>

                {pinSuccessMsg && (
                  <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-1.5">
                    <Check size={13} /> {pinSuccessMsg}
                  </div>
                )}

                {!showPinChange ? (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="password"
                        placeholder={currentSavedPin ? 'Enter Passcode to unlock' : 'Create 4-digit Passcode'}
                        value={pinInput}
                        onChange={(e) => {
                          setPinInput(e.target.value);
                          setPinError('');
                        }}
                        className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/15 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 font-mono tracking-widest"
                      />
                      <button
                        type="button"
                        onClick={handleUnlockVault}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer active:scale-95 shrink-0 shadow-md"
                      >
                        {currentSavedPin ? 'Unlock Vault' : 'Set & Open'}
                      </button>
                    </div>

                    {pinError && (
                      <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                        <AlertCircle size={12} /> {pinError}
                      </p>
                    )}

                    {currentSavedPin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPinChange(true);
                          setPinError('');
                        }}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 font-semibold cursor-pointer transition pt-0.5"
                      >
                        <KeyRound size={11} />
                        <span>Change Vault Passcode</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 p-2.5 rounded-xl bg-black/40 border border-white/10">
                    <span className="text-[10px] font-bold text-purple-300 uppercase tracking-wider block">
                      Update Vault Passcode
                    </span>
                    <input
                      type="password"
                      placeholder="Current Passcode"
                      value={oldPinInput}
                      onChange={(e) => setOldPinInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-mono tracking-widest focus:outline-none focus:border-purple-400"
                    />
                    <input
                      type="password"
                      placeholder="New Passcode (min 4 digits)"
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-black/60 border border-white/15 text-xs text-white font-mono tracking-widest focus:outline-none focus:border-purple-400"
                    />
                    {pinError && (
                      <p className="text-[11px] text-rose-400 flex items-center gap-1 font-medium">
                        <AlertCircle size={12} /> {pinError}
                      </p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowPinChange(false)}
                        className="px-3 py-1 rounded-lg bg-white/5 text-gray-400 text-xs font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleChangePin}
                        className="px-3 py-1 rounded-lg bg-purple-600 text-white text-xs font-bold"
                      >
                        Save New PIN
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Achievements & Badges Quick Access (Feature 10) */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                    <Trophy size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Achievements &amp; Badges</h4>
                    <p className="text-[10px] text-gray-400">Track milestones, watch hours &amp; collector ranks</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setShowSettings(false);
                    if (onOpenAchievements) onOpenAchievements();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 font-bold text-xs transition cursor-pointer active:scale-95"
                >
                  View Badges
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
