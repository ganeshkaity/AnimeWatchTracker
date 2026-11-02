"use client";

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Bell, Sparkles } from 'lucide-react';
import NotificationSettings from '../components/NotificationSettings';

export default function NotificationsPage() {
  return (
    <div className="min-h-screen text-white p-4 sm:p-8 flex flex-col items-center justify-start">
      <div className="w-full max-w-2xl space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <Link
            href="/"
            className="flex items-center gap-2 text-xs font-bold text-gray-400 hover:text-white transition px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10"
          >
            <ArrowLeft size={14} />
            <span>Back to Dashboard</span>
          </Link>

          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-purple-500/20 text-[#a855f7]">
              <Bell size={18} />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white flex items-center gap-1.5">
                Notifications Hub <Sparkles size={14} className="text-amber-400" />
              </h1>
              <p className="text-[11px] text-gray-400">
                Configure local &amp; remote push notification delivery
              </p>
            </div>
          </div>
        </div>

        {/* Main Settings Card */}
        <div className="glass-panel p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-xl">
          <NotificationSettings />
        </div>
      </div>
    </div>
  );
}

