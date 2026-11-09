import SignupForm from "../../components/SignupForm";

export const metadata = { title: "Sign up · BridgeWay" };

export default function SignupPage() {
  return (
    <main className="access-page access-page-narrow" id="main-content">
      <div className="access-intro">
        <p className="eyebrow">BRIDGEWAY SUBSCRIPTION</p>
        <h1>Set up your business</h1>
        <p>$50 USD per business, per month. NFC cards are sold separately.</p>
      </div>
      <SignupForm />
    </main>
  );
}
