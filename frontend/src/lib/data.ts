// Demo data for the site. Students and events come from the JSON files in src/data.
// Posts, study groups, chats, and screen time are generated here so every page has content.
// None of this is stored in the database yet; only accounts are (see backend/app/auth.py).
import eventsJson from "@/data/events.json";
import studentsJson from "@/data/students.json";

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
export const SLOTS = ["morning", "afternoon", "evening"] as const;
export type Day = (typeof DAYS)[number];
export type Slot = (typeof SLOTS)[number];

export type Student = {
  id: number;
  name: string;
  pronouns: string;
  age: number;
  uni: string;
  avatar: string;
  color: string;
  hook: string;
  lookingFor: string;
  courses: string[];
  interests: string[];
  free: Partial<Record<Day, Slot[]>>;
};

export type CampusEvent = {
  id: number;
  title: string;
  category: string;
  day: Day;
  slot: Slot;
  date: string; // like "Tue, Oct 20"
  location: string;
  tags: string[];
};

export type Post = { id: string; authorId: number; emoji: string; caption: string };

export type StudyGroup = {
  id: number;
  course: string;
  day: Day;
  time: string;
  location: string;
  seats: number;
  taken: number;
};

export const students = studentsJson as Student[];
export const events = eventsJson as CampusEvent[];

export function getStudent(id: number) {
  return students.find((s) => s.id === id) ?? students[0];
}

// "Amira Khan" -> "amira_khan"
export function handle(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// Four post ideas per interest. Each student gets two of them (which two depends on their id),
// so people who share an interest still post different things.
const POST_IDEAS: Record<string, [string, string][]> = {
  Coding: [["💻", "Finally fixed my linked list bug"], ["🐛", "3am debugging session, send help"], ["🤖", "Built a tiny Discord bot this weekend"], ["⌨️", "New keyboard, who dis"]],
  Cafes: [["🧋", "Best bubble tea near campus?"], ["☕", "Found a quiet café to study in"], ["🥐", "Croissant + midterm review = balance"], ["🍵", "Matcha latte ranking, round 2"]],
  Anime: [["🍜", "Rewatching my comfort anime"], ["🎌", "Who's going to the anime club?"], ["📺", "This season's openings are elite"], ["🗡️", "Cosplay progress check"]],
  Badminton: [["🏸", "Won my first rally today"], ["👟", "Badminton drop-in was packed"], ["🥇", "Doubles partner wanted!"], ["🎯", "Working on my smash"]],
  Gaming: [["🎮", "Late night co-op with the squad"], ["🕹️", "Retro game night was a hit"], ["🏆", "Finally hit a new rank"], ["🎲", "Board games > video games? Discuss"]],
  Basketball: [["🏀", "Pickup game at the Pan Am centre"], ["⛹️", "Working on my free throws"], ["🔥", "3-on-3 win streak continues"], ["👟", "New court shoes day"]],
  Reading: [["📚", "Library haul for the weekend"], ["📖", "Can't put this book down"], ["🔖", "Book club pick for November?"], ["🕯️", "Cozy reading corner unlocked"]],
  Art: [["🎨", "Sketchbook page of the week"], ["🖌️", "Tried watercolours for the first time"], ["🖍️", "Doodles from a long lecture"], ["🖼️", "Gallery visit this weekend"]],
  Yoga: [["🧘", "Sunrise yoga on the quad"], ["🌿", "Stretch break between lectures"], ["🫖", "Post-yoga tea ritual"], ["🌞", "Finally held crow pose"]],
  Music: [["🎸", "Open mic practice"], ["🎧", "My study playlist this week"], ["🎹", "Learning a new song on piano"], ["🎤", "Karaoke night recap"]],
  Travel: [["✈️", "Planning a reading-week trip"], ["🗺️", "Throwback to last summer"], ["🧳", "Packing light challenge"], ["🏔️", "Bucket list: Banff"]],
  Photography: [["📷", "Golden hour on campus"], ["🌇", "Highland Creek trail shots"], ["🎞️", "Shooting on film this month"], ["🌧️", "Rainy day reflections"]],
  Fitness: [["💪", "New personal best at the gym"], ["🏃", "Morning run done"], ["🥗", "Meal prep Sunday"], ["🚴", "Biked to campus today"]],
  Chess: [["♟️", "Chess club puzzle of the day"], ["🧠", "Finally beat my roommate"], ["⏱️", "Blitz tournament on Friday"], ["👑", "Learning a new opening"]],
  Hiking: [["🥾", "Trail walk between classes"], ["🍂", "Fall colours are unreal"], ["🌲", "Rouge Park this Saturday?"], ["⛰️", "Sunrise hike, worth it"]],
};

export function seedPosts(student: Student): Post[] {
  return student.interests.flatMap((interest, i) => {
    const ideas = POST_IDEAS[interest] ?? [];
    const picks = [0, 1].map((k) => ideas[(student.id * 3 + i + k) % ideas.length]).filter(Boolean);
    return picks.map(([emoji, caption], j) => ({
      id: `seed-${student.id}-${i}-${j}`,
      authorId: student.id,
      emoji,
      caption,
    }));
  });
}

export const studyGroups: StudyGroup[] = [
  { id: 1, course: "CSCA08", day: "Mon", time: "4:00 PM", location: "Library, Group Room 2", seats: 6, taken: 4 },
  { id: 2, course: "CSCA48", day: "Tue", time: "2:00 PM", location: "Science Wing, SW143", seats: 8, taken: 5 },
  { id: 3, course: "MATA31", day: "Wed", time: "10:00 AM", location: "Instructional Centre, IC220", seats: 5, taken: 5 },
  { id: 4, course: "MATA22", day: "Thu", time: "3:00 PM", location: "Library, Group Room 4", seats: 6, taken: 2 },
  { id: 5, course: "CSCA67", day: "Thu", time: "6:00 PM", location: "Online (Discord)", seats: 10, taken: 7 },
  { id: 6, course: "STAB22", day: "Fri", time: "1:00 PM", location: "Humanities Wing, HW216", seats: 6, taken: 3 },
  { id: 7, course: "PSYA01", day: "Mon", time: "6:00 PM", location: "Student Centre Lounge", seats: 8, taken: 6 },
  { id: 8, course: "BIOA01", day: "Wed", time: "3:00 PM", location: "Science Wing, SW309", seats: 6, taken: 1 },
];

export const PAST_WINNERS = [
  { week: "Oct 5", studentId: 9, hours: 11 },
  { week: "Sep 28", studentId: 3, hours: 12 },
  { week: "Sep 21", studentId: 5, hours: 14 },
  { week: "Sep 14", studentId: 9, hours: 10 },
  { week: "Sep 7", studentId: 11, hours: 15 },
];

// Made-up but stable screen time numbers, so the demo looks the same every time.
export function screenMinutesToday(studentId: number) {
  return 45 + ((studentId * 37) % 110);
}

export function screenHoursLastWeek(studentId: number) {
  return 9 + ((studentId * 13) % 14);
}

// Events are in October 2026 (Oct 20, 2026 is a Tuesday, matching the data).
export const EVENT_YEAR = 2026;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "Tue, Oct 20" -> Date
export function parseEventDate(text: string) {
  const [, monthDay] = text.split(", ");
  const [month, day] = monthDay.split(" ");
  return new Date(EVENT_YEAR, MONTHS.indexOf(month), Number(day));
}

export function formatDate(date: Date) {
  const weekday = date.toLocaleDateString("en-CA", { weekday: "short" });
  return `${weekday}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
