// Soft-delete rules for DELETE /api/dashboard/website-leads/[id] and
// DELETE /api/dashboard/conversations/[id]. Run: npm test

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isHiddenByDelete, softDelete, type SoftDeleteStore } from './lead-delete'

function memoryStore(rows: Record<string, { businessId: string; deleted: boolean }>) {
  const writes: string[] = []
  const store: SoftDeleteStore = {
    find: async (id) => (rows[id] ? { ...rows[id] } : null),
    markDeleted: async (id) => {
      writes.push(id)
      rows[id].deleted = true
    },
  }
  return { store, writes, rows }
}

for (const surface of ['website lead', 'missed-call conversation']) {
  test(`${surface}: deletes the caller's own row`, async () => {
    const { store, writes, rows } = memoryStore({ a: { businessId: 'biz1', deleted: false } })
    assert.deepEqual(await softDelete(store, 'a', ['biz1']), { status: 200, alreadyDeleted: false })
    assert.deepEqual(writes, ['a'])
    assert.equal(rows.a.deleted, true)
  })

  test(`${surface}: 403 for another business's row, nothing written`, async () => {
    const { store, writes, rows } = memoryStore({ a: { businessId: 'biz2', deleted: false } })
    const out = await softDelete(store, 'a', ['biz1'])
    assert.equal(out.status, 403)
    assert.deepEqual(writes, [])
    assert.equal(rows.a.deleted, false)
  })

  test(`${surface}: 404 for an unknown id`, async () => {
    const { store, writes } = memoryStore({})
    assert.equal((await softDelete(store, 'nope', ['biz1'])).status, 404)
    assert.deepEqual(writes, [])
  })

  test(`${surface}: second delete is 200 and writes nothing`, async () => {
    const { store, writes } = memoryStore({ a: { businessId: 'biz1', deleted: false } })
    await softDelete(store, 'a', ['biz1'])
    assert.deepEqual(await softDelete(store, 'a', ['biz1']), { status: 200, alreadyDeleted: true })
    assert.deepEqual(writes, ['a'])
  })
}

test('owner group: a sibling business row in the group can be deleted', async () => {
  const { store } = memoryStore({ a: { businessId: 'sibling', deleted: false } })
  assert.equal((await softDelete(store, 'a', ['biz1', 'sibling'])).status, 200)
})

test('deleted conversation stays hidden until a newer message lands', () => {
  const deletedAt = new Date('2026-10-30T12:00:00Z')
  assert.equal(isHiddenByDelete({ deletedAt: null, lastMessageAt: new Date('2026-10-01T00:00:00Z') }), false)
  assert.equal(isHiddenByDelete({ deletedAt, lastMessageAt: new Date('2026-10-30T11:00:00Z') }), true)
  assert.equal(isHiddenByDelete({ deletedAt, lastMessageAt: deletedAt }), true)
  // The caller texts again: the webhook bumps lastMessageAt past deletedAt.
  assert.equal(isHiddenByDelete({ deletedAt, lastMessageAt: new Date('2026-10-31T09:00:00Z') }), false)
})
