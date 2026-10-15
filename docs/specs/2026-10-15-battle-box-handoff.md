# Handoff Spec: Pokemon Explorer (Battle Box)

Oct 15, 2026 · @D-Money

## Overview

Restyle the Pokemon Explorer take-home (`frontend/`) in the "Battle Box" direction: a classic handheld RPG menu look on a modern, responsive explorer. Source designs are the canvas artboards **D · Classic: Battle Box (RPG)** and **D · Landing page**.

- **Screens:** Explorer (searchable, infinite-scroll grid of creature cards that expand) and an optional Landing page with a play button into the explorer.
- **Users:** the FINNY front-end reviewers first (they will judge structure, states and responsiveness), then anyone scanning creatures by type and stats.
- **Stack:** React 19 + Vite, Tailwind v4, shadcn/ui tokens in `src/globals.css`.
- **How strict:** values are starting points from the canvas. Keep the token names and the behavior; adjust exact numbers if they look off in the browser.
- **Guardrail:** keep it original. No official logos, character art or show frames.

## Layout

Both screens are a single centered column; everything content-bearing sits in a white box on a flat background.

**Explorer** (top to bottom, max width `layout-max` 1400px, page padding `space-12` top and `space-14` sides on desktop):

1. **Header row:** title box (EXPLORER + "1000 creatures on file") on the left, search box filling the remaining width. Gap `space-6`.
2. **Toolbar row:** type filter chips (left, wrapping) and the sort menu (right). Gap `space-5`.
3. **Result count:** one line, only when a search or filter is active.
4. **Card grid:** CSS grid, `grid-auto-flow: dense`, `align-items: start`, gap `space-5`. An expanded card spans 2 rows.
5. **Scroll sentinel + status box:** loading more, end of list, or error, centered.

**Landing** (full viewport, min height 900px):

1. Decorative scene behind everything: sky gradient, 4 drifting clouds, 4 layered hill shapes stretched to full width (360px tall), 3 trees.
2. Nav: logo mark + EXPLORER (left), Browse / Types / About (right). Max width 1200px.
3. Center stack, max width 900px, gap `space-7`: count tag, wordmark, intro dialog box (max 560px), play button, PRESS START label.
4. Type badge marquee 64px above the bottom; footer disclaimer 16px above the bottom.

Open question: where the "Finny · Pokemon" line goes. Suggested: a small eyebrow line above the wordmark.

## Design tokens

Map color tokens onto the existing shadcn variables in `src/globals.css` so shadcn components inherit them; add the rest under `@theme`. Light theme only.

**Color**

| Token | Value | shadcn variable | Usage |
| --- | --- | --- | --- |
| `color-field` | #DCE6EE | `--background` | Explorer page background |
| `color-box` | #FFFFFF | `--card`, `--popover` | Cards, dialog boxes, chips (off) |
| `color-inset` | #F2F6F8 | `--secondary` | Art panel, chip hover |
| `color-ink` | #2B2B2B | `--foreground`, `--primary`, `--border` | Text, borders, selected chip, dark dialog |
| `color-ink-muted` | #4A4A4A | `--muted-foreground` | Secondary text (8.9:1 on white) |
| `color-track` | #E8E8E8 | `--muted` | Empty part of bars |
| `color-rule` | #8A8A8A | n/a | Dotted stat leaders (decorative only) |
| `color-accent` | #F8D030 | `--accent` | HP label, ▼ prompts, legend tag, play button |
| `color-focus` | #3060C8 | `--ring` | Focus ring |
| `color-hp-good` | #48C050 | n/a | HP bar fill |
| `color-danger` | #E04038 | `--destructive` | Error text |
| `color-sky-top` to `color-sky-horizon` | #1B74DA, #3C98EC, #7CC3F4, #BFE6FA | n/a | Landing sky gradient stops (0, 38, 68, 100%) |
| `color-hill-far`, `-1`, `-2`, `-3` | #9CC6EA, #7DC65A, #56AE3E, #3E9431 | n/a | Landing hills, back to front |
| `color-title-outline` | #1A3F7A | n/a | Wordmark outline, text shadow on sky |

**Type colors** (one TypeScript map, passed to components as a `--type` CSS variable; text is `color-ink` when the color's luminance is above 0.18, otherwise white)

| Type | Value | Text | Type | Value | Text |
| --- | --- | --- | --- | --- | --- |
| Normal | #A8A878 | ink | Flying | #A890F0 | ink |
| Fire | #F08030 | ink | Psychic | #F85888 | ink |
| Water | #6890F0 | ink | Bug | #A8B820 | ink |
| Electric | #F8D030 | ink | Rock | #B8A038 | ink |
| Grass | #78C850 | ink | Ghost | #705898 | white |
| Ice | #98D8D8 | ink | Dragon | #7038F8 | white |
| Fighting | #C03028 | white | Dark | #705848 | white |
| Poison | #A040A0 | white | Steel | #B8B8D0 | ink |
| Ground | #E0C068 | ink | Fairy | #EE99AC | ink |

**Typography** (family `font-pixel`: Pixelify Sans 400/500/700, fallback monospace)

| Token | Size / line height | Weight | Case | Usage |
| --- | --- | --- | --- | --- |
| `font-display` | clamp(56px, 11vw, 132px) / 0.9 | 700 | Upper | Landing wordmark |
| `font-heading` | 28px / 1.1 | 700 | Upper | Explorer title box |
| `font-card-title` | 19px / 1.15 | 700 | Upper | Creature name |
| `font-body-lg` | 20px / 1.4 | 400 | Sentence | Dialog copy, search input |
| `font-body` | 17px / 1.35 | 400 | Sentence | Stats, descriptions |
| `font-label` | 14 to 16px, +0.04em | 700 | Upper | Badges, chips, sort, tags |
| `font-caption` | 13 to 15px | 400 | As written | No.004, meta values |

**Shape and spacing**

| Token | Value | Usage |
| --- | --- | --- |
| `border-box` | 6px double `color-ink` | Cards, dialog boxes, search, sort menu |
| `border-inset` | 2px solid `color-ink` | Art panel, meta cells, HP track |
| `border-tag` | 2px solid `color-ink` | Badges, chips |
| `radius-box` | 12px (`--radius`) | Boxes, cards |
| `radius-inset` | 6px | Art panel, dark dialog |
| `radius-tag` | 4px | Badges, chips, tags |
| `shadow-press` | 0 8px 0 `color-ink` | Play button only; nothing else uses shadows |
| `space-N` | N × 4px (Tailwind scale) | Common: 1.5 (6), 2 (8), 3 (12), 3.5 (14), 5 (20), 6 (24), 7 (28), 12 (48), 14 (56) |

## Components

Every visible piece is one of these; the dialog box is the base most others build on.

| Component | Variant | Props | Notes |
| --- | --- | --- | --- |
| DialogBox | default, dark | `tone`, `showMore` | `color-box` + `border-box` + `radius-box`, padding `space-3.5` to `space-5`. Dark = `color-ink` fill, white text, `radius-inset`. `showMore` adds a blinking ▼ bottom-right. |
| SearchField | default | `value`, `onChange` | DialogBox with prompt "What will you look for?" above a ▶ + input. Input: transparent, 2px `color-ink` bottom border, `font-body-lg`. Placeholder: "Name, type, or description". Visible label text; `/` focuses it. |
| TypeBadge | default | `type` | Height 24px, padding 0 `space-2`, `border-tag`, `radius-tag`, fill = type color, text = auto ink/white, `font-label`, uppercase. |
| TypeFilterChip | off, on | `type` (empty = ALL), `pressed`, `onPress` | Height 40px (44px on touch), `border-tag`, `radius-tag`, `font-label`. Off: `color-box` fill + 10px type-color square (2px ink border). On: `color-ink` fill, white text. ALL has no square. |
| SortMenu | default | `value`: `id` / `total` / `speed`, `onChange` | DialogBox holding "SORT" (`color-ink-muted`) + NO. / STRONGEST / FASTEST. Selected = bold with a ▶ before it. Options are 40px tall. |
| CreatureCard | collapsed, expanded | `pokemon`, `expanded`, `onToggle` | Whole card is a button. `color-box`, `border-box`, `radius-box`, padding `space-3.5`, gap `space-3`. Contains ArtPanel, name row (▶ + name), TypeBadges, HpBar; expanded adds StatList, MetaRow, dark DialogBox description. |
| ArtPanel | image, fallback | `src`, `name`, `type`, `number`, `legendary`, `expanded` | Height 140px, `color-inset`, `border-inset`, `radius-inset`. Fallback: first letter, 80px 700, type color, 3px ink drop shadow, on an oval in the type color at \~33% opacity. Corners: `No.004` (top-left), LEGEND tag (top-right, if legendary), "▼ MORE" / "▲ LESS" tag (bottom-right). |
| HpBar | full | `hp` | "HP" label (`color-accent` text on `color-ink`, radius 4px) + 10px track (`border-inset`, radius 6px) filled `color-hp-good` + value `80/80`. Always full in this app. |
| StatList | default | `pokemon` | ATTACK, DEFENSE, SP. ATK, SP. DEF, SPEED: label, dotted leader (`color-rule`), bold value right-aligned. 2px ink rule, then TOTAL (all six stats incl. HP). |
| MetaRow | default | `generation`, `height`, `weight` | Three equal cells, `border-inset`, `radius-tag`, `font-caption`, centered: "GEN 4", "3.4 m", "812.0 kg" (one decimal). |
| StatusBox | loading, empty, end, error | `kind`, `onAction` | DialogBox with game copy (see Edge cases). Empty has "Clear filters"; error has "Try again". |
| Button | primary, secondary | `variant` | Height 44px, `radius-tag`, `font-label`. Primary: `color-ink` fill, white text. Secondary: `color-box` fill, `border-tag`. |
| PlayButton | default | `href` | Landing only. 132px circle, `color-accent` fill, 6px ink border, `shadow-press`, ink ▶ icon (52px). Label "PRESS START" below. |
| LandingScene | default | none | Decorative sky, clouds, hills, trees, type badge marquee. `aria-hidden`. |

## States and interactions

State changes are instant and "stepped" rather than smooth, which is what sells the retro feel; no disabled states exist in this UI.

| Element | State | Behavior |
| --- | --- | --- |
| CreatureCard | Default | Collapsed, ▶ hidden, corner tag "▼ MORE". |
| CreatureCard | Hover | ▶ appears before the name instantly. No color or shadow change. |
| CreatureCard | Focus (keyboard) | ▶ appears + 3px `color-focus` ring, 3px offset. |
| CreatureCard | Click / Enter / Space | Toggles expanded. Several cards can be open at once. |
| CreatureCard | Expanded | Spans 2 grid rows, details reveal, corner tag "▲ LESS". |
| CreatureCard | Legendary | LEGEND tag top-right of ArtPanel. Otherwise identical. |
| CreatureCard | Loading (skeleton) | Same box and size, ArtPanel and two text bars in `color-inset`, gentle pulse. No text. |
| ArtPanel | Image failed / missing | Show the letter fallback. Never a broken-image icon. |
| TypeFilterChip | Hover (off) | Fill `color-inset`. |
| TypeFilterChip | Pressed | Switches on; any other chip switches off (single select). Pressing ALL clears the filter. List resets to page 1. |
| SortMenu option | Hover | ▶ preview appears beside it. |
| SortMenu option | Selected | Bold + ▶. List resets to page 1. |
| SearchField | Typing | Results update 250ms after the last keystroke. List resets to page 1. |
| SearchField | `/` pressed anywhere | Focuses the input (ignored while already typing in a field). |
| Grid bottom | Near viewport (600px) | Loads the next 20 and shows the loading StatusBox. |
| PlayButton | Hover / Active | Scale 1.06 / 0.96, stepped. Navigates to the explorer. |

## Responsive behavior

The grid adds columns as space allows; controls stack on small screens because phone users browse one-handed and need the filters within thumb reach.

| Breakpoint | Grid columns | Changes |
| --- | --- | --- |
| Wide (≥1536px) | 5 | Default desktop layout. |
| Desktop (1024 to 1535px) | 4 | Header and toolbar each on one row. |
| Tablet (768 to 1023px) | 3 | Sort menu drops below the chips. |
| Small tablet (480 to 767px) | 2 | Header stacks: title box above search. Page side padding `space-6`. |
| Phone (<480px) | 1 | Chips become one horizontal scrolling row (no wrap). Chip and option height 44px. Side padding `space-4`. Expanded card just grows taller (no row span needed). Landing: wordmark uses the clamp minimum, nav links wrap, hills keep full width. |

## Edge cases

Every non-happy path uses the same StatusBox with short game-style copy, so failures feel like part of the world rather than a crash.

- **Empty results:** "But nothing appeared! Try another type. ▼" plus a primary "Clear filters" button that resets search and type.
- **Loading first page:** 10 skeleton cards. **Loading more:** 4 skeleton cards after the last row plus "More creatures appeared… ▼".
- **End of list:** "That's every creature on file!" Shown once the API reports no next page.
- **Error:** "The connection fled! Try again." in `color-danger` with a secondary "Try again" button that retries the failed page. Already loaded cards stay.
- **Slow connection:** keep skeletons until data arrives; a newer search cancels the older request so stale results never appear.
- **Long names:** fixture names are short first names, but allow 2 lines on the card, then truncate with an ellipsis. Full name is in the button's accessible name.
- **Long descriptions:** no limit; the dark box grows. Expanded cards may be taller than their 2-row span.
- **Missing data:** no image or a failed image shows the letter fallback; `isLegendary` missing means not legendary; a single type shows one badge.
- **Numbers:** height and weight to one decimal; IDs padded to 3 digits (`No.004`); IDs above 999 show in full.
- **Huge fixture images:** request card-sized images (about 480×360) rather than the originals, which run up to \~4000px wide.

## Animation and motion

Motion is short and stepped; with `prefers-reduced-motion: reduce`, every animation below is turned off and state changes stay instant.

| Element | Trigger | Animation | Duration | Easing |
| --- | --- | --- | --- | --- |
| Card details | Expand | Fade in + rise 8px | 240ms | steps(4) |
| ▼ prompts, PRESS START | Always | Blink (hidden at 50%) | 1000ms loop | steps(1) |
| ▶ cursor | Hover / focus / select | Appear | 0ms | none |
| Skeleton blocks | Loading | Opacity pulse | 1500ms loop | ease-in-out |
| PlayButton | Idle | Bob 6px up and down | 2400ms loop | ease-in-out |
| PlayButton | Hover / active | Scale 1.06 / 0.96 | 120ms | steps(2) |
| Landing clouds | Always | Drift left to right across the viewport | 90 to 150s loop | linear |
| Type badge marquee | Always | Scroll left, seamless loop | 40s loop | linear |

## Accessibility

Target WCAG 2.1 AA; all text pairings in the token tables pass 4.5:1 on their intended background.

- **Focus order (explorer):** search → type chips (left to right) → sort options → cards in grid order → status box action (Clear filters / Try again).
- **Focus order (landing):** logo → Browse → Types → About → play button.
- **Roles and labels:** cards are `<button aria-expanded>` with `aria-controls` pointing at the details region; chips and sort options are `<button aria-pressed>` inside a `<fieldset>` with a visually hidden legend ("Filter by type", "Sort by"); the search input has a real `<label>`; play button `aria-label="Start exploring"`.
- **Keyboard:** Tab / Shift+Tab moves; Enter or Space toggles a card, chip or sort option; `/` focuses search; Escape in search clears it.
- **Announcements:** a polite live region states the result count after search or filter ("70 results"); errors use `role="alert"`.
- **Decorative:** ▶, ▼, color squares, the letter fallback, scenery and the marquee are `aria-hidden`. Type names are always written, never color alone.
- **Contrast on the landing sky:** white text only at the top of the gradient (`color-sky-top`) or with the `color-title-outline` shadow.
- **Touch:** 44px minimum targets on phones.
- **Motion:** honor reduced motion (see Animation and motion).
