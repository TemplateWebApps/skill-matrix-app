import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import './feedback.css'

const FeedbackContext = createContext(undefined)

/**
 * In-app confirmation dialogs and toasts.
 *
 * Replaces window.confirm/alert, which the browser draws as its own chrome
 * outside the app — it looks nothing like the product, can't be styled, and
 * some environments suppress it entirely.
 *
 * confirm() returns a promise resolving true/false, so call sites read almost
 * the same as before:  if (!(await confirm({...}))) return
 */
export function FeedbackProvider({ children }) {
  const [dialog, setDialog] = useState(null)
  const [toasts, setToasts] = useState([])
  const resolverRef = useRef(null)
  const confirmButtonRef = useRef(null)

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      resolverRef.current = resolve
      setDialog({
        title: options.title ?? 'Are you sure?',
        message: options.message ?? '',
        confirmLabel: options.confirmLabel ?? 'Confirm',
        cancelLabel: options.cancelLabel ?? 'Cancel',
        destructive: options.destructive ?? false,
      })
    })
  }, [])

  const settle = useCallback((answer) => {
    setDialog(null)
    const resolve = resolverRef.current
    resolverRef.current = null
    if (resolve) resolve(answer)
  }, [])

  const toast = useCallback((message, tone = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }, [])

  // Escape cancels, Enter confirms — same reflexes the native dialog had.
  useEffect(() => {
    if (!dialog) return
    confirmButtonRef.current?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') settle(false)
      if (e.key === 'Enter') settle(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dialog, settle])

  return (
    <FeedbackContext.Provider value={{ confirm, toast }}>
      {children}

      {dialog && (
        <div className="modal-backdrop" onClick={() => settle(false)}>
          <div
            className="modal-card confirm-card"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-title">{dialog.title}</h2>
            {dialog.message && <p className="confirm-message">{dialog.message}</p>}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => settle(false)}>
                {dialog.cancelLabel}
              </button>
              <button
                ref={confirmButtonRef}
                type="button"
                className={dialog.destructive ? 'danger' : ''}
                onClick={() => settle(true)}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  )
}

export function useFeedback() {
  const ctx = useContext(FeedbackContext)
  if (!ctx) throw new Error('useFeedback must be used within FeedbackProvider')
  return ctx
}
