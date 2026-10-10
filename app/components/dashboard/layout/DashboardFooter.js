import React from 'react';

export default function DashboardFooter({
  setShowSettings,
  setShowAddModal,
}) {
  return (
    <footer className="mt-20 border-t border-white/10 bg-black/40 backdrop-blur-md text-gray-400 py-12 px-6 md:px-12">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
        {/* Brand */}
        <div className="space-y-3 md:col-span-1">
          <div className="flex items-center gap-2">
            <img
              src="/logo.png"
              alt="AnimeWatch Logo"
              className="h-8 w-auto drop-shadow-[0_0_8px_rgba(124,92,255,0.4)]"
            />
            <span className="text-lg font-black text-white tracking-wider">
              GANESH<span className="text-[#7c5cff]">SPACE</span>
            </span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">
            The premier local Anime, Movies, Manga, Manhwa, Webtoons, Audio Stories tracking and streaming engine. Organize your PC video library with zero compromise.
          </p>
        </div>

        {/* Quick Links */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Quick Navigation</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="#hero" className="hover:text-white transition">Home Spotlight</a></li>
            <li><a href="#continue-watching" className="hover:text-white transition">Continue Watching</a></li>
            <li><a href="#anime" className="hover:text-white transition">Local Catalog</a></li>
            <li><a href="#top-rated" className="hover:text-white transition flex items-center gap-1.5"><span className="text-amber-400">★</span> Top 20 Rated</a></li>
          </ul>
        </div>

        {/* Categories */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Popular Genres</h4>
          <ul className="space-y-2 text-xs">
            <li><a href="#genres" className="hover:text-white transition">Action & Fantasy</a></li>
            <li><a href="#genres" className="hover:text-white transition">Supernatural & Sci-Fi</a></li>
            <li><a href="#genres" className="hover:text-white transition">Romance & Slice of Life</a></li>
            <li><a href="#genres" className="hover:text-white transition">Shounen & Drama</a></li>
          </ul>
        </div>

        {/* Tools & Sync */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-white mb-3">Tools & Sync</h4>
          <ul className="space-y-2 text-xs">
            <li><button type="button" onClick={() => setShowSettings(true)} className="hover:text-white transition cursor-pointer">VLC Player Path</button></li>
            <li><button type="button" onClick={() => setShowSettings(true)} className="hover:text-white transition cursor-pointer">Export Data (CSV / JSON)</button></li>
            <li><button type="button" onClick={() => setShowAddModal(true)} className="hover:text-white transition cursor-pointer">Scan Local Folder</button></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto pt-6 border-t border-white/5 flex flex-col sm:flex-row justify-between items-center text-xs text-gray-500 gap-4">
        <p>© {new Date().getFullYear()} AnimeWatch Tracker. Designed for high performance local streaming.</p>
        <div className="flex gap-4">
          <span className="hover:text-gray-400">Privacy</span>
          <span className="hover:text-gray-400">Terms</span>
          <span className="hover:text-gray-400">Local Storage</span>
        </div>
      </div>
    </footer>
  );
}
