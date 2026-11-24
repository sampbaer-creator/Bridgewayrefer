"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import DemoRequestForm from "./DemoRequestForm";
import { trackWalkthrough } from "../lib/analytics";
import { publicPaths } from "../lib/site";

export default function Walkthrough() {
  const path = usePathname();
  useEffect(() => {
    if (path === "/" && window.location.hash === "#faq") window.location.replace("/faq");
    function onClick(event: MouseEvent) {
      const link = event.target instanceof Element && event.target.closest('a[href="#walkthrough"]');
      if (link) trackWalkthrough("walkthrough_click", link.closest("header") ? "header" : "page");
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [path]);
  if (!publicPaths.includes(path)) return null;
  return <section className="walkthrough" id="walkthrough" tabIndex={-1}>
    <div><h2>Request a walkthrough</h2><p>Tell us a little about your business. We’ll email you to set up a time.</p></div>
    <DemoRequestForm key={path} />
  </section>;
}
