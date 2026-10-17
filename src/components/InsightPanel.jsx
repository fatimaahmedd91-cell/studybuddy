// InsightPanel.jsx - Owner: Person 1 (look) and Person 4 (text logic).
// Shows the "why you match" explanation and labels honestly that it is a template.
import { buildTemplateInsight } from '../lib/insight.js'

export default function InsightPanel({ match, event }) {
  const insight = buildTemplateInsight(match, event)
  return (
    <div className="insight">
      <h3>
        ✨ Match Insight <span className="badge">{insight.label}</span>
      </h3>
      <p style={{ margin: '8px 0 0' }}>{insight.text}</p>
    </div>
  )
}
