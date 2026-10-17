// Landing.jsx - Owner: Person 1. The first screen judges see.
export default function Landing({ onStart }) {
  return (
    <div className="landing">
      <div>
        <div className="floaters">🦊 🐻 🦉 🐼 🦋</div>
        <h1>Find your people<br />on campus.</h1>
        <p>FriendFinder matches university students with study buddies, friends, and events using shared courses, interests, and free time.</p>
        <button className="btn" onClick={onStart}>Find my match</button>
      </div>
    </div>
  )
}
