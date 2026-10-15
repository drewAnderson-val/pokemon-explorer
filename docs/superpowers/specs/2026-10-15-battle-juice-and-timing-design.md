# Battle juice, sound and timing: design

Date: 2026-10-15. Approved in chat; the user asked to go straight to building (no separate plan document).

## Goal

Make battles feel lively and hands-on: visual feedback on every hit, optional retro sound, and a timing bar that
rewards a well-timed press. Everything stays original, keyboard-playable, and off under reduced motion.

## Decisions taken in chat

| Topic | Choice |
| --- | --- |
| Direction | Juice (effects + sound) and timing moves |
| Sound | Off by default; 🔊 toggle, remembered |
| Timing | Player attacks only, bonus only: Perfect ×1.25, Nice ×1.1, otherwise ×1; no penalty |

## Rules

- `timingResult(position)` (pure, `src/lib/battle/timing.ts`), position 0–1 along the bar: within 0.05 of the centre
  → Perfect ×1.25; within 0.25 → Nice ×1.1; else ×1. Not pressing within the window counts as ×1.
- The move action gains `timing?: number`; it multiplies only the player's damage, after the other factors. Misses
  and crits are still decided by the engine; immune stays 0.

## Sound

`src/lib/sound.ts` synthesises short square/triangle-wave cues with the Web Audio API (no files, no library):
hit, crit, super-effective, not-very-effective, faint, throw, shake, caught, break-free, level-up, victory. The
AudioContext is created on the first user gesture (the toggle). Message steps carry a `cue`; the arena plays it when
the step appears and sound is on.

## Effects (all disabled under `prefers-reduced-motion`, like the existing hit animations)

- Floating damage number over the hit creature (yellow on a crit).
- Crit: white flash over the scene and a short scene shake.
- Super-effective: a burst of pixel sparkles on the target.
- Catching: an original pixel orb on the wild creature's platform that wobbles per shake, then sparkles on a catch or
  pops on a break-free.
- Level-up: the info box flashes gold.
- Victory / catch: a ribbon ("VICTORY!" / "GOTCHA!") drops into the scene.

## Timing bar

After picking a move the menu box shows the bar; a pointer sweeps back and forth (CSS animation, 0.6 s per pass) and
the position at the press is computed from elapsed time, so it matches what's drawn. Space/Enter/click/tap stops it;
Escape goes back to the moves; after 2.4 s it resolves as ×1. The result ("Perfect!" / "Nice!" / "OK") shows briefly
and is announced. Off when the Timing toggle is off or reduced motion is on.

## Settings

`{ sound: boolean, timing: boolean }` in `localStorage['pokemon-explorer:settings']`, defaults `{ sound: false,
timing: true }`, through the same blocked-storage-safe store as the team. Two `aria-pressed` toggles in the battle
header; Timing shows as off (disabled) under reduced motion.

## Testing

Unit: timing zones, damage with the bonus, cues on steps, settings store. UI: timing bar appears and resolves a turn,
Timing off / reduced motion skip it, Escape goes back, toggles persist, damage number text. Browser pass for the look.
