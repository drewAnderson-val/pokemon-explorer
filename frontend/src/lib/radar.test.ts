import { describe, expect, it } from 'vitest'

import { radarPoints, ringPoints } from './radar'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5)

describe('radarPoints', () => {
  it('starts at 12 o’clock and goes clockwise in 60° steps', () => {
    const points = radarPoints([1, 1, 1, 1, 1, 1], { max: 1, radius: 10 })
    close(points[0].x, 0)
    close(points[0].y, -10)
    close(points[1].x, 10 * Math.cos(-Math.PI / 6))
    close(points[1].y, 10 * Math.sin(-Math.PI / 6))
    close(points[3].x, 0)
    close(points[3].y, 10)
  })

  it('scales each value linearly against the shared max', () => {
    const [top] = radarPoints([127.5, 0, 0, 0, 0, 0], { max: 255, radius: 80 })
    close(top.y, -40)
  })

  it('clamps out-of-range values to the rim and the centre', () => {
    const [over, under] = radarPoints([999, -5], { max: 255, radius: 80 })
    close(Math.hypot(over.x, over.y), 80)
    close(Math.hypot(under.x, under.y), 0)
  })
})

describe('ringPoints', () => {
  it('is a regular hexagon at the given fraction of the radius', () => {
    const ring = ringPoints(6, { fraction: 0.5, radius: 80 })
    expect(ring).toHaveLength(6)
    for (const p of ring) close(Math.hypot(p.x, p.y), 40)
  })
})
