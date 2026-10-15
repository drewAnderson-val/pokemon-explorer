import type { Pokemon } from './pokemon'

// Custom cards live in this browser only: no sign-in, and nobody sees anyone
// else's creations. IndexedDB, not localStorage: each image is ~200 KB.
const DB_NAME = 'creature-lab'
const STORE = 'creations'

let db: Promise<IDBDatabase> | undefined

export function clearCreations() {
  return run('readwrite', store => store.clear())
}

export function deleteCreation(id: number) {
  return run('readwrite', store => store.delete(id))
}

// Newest first.
export async function loadCreations() {
  const all = await run<Pokemon[]>('readonly', store => store.getAll())
  return all.sort((a, b) => b.id - a.id)
}

export function saveCreation(creature: Pokemon) {
  return run('readwrite', store => store.put(creature))
}

function open() {
  db ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: 'id' })
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  // Don't cache a failure (e.g. storage blocked); let the next call retry.
  db.catch(() => (db = undefined))
  return db
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
) {
  const store = (await open()).transaction(STORE, mode).objectStore(STORE)
  return new Promise<T>((resolve, reject) => {
    const request = action(store)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
