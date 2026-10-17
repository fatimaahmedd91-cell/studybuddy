// How well two students match. Simple, visible rules, no AI:
//   shared interests  up to 40 points
//   shared courses    up to 35 points
//   shared free time  up to 25 points
// Total score is 0 to 100.
import { DAYS, type Day, type Slot, type Student } from "./data";

export type SharedSlot = { day: Day; slot: Slot };

export type Match = {
  student: Student;
  score: number;
  sharedInterests: string[];
  sharedCourses: string[];
  sharedSlots: SharedSlot[];
};

function overlap(a: string[], b: string[]) {
  return a.filter((item) => b.includes(item));
}

export function sharedFreeTime(a: Student, b: Student): SharedSlot[] {
  const shared: SharedSlot[] = [];
  for (const day of DAYS) {
    for (const slot of a.free[day] ?? []) {
      if ((b.free[day] ?? []).includes(slot)) shared.push({ day, slot });
    }
  }
  return shared;
}

export function scoreMatch(me: Student, other: Student): Match {
  const sharedInterests = overlap(me.interests, other.interests);
  const sharedCourses = overlap(me.courses, other.courses);
  const sharedSlots = sharedFreeTime(me, other);

  const interestScore = Math.min(sharedInterests.length, 4) * 10;
  const courseScore = Math.min(sharedCourses.length, 3) * 11.67;
  const timeScore = Math.min(sharedSlots.length, 5) * 5;

  return {
    student: other,
    score: Math.round(interestScore + courseScore + timeScore),
    sharedInterests,
    sharedCourses,
    sharedSlots,
  };
}

// Everyone else, best match first.
export function rankMatches(me: Student, everyone: Student[]) {
  return everyone
    .filter((s) => s.id !== me.id)
    .map((s) => scoreMatch(me, s))
    .sort((a, b) => b.score - a.score);
}

// A student's "friends" in the demo are the people they match at least 40% with.
export function friendsOf(student: Student, everyone: Student[]) {
  return rankMatches(student, everyone).filter((m) => m.score >= 40);
}
