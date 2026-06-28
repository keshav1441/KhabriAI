"use client";
import { useEffect, useState } from "react";

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
      {displayed}
      {loading && <span className="cursor-blink" />}
    </p>
  );
}
