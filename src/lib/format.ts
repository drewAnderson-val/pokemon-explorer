export const formatNumber = (id: number) => `No.${String(id).padStart(3, '0')}`

export const formatHeight = (meters: number) => `${meters.toFixed(1)} m`

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`

// Fixture images are Picsum/LoremFlickr URLs ending in /{width}/{height}, some
// ~4000px wide. Ask for a card-sized image instead. LoremFlickr returns HTTP 500s,
// so its links become Picsum images seeded by their lock: stable per creature.
export function cardImageUrl(src: string) {
  // Custom cards carry their image inline; base64 can end in "/12/34".
  if (src.startsWith('data:')) return src
  try {
    const url = new URL(src)
    const lock = url.searchParams.get('lock')
    if (url.hostname === 'loremflickr.com' && lock) {
      return `https://picsum.photos/seed/lock-${lock}/480/360`
    }
    url.pathname = url.pathname.replace(/\/\d+\/\d+$/, '/480/360')
    return url.toString()
  } catch {
    return src
  }
}
