import { AnimatePresence, motion } from 'motion/react'
import { cx } from '../lib/cx'
import { useToasts } from '../stores/toast'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md flex-col gap-2 lg:bottom-8" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.button
            key={toast.id}
            type="button"
            layout
            onClick={() => dismiss(toast.id)}
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 480, damping: 36 }}
            className={cx(
              'glass pointer-events-auto flex items-center gap-3 rounded-card bg-elevated px-4 py-3 text-left text-sm font-medium',
              toast.tone === 'error' && 'text-danger',
              toast.tone === 'reward' && 'ring-gradient',
            )}
          >
            {toast.icon && <span className="text-xl leading-none">{toast.icon}</span>}
            <span className="min-w-0 flex-1">{toast.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
