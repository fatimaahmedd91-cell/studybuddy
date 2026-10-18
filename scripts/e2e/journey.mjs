// End-to-end browser test: two new users (A and B) go through the whole app, plus demo mode
// and phone-sized screens. Prints PASS or FAIL for each step.
//
// Needs the app running (backend + website) and Playwright:
//   npm install --no-save playwright && npx playwright install chromium
//   node scripts/e2e/journey.mjs                       # tests http://localhost:3000
//   BASE_URL=https://your-domain.com node scripts/e2e/journey.mjs
// Set EXPECT_GEMINI=1 to require a real Gemini note (needs GEMINI_API_KEY on the server).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = createRequire(`${process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools/node_modules"}/`)("playwright");
}

const BASE = (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EXPECT_GEMINI = process.env.EXPECT_GEMINI === "1";
const run = Date.now().toString(36);
const A = { name: `Avery Test ${run}`, email: `avery-${run}@example.com`, password: "avery-password-1" };
const B = { name: `Blake Test ${run}`, email: `blake-${run}@example.com`, password: "blake-password-1" };
const results = [];
const pageErrors = [];

async function check(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push(false);
    console.log(`FAIL  ${name}\n      ${String(err.message).split("\n")[0]}`);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

const browser = await playwright.chromium.launch();
async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport, timezoneId: "America/Toronto", locale: "en-CA" });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (e) => pageErrors.push(e.message));
  return page;
}

// The Terms gate: demo visitors (and anyone after a Terms change) tick the 18+/Terms box first.
async function acceptTerms(page) {
  await page.getByRole("heading", { name: /Before you continue|Our Terms have changed/ }).waitFor();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Accept and continue" }).click();
}

async function startDemo(page) {
  await page.goto(BASE);
  await page.getByRole("button", { name: "Try the demo" }).click();
  await acceptTerms(page);
  await page.waitForURL(`${BASE}/feed`);
}

async function signUp(page, person) {
  await page.goto(`${BASE}/signup`);
  await page.getByLabel("Display name").fill(person.name);
  await page.getByLabel("Email").fill(person.email);
  await page.getByLabel("Password").fill(person.password);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Sign up" }).click();
  await page.waitForURL(`${BASE}/onboarding`);
}

async function onboard(page, { interests, goal, slots }) {
  await page.getByLabel("University or college").fill("UofT Scarborough");
  await page.getByLabel("Your hook").fill("Here for study sessions and snacks.");
  for (const interest of interests) {
    await page.getByLabel("Interests", { exact: true }).fill(interest);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await page.getByRole("button", { name: goal }).click();
  for (const slot of slots) await page.getByRole("button", { name: `${slot}: busy` }).click();
  await page.getByRole("button", { name: "Finish and find friends" }).click();
  await page.waitForURL(`${BASE}/feed`);
}

const pa = await newPage();
const pb = await newPage();

// ---------- 1. Onboarding ----------
await check("1. New user A signs up and lands on onboarding", () => signUp(pa, A));
await check("11a. Onboarding explains missing fields", async () => {
  await pa.getByRole("button", { name: "Finish and find friends" }).click();
  await pa.getByText("Add at least one interest.").waitFor();
  await pa.getByText("Add your university or college.").waitFor();
});
await check("1b. A completes onboarding and reaches Discover", () =>
  onboard(pa, { interests: ["Coding", "Chess"], goal: "Study buddy", slots: ["Tue afternoon", "Thu evening"] }));
await check("1c. B signs up and completes onboarding", async () => {
  await signUp(pb, B);
  await onboard(pb, { interests: ["Coding", "Hiking"], goal: "Study buddy", slots: ["Tue afternoon"] });
});

// ---------- 2. Profile edits survive a refresh ----------
await check("2. Profile edit is saved and survives a refresh", async () => {
  await pa.goto(`${BASE}/profile`);
  await pa.getByRole("button", { name: "Edit Profile" }).click();
  await pa.getByLabel("Your hook").fill("Edited hook that should stay");
  await pa.getByLabel("Pronouns (optional)").fill("they/them");
  await pa.getByRole("button", { name: "Save", exact: true }).click();
  await pa.getByText("Profile saved.").waitFor();
  await pa.reload();
  await pa.getByText("Edited hook that should stay").first().waitFor();
  await pa.getByText("they/them").first().waitFor();
});

await check("2b. Photo upload shows the photo", async () => {
  await pa.getByRole("button", { name: "Edit Profile" }).click();
  // A 2x2 red PNG; the browser converts it to JPEG before upload.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyAAAAABJRU5ErkJggg==", "base64");
  await pa.locator('input[type="file"]').setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await pa.getByText("Photo uploaded.").waitFor();
  await pa.getByRole("button", { name: "Cancel" }).click();
  await pa.getByAltText(`${A.name}'s profile photo`).first().waitFor();
});

await check("2c. Expressive view shows the same profile", async () => {
  await pa.getByRole("button", { name: "Expressive view" }).click();
  await pa.getByText("Edited hook that should stay").first().waitFor();
  await pa.getByRole("button", { name: "Info view" }).click();
});

// ---------- 3. Discover and filters ----------
await check("3. Discover lists people with match reasons", async () => {
  await pa.goto(`${BASE}/feed`);
  await pa.getByText(/\d+ (people|person), best match first/).waitFor();
  await pa.getByText("You both like Coding").first().waitFor();
});
await check("3b. Filters change the results", async () => {
  await pa.getByLabel("Name").fill(B.name);
  await pa.getByRole("heading", { name: "Discover" }).waitFor();
  await pa.locator("article", { hasText: B.name }).waitFor();
  await pa.getByLabel("Interest").selectOption("Chess");
  await pa.getByText("Nobody matches these filters").waitFor(); // B doesn't like chess
  await pa.getByRole("button", { name: "Clear filters" }).click();
  await pa.getByLabel("Name").fill(B.name);
  await pa.locator("article", { hasText: B.name }).waitFor();
});

// ---------- 4/5. Friend request and acceptance ----------
await check("4. A sends B a friend request", async () => {
  const card = pa.locator("article", { hasText: B.name });
  await card.getByRole("button", { name: "Add friend" }).click();
  await card.getByText("Request sent").waitFor();
});
await check("8a. B's bell shows the request", async () => {
  await pb.goto(`${BASE}/feed`);
  await pb.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
  await pb.getByText(`${A.name} sent you a friend request`).waitFor();
  await pb.keyboard.press("Escape");
});
await check("5. B accepts and both see the friendship", async () => {
  await pb.goto(`${BASE}/friends`);
  await pb.getByRole("button", { name: "Accept" }).click();
  await pb.getByRole("heading", { name: "Your friends (1)" }).waitFor();
  await pa.goto(`${BASE}/friends`);
  await pa.getByRole("heading", { name: "Your friends (1)" }).waitFor();
  await pa.getByText(B.name).first().waitFor();
});

// ---------- Messages ----------
await check("5b. Friends can message each other", async () => {
  await pa.getByRole("link", { name: "Message", exact: true }).first().click();
  await pa.getByLabel(`Message ${B.name}`).fill("Hi B! Library on Tuesday?");
  await pa.getByRole("button", { name: "Send" }).click();
  await pa.getByText("Hi B! Library on Tuesday?").waitFor();
  await pb.goto(`${BASE}/messages`);
  await pb.getByRole("button", { name: new RegExp(A.name) }).click();
  await pb.getByText("Hi B! Library on Tuesday?").waitFor();
});

// ---------- Memories ----------
await check("Memories: A shares a friends-only memory and B (a friend) sees it", async () => {
  await pa.goto(`${BASE}/memories`);
  await pa.getByLabel("Caption").fill(`Library day ${run}`);
  expect((await pa.getByLabel("Who can see this?").inputValue()) === "friends", "memories aren't friends-only by default");
  await pa.getByRole("button", { name: "Post memory" }).click();
  await pa.getByText("Posted.").waitFor();
  await pb.goto(`${BASE}/memories`);
  await pb.getByText(`Library day ${run}`).waitFor();
});

// ---------- Planning ----------
await check("Plan: B adds a private class, A finds free times with B without seeing it", async () => {
  await pb.goto(`${BASE}/plan?tab=schedule`);
  await pb.getByRole("heading", { name: "My private schedule" }).waitFor();
  await pb.getByRole("button", { name: "+ Add" }).click();
  const dialog = pb.getByRole("dialog");
  await dialog.getByLabel("Name").fill(`Secret lecture ${run}`);
  await dialog.getByLabel("Day").selectOption({ label: "Tuesday" });
  await dialog.getByLabel("Starts").fill("10:00");
  await dialog.getByLabel("Ends").fill("11:00");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await pb.getByText(`Secret lecture ${run}`).waitFor();

  await pa.goto(`${BASE}/plan`);
  await pa.getByRole("checkbox", { name: new RegExp(B.name) }).check();
  await pa.getByRole("button", { name: "Find times" }).click();
  await pa.getByRole("heading", { name: "Times that work for everyone" }).waitFor();
  await pa.getByText(/Public times only|Included|Not shared/).first().waitFor();
  expect(!(await pa.content()).includes(`Secret lecture ${run}`), "A can see B's private commitment");
});

// ---------- 9. Gemini ----------
await check(`9. Match note appears${EXPECT_GEMINI ? " and is written by Gemini" : ""}`, async () => {
  const bId = await pb.evaluate(async () => (await (await fetch("/api/me", { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).json()).id);
  await pa.goto(`${BASE}/profile?id=${bId}`);
  const label = pa.getByText(/Written by Gemini|Suggested by Meerkat/);
  await label.waitFor({ timeout: 30_000 });
  if (EXPECT_GEMINI) expect((await label.innerText()).includes("Gemini"), `got: ${await label.innerText()}`);
  await pa.getByText("Conversation starter").waitFor();
  await pa.getByText("What was sent to Gemini?").or(pa.getByText("What would be sent to Gemini?")).waitFor();
});

// ---------- 6. Groups ----------
const groupName = `Chess Club ${run}`;
let groupUrl = "";
await check("6. A creates a group from the + menu", async () => {
  await pa.getByRole("button", { name: "Create", exact: true }).click();
  await pa.getByRole("menuitem", { name: /Create a group/ }).click();
  await pa.getByLabel("Group name").fill(groupName);
  await pa.getByRole("button", { name: "Create group" }).click();
  await pa.getByRole("heading", { name: groupName }).waitFor();
  await pa.getByText("1 member").first().waitFor();
  groupUrl = pa.url();
});
await check("6b. B joins the group and posts in the discussion", async () => {
  await pb.goto(`${BASE}/groups`);
  await pb.getByLabel("Search groups").fill(groupName);
  await pb.getByRole("button", { name: `Join ${groupName}` }).click();
  await pb.getByRole("button", { name: `Leave ${groupName}` }).waitFor();
  await pb.getByRole("link", { name: groupName }).click();
  await pb.getByText("2 members").first().waitFor();
  await pb.getByLabel("Write a post").fill("Hi everyone!");
  await pb.getByRole("button", { name: "Post" }).click();
  await pb.getByText("Hi everyone!").waitFor();
});
await check("6c. B leaves the group", async () => {
  await pb.getByRole("button", { name: `Leave ${groupName}` }).click();
  await pb.getByRole("button", { name: `Join ${groupName}` }).waitFor();
  await pb.getByText("1 member").first().waitFor();
});

// ---------- 7. Events ----------
const eventTitle = `Chess night ${run}`;
let eventUrl = "";
await check("11b. Event form refuses a start time in the past", async () => {
  await pa.goto(`${BASE}/events`);
  await pa.getByRole("button", { name: "PLAN AN EVENT!" }).click();
  await pa.getByLabel("Title").fill(eventTitle);
  await pa.getByLabel("Starts").fill("2020-01-01T10:00");
  await pa.getByLabel("Location").fill("Library");
  await pa.getByRole("button", { name: "Create event" }).click();
  await pa.getByText("The start time is in the past.").waitFor();
});
await check("7. A creates an event (in Toronto time)", async () => {
  const tomorrow = new Date(Date.now() + 86_400_000);
  const day = tomorrow.toLocaleDateString("en-CA", { timeZone: "America/Toronto" });
  await pa.getByLabel("Starts").fill(`${day}T18:30`);
  await pa.getByRole("button", { name: "Create event" }).click();
  await pa.getByRole("heading", { name: eventTitle }).waitFor();
  await pa.getByText("1 going").waitFor();
  await pa.getByText(/6:30\s?p\.?m\.?.*E[DS]T/i).first().waitFor();
  eventUrl = pa.url();
});
await check("7b. B RSVPs and cancels, counts stay right", async () => {
  await pb.goto(pa.url());
  await pb.getByRole("heading", { name: eventTitle }).waitFor();
  await pb.getByRole("button", { name: "I'm going" }).click();
  await pb.getByText("2 going").waitFor();
  await pb.getByRole("button", { name: /Cancel RSVP/ }).click();
  await pb.getByText("1 going").waitFor();
});

// ---------- 8. Notifications ----------
await check("8. A's bell shows acceptance, group join and RSVP; mark all read", async () => {
  await pa.goto(`${BASE}/feed`);
  await pa.getByRole("button", { name: /Notifications, \d+ unread/ }).click();
  await pa.getByText(`${B.name} accepted your friend request`).waitFor();
  await pa.getByText(`${B.name} joined your group ${groupName}`).waitFor();
  await pa.getByText(`${B.name} is going to ${eventTitle}`).waitFor();
  await pa.getByRole("button", { name: "Mark all as read" }).click();
  await pa.getByRole("button", { name: "Notifications", exact: true }).waitFor();
});

// ---------- Editing and deleting ----------
await check("7c. The organiser edits the event, then cancels it", async () => {
  await pa.keyboard.press("Escape");
  await pa.goto(eventUrl);
  await pa.getByRole("button", { name: "Edit event" }).click();
  const dialog = pa.getByRole("dialog");
  await dialog.getByLabel("Title").fill(`${eventTitle} (moved)`);
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await pa.getByRole("heading", { name: `${eventTitle} (moved)` }).waitFor();
  await pa.getByRole("button", { name: "Cancel event" }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Cancel event" }).click();
  await pa.getByText("Event cancelled.").waitFor();
});
await check("6d. The owner edits the group, then deletes it only after typing its name", async () => {
  await pa.goto(groupUrl);
  await pa.getByRole("button", { name: "Edit group" }).click();
  await pa.getByRole("dialog").getByLabel("Group name").fill(`${groupName} II`);
  await pa.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
  await pa.getByRole("heading", { name: `${groupName} II` }).waitFor();
  await pa.getByRole("button", { name: "Delete group" }).click();
  const confirm = pa.getByRole("dialog");
  const forever = confirm.getByRole("button", { name: "Delete forever" });
  expect(await forever.isDisabled(), "Delete forever works before typing the name");
  await confirm.getByLabel("Type the group's name to confirm").fill(`${groupName} II`);
  await forever.click();
  await pa.waitForURL((url) => url.pathname === "/groups" && !url.searchParams.get("id"));
  const status = await pa.evaluate(async (url) => (await fetch(`/api/groups/${new URL(url).searchParams.get("id")}`,
    { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).status, groupUrl);
  expect(status === 404, `the group still exists (status ${status})`);
});

// ---------- Screen time ----------
await check("Screen time goal can be saved", async () => {
  await pa.keyboard.press("Escape");
  await pa.goto(`${BASE}/screen-time`);
  await pa.getByRole("heading", { name: "What the numbers mean" }).waitFor();
  await pa.getByLabel("Minutes per day").fill("30");
  await pa.getByRole("button", { name: "Save goal" }).click();
  await pa.getByText("Goal saved.").waitFor();
});

// ---------- 12. Protected actions ----------
await check("12. The server refuses requests without login or for other people", async () => {
  const result = await pb.evaluate(async () => {
    const token = localStorage.getItem("ff_token");
    const auth = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
    const noLogin = await fetch("/api/me");
    const editId = await fetch("/api/me", { method: "PATCH", headers: auth, body: JSON.stringify({ id: 1, hook: "x" }) });
    const foreign = await fetch("/api/friends/requests/999999/accept", { method: "POST", headers: auth });
    return [noLogin.status, editId.status, foreign.status];
  });
  expect(JSON.stringify(result) === "[401,422,404]", `got ${result}`);
});

// ---------- Settings ----------
await check("Settings: a notification switch and who sees your free times stay changed after a refresh", async () => {
  await pa.goto(`${BASE}/settings`);
  // The switch is drawn over a hidden checkbox, so click its label like a person would.
  await pa.getByText("Hangout plans", { exact: true }).click();
  await pa.getByText("Saved.").first().waitFor();
  await Promise.all([
    pa.waitForResponse((r) => r.url().endsWith("/api/me") && r.request().method() === "PATCH" && r.ok()),
    pa.getByRole("radio", { name: /Friends only/ }).click(), // it only shows as picked once the server saved it
  ]);
  await pa.reload();
  await pa.getByRole("heading", { name: "Notifications" }).waitFor();
  expect(!(await pa.getByRole("switch", { name: /Hangout plans/ }).isChecked()), "the switch went back on");
  expect(await pa.getByRole("radio", { name: /Friends only/ }).isChecked(), "the free-times choice wasn't saved");
});

await check("Change password in Settings: this browser stays logged in, the old password stops working", async () => {
  await pa.goto(`${BASE}/settings`);
  await pa.getByRole("button", { name: "Change password" }).click();
  await pa.locator("#pw-current").fill(A.password);
  await pa.locator("#pw-new").fill("avery-password-2");
  await pa.locator("#pw-again").fill("avery-password-2");
  await pa.getByRole("button", { name: "Save new password" }).click();
  await pa.getByText(/Password changed/).waitFor();
  const old = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: A.email, password: A.password }),
  });
  expect(old.status === 401, `the old password still works (status ${old.status})`);
  A.password = "avery-password-2";
  await pa.reload();
  await pa.getByRole("heading", { name: "Notifications" }).waitFor();
});
await check("Forgot password: the page says honestly whether email reset is set up", async () => {
  const visitor = await newPage();
  await visitor.goto(`${BASE}/login`);
  await visitor.getByRole("link", { name: "Forgot password?" }).click();
  await visitor.getByRole("heading", { name: "Forgot your password?" }).waitFor();
  await visitor.getByLabel("Email").fill(A.email);
  await visitor.getByRole("button", { name: "Get a reset code" }).click();
  await visitor.getByText(/isn't set up on this server|we'll send a reset code there/).waitFor();
  await visitor.context().close();
});

// ---------- Remove friend ----------
await check("Remove friend asks first, then removes", async () => {
  const bId = await pb.evaluate(async () => (await (await fetch("/api/me", { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).json()).id);
  await pa.goto(`${BASE}/profile?id=${bId}`);
  await pa.getByRole("button", { name: "Remove friend" }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Remove friend" }).click();
  await pa.getByRole("button", { name: "Add friend" }).waitFor();
});

// ---------- Safety ----------
await check("Report and block from a profile, then unblock in Settings", async () => {
  const bId = await pb.evaluate(async () => (await (await fetch("/api/me", { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).json()).id);
  await pa.goto(`${BASE}/profile?id=${bId}`);
  await pa.getByRole("button", { name: "Report profile" }).click();
  const report = pa.getByRole("dialog");
  await report.getByRole("radio", { name: "Spam, scam or fake account" }).check();
  await report.getByRole("button", { name: "Send report" }).click();
  await report.getByText("Report sent.").waitFor();
  await report.getByRole("button", { name: "Close" }).last().click(); // the last one: the dialog's × is also "Close"

  await pa.getByRole("button", { name: "Block" }).click();
  await pa.getByRole("dialog").getByRole("button", { name: "Block" }).click();
  await pa.waitForURL(`${BASE}/feed`);
  const seen = await pb.evaluate(async (id) => (await fetch(`/api/people/${id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).status,
    await pa.evaluate(async () => (await (await fetch("/api/me", { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).json()).id));
  expect(seen === 404, `B can still see A's profile (status ${seen})`);

  await pa.goto(`${BASE}/settings`);
  const blocked = pa.locator("#blocked");
  await blocked.getByText(B.name).waitFor();
  await blocked.getByRole("button", { name: "Unblock" }).click();
  await blocked.getByText("You haven't blocked anyone.").waitFor();
});
await check("Moderation area is closed to members (page and server)", async () => {
  await pa.goto(`${BASE}/moderation`);
  await pa.getByText("This area is only for Meerkat moderators.").waitFor();
  const status = await pa.evaluate(async () => (await fetch("/api/moderation/reports", { headers: { Authorization: `Bearer ${localStorage.getItem("ff_token")}` } })).status);
  expect(status === 403, `the server allowed it (status ${status})`);
});
await check("Terms, Privacy and Guidelines open without an account, marked as drafts", async () => {
  const visitor = await newPage();
  for (const [path, heading] of [["/terms", /Terms/], ["/privacy", /Privacy/], ["/guidelines", /Guidelines/]]) {
    await visitor.goto(`${BASE}${path}`);
    await visitor.getByRole("heading", { level: 1, name: heading }).waitFor();
    await visitor.getByText(/draft/i).first().waitFor();
  }
  await visitor.context().close();
});

// ---------- Demo mode ----------
const pd = await newPage();
await check("Demo mode: Try the demo, accept a waiting request", async () => {
  await startDemo(pd);
  await pd.getByText("Demo account").first().waitFor();
  await pd.goto(`${BASE}/friends`);
  await pd.getByRole("button", { name: "Accept" }).first().click();
  await pd.getByRole("heading", { name: "Your friends (2)" }).waitFor();
});

// ---------- 13. Phone width ----------
const pm = await newPage({ width: 390, height: 844 });
await check("13. Phone width: every page fits, bottom navigation works", async () => {
  await startDemo(pm);
  for (const path of ["/feed", "/memories", "/plan", "/profile", "/groups", "/events", "/friends", "/messages", "/screen-time",
    "/settings", "/terms", "/privacy", "/guidelines"]) {
    await pm.goto(`${BASE}${path}`);
    await pm.waitForLoadState("networkidle");
    const overflow = await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(!overflow, `${path} scrolls sideways`);
  }
  await pm.goto(`${BASE}/feed`); // the legal pages above have no tab bar
  const nav = pm.getByRole("navigation", { name: "Main" });
  const box = await nav.getByRole("link", { name: "Memories" }).boundingBox();
  expect(box && box.height >= 44, "tab bar targets are smaller than 44px");
  // Groups is under "More" on phones.
  await nav.getByRole("button", { name: "More" }).click();
  await nav.getByRole("menuitem", { name: "Groups" }).click();
  await pm.waitForURL(`${BASE}/groups`);
});

await check("Log out returns to the login page", async () => {
  await pa.goto(`${BASE}/settings`);
  await pa.getByRole("button", { name: "Log out" }).click();
  await pa.waitForURL(`${BASE}/login`);
});

// ---------- Clean up: B deletes their account in Settings, A's is deleted through the API ----------
await check("Delete account asks for DELETE, then logs out and the account is gone", async () => {
  await pb.goto(`${BASE}/settings`);
  await pb.getByRole("button", { name: "Delete my account" }).click();
  const forever = pb.getByRole("button", { name: "Delete forever" });
  expect(await forever.isDisabled(), "Delete forever works before typing DELETE");
  await pb.getByLabel("Type DELETE to confirm").fill("DELETE");
  await forever.click();
  await pb.waitForURL((url) => !url.pathname.startsWith("/settings"));
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: B.email, password: B.password }),
  });
  expect(login.status === 401, `B can still log in (status ${login.status})`);
});
{
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: A.email, password: A.password }),
  });
  const token = login.ok ? (await login.json()).access_token : null;
  if (token) {
    await fetch(`${BASE}/api/me`, {
      method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
  }
}

await check("No JavaScript errors on any page", async () => expect(pageErrors.length === 0, pageErrors.slice(0, 3).join(" | ")));

await browser.close();
const passed = results.filter(Boolean).length;
console.log(`\n${passed} of ${results.length} checks passed.`);
process.exit(passed === results.length ? 0 : 1);
