import PublicPage from "../../../components/PublicPage";
export default async function CardPage({ params }: { params: Promise<{ code: string }> }) { const { code } = await params; return <PublicPage code={code} />; }
