import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'WatchAnime - Local Anime Tracking Platform',
  description: 'Track your local personal anime folders, episodes progress, notes, and flags with direct VLC integration.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={`bg-bgDark text-white min-h-screen ${inter.className}`}>
        {/* Animated neon gradient background — fixed behind all pages */}
        <div className="neon-bg" aria-hidden="true">
          <div className="neon-bg-orb neon-bg-orb-1" />
          <div className="neon-bg-orb neon-bg-orb-2" />
          <div className="neon-bg-orb neon-bg-orb-3" />
          <div className="neon-bg-orb neon-bg-orb-4" />
        </div>
        <AuthProvider>
          <OfflineProvider>
            {children}
          </OfflineProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
