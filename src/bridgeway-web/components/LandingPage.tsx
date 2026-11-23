"use client";

import { useEffect, useRef } from "react";
import Hero from "./landing/Hero";
import Story from "./landing/Story";
import Pricing from "./landing/Pricing";
import LeadCapture from "./landing/LeadCapture";
import Close from "./landing/Close";
import Footer from "./landing/Footer";

/* The landing page coordinates page-wide motion (scroll reveals, counters, sticky CTA). Each
   content section lives in components/landing/. */

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Scroll reveals ---- */
    const revealEls = el.querySelectorAll<HTMLElement>(".reveal");
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const target = entry.target as HTMLElement;
            const siblings = Array.prototype.indexOf.call(
              (target.parentElement as HTMLElement).querySelectorAll(":scope > .reveal"),
              target
            );
            target.style.transitionDelay = `${Math.max(0, siblings) * 70}ms`;
            target.classList.add("in");
            io.unobserve(target);
          }
        },
        { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
      );
      revealEls.forEach((node) => io.observe(node));
      return () => io.disconnect();
    }
    revealEls.forEach((node) => node.classList.add("in"));
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* ---- Counters ---- */
    const counters = el.querySelectorAll<HTMLElement>(".count[data-count]");
    const animate = (node: HTMLElement) => {
      const target = parseInt(node.dataset.count || "0", 10) || 0;
      const prefix = node.dataset.prefix || "";
      const suffix = node.dataset.suffix || "";
      if (reducedMotion || target === 0) {
        node.textContent = `${prefix}${target}${suffix}`;
        return;
      }
      let start: number | null = null;
      const tick = (ts: number) => {
        if (start === null) start = ts;
        const p = Math.min((ts - start) / 1100, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = `${prefix}${Math.round(eased * target)}${suffix}`;
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              animate(entry.target as HTMLElement);
              io.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.6 }
      );
      counters.forEach((node) => io.observe(node));
      return () => io.disconnect();
    }
    counters.forEach(animate);
  }, []);

  useEffect(() => {
    const el = root.current;
    const sticky = el?.querySelector<HTMLElement>("#sticky-cta");
    const hero = el?.querySelector<HTMLElement>(".bw-hero");
    if (!sticky || !hero) return;
    const onScroll = () => {
      const past = window.scrollY > hero.offsetHeight - 120;
      const nearBottom = window.innerHeight + window.scrollY > document.body.offsetHeight - 420;
      sticky.classList.toggle("visible", past && !nearBottom);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="bw-landing" id="main-content" ref={root}>
      <Hero />
      <Story />
      <Pricing />
      <LeadCapture />
      <Close />
      <Footer />
    </main>
  );
}

