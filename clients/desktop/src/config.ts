/**
 * LinAI deployment configuration.
 *
 * The backend address lives in `host.js`, which is shared by the Vue client and
 * packaging scripts. Change that one value and rebuild to repoint the client.
 */

import { BACKEND_ORIGIN } from './host.js'

export { BACKEND_ORIGIN }

/** Base URL for API calls. The backend serves its v1 API under `/api/v1`. */
export const API_BASE_URL = `${BACKEND_ORIGIN}/api/v1`

/**
 * Builds a URL into the deployment's web console, used when a flow has to
 * finish in the system browser (third-party OAuth, registration, payments).
 */
export function webUrl(path: string): string {
  return `${BACKEND_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`
}
