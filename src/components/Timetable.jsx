// Timetable.jsx - Owner: Person 2. Weekly grid of free time.
// Pass "mine" always. Pass "other" to highlight shared free time in green.
import { DAYS, SLOTS } from '../lib/matching.js'

export default function Timetable({ mine, other }) {
  return (
    <table className="timetable">
      <thead>
        <tr>
          <th></th>
          {DAYS.map((d) => <th key={d}>{d}</th>)}
        </tr>
      </thead>
      <tbody>
        {SLOTS.map((slot) => (
          <tr key={slot}>
            <th>{slot}</th>
            {DAYS.map((day) => {
              const m = (mine.free[day] || []).includes(slot)
              const o = other ? (other.free[day] || []).includes(slot) : false
              let cls = 'cell'
              let text = ''
              if (m && o) { cls += ' both'; text = 'Both free' }
              else if (m) { cls += ' mine'; text = other ? 'You' : 'Free' }
              else if (o) { cls += ' theirs'; text = 'Them' }
              return <td key={day} className={cls}>{text}</td>
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
