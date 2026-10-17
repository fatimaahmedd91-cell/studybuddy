// Sidebar.jsx - Owner: Person 1. Matches the sidebar in the sketch.
const ITEMS = [
  { id: 'profile', label: 'Profile', icon: '🙂' },
  { id: 'feed', label: 'Feed', icon: '✨' },
  { id: 'group', label: 'Group', icon: '👥' },
  { id: 'screentime', label: 'Screen Time', icon: '⏱️' },
  { id: 'events', label: 'Events', icon: '📅' },
  { id: 'friends', label: 'Friends', icon: '💬' },
]

export default function Sidebar({ page, setPage }) {
  return (
    <nav className="sidebar">
      <div className="logo">Friend<span>Finder</span></div>
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={'nav-item' + (page === item.id ? ' active' : '')}
          onClick={() => setPage(item.id)}
        >
          <span>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </nav>
  )
}
