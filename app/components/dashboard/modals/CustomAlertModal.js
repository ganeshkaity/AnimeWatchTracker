import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

export default function CustomAlertModal({ alertMessage, onClose }) {
  return (
    <AnimatePresence>
      {alertMessage && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-sm glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl text-center space-y-4"
          >
            <div className="mx-auto w-12 h-12 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wider">
                Action Blocked
              </h3>
              <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                {alertMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 rounded-xl bg-[#7c5cff] hover:bg-[#6b4eeb] text-white text-xs font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Okay
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
