// insight.js
// Owner: Person 4 (Back-End B). Written by Claude.
//
// IMPORTANT: This is a TEMPLATE insight generator. It is NOT a live AI model.
// It turns the match facts into a friendly sentence using fixed templates.
// The UI labels it "Template insight" so we never claim it is live AI.
//
// Later, a live AI call can replace buildTemplateInsight() but must send only:
// shared interests, shared courses, and shared free slots. No names, no contact info.

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

  if (event) {
    text += ` You could go to "${event.title}" together.`
  }

  return { text, source: 'template', label: 'Template insight' }
}
