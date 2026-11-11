const productionApiOrigin = 'https://acadex.174.138.191.32.nip.io'
const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim()

/** Browser HTTP requests use Vercel's same-origin API proxy in production. */
export const API_BASE_URL = import.meta.env.PROD
  ? ''
  : (configuredApiOrigin || '').replace(/\/+$/, '')

/** Keep realtime WebSocket connections pointed at the API origin directly. */
export const API_ORIGIN = (configuredApiOrigin || (import.meta.env.PROD ? productionApiOrigin : '')).replace(/\/+$/, '')
