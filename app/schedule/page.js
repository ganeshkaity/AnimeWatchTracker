"use client";

import React, { Suspense } from 'react';
import SchedulePage from '../pages/SchedulePage';
import ModernTrackerLoader from '../components/ModernTrackerLoader';

export default function ScheduleRoutePage() {
  return (
    <Suspense fallback={<ModernTrackerLoader text="Loading Schedule..." />}>
      <SchedulePage />
    </Suspense>
  );
}
