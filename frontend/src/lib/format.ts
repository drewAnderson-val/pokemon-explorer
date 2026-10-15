export const formatNumber = (id: number) => `No.${String(id).padStart(3, '0')}`

export const formatHeight = (meters: number) => `${meters.toFixed(1)} m`

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`

// Fixture images are Picsum/LoremFlickr URLs ending in /{width}/{height}, some
// ~4000px wide. Ask for a card-sized image instead.
export function cardImageUrl(src: string) {
  try {
    const url = new URL(src)
    url.pathname = url.pathname.replace(/\/\d+\/\d+$/, '/480/360')
    return url.toString()
  } catch {
    return src
  }
}
