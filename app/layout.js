import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from './context/AuthContext';
import { OfflineProvider } from './context/OfflineContext';
import CookieConsent from './components/CookieConsent';
import PwaRegistration from './components/PwaRegistration';
import NotificationBanner from './components/NotificationBanner';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: "GaneshSpace - Track and Watch Anime, Movies, Manhwa, Webtoons, Audio Stories",
  description: "Track your personal Anime, Movies, Manhwa, Webtoons, Audio Stories, episodes progress, notes, and flags with direct VLC integration and offline support.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GaneshSpace",
  },
  icons: {
    icon: "/icons/icon-192x192.png",
    shortcut: "/icons/icon-96x96.png",
    apple: "/icons/icon-192x192.png",
  },
};

export const viewport = {
  themeColor: "#07090f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#07090f" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
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
            <PwaRegistration />
            <NotificationBanner />
          </OfflineProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
