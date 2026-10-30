export const formatNumber = (id: number) => `No.${String(id).padStart(3, '0')}`

export const formatHeight = (meters: number) => `${meters.toFixed(1)} m`

export const formatWeight = (kg: number) => `${kg.toFixed(1)} kg`
