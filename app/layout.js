import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import CookieConsent from './components/CookieConsent';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'GaneshSpace - Track and Watch Ganesh\'s Anime, Movies, Manhwa, Webtoons, Audio Stories',
  description: 'Track your local personal Anime, Movies, Manhwa, Webtoons, Audio Stories folders, episodes progress, notes, and flags with direct VLC integration.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
      </head>
      <body className={`bg-bgDark text-white min-h-screen ${inter.className}`} suppressHydrationWarning>
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
            <CookieConsent />
          </OfflineProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
