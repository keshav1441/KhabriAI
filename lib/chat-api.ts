// Auth is carried by the httpOnly `khabri_session` cookie, sent automatically
// on same-origin requests — no header needed here.
export function chatHeaders(): HeadersInit {
  return { "Content-Type": "application/json" };
}

export type ChatSessionSummary = {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
};
