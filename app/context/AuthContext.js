"use client";

import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase';
import {
  getUserId,
  setUserId,
  getLocalSettings,
  setLocalSettings,
} from '../utils/localStore';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isConfigured] = useState(() => {
    // Check only client-side
    if (typeof window === 'undefined') return false;
    return isFirebaseConfigured();
  });

  useEffect(() => {
    // Get or create local userId
    const uid = getUserId();

    // Load settings from localStorage first (instant, works offline)
    const localSettings = getLocalSettings();

    setCurrentUser({
      uid,
      displayName: 'Local User',
      vlcPath: localSettings.vlcPath || '',
      defaultPlayer: localSettings.defaultPlayer || 'ask',
    });

    // Attempt to fetch/merge settings from Firestore if online
    if (db && uid) {
      const userRef = doc(db, 'users', uid);
      getDoc(userRef)
        .then(snap => {
          if (snap.exists()) {
            const data = snap.data();
            const merged = {
              vlcPath: data.vlcPath || localSettings.vlcPath || '',
              defaultPlayer: data.defaultPlayer || localSettings.defaultPlayer || 'ask',
            };
            setLocalSettings(merged);
            setCurrentUser(prev => ({ ...prev, ...merged }));
          } else {
            // Create document stub for this user
            setDoc(userRef, {
              vlcPath: localSettings.vlcPath || '',
              defaultPlayer: localSettings.defaultPlayer || 'ask',
              createdAt: new Date().toISOString(),
            }, { merge: true }).catch(console.error);
          }
        })
        .catch(() => {
          // Offline — use local settings only
        });
    }

    setLoading(false);
  }, []);

  async function updateVlcPath(vlcPath) {
    // Always save locally
    const settings = getLocalSettings();
    setLocalSettings({ ...settings, vlcPath });
    setCurrentUser(prev => ({ ...prev, vlcPath }));

    // Try Firestore if available
    if (db && currentUser?.uid) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), { vlcPath }, { merge: true });
      } catch { /* offline — will sync later */ }
    }
  }

  async function updateDefaultPlayer(defaultPlayer) {
    const settings = getLocalSettings();
    setLocalSettings({ ...settings, defaultPlayer });
    setCurrentUser(prev => ({ ...prev, defaultPlayer }));

    if (db && currentUser?.uid) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid), { defaultPlayer }, { merge: true });
      } catch { /* offline */ }
    }
  }

  function updateUserIdManually(newUid) {
    setUserId(newUid);
    window.location.reload();
  }

  const value = {
    currentUser,
    loading,
    isConfigured,
    updateVlcPath,
    updateDefaultPlayer,
    updateUserIdManually,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
