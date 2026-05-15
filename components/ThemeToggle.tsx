"use client";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    // On mount, read saved preference or system preference
    const saved = localStorage.getItem("theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = saved ? saved === "dark" : prefersDark;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  }

  return (
    <button
      onClick={toggle}
      className="text-sm px-3 py-1.5 rounded-full border transition-colors
        dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:text-white
        border-gray-300 bg-white text-gray-600 hover:text-gray-900"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
