/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Origin of the FastAPI service, set at build time; unset in dev (proxied).
  readonly VITE_API_URL?: string
}
