import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import { Modal } from './Modal'

type Request = {
  title: string
  text?: string
  confirm?: string
  tone?: 'danger' | 'default'
  resolve: (ok: boolean) => void
}

const useConfirm = create<{ request: Request | null }>()(() => ({ request: null }))

/** Asks a yes/no question in the app's own dialog, in place of window.confirm. */
export function confirmDialog(options: Omit<Request, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirm.getState().request?.resolve(false)
    useConfirm.setState({ request: { ...options, resolve } })
  })
}

/** Mounted once at the root; shows whatever confirmDialog asks. */
export function ConfirmHost() {
  const { t } = useTranslation()
  const request = useConfirm((s) => s.request)

  function finish(ok: boolean) {
    request?.resolve(ok)
    useConfirm.setState({ request: null })
  }

  return (
    <Modal
      open={request !== null}
      onClose={() => finish(false)}
      title={request?.title ?? ''}
      footer={
        request && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => finish(false)}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              autoFocus
              className={request.tone === 'danger' ? 'btn border border-danger/40 bg-danger/12 text-danger hover:bg-danger/20' : 'btn btn-primary'}
              onClick={() => finish(true)}
            >
              {request.confirm ?? t('common.confirm')}
            </button>
          </>
        )
      }
    >
      {request?.text && <p className="text-muted">{request.text}</p>}
    </Modal>
  )
}
