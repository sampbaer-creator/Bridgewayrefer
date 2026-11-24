import ReferralCalculator from "../../../components/ReferralCalculator";

export const metadata = { title: "Referral Rate Calculator", description: "Use this referral rate calculator to see what share of recorded card-link opens led to a submitted referral.", alternates: { canonical: "/tools/referral-rate" } };

export default function Page() {
  return <main className="bw-page" id="main-content"><article className="bw-doc">
    <h1>Referral Rate Calculator</h1>
    <p>Use this referral rate calculator to see what share of recorded card-link opens led to a submitted referral.</p>
    <ReferralCalculator mode="rate" />
    <p><a href="#walkthrough">Request a walkthrough</a> or <a href="/">see how BridgeWay works</a>.</p>
  </article></main>;
}
