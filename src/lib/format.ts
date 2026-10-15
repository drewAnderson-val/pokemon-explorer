export const formatNumber = (id: number) => `No.${String(id).padStart(3, '0')}`

export const formatHeight = (meters: number) => `${meters.toFixed(1)} m`

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`

// Fixture images are Picsum/LoremFlickr URLs ending in /{width}/{height}, some
// ~4000px wide. Ask for the size it's shown at (2x for retina screens) instead,
// and drop Picsum's baked-in `blur` so the photo comes back sharp. LoremFlickr
// returns HTTP 500s, so its links become Picsum images seeded by their lock:
// stable per creature.
export function cardImageUrl(src: string, width = 640, height = 320) {
  try {
    const url = new URL(src)
    const lock = url.searchParams.get('lock')
    if (url.hostname === 'loremflickr.com' && lock) {
      return `https://picsum.photos/seed/lock-${lock}/${width}/${height}`
    }
    url.pathname = url.pathname.replace(/\/\d+\/\d+$/, `/${width}/${height}`)
    url.searchParams.delete('blur')
    // URLSearchParams writes a bare flag as "grayscale="; Picsum wants "grayscale".
    url.search = url.searchParams.toString().replace(/=(&|$)/g, '$1')
    return url.toString()
  } catch {
    return src
  }
}
