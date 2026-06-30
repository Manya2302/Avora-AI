import Cookies from 'js-cookie'

export function setTokens(access: string, refresh: string) {
  Cookies.set('access_token', access, { expires: 1, secure: process.env.NODE_ENV === 'production' })
  Cookies.set('refresh_token', refresh, { expires: 7, secure: process.env.NODE_ENV === 'production' })
}

export function clearTokens() {
  Cookies.remove('access_token')
  Cookies.remove('refresh_token')
}

export function getAccessToken(): string | undefined {
  return Cookies.get('access_token')
}

export function isAuthenticated(): boolean {
  return !!Cookies.get('access_token')
}
