import LandingPage from "../components/LandingPage";

export const metadata = {
  description: "Bridgewayrefer helps dental specialists track referrals from an NFC card or QR link through staff follow-up.",
  alternates: { canonical: "https://bridgewayrefer.com/" },
  openGraph: {
    title: "Bridgewayrefer | Referral tracking for dental specialists",
    description: "Capture referrals, assign follow-up, and see where each request stands.",
    url: "https://bridgewayrefer.com/",
  },
};

export default function Home() { return <LandingPage />; }
