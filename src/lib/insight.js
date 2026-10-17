// insight.js
// Owner: Person 4 (Back-End B). Written by Claude.
//
// Two ways to explain a match:
//   - fetchAiInsight() asks Google Gemini (through server/insightApi.js) to write the sentence.
//     It sends only shared interests, shared courses, and shared free slots. No names, no contact info.
//   - buildTemplateInsight() uses fixed templates. It is the fallback when the AI is not
//     available (no API key, no internet, or an error).
// The UI labels each one honestly: "AI insight · Gemini" or "Template insight".

function joinList(items) {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export function buildTemplateInsight(match, event) {
  const parts = []

  if (match.sharedCourses.length > 0) {
    parts.push(`you are both taking ${joinList(match.sharedCourses)}`)
  }
  if (match.sharedInterests.length > 0) {
    parts.push(`you both enjoy ${joinList(match.sharedInterests.map((i) => i.toLowerCase()))}`)
  }
  if (match.sharedSlots.length > 0) {
    const first = match.sharedSlots[0]
    parts.push(`you are both free on ${first.day} ${first.slot}s`)
  }

  let text
  if (parts.length === 0) {
    text = 'You do not share much on paper, but a new perspective can make a great study partner.'
  } else {
    text = `You might get along because ${joinList(parts)}.`
  }

  return { text: text + eventSuggestion(event), source: 'template', label: 'Template insight' }
}

// The event is added here in the browser, so the AI never needs to see it.
function eventSuggestion(event) {
  return event ? ` You could go to "${event.title}" together.` : ''
}

// Remembers answers so reopening the same match does not call the AI again.
const aiCache = new Map()

async function requestAiText(facts) {
  const res = await fetch('/api/insight', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(facts),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data.text) throw new Error(data.error || `Insight request failed (${res.status})`)
  return data.text
}

export async function fetchAiInsight(match, event) {
  // Only these three facts leave the browser.
  const facts = {
    sharedInterests: match.sharedInterests,
    sharedCourses: match.sharedCourses,
    sharedSlots: match.sharedSlots,
  }
  const cacheKey = JSON.stringify(facts)
  if (!aiCache.has(cacheKey)) {
    const request = requestAiText(facts)
    // Forget failed requests so the next click can try again.
    request.catch(() => aiCache.delete(cacheKey))
    aiCache.set(cacheKey, request)
  }
  const text = await aiCache.get(cacheKey)
  return { text: text + eventSuggestion(event), source: 'ai', label: 'AI insight · Gemini' }
}
