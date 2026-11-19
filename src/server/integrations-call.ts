/**
 * Server-side, developer-billed call to a DeepSpace integration endpoint.
 * Same headers the /api/integrations proxy sends, so the api-worker bills the
 * app owner and identifies this app. No vendor key ever exists in this repo.
 */
import { apiWorkerFetch, integrationPath } from 'deepspace/worker'
import type { Env } from '../../worker'

export type IntegrationResult = { ok: true; data: unknown } | { ok: false; status: number; error: string }

export async function callIntegrationAsOwner(
  env: Env,
  endpoint: `${string}/${string}`,
  body: Record<string, unknown>,
): Promise<IntegrationResult> {
  const [name, ep] = endpoint.split('/')
  const path = integrationPath(name, ep)
  if (!path) return { ok: false, status: 400, error: `Bad endpoint ${endpoint}` }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${env.APP_OWNER_JWT}`,
  }
  if (env.APP_IDENTITY_TOKEN) {
    headers['x-app-identity-token'] = env.APP_IDENTITY_TOKEN
    headers['x-app-id'] = env.DEEPSPACE_APP_ID
  }
  try {
    const res = await apiWorkerFetch(env, path, { method: 'POST', headers, body: JSON.stringify(body) })
    const json = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: unknown; error?: unknown }
      | null
    if (!res.ok || !json || json.success === false) {
      const err = json?.error
      const msg = typeof err === 'string' ? err : err ? JSON.stringify(err) : `HTTP ${res.status}`
      return { ok: false, status: res.status, error: msg }
    }
    return { ok: true, data: json.data ?? json }
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : 'Integration call failed' }
  }
}

/** Pull the assistant text out of either an Anthropic- or OpenAI-shaped reply. */
export function extractText(data: unknown): string | null {
  const d = data as Record<string, unknown> | null
  if (!d) return null
  if (typeof d.text === 'string') return d.text
  if (typeof d.content === 'string') return d.content
  if (Array.isArray(d.content)) {
    const t = d.content
      .map((c) => (c && typeof c === 'object' && 'text' in c ? String((c as { text: unknown }).text) : ''))
      .join('')
    if (t) return t
  }
  const choice = Array.isArray(d.choices) ? (d.choices[0] as { message?: { content?: unknown } }) : null
  if (choice && typeof choice.message?.content === 'string') return choice.message.content
  return null
}
