"use client";
import { useEffect, useState } from "react";

// ponytail: the narrative only ever emits **bold** — split on it rather than
// pulling in a markdown renderer. Swap for one if headings/lists show up.
function renderBold(text: string) {
  return text
    .split(/\*\*(.+?)\*\*/g)
    .map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
}

export function StreamingText({ text, loading }: { text: string; loading?: boolean }) {
  const [displayed, setDisplayed] = useState("");

  useEffect(() => { setDisplayed(text); }, [text]);

  if (!displayed && loading) {
    return (
      <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
        <span className="cursor-blink" />
      </span>
    );
  }

  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
      {renderBold(displayed)}
      {loading && <span className="cursor-blink" />}
    </p>
  );
}
