// Feed.jsx - Owner: Person 2. The main FriendFinder flow:
// pick a filter, see ranked matches, click one to see the insight and shared free time.
import { useState } from 'react'
import students from '../data/students.json'
import events from '../data/events.json'
import { findMatches, recommendEvents } from '../lib/matching.js'
import MatchCard from '../components/MatchCard.jsx'
import InsightPanel from '../components/InsightPanel.jsx'
import Timetable from '../components/Timetable.jsx'

export default function Feed({ me }) {
  const [mode, setMode] = useState('all')
  const [selected, setSelected] = useState(null)
  const matches = findMatches(me, students, mode)

  if (selected) {
    const s = selected.student
    const suggested = recommendEvents(s, events).find((e) => e.isFree && selected.sharedInterests.some((i) => e.event.tags.includes(i)))
    return (
      <div>
        <button className="tab" onClick={() => setSelected(null)}>← Back to feed</button>
        <div className="card" style={{ marginTop: 16 }}>
          <div className="profile-hero">
            <div className="avatar big" style={{ background: s.color + '33' }}>{s.avatar}</div>
            <div>
              <h2>{s.name} <span className="muted">· {s.pronouns} · {s.age}</span></h2>
              <div className="muted">{s.uni}</div>
              <p>"{s.hook}"</p>
              <div className="muted">Looking for: {s.lookingFor}</div>
              <div className="tags">{s.interests.map((i) => <span key={i} className={'tag' + (selected.sharedInterests.includes(i) ? ' shared' : '')}>{i}</span>)}</div>
            </div>
            <div className="score" style={{ fontSize: 32 }}>{selected.score}%<small>match</small></div>
          </div>
          <InsightPanel match={selected} event={suggested ? suggested.event : null} />
        </div>
        <div className="card" style={{ marginTop: 18 }}>
          <h3>Your shared free time</h3>
          <p className="muted">Green squares are times you are both free.</p>
          <Timetable mine={me} other={s} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2>Your matches</h2>
      <div className="muted">Ranked by shared interests, courses, and free time.</div>
      <div className="tabs">
        {[['all', 'Everyone'], ['study', 'Study buddies'], ['friends', 'Friends']].map(([id, label]) => (
          <button key={id} className={'tab' + (mode === id ? ' active' : '')} onClick={() => setMode(id)}>{label}</button>
        ))}
      </div>
      <div className="grid">
        {matches.map((m) => <MatchCard key={m.student.id} match={m} onOpen={setSelected} />)}
      </div>
    </div>
  )
}
