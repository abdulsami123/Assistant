import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useSettings } from '../contexts/SettingsContext'

export function ProtectedLayout() {
  const { settings } = useSettings()
  const location = useLocation()

  if (!settings.groqApiKey.trim()) {
    const next = encodeURIComponent(`${location.pathname}${location.search}`)
    return <Navigate to={`/settings?next=${next}`} replace />
  }

  return <Outlet />
}
