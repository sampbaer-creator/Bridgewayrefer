import CardAdmin from "../../components/CardAdmin";

export const metadata = { title: "Card administration · BridgeWay", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <main className="access-page access-page-narrow" id="main-content">
      <div className="access-intro">
        <p className="eyebrow">PLATFORM ADMIN</p>
        <h1>Card administration</h1>
        <p>Issue a unique link for a company or office, then write that link to its NFC card.</p>
      </div>
      <CardAdmin />
    </main>
  );
}
