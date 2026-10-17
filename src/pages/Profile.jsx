// Profile.jsx - Owner: Person 2. Shows the profile layout from the sketch and lets you edit the hook.
import { useState } from 'react'
import Timetable from '../components/Timetable.jsx'

export default function Profile({ me, updateMe }) {
  const [hook, setHook] = useState(me.hook)
  const [saved, setSaved] = useState(false)

  function save() {
    updateMe({ hook })
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div>
      <div className="card">
        <div className="profile-hero">
          <div className="avatar big" style={{ background: me.color + '33' }}>{me.avatar}</div>
          <div>
            <h2>{me.name}</h2>
            <div className="muted">{me.pronouns} · {me.age} · {me.uni}</div>
            <div className="muted" style={{ marginTop: 6 }}>Looking for: {me.lookingFor}</div>
            <div className="tags">
              {me.courses.map((c) => <span key={c} className="tag course">{c}</span>)}
              {me.interests.map((i) => <span key={i} className="tag">{i}</span>)}
            </div>
          </div>
        </div>
        <label htmlFor="hook">Your hook</label>
        <textarea id="hook" rows={2} value={hook} onChange={(e) => setHook(e.target.value)} />
        <p><button className="btn" onClick={save}>{saved ? 'Saved ✓' : 'Save hook'}</button></p>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h3>Your weekly availability</h3>
        <Timetable mine={me} />
      </div>
    </div>
  )
}
