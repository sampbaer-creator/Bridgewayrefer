import LandingPage from "../components/LandingPage";
import "./landing.css";

export const metadata = {
  alternates: { canonical: "/" },
  description:
    "Most partner referrals never get followed up. BridgeWay captures every referral with branded NFC cards and QR links, then tracks each one through to a booked job.",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    ["How do NFC cards work?", "Tap the card with a compatible phone to open the receiving business's branded referral form. QR links do the same for any camera."],
    ["Do customers need an app?", "No. The referral form opens in the phone's web browser — nothing to download, nothing to sign up for."],
    ["Who can see our referrals?", "Only authorized members of your business workspace can access its private referral dashboard."],
    ["Can I cancel anytime?", "Manage your subscription and cancellation from Billing in your workspace."],
    ["How do I add more offices?", "Add offices from Setup in your workspace, then issue card links for the correct office. Unlimited offices on every plan."],
  ].map(([name, answer]) => ({
    "@type": "Question",
    name,
    acceptedAnswer: { "@type": "Answer", answerBody: answer },
  })),
};

export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "SoftwareApplication",
            name: "Bridgewayrefer",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://bridgewayrefer.com",
            description: "NFC referral cards, partner attribution, and referral follow-up for businesses",
            offers: [
              { "@type": "Offer", name: "Referral Workspace", price: "50", priceCurrency: "USD", description: "Per business per month. NFC cards sold separately." },
              { "@type": "Offer", name: "Managed Calling", price: "400", priceCurrency: "USD", description: "Per business per month, including the Referral Workspace." },
            ],
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <LandingPage />
    </>
  );
}
