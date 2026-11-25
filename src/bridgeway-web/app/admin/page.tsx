import AdminConsole from "../../components/AdminConsole";
export const metadata = { title: "Platform admin", robots: { index: false, follow: false } };
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AdminConsole signInFailed={(await searchParams).error === "signin"} />;
}
