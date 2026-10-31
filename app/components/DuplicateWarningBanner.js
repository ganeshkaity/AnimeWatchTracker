import React from 'react';
import { AlertTriangle, ExternalLink, Check } from 'lucide-react';

export default function DuplicateWarningBanner({ match, onDismiss }) {
  if (!match) return null;

  return (
    <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 space-y-1.5 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-top-1 duration-200">
      <div className="flex items-start gap-2.5">
        <div className="p-1 rounded-lg bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
          <AlertTriangle size={15} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-amber-400">
              Already in Your Library
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              {match.type}
            </span>
          </div>
          <p className="text-xs text-gray-200 font-medium truncate mt-0.5">
            &ldquo;{match.title}&rdquo; {match.year && `(${match.year})`}
          </p>
          <p className="text-[11px] text-amber-300/80 mt-0.5">
            Current status: <span className="font-semibold text-white">{match.status || 'Tracked'}</span>. Adding this again may create a duplicate entry.
          </p>
        </div>
      </div>
    </div>
  );
}

