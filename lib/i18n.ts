// ponytail: plain dictionary for the visible chat/nav labels, not full app i18n.
// Add keys as views need them; swap for next-intl only if scored on deep localization.
import type { Lang } from "@/store/chat";

export const STRINGS = {
  "nav.chat":     { en: "Intelligence Chat",   kn: "ಗುಪ್ತಚರ ಚಾಟ್" },
  "nav.map":      { en: "Crime Map",           kn: "ಅಪರಾಧ ನಕ್ಷೆ" },
  "nav.network":  { en: "Criminal Network",    kn: "ಅಪರಾಧಿ ಜಾಲ" },
  "nav.profiling":{ en: "Profiling",           kn: "ವಿಶ್ಲೇಷಣೆ" },
  "nav.reports":  { en: "Case Reports",        kn: "ಪ್ರಕರಣ ವರದಿಗಳು" },
  "nav.about":    { en: "About Project",       kn: "ಯೋಜನೆ ಬಗ್ಗೆ" },
  "chat.online":  { en: "● INTELLIGENCE SYSTEM ONLINE", kn: "● ಗುಪ್ತಚರ ವ್ಯವಸ್ಥೆ ಸಕ್ರಿಯವಾಗಿದೆ" },
  "chat.heading": { en: "What do you want to investigate?", kn: "ನೀವು ಏನನ್ನು ತನಿಖೆ ಮಾಡಲು ಬಯಸುತ್ತೀರಿ?" },
  "chat.subtitle":{ en: "Ask anything about Karnataka crime data in plain English. I generate SQL, execute it, and explain what I found.",
                    kn: "ಕರ್ನಾಟಕದ ಅಪರಾಧ ಮಾಹಿತಿಯ ಬಗ್ಗೆ ಕನ್ನಡ ಅಥವಾ ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ ಕೇಳಿ. ನಾನು SQL ರಚಿಸಿ, ಚಲಾಯಿಸಿ, ಫಲಿತಾಂಶವನ್ನು ವಿವರಿಸುತ್ತೇನೆ." },
  "chat.placeholder": { en: "Query the crime database… (Enter to send)", kn: "ಅಪರಾಧ ಡೇಟಾಬೇಸ್ ಅನ್ನು ಪ್ರಶ್ನಿಸಿ… (ಕಳುಹಿಸಲು Enter)" },
  "chat.footer":  { en: "KSP Intelligence System · Read-only · AI-generated analysis",
                    kn: "KSP ಗುಪ್ತಚರ ವ್ಯವಸ್ಥೆ · ಓದಲು-ಮಾತ್ರ · AI-ರಚಿತ ವಿಶ್ಲೇಷಣೆ" },
  "chat.generateQuery": { en: "Generate a query", kn: "ಪ್ರಶ್ನೆ ರಚಿಸಿ" },

  // Top bar
  "header.restricted": { en: "RESTRICTED", kn: "ನಿರ್ಬಂಧಿತ" },
  "header.live":        { en: "LIVE", kn: "ಲೈವ್" },
  "header.exportPdf":   { en: "Export conversation as PDF", kn: "ಸಂಭಾಷಣೆಯನ್ನು PDF ಆಗಿ ರಫ್ತು ಮಾಡಿ" },

  // Sidebar / user
  "user.officer":      { en: "Officer", kn: "ಅಧಿಕಾರಿ" },
  "user.analystFallback": { en: "KSP Analyst", kn: "KSP ವಿಶ್ಲೇಷಕ" },
  "user.profile":       { en: "Profile", kn: "ಪ್ರೊಫೈಲ್" },
  "user.signOut":       { en: "Sign out", kn: "ಸೈನ್ ಔಟ್" },
  "user.role":          { en: "Role", kn: "ಪಾತ್ರ" },
  "user.roleValue":     { en: "KSP Intelligence Analyst", kn: "KSP ಗುಪ್ತಚರ ವಿಶ್ಲೇಷಕ" },
  "user.access":        { en: "Access", kn: "ಪ್ರವೇಶ" },
  "user.accessValue":   { en: "Restricted", kn: "ನಿರ್ಬಂಧಿತ" },
  "user.close":         { en: "Close", kn: "ಮುಚ್ಚಿ" },
  "user.signOutConfirmTitle": { en: "Sign out?", kn: "ಸೈನ್ ಔಟ್ ಮಾಡಬೇಕೇ?" },
  "user.signOutConfirmBody":  { en: "You'll need to sign in again to access Khabri AI.",
                                 kn: "Khabri AI ಪ್ರವೇಶಿಸಲು ನೀವು ಮತ್ತೆ ಸೈನ್ ಇನ್ ಮಾಡಬೇಕಾಗುತ್ತದೆ." },
  "user.cancel":        { en: "Cancel", kn: "ರದ್ದುಮಾಡಿ" },

  // Case Board
  "board.title":        { en: "Case Board", kn: "ಪ್ರಕರಣ ಫಲಕ" },
  "board.empty":         { en: "Reasoning steps will pin here as the agent investigates.",
                            kn: "ಏಜೆಂಟ್ ತನಿಖೆ ಮಾಡುತ್ತಿದ್ದಂತೆ ತಾರ್ಕಿಕ ಹಂತಗಳು ಇಲ್ಲಿ ಪಿನ್ ಆಗುತ್ತವೆ." },
  "board.why":           { en: "Why", kn: "ಏಕೆ" },
  "board.statusRunning": { en: "Running", kn: "ಚಾಲನೆಯಲ್ಲಿ" },
  "board.statusDone":    { en: "Done", kn: "ಮುಗಿದಿದೆ" },
  "board.statusFailed":  { en: "Failed", kn: "ವಿಫಲ" },
  "board.rows":          { en: "row(s)", kn: "ಸಾಲು(ಗಳು)" },
  "board.relatedCases":  { en: "related case(s)", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣ(ಗಳು)" },
  "board.insights":      { en: "insight(s)", kn: "ಒಳನೋಟ(ಗಳು)" },
  "board.prediction":    { en: "Prediction", kn: "ಮುನ್ಸೂಚನೆ" },
  "board.tool.queryDatabase":       { en: "Query Database", kn: "ಡೇಟಾಬೇಸ್ ಪ್ರಶ್ನೆ" },
  "board.tool.searchRelatedCases":  { en: "Search Related Cases", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣ ಹುಡುಕಿ" },
  "board.tool.checkInsights":       { en: "Check Insights", kn: "ಒಳನೋಟಗಳನ್ನು ಪರಿಶೀಲಿಸಿ" },
  "board.tool.getNetworkOrMapData": { en: "Network / Map Data", kn: "ಜಾಲ / ನಕ್ಷೆ ಡೇಟಾ" },
  "board.tool.predictRisk":         { en: "Risk Prediction", kn: "ಅಪಾಯ ಮುನ್ಸೂಚನೆ" },

  // Insight briefing
  "insight.title":     { en: "Intelligence Briefing", kn: "ಗುಪ್ತಚರ ವರದಿ" },
  "insight.expand":     { en: "▸ expand", kn: "▸ ವಿಸ್ತರಿಸಿ" },
  "insight.collapse":   { en: "▾ collapse", kn: "▾ ಮುಚ್ಚಿ" },
  "insight.investigate":{ en: "→ Investigate", kn: "→ ತನಿಖೆ ಮಾಡಿ" },
  "insight.type.spike":         { en: "SPIKE", kn: "ಏರಿಕೆ" },
  "insight.type.repeat_suspect":{ en: "REPEAT SUSPECT", kn: "ಪುನರಾವರ್ತಿತ ಶಂಕಿತ" },
  "insight.type.weekly_surge":  { en: "SURGE", kn: "ಉಲ್ಬಣ" },
  "insight.type.forecast":      { en: "⚠ FORECAST", kn: "⚠ ಮುನ್ಸೂಚನೆ" },
  "insight.type.default":       { en: "ALERT", kn: "ಎಚ್ಚರಿಕೆ" },

  // Chat history
  "history.newChat":    { en: "New chat", kn: "ಹೊಸ ಚಾಟ್" },
  "history.recent":     { en: "Recent chats", kn: "ಇತ್ತೀಚಿನ ಚಾಟ್‌ಗಳು" },
  "history.empty":      { en: "No chats yet", kn: "ಇನ್ನೂ ಚಾಟ್‌ಗಳಿಲ್ಲ" },
  "history.delete":     { en: "Delete chat", kn: "ಚಾಟ್ ಅಳಿಸಿ" },
  "history.justNow":    { en: "Just now", kn: "ಈಗಷ್ಟೇ" },
  "history.minAgo":     { en: "m ago", kn: " ನಿಮಿಷ ಹಿಂದೆ" },
  "history.hourAgo":    { en: "h ago", kn: " ಗಂಟೆ ಹಿಂದೆ" },
  "history.dayAgo":     { en: "d ago", kn: " ದಿನ ಹಿಂದೆ" },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang] ?? STRINGS[key].en;
}

/** BCP-47 locale for Web Speech STT/TTS. */
export function speechLocale(lang: Lang): string {
  return lang === "kn" ? "kn-IN" : "en-IN";
}
