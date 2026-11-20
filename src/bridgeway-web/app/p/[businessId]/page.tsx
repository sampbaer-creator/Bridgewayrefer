import PublicPage from "../../../components/PublicPage";

export const metadata = { title: "Patient referral form | BridgeWay", robots: { index: false, follow: false } };

export default async function BusinessPatientPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  return <PublicPage businessId={businessId} />;
}
