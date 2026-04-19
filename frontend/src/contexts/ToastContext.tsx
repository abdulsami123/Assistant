import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ToastTone = 'info' | 'error'

export type ToastInput = {
  title: string
  message?: string
  tone?: ToastTone
}

type ToastRecord = ToastInput & {
  id: string
  tone: ToastTone
}

type ToastContextValue = {
  pushToast: (toast: ToastInput) => void
  dismissToast: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([])

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const pushToast = useCallback(
    (toast: ToastInput) => {
      const id = crypto.randomUUID()
      const record: ToastRecord = {
        id,
        title: toast.title,
        message: toast.message,
        tone: toast.tone ?? 'info',
      }
      setToasts((prev) => [...prev, record])
      window.setTimeout(() => {
        dismissToast(id)
      }, 6000)
    },
    [dismissToast],
  )

  const value = useMemo(() => ({ pushToast, dismissToast }), [dismissToast, pushToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto w-full max-w-sm rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md sm:w-96 ${
              toast.tone === 'error'
                ? 'border-red-400/40 bg-red-950/70 text-red-50'
                : 'border-[var(--color-border)] bg-[var(--color-surface-strong)] text-[var(--color-text)]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{toast.title}</p>
                {toast.message ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">{toast.message}</p> : null}
              </div>
              <button
                type="button"
                className="rounded-md border border-white/10 px-2 py-1 text-xs text-[var(--color-text-muted)] focus-visible:outline-none"
                onClick={() => dismissToast(toast.id)}
              >
                Close
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider')
  }
  return ctx
}
