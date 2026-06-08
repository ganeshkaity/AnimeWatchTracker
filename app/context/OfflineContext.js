"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { db } from '../firebase';
import { fullSync } from '../utils/syncEngine';

const OfflineContext = createContext({
  isOffline: false,
  isManualOffline: false,
  isSyncing: false,
  lastSyncedAt: null,
  setManualOffline: () => {},
  syncNow: async () => {},
});

export function useOffline() {
  return useContext(OfflineContext);
}

export function OfflineProvider({ children }) {
  const [networkOnline, setNetworkOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [isManualOffline, setIsManualOffline] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('watchanime_manual_offline') === 'true';
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const syncTimeoutRef = useRef(null);

  // Computed: effectively offline if either network is down or manual mode is on
  const isOffline = !networkOnline || isManualOffline;

  // Network event listeners
  useEffect(() => {
    const handleOnline = () => setNetworkOnline(true);
    const handleOffline = () => setNetworkOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Persist manual offline preference
  const handleSetManualOffline = useCallback((val) => {
    setIsManualOffline(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('watchanime_manual_offline', val ? 'true' : 'false');
    }
  }, []);

  // Sync function
  const syncNow = useCallback(async () => {
    if (!networkOnline || isManualOffline) return;
    if (!db) return;
    if (isSyncing) return;

    setIsSyncing(true);
    try {
      await fullSync(db);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Sync error:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [networkOnline, isManualOffline, isSyncing]);

  // Auto-sync when coming back online (debounced 1.5s)
  useEffect(() => {
    if (networkOnline && !isManualOffline) {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        syncNow();
      }, 1500);
    }
    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [networkOnline, isManualOffline]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    isOffline,
    isManualOffline,
    isSyncing,
    lastSyncedAt,
    setManualOffline: handleSetManualOffline,
    syncNow,
  };

  return (
    <OfflineContext.Provider value={value}>
      {children}
    </OfflineContext.Provider>
  );
}
