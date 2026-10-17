// Events.jsx - Owner: Person 2. Campus events sorted by how well they fit you.
import { useState } from 'react'
import events from '../data/events.json'
import { recommendEvents } from '../lib/matching.js'

export default function Events({ me }) {
  const [going, setGoing] = useState([])
  const ranked = recommendEvents(me, events)

  function toggle(id) {
    setGoing((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]))
  }

  return (
    <div>
      <h2>Events for you</h2>
      <div className="muted">Sample campus events (mock data). Matches your interests and free time.</div>
      <div className="grid" style={{ marginTop: 18 }}>
        {ranked.map(({ event, sharedTags, isFree }) => (
          <div className="card" key={event.id}>
            <h3>{event.title}</h3>
            <div className="muted">{event.date} · {event.slot} · {event.location}</div>
            <div className="tags">
              {sharedTags.map((t) => <span key={t} className="tag shared">{t}</span>)}
              {isFree && <span className="tag course">You are free</span>}
            </div>
            <p><button className={'btn' + (going.includes(event.id) ? ' alt' : '')} onClick={() => toggle(event.id)}>
              {going.includes(event.id) ? "I'm going ✓" : 'Count me in'}
            </button></p>
          </div>
        ))}
      </div>
    </div>
  )
}
