export function getUserEmail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const user = JSON.parse(sessionStorage.getItem("khabri_user") ?? "{}");
    return user.email ?? null;
  } catch {
    return null;
  }
}

export function chatHeaders(): HeadersInit {
  const email = getUserEmail();
  return email ? { "Content-Type": "application/json", "X-User-Email": email } : { "Content-Type": "application/json" };
}

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};
