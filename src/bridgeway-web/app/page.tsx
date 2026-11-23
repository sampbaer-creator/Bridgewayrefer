import { planCopy } from "../lib/plan-copy";
import { FAQS } from "../components/landing/content";
import LandingPage from "../components/LandingPage";

export const metadata = {
  title: { absolute: "Referral Tracking Software for Teams | BridgeWay" },
  alternates: { canonical: "/" },
  description:
    "Referral tracking software to capture partner introductions, identify their source and organize team follow-up. NFC and QR links make the handoff simple.",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(([name, answer]) => ({
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
            name: "BridgeWay",
            applicationCategory: "BusinessApplication",
            operatingSystem: "Web",
            url: "https://bridgewayrefer.com",
            description: "Referral management and tracking software for partner attribution and team follow-up",
            offers: [
              { "@type": "Offer", name: planCopy.workspace.name, price: String(planCopy.workspace.fromUsd), priceCurrency: "USD", description: planCopy.billing },
              { "@type": "Offer", name: planCopy.managedCalling.name, price: String(planCopy.managedCalling.fromUsd), priceCurrency: "USD", description: planCopy.billing },
            ],
          }),
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <LandingPage />
    </>
  );
}
