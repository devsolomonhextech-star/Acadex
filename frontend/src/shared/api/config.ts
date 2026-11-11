const productionApiOrigin = 'https://acadex.174.138.191.32.nip.io'
const configuredApiOrigin = import.meta.env.VITE_API_URL?.trim()

/** VITE_API_URL may override the deployed API origin; local dev stays same-origin. */
export const API_BASE_URL = (configuredApiOrigin || (import.meta.env.PROD ? productionApiOrigin : '')).replace(/\/+$/, '')
