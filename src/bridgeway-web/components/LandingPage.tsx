"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Hero from "./landing/Hero";
import Story from "./landing/Story";
import Pricing from "./landing/Pricing";
import LeadCapture from "./landing/LeadCapture";
import Close from "./landing/Close";
import Footer from "./landing/Footer";

/* The landing page keeps the chrome (header, mobile menu) and the page-wide
   motion (scroll reveals, pipeline lighting, counters, sticky CTA). Each
   content section lives in components/landing/. */

export default function LandingPage() {
  const root = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

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

    /* ---- Pipeline step lighting ---- */
    const steps = el.querySelectorAll<HTMLElement>(".bw-pipe-step");
    if (reducedMotion) {
      steps.forEach((s) => s.classList.add("lit"));
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const lightSteps = () => {
      steps.forEach((s) => s.classList.remove("lit"));
      steps[0]?.classList.add("lit");
      timers = [
        setTimeout(() => steps[1]?.classList.add("lit"), 1900),
        setTimeout(() => steps[2]?.classList.add("lit"), 3900),
        setTimeout(() => steps.forEach((s) => s.classList.remove("lit")), 5900),
      ];
    };
    lightSteps();
    const interval = setInterval(lightSteps, 6000);
    return () => {
      timers.forEach(clearTimeout);
      clearInterval(interval);
    };
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
      <header className="bw-header">
        <div className="bw-header-inner">
          <Link className="bw-brand" href="/" aria-label="BridgeWayRefer home">
            <img className="bw-brand-logo" src="/brand-logo.png" alt="BridgeWayRefer" width={116} height={40} />
          </Link>
          <nav className="bw-nav" aria-label="Main navigation">
            <a href="#how-it-works">How it works</a>
            <Link href="/industries/dental">Dental</Link>
            <Link href="/industries/trades">Trades</Link>
            <Link href="/pricing">Pricing</Link>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="bw-header-actions">
            <Link className="bw-signin" href="/staff/login">
              Sign in
            </Link>
            <Link className="bw-btn bw-btn-primary bw-btn-sm" href="/signup?plan=workspace">
              Get started
            </Link>
            <button
              type="button"
              className="bw-menu-toggle"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              aria-controls="bw-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span aria-hidden="true">{menuOpen ? "\u2715" : "\u2630"}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="bw-mobile-menu" id="bw-mobile-menu" aria-label="Mobile navigation" onClick={() => setMenuOpen(false)}>
            <a href="#how-it-works">How it works</a>
            <Link href="/industries/dental">Dental</Link>
            <Link href="/industries/trades">Trades</Link>
            <Link href="/pricing">Pricing</Link>
            <a href="#faq">FAQ</a>
            <Link href="/staff/login">Sign in</Link>
            <Link className="bw-btn bw-btn-primary" href="/signup?plan=workspace">Get started</Link>
          </nav>
        )}
      </header>

      <Hero />
      <Story />
      <Pricing />
      <LeadCapture />
      <Close />
      <Footer />
    </main>
  );
}
