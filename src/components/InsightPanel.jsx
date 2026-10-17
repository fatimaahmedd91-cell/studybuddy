// InsightPanel.jsx - Owner: Person 1 (look) and Person 4 (text logic).
// Shows the "why you match" explanation. Asks Gemini first, and falls back to the
// template if the AI is not available. The badge always says which one you are seeing.
import { useEffect, useState } from 'react'
import { buildTemplateInsight, fetchAiInsight } from '../lib/insight.js'

export default function InsightPanel({ match, event }) {
  const [aiInsight, setAiInsight] = useState(null)
  const [status, setStatus] = useState('loading') // 'loading' | 'ai' | 'template'

  useEffect(() => {
    let cancelled = false
    fetchAiInsight(match, event)
      .then((result) => {
        if (cancelled) return
        setAiInsight(result)
        setStatus('ai')
      })
      .catch((err) => {
        console.info('Using template insight:', err.message)
        if (!cancelled) setStatus('template')
      })
    return () => {
      cancelled = true
    }
  }, [match, event])

  if (status === 'loading') {
    return (
      <div className="insight">
        <h3>
          ✨ Match Insight <span className="badge">Asking Gemini…</span>
        </h3>
        <p className="muted" style={{ margin: '8px 0 0' }}>Working out why you two might get along…</p>
      </div>
    )
  }

  const insight = status === 'ai' ? aiInsight : buildTemplateInsight(match, event)
  return (
    <div className="insight">
      <h3>
        ✨ Match Insight <span className="badge">{insight.label}</span>
      </h3>
      <p style={{ margin: '8px 0 0' }}>{insight.text}</p>
    </div>
  )
}
