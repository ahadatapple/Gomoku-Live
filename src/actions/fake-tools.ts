/** In-memory stand-in for RecordRoom tools used by action tests. */
import type { ActionTools } from 'deepspace/worker'
import { schemas } from '../schemas'

type Row = { recordId: string; data: Record<string, unknown> }

export function fakeTools() {
  const db: Record<string, Row[]> = {}
  let seq = 0
  const tick = () => new Promise((r) => setTimeout(r, 0)) // let racing requests interleave
  /** Mirror RecordRoom's column validation: text must be a string within maxLength, numbers numeric. */
  const invalid = (collection: string, data: Record<string, unknown>) => {
    const schema = schemas.find((s) => s.name === collection)!
    for (const [k, v] of Object.entries(data)) {
      const col = schema.columns.find((c) => c.name === k)
      if (!col) return `Unknown field '${k}'`
      if (col.storage === 'text' && typeof v !== 'string') return `Field '${k}' must be text`
      if (col.storage === 'text' && col.maxLength && (v as string).length > col.maxLength)
        return `Field '${k}' must be text of at most ${col.maxLength} characters`
      if (col.storage === 'number' && typeof v !== 'number') return `Field '${k}' must be a number`
    }
    return null
  }
  const tools = {
    async create(collection: string, data: Record<string, unknown>) {
      await tick()
      const bad = invalid(collection, data)
      if (bad) return { success: false, error: bad }
      const schema = schemas.find((s) => s.name === collection)!
      const rows = (db[collection] ??= [])
      if (schema.uniqueOn && rows.some((r) => schema.uniqueOn!.every((f) => r.data[f] === data[f])))
        return { success: false, error: `Duplicate: a record already exists in ${collection}` }
      const recordId = `${collection}_${++seq}`
      rows.push({ recordId, data: { ...data } })
      return { success: true, data: { recordId } }
    },
    async update(collection: string, recordId: string, patch: Record<string, unknown>) {
      await tick()
      const row = (db[collection] ?? []).find((r) => r.recordId === recordId)
      if (!row) return { success: false, error: 'no record' }
      const bad = invalid(collection, patch)
      if (bad) return { success: false, error: bad }
      Object.assign(row.data, patch)
      return { success: true, data: { recordId } }
    },
    async get(collection: string, recordId: string) {
      await tick()
      const row = (db[collection] ?? []).find((r) => r.recordId === recordId)
      return row ? { success: true, data: { record: { ...row, data: { ...row.data } } } } : { success: false, error: 'not found' }
    },
    async query(collection: string, opts: { where?: Record<string, unknown>; orderBy?: string; limit?: number } = {}) {
      await tick()
      let rows = (db[collection] ?? []).filter((r) =>
        Object.entries(opts.where ?? {}).every(([k, v]) => r.data[k] === v),
      )
      if (opts.orderBy) rows = [...rows].sort((a, b) => (a.data[opts.orderBy!] as number) - (b.data[opts.orderBy!] as number))
      return { success: true, data: { records: rows.slice(0, opts.limit ?? 100), count: rows.length } }
    },
  }
  return { tools: tools as unknown as ActionTools, db }
}

