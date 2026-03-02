import { JWT } from 'google-auth-library'

const tokenCache = new Map<string, { token: string; expiry: number }>()

export async function getGoogleAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope)
  if (cached && cached.expiry > Date.now() + 60_000) {
    return cached.token
  }

  const clientEmail = process.env.GA4_CLIENT_EMAIL
  const privateKey = process.env.GA4_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!clientEmail || !privateKey) {
    throw new Error('Missing GA4 service account credentials (GA4_CLIENT_EMAIL / GA4_PRIVATE_KEY)')
  }

  const client = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: [scope],
  })

  const tokenResponse = await client.getAccessToken()
  const token = tokenResponse?.token

  if (!token) {
    throw new Error('Failed to get Google access token')
  }

  tokenCache.set(scope, {
    token,
    expiry: Date.now() + 3_500_000,
  })

  return token
}
