// ScreenTime.jsx - Owner: Person 2. A simple focus timer plus a log of sessions (saved in the browser).
import { useEffect, useState } from 'react'

function load() {
  try { return JSON.parse(localStorage.getItem('focusLog') || '[]') } catch { return [] }
}

export default function ScreenTime() {
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [log, setLog] = useState(load)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  function finish() {
    if (seconds > 0) {
      const next = [{ seconds, at: new Date().toLocaleString() }, ...log].slice(0, 10)
      setLog(next)
      try { localStorage.setItem('focusLog', JSON.stringify(next)) } catch { /* ignore */ }
    }
    setRunning(false)
    setSeconds(0)
  }

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0')
  const ss = String(seconds % 60).padStart(2, '0')
  const total = Math.round(log.reduce((a, l) => a + l.seconds, 0) / 60)

  return (
    <div>
      <h2>Focus time</h2>
      <div className="muted">Track focused study time. Your own data stays in your browser.</div>
      <div className="card" style={{ marginTop: 18, maxWidth: 480 }}>
        <div className="timer-face">{mm}:{ss}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn" onClick={() => setRunning(!running)}>{running ? 'Pause' : 'Start'}</button>
          <button className="btn alt" onClick={finish}>Finish session</button>
        </div>
      </div>
      <div className="card" style={{ marginTop: 18, maxWidth: 480 }}>
        <h3>Recent sessions · {total} min total</h3>
        {log.length === 0 && <div className="muted">No sessions yet.</div>}
        {log.map((l, i) => (
          <div key={i} className="muted">{l.at}: {Math.round(l.seconds / 60) || '<1'} min</div>
        ))}
      </div>
    </div>
  )
}
