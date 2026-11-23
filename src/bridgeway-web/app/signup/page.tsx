import SignupForm from "../../components/SignupForm";
import LeadCapture from "../../components/landing/LeadCapture";

export const metadata = { title: "Sign up", description: "Request a BridgeWay referral tracking demo and tell us about your business and NFC card needs." };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const { plan } = await searchParams;
  return (
    <main className="bw-landing bw-signup-inquiry" id="main-content">
      <LeadCapture signupPlan={plan === "managed-calling" ? "managed-calling" : "workspace"} />
      <div className="bw-signup-main"><SignupForm /></div>
    </main>
  );
}
