export const siteOrigin = "https://bridgewayrefer.com";
export const siteDescription = "Capture partner referrals with branded NFC cards and QR links. Assign follow-up and track every referral through completion.";
const corePaths = ["/", "/how-it-works", "/industries/healthcare", "/industries/trades", "/pricing", "/contact", "/security", "/privacy", "/terms"];

export const guideLinks = [
  { href: "/referral-tracking-system", label: "What Is a Referral Tracking System?" },
  { href: "/guides/orthodontic-referral-tracking", label: "How Orthodontists Track Referring Dentists" },
  { href: "/guides/where-referrals-get-lost", label: "Where Referrals Get Lost" },
  { href: "/guides/home-service-referral-tracking", label: "Home Service Referral Tracking Guide" },
  { href: "/guides/nfc-referral-cards", label: "NFC and QR Referral Cards Explained" },
];

export const toolLinks = [
  { href: "/tools/referral-tracker", label: "Free Referral Tracker Template" },
  { href: "/tools/referral-roi", label: "Referral ROI Calculator" },
  { href: "/tools/referral-rate", label: "Referral Rate Calculator" },
];

export const comparisonLinks = [
  { href: "/compare/spreadsheet", label: "Referral Tracking Spreadsheet vs. BridgeWay" },
];

export const publicPaths = [...corePaths, "/industries/dental", ...[...guideLinks, ...toolLinks, ...comparisonLinks].map(link => link.href)];
