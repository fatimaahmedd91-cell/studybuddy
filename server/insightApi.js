// insightApi.js
// Owner: Person 4 (Back-End B). Written by Claude.
//
// A small server-side endpoint, POST /api/insight, that asks Google Gemini to write
// the "why you might get along" sentence. It runs inside the Vite server (npm run dev
// and npm run preview), so the API key stays on your computer and never reaches the browser.
//
// Privacy rule: the browser sends only shared interests, shared courses, and shared
// free slots. No names, no contact info. This file checks that before calling Gemini.

import { DAYS, SLOTS } from '../src/lib/matching.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_MODEL = 'gemini-flash-lite-latest'

const INSTRUCTIONS = `You write one short, friendly note for a university student explaining why they might get along with another student they matched with.
Rules:
- One or two sentences, under 45 words.
- Speak to the student as "you", and describe what "you both" share.
- Use only the facts given. Do not invent names, places, or details.
- If there is little in common, say kindly that a fresh perspective can still make a good study partner.
- Plain text only. No emojis, no markdown, no quotation marks.`

// Keeps only short strings, so nothing large or unexpected reaches the AI.
function cleanList(value, max) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.slice(0, 40))
    .slice(0, max)
}

function cleanSlots(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((s) => s && DAYS.includes(s.day) && SLOTS.includes(s.slot))
    .map((s) => `${s.day} ${s.slot}`)
    .slice(0, 15)
}

function buildPrompt(facts) {
  const show = (list) => (list.length > 0 ? list.join(', ') : 'none')
  return [
    `Shared courses: ${show(facts.courses)}`,
    `Shared interests: ${show(facts.interests)}`,
    `Times you are both free: ${show(facts.slots)}`,
  ].join('\n')
}

async function readJson(req) {
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 10000) throw new Error('Request body too large')
  }
  return JSON.parse(body)
}

async function askGemini(apiKey, model, prompt) {
  const res = await fetch(`${GEMINI_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
    }),
    signal: AbortSignal.timeout(20000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `Gemini returned ${res.status}`)

  const parts = data.candidates?.[0]?.content?.parts || []
  const text = parts.map((p) => p.text || '').join('').trim()
  if (!text) throw new Error('Gemini returned no text')
  return text.slice(0, 400)
}

function sendJson(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

// Once the site is public, anyone could call /api/insight. This caps each visitor at
// 30 insights per 10 minutes so a stranger cannot use up our Gemini quota.
const LIMIT = 30
const WINDOW_MS = 10 * 60 * 1000

function createRateLimiter() {
  let windowStart = Date.now()
  let counts = new Map()
  return function overLimit(req) {
    if (Date.now() - windowStart > WINDOW_MS) {
      windowStart = Date.now()
      counts = new Map()
    }
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim()
    const count = (counts.get(ip) || 0) + 1
    counts.set(ip, count)
    return count > LIMIT
  }
}

// Handles POST /api/insight. Used by the Vite plugin below and by server/index.js.
// env holds GEMINI_API_KEY (and optionally GEMINI_MODEL).
export function createInsightHandler(env) {
  const apiKey = env.GEMINI_API_KEY
  const model = env.GEMINI_MODEL || DEFAULT_MODEL
  const overLimit = createRateLimiter()

  return async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST' })
    if (!apiKey) return sendJson(res, 503, { error: 'GEMINI_API_KEY is not set' })
    if (overLimit(req)) return sendJson(res, 429, { error: 'Too many requests, try again later' })

    try {
      const body = await readJson(req)
      const facts = {
        interests: cleanList(body.sharedInterests, 10),
        courses: cleanList(body.sharedCourses, 10),
        slots: cleanSlots(body.sharedSlots),
      }
      const text = await askGemini(apiKey, model, buildPrompt(facts))
      sendJson(res, 200, { text, model })
    } catch (err) {
      // The details go to the server log only, not to visitors.
      console.warn('[insight-api]', err.message)
      sendJson(res, 502, { error: 'AI insight is unavailable right now' })
    }
  }
}

// Adds /api/insight to `npm run dev` and `npm run preview`.
// env comes from Vite's loadEnv, which reads .env.local.
export function insightApi(env) {
  const handler = createInsightHandler(env)
  return {
    name: 'insight-api',
    configureServer(server) {
      server.middlewares.use('/api/insight', handler)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/insight', handler)
    },
  }
}
