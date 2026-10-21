# Pokemon Explorer

FINNY frontend take-home: a searchable, infinitely scrolling grid of 1,000 creatures with expandable cards, plus
a turn-based battle on a handheld console and a Creature Lab.

**Live:** https://pokemon-explorer-605570978921.us-central1.run.app

<p align="center"><img src="docs/media/landing.gif" alt="Landing page with the start menu" width="800"></p>

## Explorer

Search by name, type or description, filter by type, sort by number, strength or speed, and keep scrolling: the
next batch loads on its own. Click a card for its stats and description; add up to six to your team.

<p align="center"><img src="docs/media/explorer.gif" alt="Searching, filtering by Fire, sorting by Strongest, scrolling, then adding three creatures to the team" width="720"></p>

## Battle

Your team fights wild creatures on a "Pocket Explorer" handheld. Choose a move and stop the timing bar in the middle
for extra damage; win to level up, or catch the wild creature. **Classic** switches between the four-green screen
and full color.

<p align="center"><img src="docs/media/battle.gif" alt="Two battles on the handheld: one on the Classic green screen, one in color" width="400"></p>

## Creature Lab

Name a creature, pick its types, describe it, and Gemini on Vertex AI draws its card (deployed app or local Google
Cloud credentials only).

## Architecture

One Cloud Run container serves the React app and the Express API. The creatures are a JSON file bundled with the
server, so search, filter, sort and paging run in `server/query.ts` with no database. Your team and custom cards
stay in your browser.

```mermaid
flowchart LR
  subgraph Browser
    SPA["React 19 SPA<br/>(TanStack Query)"]
    Store[("localStorage + IndexedDB<br/>team, settings, custom cards")]
    SPA --- Store
  end

  subgraph Run["Cloud Run: one container"]
    API["Express 5 API"]
    Query["server/query.ts<br/>search · filter · sort · paging"]
    Data[("pokemon.json<br/>1,000 creatures")]
    Limit["Rate limits"]
    API -->|"GET /api/pokemon"| Query --> Data
    API -->|"POST /api/creatures"| Limit
  end

  Vertex["Vertex AI<br/>Gemini image model"]

  SPA -->|"fetch"| API
  Limit -->|"service account"| Vertex

  GH["GitHub Actions → Pulumi<br/>(OIDC, image pinned by digest)"] -->|"deploy"| Run
```

Infra details: [`docs/deployment.md`](docs/deployment.md). Decisions: [`docs/decisions.md`](docs/decisions.md).

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173 (app + API)
pnpm test
pnpm lint && pnpm build && pnpm start   # production build on http://localhost:3000
```
