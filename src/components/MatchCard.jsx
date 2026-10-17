// MatchCard.jsx - Owner: Person 1. One student in the Feed.
export default function MatchCard({ match, onOpen }) {
  const s = match.student
  return (
    <div className="card clickable" onClick={() => onOpen(match)}>
      <div className="card-head">
        <div className="avatar" style={{ background: s.color + '33' }}>{s.avatar}</div>
        <div>
          <h3>{s.name}</h3>
          <div className="muted">{s.pronouns} · {s.age} · {s.uni}</div>
        </div>
        <div className="score">
          {match.score}%<small>match</small>
        </div>
      </div>
      <div className="bar"><div style={{ width: match.score + '%' }} /></div>
      <div className="muted">"{s.hook}"</div>
      <div className="tags">
        {match.sharedCourses.map((c) => <span key={c} className="tag course">{c}</span>)}
        {match.sharedInterests.map((i) => <span key={i} className="tag shared">{i}</span>)}
      </div>
    </div>
  )
}
