import { useCallback, useEffect, useMemo, useState } from 'react'
import { DEFAULT_SETTINGS } from '../config/defaultSettings'
import type { TwinMindSettings } from '../types/settings'

const STORAGE_KEY = 'twinmind.settings.v1'

function load(): TwinMindSettings {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { ...DEFAULT_SETTINGS }
    }
    const parsed = JSON.parse(raw) as Partial<TwinMindSettings>
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function useTwinMindSettings() {
  const [settings, setSettings] = useState<TwinMindSettings>(() => load())

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const updateSettings = useCallback((patch: Partial<TwinMindSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS })
  }, [])

  return useMemo(
    () => ({
      settings,
      updateSettings,
      resetSettings,
    }),
    [resetSettings, settings, updateSettings],
  )
}
