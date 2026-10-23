'use client';

import { useEffect } from 'react';
import { Serwist } from '@serwist/window';

export function PwaRegistration() {
  useEffect(() => {
    if (
      process.env.NODE_ENV !== 'production' ||
      !('serviceWorker' in navigator)
    )
      return;
    const worker = new Serwist('/sw.js', { scope: '/' });
    void worker.register().catch(() => undefined);
  }, []);
  return null;
}
