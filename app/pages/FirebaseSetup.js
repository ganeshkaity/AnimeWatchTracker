"use client";

import React, { useState } from 'react';
import { saveFirebaseConfig } from '../firebase';
import { Database, ShieldAlert, Check } from 'lucide-react';

export default function FirebaseSetup() {
  const [apiKey, setApiKey] = useState('');
  const [authDomain, setAuthDomain] = useState('');
  const [projectId, setProjectId] = useState('');
  const [storageBucket, setStorageBucket] = useState('');
  const [messagingSenderId, setMessagingSenderId] = useState('');
  const [appId, setAppId] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!apiKey || !authDomain || !projectId || !appId) {
      setError('Please fill in at least API Key, Auth Domain, Project ID, and App ID.');
      return;
    }

    const config = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim(),
      projectId: projectId.trim(),
      storageBucket: storageBucket.trim(),
      messagingSenderId: messagingSenderId.trim(),
      appId: appId.trim(),
    };

    try {
      saveFirebaseConfig(config);
    } catch (err) {
      setError('Failed to save configuration. Please try again.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#03030d] relative overflow-hidden">
      {/* Background neon glows */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-neonPurple/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-neonCyan/10 blur-[150px] pointer-events-none" />

      <div className="w-full max-w-lg glass-panel p-8 rounded-2xl border border-borderGlass shadow-neon-border z-10">
        <div className="text-center mb-8">
          <div className="inline-flex p-3 rounded-full bg-neonPurple/10 text-neonPurple mb-4 animate-glow-pulse">
            <Database size={32} />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-wider">
            WATCH<span className="text-neonCyan">ANIME</span>
          </h1>
          <p className="text-sm text-gray-400 mt-2">Connect your Firebase database to begin tracking</p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 flex items-start gap-3 text-sm">
            <ShieldAlert className="flex-shrink-0 mt-0.5" size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">API Key *</label>
            <input
              type="text"
              placeholder="AIzaSy..."
              className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">Project ID *</label>
              <input
                type="text"
                placeholder="watchanime-123"
                className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">Auth Domain *</label>
              <input
                type="text"
                placeholder="watchanime-123.firebaseapp.com"
                className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
                value={authDomain}
                onChange={(e) => setAuthDomain(e.target.value)}
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">App ID *</label>
            <input
              type="text"
              placeholder="1:123456789:web:abcdef..."
              className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">Storage Bucket (Optional)</label>
              <input
                type="text"
                placeholder="watchanime-123.appspot.com"
                className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
                value={storageBucket}
                onChange={(e) => setStorageBucket(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wider text-gray-400 mb-1 font-semibold">Messaging Sender ID (Optional)</label>
              <input
                type="text"
                placeholder="12345678901"
                className="w-full px-4 py-2.5 rounded-lg glass-input text-sm text-white"
                value={messagingSenderId}
                onChange={(e) => setMessagingSenderId(e.target.value)}
              />
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              className="w-full py-3 rounded-lg btn-neon-cyan font-bold tracking-wider uppercase text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Check size={18} />
              Connect Database
            </button>
          </div>
        </form>

        <div className="mt-8 p-4 rounded-lg bg-white/5 border border-white/5 text-xs text-gray-400 space-y-2">
          <h3 className="font-semibold text-white">How do I get these?</h3>
          <p>
            1. Open the <a href="https://console.firebase.google.com/" target="_blank" rel="noopener noreferrer" className="text-neonCyan hover:underline">Firebase Console</a>.
          </p>
          <p>
            2. Create a project, navigate to <strong>Project Settings</strong>, and click <strong>Add App</strong> (choose Web <code>&lt;/&gt;</code>).
          </p>
          <p>
            3. Copy the configuration values object values and paste them above. Make sure to enable <strong>Email/Password</strong> authentication and initialize <strong>Cloud Firestore</strong> database.
          </p>
        </div>
      </div>
    </div>
  );
}
