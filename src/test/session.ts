import { authStore } from '@/lib/auth'

// Signs the tests' user in, as if they had logged in.
export function signIn(username = 'Drew_1') {
  authStore.update(() => ({
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    token: 'test-token',
    user: { id: 'u1', username }
  }))
}
