// sessionStorage keys of the legacy PIN login. The names are a stable contract
// with already-open tabs — do not rename.
export const dashKey = (clientId: string) => `client-dash-${clientId}`
export const tokenKey = (clientId: string) => `client-token-${clientId}`
export const tokenExpiresKey = (clientId: string) => `client-token-expires-${clientId}`

export function clearLegacySession(clientId: string) {
  sessionStorage.removeItem(dashKey(clientId))
  sessionStorage.removeItem(tokenKey(clientId))
  sessionStorage.removeItem(tokenExpiresKey(clientId))
}
