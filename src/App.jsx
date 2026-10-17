// App.jsx - Owner: Person 2. Connects the pages together.
import { useState } from 'react'
import students from './data/students.json'
import Sidebar from './components/Sidebar.jsx'
import Landing from './pages/Landing.jsx'
import Feed from './pages/Feed.jsx'
import Profile from './pages/Profile.jsx'
import Events from './pages/Events.jsx'
import ScreenTime from './pages/ScreenTime.jsx'
import Placeholder from './pages/Placeholder.jsx'

export default function App() {
  const [started, setStarted] = useState(false)
  const [page, setPage] = useState('feed')
  const [meId, setMeId] = useState(1)
  const [edits, setEdits] = useState({})

  const base = students.find((s) => s.id === meId)
  const me = { ...base, ...(edits[meId] || {}) }
  const updateMe = (changes) => setEdits({ ...edits, [meId]: { ...(edits[meId] || {}), ...changes } })

  if (!started) return <Landing onStart={() => setStarted(true)} />

  return (
    <div className="shell">
      <Sidebar page={page} setPage={setPage} />
      <div className="main">
        <div className="topbar">
          <label style={{ margin: 0, fontWeight: 500 }}>
            Demo as:{' '}
            <select value={meId} onChange={(e) => setMeId(Number(e.target.value))}>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
          <div className="top-actions">
            <button className="round-btn" title="New post">＋</button>
            <button className="round-btn" title="Notifications">🔔</button>
          </div>
        </div>
        <div className="content">
          {page === 'feed' && <Feed key={meId} me={me} />}
          {page === 'profile' && <Profile key={meId} me={me} updateMe={updateMe} />}
          {page === 'events' && <Events key={meId} me={me} />}
          {page === 'screentime' && <ScreenTime />}
          {page === 'group' && <Placeholder title="Groups" text="Study groups are planned for a future version." />}
          {page === 'friends' && <Placeholder title="Friends" text="Your friend list and chat are planned for a future version." />}
        </div>
      </div>
    </div>
  )
}
