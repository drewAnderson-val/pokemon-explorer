# Pokemon Explorer: Design Notes ("Battle Box")

A loose guide for styling `frontend/`, not a strict spec. Values below are
starting points taken from the design canvas (artboards "D · Classic: Battle
Box (RPG)" and "D · Landing page"). Change anything that doesn't feel right
once it's in the browser; update this file when you do.

## The vibe

A classic handheld RPG menu, built like a modern web app.

- Content sits in white text boxes with a chunky double border, on a soft
  blue-grey background.
- One pixel-style font, a ▶ cursor, blinking ▼ "more" prompts, an HP bar.
- Type colors do the heavy lifting for scanning. Everything else stays
  ink, white and one yellow accent.
- Retro in looks, normal in behavior: real search, filters, keyboard focus,
  readable text.
- Keep it original: no official logos, character art or show frames.

## Palette (starting point)

| Role | Suggested | Notes |
|---|---|---|
| Page background | `#DCE6EE` | Soft blue-grey |
| Boxes / cards | `#FFFFFF` | |
| Inset / hover | `#F2F6F8` | Art panel, hover fill |
| Ink | `#2B2B2B` | Text and borders |
| Secondary text | `#4A4A4A` | |
| Accent | `#F8D030` | Yellow, used sparingly |
| HP bar | `#48C050` | Green |
| Focus ring | `#3060C8` | |

Landing scene: a blue sky gradient (about `#1B74DA` to `#BFE6FA`) over a few
layers of green hills, with dark blue (`#1A3F7A`) outlines on white title
text.

### Type colors

The common fan palette works well. Pick dark or white text per color for
contrast.

Normal `#A8A878` · Fire `#F08030` · Water `#6890F0` · Electric `#F8D030` ·
Grass `#78C850` · Ice `#98D8D8` · Fighting `#C03028` · Poison `#A040A0` ·
Ground `#E0C068` · Flying `#A890F0` · Psychic `#F85888` · Bug `#A8B820` ·
Rock `#B8A038` · Ghost `#705898` · Dragon `#7038F8` · Dark `#705848` ·
Steel `#B8B8D0` · Fairy `#EE99AC`

Always show the type name too, not just the color.

## Type

- **Pixelify Sans** (Google Fonts) for everything. Swap it if it reads
  poorly at small sizes.
- Uppercase for names, labels and the big wordmark. Sentence case for
  descriptions.
- Rough sizes: wordmark very big, headers ~28px, card names ~19px, body
  ~17px, labels ~14 to 16px.

## Shapes and feel

- Boxes: thick double border (~6px), rounded corners (~12px).
- Small things (badges, chips, tags): thin solid border, small radius.
- Depth from borders, not shadows. The landing play button can break this
  rule.
- Motion can feel slightly "stepped" for the retro touch: a quick reveal
  when a card opens, blinking ▼ prompts. Turn motion off for people who've
  set reduced motion.

## Pieces we'll probably need

These are ideas from the canvas, not a fixed list.

- **Search** in a text box with a prompt line ("What will you look for?").
- **Type badges** on each card.
- **Type filter chips** (with a small color square) and a **sort** option
  (number / strongest / fastest), if time allows.
- **Creature card:**
  - Default: image or a big letter fallback, number, name, type badges,
    HP bar.
  - Expanded: stats list, base total, gen / height / weight, and the
    description in a dark text box.
  - A ▶ cursor on hover or focus and a small "more / less" hint are nice
    extras.
- **Status messages** in the same box style: loading more, nothing found,
  end of list, error.
- **Landing page** (optional): sky and hills scene, EXPLORER wordmark, short
  intro box, a play button into the explorer. Possibly a "Finny · Pokemon"
  line near the wordmark (still to decide).

## Layout

- Responsive grid: 1 column on phones, scaling up to 4 or 5 on wide
  screens.
- Opened cards can take more space (for example, two rows tall).
- Header with title and search, then filters, then the grid with infinite
  scroll.

## Copy tone

Short and playful, game flavored, never at the expense of clarity. For
example: "A wild catalog appeared!", "But nothing appeared! Try another
type.", "That's every creature on file!", "PRESS START".

## Fitting the stack

- Map the palette onto the existing shadcn variables in `src/globals.css`
  (background, card, primary, muted, accent, border, ring) so shadcn
  components pick it up.
- Keep type colors in one TypeScript map and pass them to components as a
  CSS variable.
- Light theme only for this direction.

## Basics to keep

Readable contrast, real buttons and labels, visible focus, comfortable tap
sizes on phones.

## Implemented as

The detailed spec is `docs/specs/2026-10-15-battle-box-handoff.md`. Tokens live in `src/globals.css`; type colors
in `src/lib/type-colors.ts`.

Tailwind already uses some of the spec's token names, so they map like this:

| Spec token | Tailwind usage | Why |
| --- | --- | --- |
| `color-field`, `color-box`, `color-inset`, `color-ink`, `color-ink-muted`, `color-track`, `color-accent`, `color-focus`, `color-danger` | `bg-field`, `bg-box`, `bg-inset`, `text-ink`, `text-ink-muted`, `bg-track`, `bg-accent`, `focus-ring`, `text-danger` | Aliases of the shadcn variables, so both names work |
| `font-display` … `font-caption` | `text-display` … `text-caption` | `font-*` is the font-family namespace |
| `font-pixel` | `font-pixel` | |
| `border-box`, `border-inset`, `border-tag` | `frame-box`, `frame-inset`, `frame-tag` | `border-box` would collide with `border-{color}` for `--color-box` |
| `radius-box`, `radius-inset`, `radius-tag` | `rounded-box`, `rounded-inset`, `rounded-tag` | |
| `shadow-press` | `shadow-press` | |

Changed from the spec after seeing it in the browser:

- ▼ prompts are ink on white boxes; accent yellow on white is about 1.5:1.
- Error copy is bold: `color-danger` on white is 4.2:1, which passes only as large (bold) text.
- Sort menu: never shrinks on desktop; below 480px it goes full width and hides the decorative "SORT" word so
  NO. / STRONGEST / FASTEST fit on one row.
