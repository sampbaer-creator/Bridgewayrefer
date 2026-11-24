"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Slides public-page sections up into view as the visitor scrolls down.
// Content stays visible without JavaScript or when reduced motion is requested.
const targets = "main.editorial > section:not(.cover), main.bw-page > section, .walkthrough > *, .industry-grid > a";

export default function ScrollReveal() {
  const path = usePathname();
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const items = Array.from(document.querySelectorAll<HTMLElement>(targets)).filter(el => el.getBoundingClientRect().top > window.innerHeight * 0.9);
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add("is-revealed"); observer.unobserve(entry.target); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    items.forEach((el, i) => { el.classList.add("reveal"); el.style.setProperty("--reveal-delay", `${(i % 3) * 90}ms`); observer.observe(el); });
    return () => { observer.disconnect(); items.forEach(el => el.classList.remove("reveal", "is-revealed")); };
  }, [path]);
  return null;
}
