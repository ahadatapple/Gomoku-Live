/** POST /api/actions/:name with the caller's JWT. Returns the ActionResult shape. */
import { getAuthToken } from 'deepspace'

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string }

export async function callAction<T = unknown>(name: string, body: unknown, timeoutMs = 30_000): Promise<ActionResult<T>> {
  let token: string | null = null
  try {
    token = await getAuthToken()
  } catch {
    token = null
  }
  if (!token) return { success: false, error: 'Sign in to play.', code: 'signed_out' }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`/api/actions/${name}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) return { success: false, error: `Server error (${res.status}). Try again.` }
    return (await res.json()) as ActionResult<T>
  } catch {
    return {
      success: false,
      error: controller.signal.aborted ? 'The server took too long. Try again.' : 'Network error. Try again.',
    }
  } finally {
    clearTimeout(timer)
  }
}
