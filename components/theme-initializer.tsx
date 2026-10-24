'use client';
import { useEffect } from 'react';

// Also runs while Home is gated by authentication. Never touches credentials.
export function ThemeInitializer() {
  useEffect(() => {
    const apply = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem('noc-megalink-theme'); } catch { /* Storage can be unavailable. */ }
      document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
    };
    apply();
    window.addEventListener('storage', apply);
    return () => window.removeEventListener('storage', apply);
  }, []);
  return null;
}
