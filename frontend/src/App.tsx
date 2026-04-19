import { Navigate, Route, Routes } from 'react-router-dom'
import { RootLayout } from './layouts/RootLayout'
import { ProtectedLayout } from './layouts/ProtectedLayout'
import { SettingsPage } from './pages/SettingsPage'
import { StudioPage } from './pages/StudioPage'

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to="/studio" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="studio" element={<StudioPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/studio" replace />} />
    </Routes>
  )
}
