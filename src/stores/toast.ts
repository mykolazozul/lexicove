import { create } from 'zustand'

export type Toast = { id: number; text: string; tone: 'ok' | 'error' | 'reward'; icon?: string }

type ToastState = {
  toasts: Toast[]
  push: (text: string, tone?: Toast['tone'], icon?: string) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (text, tone = 'ok', icon) => {
    const id = nextId++
    // Three at most; the oldest goes first.
    set({ toasts: [...get().toasts.slice(-2), { id, text, tone, icon }] })
    setTimeout(() => get().dismiss(id), tone === 'error' ? 6000 : 4500)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}))

/** Shows a short message at the bottom of the screen from anywhere in the app. */
export function toast(text: string, tone: Toast['tone'] = 'ok', icon?: string) {
  useToasts.getState().push(text, tone, icon)
}
