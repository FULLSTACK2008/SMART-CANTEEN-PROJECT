import { openDB } from 'idb'

const databasePromise = openDB('apacope-canteen-offline', 1, {
  upgrade(database) {
    if (!database.objectStoreNames.contains('cache')) {
      database.createObjectStore('cache', { keyPath: 'key' })
    }
    if (!database.objectStoreNames.contains('sales')) {
      const sales = database.createObjectStore('sales', { keyPath: 'uuid' })
      sales.createIndex('userId', 'userId')
    }
  },
})

export async function readCache(key) {
  const database = await databasePromise
  const record = await database.get('cache', key)
  return record?.value ?? null
}

export async function writeCache(key, value) {
  const database = await databasePromise
  await database.put('cache', { key, value, updatedAt: new Date().toISOString() })
}

export async function cacheStudentResults(userId, students) {
  const database = await databasePromise
  const key = `students:${userId}`
  const existing = await database.get('cache', key)
  const byId = new Map((existing?.value || []).map((student) => [student.id, student]))

  for (const student of students) {
    byId.set(student.id, {
      id: student.id,
      student_number: student.student_number,
      full_name: student.full_name,
      photo_url: student.photo_url,
      class: student.class,
      balance: student.balance,
      daily_limit: student.daily_limit,
      is_active: student.is_active,
    })
  }

  await database.put('cache', { key, value: [...byId.values()], updatedAt: new Date().toISOString() })
}

export async function cacheStudentDirectory(userId, students) {
  const database = await databasePromise
  await database.put('cache', {
    key: `students:${userId}`,
    value: students.map((student) => ({
      id: student.id,
      student_number: student.student_number,
      full_name: student.full_name,
      photo_url: student.photo_url,
      class: student.class,
      balance: student.balance,
      daily_limit: student.daily_limit,
      is_active: student.is_active,
    })),
    updatedAt: new Date().toISOString(),
  })
}

export async function findCachedStudents(userId, search) {
  const database = await databasePromise
  const record = await database.get('cache', `students:${userId}`)
  const normalized = search.trim().toLowerCase()

  return (record?.value || []).filter((student) => (
    student.is_active
    && `${student.full_name} ${student.student_number}`.toLowerCase().includes(normalized)
  )).slice(0, 20)
}

export async function queueSale(userId, sale) {
  const database = await databasePromise
  await database.put('sales', {
    ...sale,
    userId,
    status: 'queued',
    queuedAt: new Date().toISOString(),
  })
}

export async function listQueuedSales(userId) {
  const database = await databasePromise
  return (await database.getAllFromIndex('sales', 'userId', userId))
    .filter((sale) => sale.type !== 'saved_student_batch')
    .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))
}

export async function updateQueuedSale(uuid, changes) {
  const database = await databasePromise
  const sale = await database.get('sales', uuid)
  if (sale) await database.put('sales', { ...sale, ...changes })
}

export async function removeQueuedSale(uuid) {
  const database = await databasePromise
  await database.delete('sales', uuid)
}

export async function saveStudentBatch(userId, batch) {
  const database = await databasePromise
  const existing = await database.get('sales', batch.uuid)
  await database.put('sales', {
    ...batch,
    userId,
    type: 'saved_student_batch',
    status: 'saved',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

export async function listSavedStudentBatches(userId) {
  const database = await databasePromise
  return (await database.getAllFromIndex('sales', 'userId', userId))
    .filter((sale) => sale.type === 'saved_student_batch')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export async function removeSavedStudentBatch(uuid) {
  const database = await databasePromise
  await database.delete('sales', uuid)
}
