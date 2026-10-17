import api from './api.js'
import { listQueuedSales, removeQueuedSale, updateQueuedSale } from './offlineStore.js'

export async function syncQueuedSales(userId) {
  const sales = await listQueuedSales(userId)
  let synced = 0

  for (const sale of sales) {
    if (sale.status !== 'queued') continue

    try {
      await api.post('/transactions/purchase', {
        student_id: sale.student_id,
        uuid: sale.uuid,
        amount: sale.amount ?? sale.total,
      })
      await removeQueuedSale(sale.uuid)
      synced += 1
    } catch (error) {
      const status = error.response?.status

      if (status === 409 || status === 422) {
        await updateQueuedSale(sale.uuid, {
          status: 'needs_review',
          error: error.response.data?.message || 'This sale needs review before it can be synchronized.',
          error_code: error.response.data?.code || null,
        })
        continue
      }

      break
    }
  }

  return { synced, sales: await listQueuedSales(userId) }
}
