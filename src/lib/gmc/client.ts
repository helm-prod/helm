import { getGoogleAccessToken } from '@/lib/google-auth'

const GMC_SCOPE = 'https://www.googleapis.com/auth/content'
const GMC_API_BASE = 'https://merchantapi.googleapis.com/reports/v1beta'

export function getGmcAccessToken(): Promise<string> {
  return getGoogleAccessToken(GMC_SCOPE)
}

export interface GmcReportResponse {
  results?: Record<string, unknown>[]
  nextPageToken?: string
}

export async function queryMerchantReports(
  query: string,
  maxResults = 10_000
): Promise<Record<string, unknown>[]> {
  const token = await getGmcAccessToken()
  const accountId = process.env.GMC_ACCOUNT_ID

  if (!accountId) {
    throw new Error('GMC_ACCOUNT_ID env var not set')
  }

  const url = `${GMC_API_BASE}/accounts/${accountId}/reports:search`
  const allResults: Record<string, unknown>[] = []
  let pageToken: string | undefined

  while (true) {
    const body: Record<string, unknown> = { query }
    if (pageToken) {
      body.pageToken = pageToken
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`GMC Reports API error ${response.status}: ${error}`)
    }

    const data = (await response.json()) as GmcReportResponse
    const rows = data.results ?? []
    allResults.push(...rows)

    if (!data.nextPageToken || allResults.length >= maxResults) {
      break
    }

    pageToken = data.nextPageToken
  }

  return allResults.slice(0, maxResults)
}
