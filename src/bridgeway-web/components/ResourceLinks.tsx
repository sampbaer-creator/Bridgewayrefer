import Link from "next/link";
import { comparisonLinks, guideLinks, toolLinks } from "../lib/site";

export default function ResourceLinks() {
  return <nav aria-label="Guides and tools" className="bw-resource-links">
    <div>
      <strong>Guides</strong>
      <ul>{[...guideLinks, ...comparisonLinks].map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
    </div>
    <div>
      <strong>Tools</strong>
      <ul>{toolLinks.map(link => <li key={link.href}><Link href={link.href}>{link.label}</Link></li>)}</ul>
    </div>
  </nav>;
}
