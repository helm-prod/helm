import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const SYSTEM_PROMPT = `You are a code generator for the Navy Exchange (NEX) ecommerce website. You generate clean, production-ready HTML and CSS for promotional panels and web content.

RULES:
- Output ONLY the requested code. No explanations, no markdown fences, no commentary.
- Use inline styles or <style> tags — no external stylesheets.
- Use the NEX brand colors: Navy #003057, Gold #CFA751, White #FFFFFF, Light Gray #F5F5F5
- All images should use placeholder src with descriptive alt text: <img src="https://placehold.co/600x400/003057/FFFFFF?text=Product+Image" alt="Product Image">
- Keep code clean and well-indented.
- Use system fonts: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif
- Make layouts responsive using max-width and percentage widths.
- Tables should use border-collapse and clean cell padding.
- When asked to modify existing code, return the COMPLETE modified code, not just the changes.

CONTEXT: This code will be used in promotional panels on mynavyexchange.com. It needs to look polished and professional, matching military exchange retail standards.`

export async function POST(request: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'AI generation not configured. Add ANTHROPIC_API_KEY to environment variables.' }, { status: 503 })
  }

  const body = await request.json()
  const { prompt, language, currentCode } = body as {
    prompt: string
    language: 'html' | 'css' | 'javascript'
    currentCode?: string
  }

  if (!prompt?.trim()) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
  }

  let userMessage = ''
  if (currentCode?.trim()) {
    userMessage = `Here is my current ${language.toUpperCase()} code:\n\n${currentCode}\n\nRequest: ${prompt}\n\nReturn the complete updated ${language.toUpperCase()} code.`
  } else {
    userMessage = `Generate ${language.toUpperCase()} code for the following:\n\n${prompt}\n\nReturn only the ${language.toUpperCase()} code.`
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', response.status, errText)
      return NextResponse.json(
        { error: `AI generation failed (${response.status}). ${errText}` },
        { status: 502 }
      )
    }

    const data = await response.json()
    let generatedCode = data?.content?.[0]?.text ?? ''

    // Strip markdown code fences if present
    generatedCode = generatedCode
      .replace(/^```(?:html|css|javascript|js)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim()

    return NextResponse.json({ code: generatedCode })
  } catch (err) {
    console.error('AI generation error:', err)
    return NextResponse.json(
      { error: 'AI generation failed. Please try again.' },
      { status: 500 }
    )
  }
}
