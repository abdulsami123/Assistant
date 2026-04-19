import { createContext, useContext, type ReactNode } from 'react'
import { useTwinMindSettings } from '../hooks/useTwinMindSettings'
import type { TwinMindSettings } from '../types/settings'

type SettingsContextValue = {
  settings: TwinMindSettings
  updateSettings: (patch: Partial<TwinMindSettings>) => void
  resetSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const value = useTwinMindSettings()
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) {
    throw new Error('useSettings must be used within SettingsProvider')
  }
  return ctx
}
