// The Terms of Service, Privacy Policy and Community Guidelines, as DRAFTS.
//
// To finish them before launch (see docs/PRE_LAUNCH_CHECKLIST.md):
//   1. Fill in LEGAL_CONFIG below (operator, contacts, dates, providers...).
//   2. Replace every remaining "[INSERT ...]" in the text. Pages show a "not ready" banner until none are left.
//   3. Have the text reviewed by someone qualified. Nobody has reviewed it yet.
//   4. Delete the "note" blocks (the "Draft check" boxes): they compare the text with what the code really does.
// The Terms version people accept is TERMS_VERSION in backend/.env; raise it when the Terms change materially.

export const LEGAL_CONFIG = {
  operator: "[INSERT LEGAL NAME OF INDIVIDUAL(S) OR ENTITY OPERATING MEERKAT]",
  supportEmail: "[INSERT MONITORED SUPPORT EMAIL]",
  privacyContact: "[INSERT NAME OR ROLE AND EMAIL]",
  privacyEmail: "[INSERT MONITORED EMAIL]",
  moderationEmail: "[INSERT MODERATION EMAIL]",
  mailingAddress: "[INSERT]",
  termsEffectiveDate: "[INSERT PUBLICATION DATE]",
  privacyEffectiveDate: "[INSERT DATE]",
  privacyVersion: "[INSERT VERSION]",
  // A real, working path in the app (this one exists).
  closurePath: "Settings → Terms and privacy (\"Delete my account\", or \"Send a privacy request\")",
};

// A block is a paragraph, a bullet list, a table, or a "Draft check" note for the team.
export type Block = string | { list: string[] } | { table: string[][] } | { note: string };
export type Section = { heading: string; blocks: Block[] };
export type LegalDoc = { title: string; meta: [string, string][]; intro: Block[]; sections: Section[] };

const C = LEGAL_CONFIG;

export const TERMS: LegalDoc = {
  title: "Meerkat Terms of Service",
  meta: [
    ["Effective date", C.termsEffectiveDate],
    ["Operator", C.operator],
    ["Contact", C.supportEmail],
  ],
  intro: [],
  sections: [
    {
      heading: "1. About Meerkat",
      blocks: [
        "Meerkat is a platform intended to help people form platonic friendships, discover groups and events, share memories, and coordinate activities using shared interests and availability.",
        "In these Terms, “Meerkat,” “we,” “us,” and “our” refer to the operator identified above. “You” refers to the person using the service.",
        "These Terms govern your access to Meerkat. Our Community Guidelines form part of these Terms. Our Privacy Policy explains how we handle personal information.",
        "Some features may be experimental, unavailable, or offered only to selected users. A description of a feature does not mean it is currently available.",
      ],
    },
    {
      heading: "2. Eligibility and acceptance",
      blocks: [
        "For our initial launch, you must be at least 18 years old to create an account or use member features.",
        "You must provide accurate eligibility information and must not misrepresent your age, impersonate another person, or create an account for someone else without authorization.",
        "By selecting the acceptance checkbox during registration, you agree to these Terms and the Community Guidelines. If you do not agree, do not create an account.",
        "We may restrict access where we reasonably believe that a person does not meet our eligibility requirements. If we learn that an account belongs to an ineligible person, we may suspend or close it and handle its information under our Privacy Policy and applicable law.",
        { note: "18+ is the PROPOSED launch policy and still needs the team's confirmation. Today the app asks people to confirm they are 18+ with an unticked checkbox; it does not verify age." },
      ],
    },
    {
      heading: "3. Accounts and security",
      blocks: [
        "You are responsible for:",
        { list: [
          "Providing accurate account information and keeping it reasonably current.",
          "Protecting your login credentials.",
          "Using only accounts you are authorized to access.",
          "Promptly reporting suspected unauthorized access.",
        ] },
        "Do not share verification codes, passwords, wallet recovery phrases, or other security credentials.",
        "You are responsible for activity you authorize through your account. This provision does not remove any responsibility we may have for our own conduct or security obligations.",
      ],
    },
    {
      heading: "4. Verification and badges",
      blocks: [
        "Meerkat may offer email, phone, age, university, or other verification features.",
        "Each verification label refers only to the particular check described alongside it. For example:",
        { list: [
          "Email verification indicates completion of an email-control check.",
          "Phone verification indicates completion of a phone-control check.",
          "An age-check label indicates completion of the stated age-assurance process.",
        ] },
        "A verification label does not guarantee a person’s identity, background, intentions, trustworthiness, student status, or safety unless the specific verification description expressly says that matter was checked.",
        "You must not submit another person’s documents or images, manipulate a verification process, or falsely represent a verification result.",
        "Where a third-party verification provider is used, we will identify the provider and explain relevant processing before you proceed.",
        { note: "Today: email codes work only when an SMTP account is configured, phone codes only when Twilio Verify is configured. No age-check provider and no university verification exist, so no such labels are ever shown." },
      ],
    },
    {
      heading: "5. Friendship, groups, and offline activities",
      blocks: [
        "Meerkat is intended for platonic social connection. Other users are responsible for their own statements, invitations, and conduct.",
        "You decide whether to communicate, share information, join a group, or attend an activity. Use reasonable precautions, including meeting in public places, protecting private addresses, and independently checking activity details.",
        "Unless expressly identified otherwise, Meerkat is not the organizer, venue operator, transportation provider, or supervisor of user-created activities.",
        "Meerkat is not an emergency service. Contact the appropriate emergency services if someone is in immediate danger.",
        "Nothing in this section excludes responsibilities that cannot lawfully be excluded.",
      ],
    },
    {
      heading: "6. Availability, schedules, and planning",
      blocks: [
        "You may choose to provide public availability, private commitments, or imported schedule information.",
        "You must only upload information you are authorized to provide. Do not upload another person’s private calendar or confidential workplace or university information without permission.",
        "Review imported information before confirming it. Schedule extraction, recurrence interpretation, time-zone conversion, and availability calculations may contain errors.",
        "Choosing to use private commitments for planning does not, by itself, authorize their publication. The available privacy controls determine what other users may see.",
        "You are responsible for reviewing a proposed plan before accepting it, including its date, time, travel requirements, and any conflicts.",
      ],
    },
    {
      heading: "7. AI-generated suggestions and maps",
      blocks: [
        "Some features may use artificial intelligence to suggest compatibility explanations, conversation starters, activities, or hangout plans.",
        "AI output may be inaccurate, incomplete, inappropriate, or out of date. It is a suggestion, not a factual assessment of a person’s character, a guarantee of compatibility, or professional advice.",
        "Map results, venue information, opening hours, estimated travel times, and suggested meeting areas may also be incomplete or change. Independently confirm important details before travelling or making a reservation.",
        "An approximate halfway point does not necessarily mean equal travel time, equal cost, accessibility, or safety for every participant.",
        "Where optional AI or location processing requires a separate choice, the relevant notice and controls apply.",
      ],
    },
    {
      heading: "8. Screen-time features",
      blocks: [
        "Meerkat may provide in-app activity tracking, self-reported screen-time entries, or separately identified supported integrations.",
        "These are different measurements. In-app activity is not a measurement of all device use. Self-reported entries are not independently verified unless expressly stated.",
        "Group targets, progress indicators, and leaderboards are social accountability features, not medical advice or an assessment of someone’s health, productivity, or character.",
        "You must not use these features to coerce, humiliate, threaten, or monitor another person without permission.",
        { note: "Today: in-app time and self-reported entries only. No device-wide integration exists." },
      ],
    },
    {
      heading: "9. Your content and permissions",
      blocks: [
        "You retain ownership of content you submit, subject to any rights held by others.",
        "You grant Meerkat a non-exclusive, worldwide, royalty-free license to host, store, reproduce, technically adapt, and display that content only as reasonably necessary to:",
        { list: [
          "Operate the service.",
          "Deliver the sharing features and audience choices you select.",
          "Maintain backups and security.",
          "Review reports and enforce these Terms.",
          "Meet applicable legal obligations.",
        ] },
        "This permission does not transfer ownership of your content or grant us unrestricted permission to sell it or use it in unrelated advertising.",
        "Using your content to train a general-purpose AI model is not authorized merely by this clause. Any such proposed use would require a separate assessment, disclosure, and permission where required.",
        "You must have the necessary rights and permissions to upload content. Do not publish private information, private messages, or identifiable images of others in circumstances that violate their rights or these Terms.",
        "When you delete content, we will handle removal and any limited retention as explained in the Privacy Policy. Copies already obtained by other users may remain outside our control.",
      ],
    },
    {
      heading: "10. Acceptable use",
      blocks: [
        "You must follow the Community Guidelines.",
        "You must not:",
        { list: [
          "Harass, threaten, stalk, exploit, or discriminate against others.",
          "Share illegal content or content that violates another person’s rights.",
          "Publish private identifying information without authorization.",
          "Impersonate people or misrepresent your affiliation.",
          "Send scams, spam, or deceptive solicitations.",
          "Upload malicious software or attempt unauthorized access.",
          "Scrape private data, evade access controls, or bypass suspensions.",
          "Manipulate verification, requests, reports, or leaderboards.",
          "Use Meerkat for sexual exploitation or to target minors.",
          "Use another person’s schedules or location information to follow or surveil them.",
        ] },
      ],
    },
    {
      heading: "11. Reporting and enforcement",
      blocks: [
        "You may report content or conduct using available reporting tools or the contact address above.",
        "Depending on the circumstances, we may restrict distribution, remove content, limit features, suspend an account, or terminate access.",
        "Where appropriate, we will provide a reason and a way to request reconsideration. We may limit the information provided where disclosure could compromise another person’s privacy, security, an investigation, or a legal obligation.",
        "Reports must be submitted honestly. A report does not guarantee a particular outcome or an immediate response.",
        "We do not promise continuous monitoring or round-the-clock moderation.",
      ],
    },
    {
      heading: "12. Third-party services and optional blockchain features",
      blocks: [
        "Meerkat may rely on third parties for hosting, authentication, AI, maps, storage, verification, or other functions. Relevant third-party terms may apply when you use their services.",
        "The presence of a provider or sponsor name does not mean that provider endorses Meerkat or every activity offered through it.",
        "If an optional blockchain feature is offered:",
        { list: [
          "We will identify whether it uses a test network or main network.",
          "You must review the transaction before approving it.",
          "Public blockchain information may be visible to others and difficult or impossible to erase.",
          "Do not place personal schedules, private messages, verification records, or other sensitive information on-chain.",
          "We will not ask for your private key or recovery phrase.",
        ] },
        { note: "Today: no blockchain feature is offered." },
      ],
    },
    {
      heading: "13. Availability, changes, and charges",
      blocks: [
        "The service may experience outages, errors, data loss, or feature changes, including during testing.",
        "We may update, discontinue, or restrict features. Where reasonably practicable, we will give notice of changes that materially affect existing users.",
        "Any paid feature must clearly disclose its price and applicable purchase terms before purchase. These Terms alone do not authorize a charge.",
        { note: "Today: there are no paid features." },
      ],
    },
    {
      heading: "14. Account closure and data requests",
      blocks: [
        `You may stop using Meerkat and request account closure through ${C.closurePath}.`,
        "Account closure and personal-information deletion are related but distinct processes. Some information may need to be retained for legitimate security, dispute, or legal purposes as described in the Privacy Policy.",
        "You may contact us to request access to, correction of, or deletion of your personal information, subject to applicable law.",
      ],
    },
    {
      heading: "15. Disclaimers and responsibility",
      blocks: [
        "To the extent permitted by applicable law, Meerkat is provided on an “as available” basis, without a guarantee of uninterrupted operation, error-free output, successful friendships, or the conduct of other users.",
        "We are not responsible for every act of another user or independent third-party provider. Responsibility for a particular loss depends on the circumstances and applicable law.",
        "Nothing in these Terms excludes liability that cannot lawfully be excluded, excuses our own fraud or wilful misconduct, or removes mandatory privacy, consumer, or other statutory rights.",
      ],
    },
    {
      heading: "16. Governing law and disputes",
      blocks: [
        "Subject to any mandatory law that applies to you, these Terms are governed by the laws of Ontario and the federal laws of Canada applicable there.",
        "Contact us first if you wish to raise a concern. This request does not prevent you from contacting a regulator, obtaining legal advice, or using a court or other dispute process available to you.",
        "Nothing in these Terms requires you to waive a legally protected right to bring a claim.",
      ],
    },
    {
      heading: "17. Changes to these Terms",
      blocks: [
        "We will identify the current version and effective date of these Terms.",
        "For material changes, we will provide reasonable notice and request renewed acceptance where appropriate or legally required. We will not treat a Terms update as automatic permission for a new, unrelated use of personal information.",
        { note: "Implemented: the accepted version and time are stored for each account. Raising TERMS_VERSION asks everyone to accept again on their next visit." },
      ],
    },
    {
      heading: "18. Contact",
      blocks: [
        { list: [
          `Operator: ${C.operator}`,
          `Support and legal notices: ${C.supportEmail}`,
          `Privacy contact: ${C.privacyContact}`,
        ] },
      ],
    },
  ],
};

export const GUIDELINES: LegalDoc = {
  title: "Meerkat Community Guidelines",
  meta: [],
  intro: ["Meerkat exists to help people find their mob through respectful, platonic connection."],
  sections: [
    { heading: "1. Be respectful", blocks: [
      "No bullying, harassment, threats, hateful conduct, discriminatory abuse, or repeated unwanted contact.",
      "Disagreement is allowed. Attacking or intimidating someone is not.",
    ] },
    { heading: "2. Respect boundaries", blocks: [
      "A friendship request, group invitation, or message does not create an obligation to respond.",
      "Do not pressure people to meet, reveal their location, share their schedule, provide photographs, or continue a conversation.",
      "Do not contact someone through another account after they block you.",
    ] },
    { heading: "3. Be honest", blocks: [
      "Use accurate eligibility information. Do not impersonate someone, falsify verification, or deceive users about your affiliations or intentions.",
      "Clearly identify fictional demonstration accounts.",
    ] },
    { heading: "4. Protect privacy", blocks: [
      "Do not post another person’s phone number, address, private timetable, verification documents, private messages, or live location without appropriate permission.",
      "Do not use availability or location features to track people.",
      "Ask permission before posting identifiable photos when the context reasonably calls for it, and respect requests to remove them.",
    ] },
    { heading: "5. Keep the platform appropriate", blocks: [
      "Do not post sexual exploitation, non-consensual intimate material, explicit sexual solicitation, graphic threats, or content promoting abuse.",
      "Content involving the sexual exploitation of children is prohibited.",
      "Meerkat is not a service for targeting minors or arranging exploitative relationships.",
    ] },
    { heading: "6. No scams or harmful conduct", blocks: [
      "No fraud, phishing, malware, deceptive fundraising, illegal sales, or instructions intended to facilitate harm against another person.",
      "Do not use the service to coordinate violence or other illegal activity.",
    ] },
    { heading: "7. Use screen-time groups supportively", blocks: [
      "Share participation and usage information voluntarily.",
      "Do not shame people over their numbers, pressure them to provide screenshots, or claim that a leaderboard proves addiction, laziness, or poor mental health.",
    ] },
    { heading: "8. Respect shared spaces", blocks: [
      "Keep group discussions, event descriptions, and memory posts relevant to their audience.",
      "Do not repeatedly advertise, mass-invite strangers, manipulate engagement, or overwhelm others with unwanted messages.",
    ] },
    { heading: "9. Report responsibly", blocks: [
      "Report suspected violations through the reporting tools. Do not retaliate against someone for reporting a concern.",
      "Do not organize mass false reports or public harassment campaigns.",
    ] },
    { heading: "10. Enforcement", blocks: [
      "Violations may result in content removal, feature restrictions, suspension, or account closure. Serious conduct may lead to immediate action.",
      `You may request reconsideration by contacting ${C.moderationEmail}.`,
      "If someone is in immediate danger, contact local emergency services rather than waiting for an in-app report response.",
    ] },
  ],
};

export const PRIVACY: LegalDoc = {
  title: "Meerkat Privacy Policy",
  meta: [
    ["Effective date", C.privacyEffectiveDate],
    ["Version", C.privacyVersion],
  ],
  intro: [],
  sections: [
    { heading: "1. Who is responsible", blocks: [
      `Meerkat is operated by ${C.operator}.`,
      `Our privacy contact is ${C.privacyContact}, reachable at ${C.privacyEmail}.`,
      "This Policy explains how we collect, use, disclose, retain, and protect personal information when you use Meerkat.",
    ] },
    { heading: "2. Information we collect", blocks: [
      "Depending on the features you use, we may collect:",
      { table: [
        ["Category", "Examples and purposes"],
        ["Account information", "Email, account identifier, authentication information, and optional phone number to provide and secure your account."],
        ["Profile information", "Display name, profile photo, university, pronouns, age information, interests, bio, and friendship preferences to provide your selected profile and discovery features."],
        ["Availability and schedules", "Published availability, private commitments, and imported timetable information to calculate permitted planning results."],
        ["Social activity", "Friend requests, memberships, invitations, RSVPs, messages, memory posts, comments, and reactions to operate those features."],
        ["Location information", "A voluntarily supplied meeting origin or permitted device location to suggest meeting areas and venues."],
        ["Screen-time information", "Active in-app usage, self-reported totals, or data from a separately identified integration."],
        ["Verification information", "Verification status, timestamps, and necessary provider references. Any additional data will be explained before collection."],
        ["Safety and technical records", "Reports, moderation decisions, security logs, device/browser information, and error records needed to protect and operate the service."],
      ] },
      "[REMOVE CATEGORIES NOT ACTUALLY COLLECTED. IDENTIFY ANY ANALYTICS, COOKIES, OR TRACKING TOOLS ACTUALLY USED.]",
      { note: "What the code does today: no analytics, advertising or tracking tools, and no cookies. The browser's local storage keeps your login token and a few display choices. Locations are only an approximate meeting area you choose (rounded to about 1 km). No device-wide screen time is collected. Server logs (the web server and API) record IP addresses and requested addresses: confirm how long the host keeps them." },
    ] },
    { heading: "3. Why we use information", blocks: [
      "We use personal information to:",
      { list: [
        "Create, authenticate, and maintain accounts.",
        "Display profiles and content according to selected audiences.",
        "Provide friendships, groups, events, and messaging.",
        "Calculate permitted shared availability.",
        "Generate requested AI suggestions.",
        "Provide requested map and venue results.",
        "Operate screen-time accountability features.",
        "Verify specific account attributes.",
        "Prevent abuse and investigate reports.",
        "Respond to support and privacy requests.",
        "Meet applicable legal obligations.",
      ] },
      "We will explain a materially different proposed purpose and obtain any permission required before using information for that purpose.",
    ] },
    { heading: "4. What other users can see", blocks: [
      "Profile and content visibility depend on the feature and audience you select.",
      "Private commitments are not intended to be public. Planning participants may see shared free-time results without seeing the underlying private event titles or reasons you are unavailable.",
      "Email addresses, phone numbers, verification materials, and private starting locations are not intended to be public profile fields.",
      "Members of a screen-time group can see the usage entries you choose to share within that group.",
      "Recipients may copy or screenshot information they can access. Audience controls cannot prevent every action taken outside Meerkat.",
      "[CONFIRM DEFAULT AUDIENCES AND THE EXACT VISIBILITY OF EVERY FIELD BEFORE PUBLICATION.]",
      { note: "Defaults in the code today: profiles are visible to logged-in members (you can hide yourself from Discover); public free-time slots: everyone on Meerkat (changeable to friends or nobody); memories: friends; email, phone, private commitments and meeting areas: never shown to others." },
    ] },
    { heading: "5. AI processing", blocks: [
      "When you use [IDENTIFY AI FEATURES], we send [IDENTIFY ACTUAL DATA FIELDS] to [IDENTIFY PROVIDER AND RELEVANT SERVICE] to produce the requested result.",
      "Do not upload confidential information you are not authorized to share.",
      "Before you use optional schedule-image extraction or other sensitive AI processing, we explain the information involved and provide the applicable choice.",
      "Provider retention, training use, processing locations, and account settings are described here: [INSERT VERIFIED DETAILS].",
      "Turning off optional AI features does not by itself delete information already processed. Contact us for available deletion options.",
      { note: "What the code does today: AI is optional (Settings → Privacy) and uses Google Gemini through the Gemini API. Match notes send only shared interests, shared friendship goals, the university name if it's the same, and up to 6 shared free times, and only if both people turned AI on. Hangout suggestions send shared interests, the number of people and the proposed time slots. Timetable extraction sends the uploaded image or PDF, only after a separate choice each time. Names, emails, photos and messages are never sent." },
    ] },
    { heading: "6. Selfies and age assurance", blocks: [
      "If age assurance is enabled, the provider is [INSERT PROVIDER].",
      "Before you proceed, we explain:",
      { list: [
        "What image or identity information is collected.",
        "Whether the method estimates age or verifies a stated age attribute.",
        "Who receives the information.",
        "How long it is kept.",
        "What result Meerkat receives.",
        "Any available alternative or review process.",
      ] },
      "Meerkat receives and stores [INSERT VERIFIED DATA FIELDS]. Raw images and any biometric information are handled as follows: [INSERT VERIFIED STORAGE AND DELETION PRACTICES].",
      "[DO NOT ENABLE THIS FLOW UNTIL THIS SECTION CAN BE COMPLETED ACCURATELY.]",
      { note: "Today: no age-assurance provider is integrated, the selfie check is switched off, and Meerkat never takes, stores or analyses selfies." },
    ] },
    { heading: "7. Service providers and disclosures", blocks: [
      "We use the following providers where configured:",
      "[INSERT ACTUAL PROVIDER TABLE: NAME, SERVICE, DATA SHARED, AND PROCESSING LOCATION WHERE KNOWN.]",
      { note: "Providers the code can use: Google Gemini (AI, if a key is set), Google Maps Platform Places (venue search, if a key is set), Twilio Verify (phone codes, if set), an SMTP email provider (email codes, if set), the web host (Vultr or Render) and the database (PostgreSQL, or TigerData if used). Fill in which are actually used, what they receive and where." },
      "We may also disclose information where required or permitted by applicable law, including in response to valid legal process or a serious safety situation.",
      "We do not publish private data to a blockchain as part of ordinary account operation. Any optional blockchain action has a separate notice describing public information and permanence.",
      "[STATE ACTUAL PRACTICES REGARDING SALE, TARGETED ADVERTISING, ANALYTICS, AND MODEL TRAINING. DO NOT INSERT AN UNVERIFIED “WE NEVER SHARE DATA” CLAIM.]",
    ] },
    { heading: "8. Processing outside Canada", blocks: [
      "Information may be processed in [INSERT VERIFIED COUNTRIES OR EXPLAIN KNOWN PROVIDER LOCATIONS].",
      "Information processed in another country may be subject to that country’s laws and lawful access requirements.",
      "Contact us for information about the providers and safeguards relevant to your data.",
    ] },
    { heading: "9. Retention and deletion", blocks: [
      "We retain information only for the purposes described and applicable legal requirements.",
      "Our retention periods or criteria are:",
      { list: [
        "Account and profile records: [INSERT].",
        "Private schedules and original uploads: [INSERT].",
        "Messages and memory media: [INSERT].",
        "Verification records: [INSERT].",
        "Security and moderation records: [INSERT].",
        "Backups: [INSERT].",
      ] },
      `You can request account deletion through ${C.closurePath}.`,
      "Some information may be retained where reasonably necessary for security, legal obligations, or an active dispute. We will explain relevant exceptions where appropriate.",
      "Information posted to a public blockchain may not be erasable. Copies independently saved by other people may remain outside our control.",
      { note: "What the code does today: deleting your account immediately deletes your profile, photos, messages, friendships, memories, schedules, screen-time entries, notifications and verification records, plus groups and events nobody else is in. Reports you made stay (without your name), and moderation logs stay. Uploaded timetable files are never stored. Backups depend on the host: confirm." },
    ] },
    { heading: "10. Security", blocks: [
      "We use safeguards appropriate to the information and risks involved, including [INSERT CONTROLS ACTUALLY IMPLEMENTED].",
      "No online service can guarantee absolute security. Report suspected unauthorized access to [INSERT EMAIL].",
      { note: "Controls in the code today: Argon2 password hashing; HTTPS through Caddy on the server; every permission checked on the server; rate limits on sign-up, login, messages and reports; location data removed from uploaded photos; memory photos served only through expiring signed links; secrets kept in server settings, never in the website." },
    ] },
    { heading: "11. Your choices and requests", blocks: [
      "You may use available settings or contact us to:",
      { list: [
        "Review or correct profile information.",
        "Change sharing audiences.",
        "Stop optional location or AI processing.",
        "Leave screen-time groups.",
        "Request access to personal information.",
        "Request correction or deletion.",
        "Ask questions or make a privacy complaint.",
      ] },
      "Withdrawing permission may prevent us from providing the feature that depends on that information. It does not necessarily undo processing already lawfully completed.",
      "We may need to verify your identity before fulfilling a request, using information proportionate to the request.",
      { note: "Working routes today: Settings → Privacy (AI and location choices), Settings → Terms and privacy (download your data, send a privacy request, delete your account). Requests go to the admins' queue." },
    ] },
    { heading: "12. Age restriction", blocks: [
      "Meerkat’s initial launch is intended for adults aged 18 and over.",
      `If you believe an ineligible person has created an account, contact ${C.supportEmail} so we can investigate and take appropriate action.`,
    ] },
    { heading: "13. Policy changes", blocks: [
      "We will update the effective date when this Policy changes and provide additional notice for material changes where appropriate.",
      "A policy update alone does not replace consent required for a new use of personal information.",
    ] },
    { heading: "14. Contact and complaints", blocks: [
      { list: [
        `Privacy contact: ${C.privacyContact}`,
        `Email: ${C.privacyEmail}`,
        `Mailing/contact address where appropriate: ${C.mailingAddress}`,
      ] },
      "You may also raise a concern with the applicable privacy regulator.",
    ] },
  ],
};

// Plain-language summary shown at the top of the Privacy Policy. It describes what the code does now.
export const PRIVACY_SUMMARY: string[] = [
  "Your profile (display name, photo, university, interests, goals, bio, optional pronouns and age) is visible to other logged-in members. You can hide yourself from Discover.",
  "Your email and phone number are private. They are never shown to anyone else.",
  "Your public \"free to hang out\" times are shared only with the audience you choose: everyone, friends, or nobody.",
  "Your private schedule (classes, shifts) is only ever seen by you. Planning can use it to find free times only for the friends or groups you allow, and they see the resulting free times, never your events.",
  "AI (Google Gemini) is off unless you turn it on. When it's on, only shared interests, goals, university and shared free times are sent, never your name, photo, messages or contact details.",
  "Location is optional: you can choose an approximate meeting area (about 1 km precision). Others never see it.",
  "There's no selfie age check yet, and Meerkat never analyses faces.",
  "You can download your data or delete your account at any time in Settings → Terms and privacy.",
];

// Counts the "[INSERT ...]"-style placeholders still left in a document.
export function placeholders(doc: LegalDoc) {
  const text = JSON.stringify([doc.meta, doc.intro, doc.sections]);
  return text.match(/\[[A-Z][A-Z0-9 ,.'’()/:;\-–—“”"]+\]/g) ?? [];
}
