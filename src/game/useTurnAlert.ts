import { useEffect, useRef, useState } from 'react'

/**
 * "Your move" alert with no integration and no cost: the tab title flips to
 * "● Your move" while it's your turn, and if the page is in the background
 * and the player allowed it, the browser shows a notification. Covers the
 * common case (game open in another tab); email covers the closed-tab case.
 */
export function useTurnAlert(myTurn: boolean, ply: number) {
  const supported = typeof window !== 'undefined' && 'Notification' in window
  const [permission, setPermission] = useState<NotificationPermission>(supported ? Notification.permission : 'denied')
  const base = useRef<string>(typeof document !== 'undefined' ? document.title : '')

  useEffect(() => {
    if (typeof document === 'undefined') return
    const original = base.current
    document.title = myTurn ? `● Your move · ${original}` : original
    if (myTurn && supported && permission === 'granted' && document.visibilityState === 'hidden') {
      try {
        new Notification('Your move', { body: 'Your opponent just played.', tag: 'gomoku-turn' })
      } catch {
        /* some mobile browsers only allow notifications from a service worker */
      }
    }
    return () => {
      document.title = original
    }
  }, [myTurn, ply, supported, permission])

  return {
    supported,
    permission,
    request: async () => setPermission(await Notification.requestPermission()),
  }
}
