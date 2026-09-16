'use client'

import { useEffect } from 'react'

/** Registers the service worker so the CRM is installable and can get push. */
export function PwaRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])
  return null
}
