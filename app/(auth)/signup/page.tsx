"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) { setError("Passwords do not match."); return; }
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName, email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Signup failed.");
      else setDone(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-8"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="w-full max-w-sm text-center animate-fade-up">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"
            style={{ background: "var(--green-dim)", border: "1px solid var(--green)" }}
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="var(--green)" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>Account Created</h2>
          <p className="text-sm mb-8" style={{ color: "var(--text-secondary)" }}>
            Welcome, <strong style={{ color: "var(--text-primary)" }}>{form.firstName}</strong>. Your officer account is active.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="w-full py-3 rounded-md text-sm font-semibold text-white transition-all"
            style={{ background: "var(--red)" }}
          >
            Sign In →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-8"
      style={{ background: "var(--bg-base)" }}
    >
      <div className="w-full max-w-sm animate-fade-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <ShieldIcon />
          <span className="badge-classified">KSP Intelligence</span>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1" style={{ color: "var(--text-primary)" }}>
            Register Officer
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Create your Khabri AI access credentials
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <InputField label="First Name" type="text" value={form.firstName} onChange={set("firstName")} placeholder="Arjun" required />
            <InputField label="Last Name" type="text" value={form.lastName} onChange={set("lastName")} placeholder="Kumar" required />
          </div>
          <InputField label="Email Address" type="email" value={form.email} onChange={set("email")} placeholder="officer@ksp.gov.in" required />
          <InputField label="Password" type="password" value={form.password} onChange={set("password")} placeholder="Minimum 8 characters" required />
          <InputField label="Confirm Password" type="password" value={form.confirm} onChange={set("confirm")} placeholder="Repeat password" required />

          {error && (
            <div
              className="flex items-center gap-2 text-xs px-3 py-2.5 rounded-md"
              style={{ background: "var(--red-dim)", border: "1px solid var(--red)", color: "var(--red)" }}
            >
              <span>⚠</span> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !form.firstName || !form.lastName || !form.email || !form.password || !form.confirm}
            className="w-full py-3 rounded-md text-sm font-semibold tracking-wide text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--red)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner /> Creating account...
              </span>
            ) : (
              "Create Account →"
            )}
          </button>
        </form>

        <div style={{ borderTop: "1px solid var(--border)", marginTop: "1.5rem", paddingTop: "1.5rem" }}>
          <p className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
            Already registered?{" "}
            <Link href="/login" style={{ color: "var(--red)" }} className="hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs mt-4 font-data" style={{ color: "var(--text-muted)", opacity: 0.5 }}>
          KSP × Hack2skill · Datathon 2026
        </p>
      </div>
    </div>
  );
}

function InputField({
  label, type, value, onChange, placeholder, required,
}: {
  label: string; type: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5 tracking-wider uppercase" style={{ color: "var(--text-muted)" }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-md px-4 py-3 text-sm font-data outline-none transition-all"
        style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
        onFocus={(e) => { e.target.style.borderColor = "var(--red)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="32" height="36" viewBox="0 0 32 36" fill="none">
      <path d="M16 1L2 7v10c0 8.5 5.9 16.5 14 18.5C24.1 33.5 30 25.5 30 17V7L16 1z" fill="var(--red)" fillOpacity="0.15" stroke="var(--red)" strokeWidth="1.5" />
      <path d="M11 18l3 3 7-7" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0110 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
