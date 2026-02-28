import { NextRequest, NextResponse } from 'next/server'

const SYSTEM_PROMPT =
  'You are Helm AI, an analytics assistant for the NEXCOM Navy Exchange ecommerce team. You analyze website performance data and provide concise, actionable insights for web producers. Keep responses brief and focused on what matters — trends, anomalies, and recommended actions. Use plain language, not jargon.'

const GEMINI_MODEL = 'gemini-2.5-flash'

type GeminiRequestBody = {
  prompt: string
  context?: string
  type?: string
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Gemini API is not configured' }, { status: 503 })
  }

  let body: GeminiRequestBody
  try {
    body = (await request.json()) as GeminiRequestBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const prompt = body.prompt?.trim()
  const context = body.context?.trim()
  const type = body.type?.trim()

  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  const userPrompt = type ? `[Insight type: ${type}]\n${prompt}` : prompt
  const promptPrefix = context ? `${SYSTEM_PROMPT}\n\n${context}` : SYSTEM_PROMPT
  const fullPrompt = `${promptPrefix}\n\n${userPrompt}`

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: fullPrompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2048,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', response.status, errorText)
      return NextResponse.json(
        { error: `Gemini request failed (${response.status})` },
        { status: 502 }
      )
    }

    const data = await response.json()
    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part?.text ?? '')
        .join('')
        .trim() ?? ''

    if (!text) {
      return NextResponse.json({ error: 'Gemini returned an empty response' }, { status: 502 })
    }

    const tokens =
      typeof data?.usageMetadata?.totalTokenCount === 'number'
        ? data.usageMetadata.totalTokenCount
        : undefined

    return NextResponse.json({
      text,
      model: data?.modelVersion ?? GEMINI_MODEL,
      ...(tokens !== undefined ? { tokens } : {}),
    })
  } catch (error) {
    console.error('Gemini route error:', error)
    return NextResponse.json({ error: 'Gemini request failed. Please try again.' }, { status: 500 })
  }
}
