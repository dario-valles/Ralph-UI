import { usePWAUpdate } from '@/hooks/usePWAUpdate'
import { RefreshCw, X } from 'lucide-react'

export function PWAUpdatePrompt() {
  const { showUpdatePrompt, acceptUpdate, dismissUpdate } = usePWAUpdate()

  if (!showUpdatePrompt) return null

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 rounded-lg border border-zinc-700
                 bg-zinc-900 p-4 shadow-xl md:left-auto md:right-4 md:w-80"
    >
      <div className="flex items-start gap-3">
        <RefreshCw className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-400" />
        <div className="flex-1">
          <h4 className="font-medium text-white">Update Available</h4>
          <p className="mt-1 text-sm text-zinc-400">
            A new version is ready. Update now for the latest features.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={acceptUpdate}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white
                         transition-colors hover:bg-blue-700"
            >
              Update Now
            </button>
            <button
              onClick={dismissUpdate}
              className="rounded-md bg-zinc-700 px-3 py-1.5 text-sm text-zinc-300
                         transition-colors hover:bg-zinc-600"
            >
              Later
            </button>
          </div>
        </div>
        <button onClick={dismissUpdate} className="text-zinc-500 hover:text-zinc-300">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
