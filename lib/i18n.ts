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
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang] ?? STRINGS[key].en;
}

/** BCP-47 locale for Web Speech STT/TTS. */
export function speechLocale(lang: Lang): string {
  return lang === "kn" ? "kn-IN" : "en-IN";
}
