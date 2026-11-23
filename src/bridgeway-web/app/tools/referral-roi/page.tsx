import ReferralCalculator from "../../../components/ReferralCalculator";

export const metadata = { title: "Referral ROI Calculator", description: "Use this referral ROI calculator to estimate potential return based on your own referral volume, conversion rate and contribution per booking.", alternates: { canonical: "/tools/referral-roi" } };

export default function Page() {
  return <main className="bw-page" id="main-content"><article className="bw-doc">
    <h1>Referral ROI Calculator</h1>
    <p>Use this referral ROI calculator to estimate potential return based on your own referral volume, conversion rate and contribution per booking.</p>
    <ReferralCalculator mode="roi" />
    <p><a href="/contact">Book a BridgeWay demo</a> or <a href="/">see how BridgeWay works</a>.</p>
  </article></main>;
}
