"use client";

import React from 'react';
import { useRouter } from 'next/navigation';
import Stream from '../pages/Stream';

export default function StreamPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen text-white">
      <Stream onBack={() => router.push('/')} />
    </div>
  );
}
