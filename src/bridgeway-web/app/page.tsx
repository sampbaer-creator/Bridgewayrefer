import LandingPage from "../components/LandingPage";
export const metadata = { alternates: { canonical: "/" } };
export default function HomePage() { return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "BridgeWay", applicationCategory: "BusinessApplication", operatingSystem: "Web", url: "https://bridgewayrefer.com", description: "Referral tracking for dental specialists", offers: { "@type": "Offer", price: "50", priceCurrency: "USD", description: "Per business per month. NFC cards sold separately." } }) }} /><LandingPage /></>; }

