import { planCopy } from "../../lib/plan-copy";
/* Landing-page copy and icons, split from the page so each section
   component stays small and the content is easy to edit in one place. */

export const PIPE_STEPS = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="20" height="14" x="2" y="5" rx="2" />
        <line x1="2" x2="22" y1="10" y2="10" />
      </svg>
    ),
    title: "Your partner shares the card",
    copy: "A partner hands the customer your branded NFC card or QR link.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="14" height="20" x="5" y="2" rx="2" />
        <path d="M12 18h.01" />
      </svg>
    ),
    title: "The customer taps and fills a short form",
    copy: "No app needed. The form opens in the browser with the partner attached.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
    title: "Your team assigns and follows up",
    copy: "Alerts reach the right staff member. You track each referral to a booked visit or job.",
  },
];

export const FEATURES = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect width="5" height="5" x="3" y="3" rx="1" />
        <rect width="5" height="5" x="16" y="3" rx="1" />
        <rect width="5" height="5" x="3" y="16" rx="1" />
        <path d="M21 16h-3a2 2 0 0 0-2 2v3" />
        <path d="M21 21v.01" />
        <path d="M12 7v3a2 2 0 0 1-2 2H7" />
        <path d="M3 12h.01" />
        <path d="M12 3h.01" />
        <path d="M12 16v.01" />
        <path d="M16 12h1" />
        <path d="M21 12v.01" />
        <path d="M12 21v-1" />
      </svg>
    ),
    title: "Branded form",
    copy: "Your logo and offices on every card link. Partners share a form that looks like you.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    title: "Partner tracking",
    copy: "See card taps and referrals for each partner and office.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
    title: "Staff alerts",
    copy: "Email alerts link your team to the dashboard when a referral arrives.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </svg>
    ),
    title: "Monthly reports",
    copy: "12-month trends and month-over-month comparisons in your workspace.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4" />
        <path d="M10 10h4" />
        <path d="M10 14h4" />
        <path d="M10 18h4" />
      </svg>
    ),
    title: "Team access",
    copy: "Invite staff to your workspace as admins or staff.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: "Secure by default",
    copy: "Only workspace members can see your referral records.",
  },
];

export const FAQS: [string, string][] = [
  ["What is a referral tracking system?", "It records where an introduction came from, who owns follow-up, and what happened next."],
  ["Can I replace my referral spreadsheet?", "Use the BridgeWay referral inbox to capture requests and assign follow-up. Keep your spreadsheet if you need a separate historical record."],
  ["Do patient details go in emails?", "Standard referral alerts link authorized staff to the inbox. They omit patient names, contact details, and notes."],
  ["How do NFC referral cards work?", "Tap the card on a phone to open the receiving business's referral form. QR links work with any camera."],
  ["Do customers need an app?", "No. The form opens in the phone's browser."],
  ["How is this different from a shared link or QR code?", "A link tells you a referral happened. BridgeWay tells you who sent it, who it is for, and whether your team followed up — with the status visible until it is done."],
  ["What happens if a referral is not followed up?", "It stays open on your dashboard until someone closes it out, so follow-ups cannot quietly disappear."],
  ["Who can see our referrals?", "Only members of your workspace."],
  ["Is our customers' information secure?", "Referral details stay in your workspace, protected in transit and at rest. Our Security page has the details."],
  ["Can I cancel anytime?", "Yes. Manage or cancel your subscription from Billing in your workspace."],
  ["Are NFC cards included?", planCopy.cards],
  ["How do I add more offices?", "Add locations in your workspace, then request cards for the new location. Contact BridgeWay about pricing."],
];

export const CHECK_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
