// matching.js
// Owner: Person 4 (Back-End B). Written by Claude.
// This file decides how well two students match. It uses simple, visible rules:
//   - shared interests  (up to 40 points)
//   - shared courses    (up to 35 points)
//   - overlapping free time (up to 25 points)
// Total score is 0 to 100. There is no AI here, only plain math.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
export const SLOTS = ['morning', 'afternoon', 'evening']

// Returns items that appear in both lists.
function overlap(listA, listB) {
  return listA.filter((item) => listB.includes(item))
}

// Returns a list like [{ day: 'Tue', slot: 'afternoon' }, ...] of shared free times.
export function sharedFreeTime(studentA, studentB) {
  const shared = []
  for (const day of DAYS) {
    const a = studentA.free[day] || []
    const b = studentB.free[day] || []
    for (const slot of overlap(a, b)) {
      shared.push({ day, slot })
    }
  }
  return shared
}

// Scores one pair of students. Returns the score and the reasons behind it.
export function scoreMatch(me, other) {
  const sharedInterests = overlap(me.interests, other.interests)
  const sharedCourses = overlap(me.courses, other.courses)
  const sharedSlots = sharedFreeTime(me, other)

  const interestScore = Math.min(sharedInterests.length, 4) * 10 // max 40
  const courseScore = Math.min(sharedCourses.length, 3) * 11.67 // max about 35
  const timeScore = Math.min(sharedSlots.length, 5) * 5 // max 25

  const score = Math.round(interestScore + courseScore + timeScore)

  return {
    student: other,
    score,
    sharedInterests,
    sharedCourses,
    sharedSlots,
  }
}

// Ranks every other student for the chosen student, best match first.
// mode: 'all' | 'study' | 'friends'
export function findMatches(me, allStudents, mode = 'all') {
  let pool = allStudents.filter((s) => s.id !== me.id)

  if (mode === 'study') {
    // Study buddies must share at least one course.
    pool = pool.filter((s) => overlap(me.courses, s.courses).length > 0)
  }
  if (mode === 'friends') {
    // Friends must share at least one interest.
    pool = pool.filter((s) => overlap(me.interests, s.interests).length > 0)
  }

  return pool.map((s) => scoreMatch(me, s)).sort((a, b) => b.score - a.score)
}

// Finds events that match a student's interests and free time.
export function recommendEvents(me, events) {
  return events
    .map((event) => {
      const sharedTags = overlap(me.interests, event.tags)
      const isFree = (me.free[event.day] || []).includes(event.slot)
      return { event, sharedTags, isFree, score: sharedTags.length * 2 + (isFree ? 3 : 0) }
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
}
