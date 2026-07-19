"use client";

import { useEffect } from "react";

export function ScrollToHash() {
  useEffect(() => {
    const section =
      sessionStorage.getItem("scroll-to-section") ||
      window.location.hash.replace("#", "");

    sessionStorage.removeItem("scroll-to-section");

    if (!section) return;

    const el = document.getElementById(section);
    if (el) {
      const OFFSET = 80;
      const top = el.getBoundingClientRect().top + window.scrollY - OFFSET;
      window.scrollTo({ top, behavior: "smooth" });
    }
  }, []);

  return null;
}
