import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { APP_NAME } from '../config/branding'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition focus-visible:outline-none ${
    isActive
      ? 'bg-white/10 text-[var(--color-text)]'
      : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
  }`

export function RootLayout({ children }: { children?: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-black focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface-strong)]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[var(--color-brand)] to-sky-400 shadow-lg shadow-cyan-500/20" />
            <div>
              <p className="font-display text-lg font-semibold tracking-tight text-[var(--color-text)]">
                {APP_NAME}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">Live meeting copilot</p>
            </div>
          </div>
          <nav className="hidden items-center gap-2 md:flex" aria-label="Primary">
            <NavLink to="/studio" className={linkClass}>
              Studio
            </NavLink>
            <NavLink to="/settings" className={linkClass}>
              Settings
            </NavLink>
          </nav>
          <div className="flex items-center gap-2 md:hidden">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)]"
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileOpen((open) => !open)}
            >
              Menu
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <div id="mobile-nav" className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 md:hidden">
            <div className="mx-auto flex max-w-[1600px] flex-col gap-1 px-4 py-3">
              <Link
                to="/studio"
                className="rounded-lg px-3 py-2 text-sm text-[var(--color-text)]"
                onClick={() => setMobileOpen(false)}
              >
                Studio
              </Link>
              <Link
                to="/settings"
                className="rounded-lg px-3 py-2 text-sm text-[var(--color-text)]"
                onClick={() => setMobileOpen(false)}
              >
                Settings
              </Link>
            </div>
          </div>
        ) : null}
      </header>
      <main id="main-content" className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {children ?? <Outlet />}
      </main>
    </div>
  )
}
