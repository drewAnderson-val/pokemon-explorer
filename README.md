# Pokemon Explorer

FINNY frontend take-home: a searchable, infinitely scrolling grid of 1,000 creatures with expandable cards, plus
a turn-based battle on a handheld console and a Creature Lab.

**Live:** https://pokemon-explorer-605570978921.us-central1.run.app

<p align="center">
  <a href="docs/media/review.mp4"><img src="docs/media/landing.gif" alt="Landing page with the start menu" width="800"></a>
  <br>
  <a href="docs/media/review.mp4"><b>▶ Watch the full walkthrough (1:49, MP4)</b></a>
</p>

## Explorer

Search by name, type or description, filter by type, sort by number, strength or speed, and keep scrolling: the
next batch loads on its own. Click a card to open its stats, description and size; add up to six to your team.

<p align="center"><img src="docs/media/explorer.gif" alt="Searching, filtering by Fire, sorting by Strongest, scrolling, then adding three creatures to the team" width="720"></p>

| Search | Expanded card | Team |
| --- | --- | --- |
| ![Search results for "dragon"](docs/media/explorer-search.png) | ![An expanded card with stats, size and description](docs/media/explorer-card.png) | ![The team bar with three creatures](docs/media/explorer-team.png) |

## Battle

Your team fights wild creatures on a "Pocket Explorer" handheld. Pick FIGHT, choose a move, and stop the timing bar
in the middle for extra damage; win to gain XP and levels, or try to catch the wild creature. The **Classic** toggle
switches between the four-green screen and full color.

<p align="center"><img src="docs/media/battle.gif" alt="Two battles on the handheld: one on the Classic green screen, one in color" width="400"></p>

| Classic screen | Timing bar | Color | Victory |
| --- | --- | --- | --- |
| ![Battle start on the green screen](docs/media/battle.png) | ![The timing bar: stop it in the middle](docs/media/battle-timing.png) | ![The same battle with Classic off](docs/media/battle-color.png) | ![You won! with Battle again and Change team](docs/media/battle-end.png) |

## Creature Lab

Name a creature, pick up to two types, describe it, and the lab draws its card. Image generation runs on Vertex AI,
so it needs the deployed app or local Google Cloud credentials.

<p align="center"><img src="docs/media/creator.png" alt="Creature Lab form filled in for a fire fox called Embercub" width="720"></p>

## On a phone

Everything works at phone width; the battle drops the console shell and fills the screen.

<p align="center">
  <img src="docs/media/mobile.gif" alt="Scrolling the explorer and opening a card on a phone" width="260">
  <img src="docs/media/mobile-card.png" alt="An expanded card on a phone" width="260">
  <img src="docs/media/mobile-battle.png" alt="A battle in full color on a phone" width="260">
</p>

## Architecture

One container on Cloud Run serves the React app and the Express API. The 1,000 creatures are a JSON file bundled
with the server, so search, filter, sort and paging run in `server/query.ts` with no database. Your team and custom
cards stay in your browser. Only the Creature Lab calls out, to Gemini on Vertex AI, behind rate limits.

```mermaid
flowchart LR
  subgraph Browser
    SPA["React 19 SPA<br/>Landing · Explorer · Battle · Creature Lab<br/>(TanStack Query)"]
    LS[("localStorage<br/>team, levels, settings")]
    IDB[("IndexedDB<br/>custom cards + images")]
    SPA --- LS
    SPA --- IDB
  end

  subgraph Run["Cloud Run: one container (server/index.ts)"]
    Static["Static files<br/>dist/ + SPA fallback"]
    API["Express 5 API (server/app.ts)"]
    Query["server/query.ts<br/>search · type filter · sort · paging"]
    Data[("src/data/pokemon.json<br/>1,000 creatures")]
    Limit["Rate limits<br/>5/hour per client · 100/day total"]
    API -->|"GET /api/pokemon"| Query --> Data
    API -->|"POST /api/creatures"| Limit
  end

  Vertex["Vertex AI<br/>Gemini image model"]

  SPA -->|"page load"| Static
  SPA -->|"fetch"| API
  Limit -->|"service account,<br/>no API key"| Vertex

  subgraph Deploy["Delivery (.github/workflows/deploy.yml)"]
    GH["GitHub Actions<br/>lint · test · build"] --> Pulumi["Pulumi up<br/>(OIDC, no stored keys)"]
    Pulumi --> AR[("Artifact Registry<br/>image pinned by digest")]
  end
  AR -->|"new revision after<br/>/api/health passes"| Run
```

In dev, `pnpm dev` mounts the same `server/app.ts` as Vite middleware, so the API and the app share
`localhost:5173`. Infra details: [`docs/deployment.md`](docs/deployment.md).

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173 (API served by the same Vite dev server)
pnpm test       # Vitest + Testing Library
pnpm lint && pnpm build && pnpm start   # production build on http://localhost:3000
```

## Repo map

| Path | What |
| --- | --- |
| [`src/`](src/), [`server/`](server/) | React + Vite app and Express API, at the repo root ([assignment brief](docs/brief.md)) |
| [`infra/`](infra/) | Pulumi (TypeScript) deploying to Google Cloud Run ([how it deploys](docs/deployment.md)) |
| [`.github/workflows/`](.github/workflows/) | Lint, test, build, deploy, per-PR preview environments and AI review |
| [`docs/decisions.md`](docs/decisions.md) | Decision log |
| [`docs/media/`](docs/media/) | The screenshots, GIFs and walkthrough video above |
