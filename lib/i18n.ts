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
  "header.statewide":  { en: "STATEWIDE", kn: "ರಾಜ್ಯವ್ಯಾಪಿ" },
  "header.scope":      { en: "SCOPE", kn: "ವ್ಯಾಪ್ತಿ" },
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
  "board.repaired":      { en: "SQL self-corrected", kn: "SQL ಸ್ವಯಂ-ಸರಿಪಡಿಸಲಾಗಿದೆ" },
  "board.relatedCases":  { en: "related case(s)", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣ(ಗಳು)" },
  "board.insights":      { en: "insight(s)", kn: "ಒಳನೋಟ(ಗಳು)" },
  "board.prediction":    { en: "Prediction", kn: "ಮುನ್ಸೂಚನೆ" },
  "board.tool.queryDatabase":       { en: "Query Database", kn: "ಡೇಟಾಬೇಸ್ ಪ್ರಶ್ನೆ" },
  "board.tool.searchRelatedCases":  { en: "Search Related Cases", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣ ಹುಡುಕಿ" },
  "board.tool.checkInsights":       { en: "Check Insights", kn: "ಒಳನೋಟಗಳನ್ನು ಪರಿಶೀಲಿಸಿ" },
  "board.tool.getNetworkOrMapData": { en: "Network / Map Data", kn: "ಜಾಲ / ನಕ್ಷೆ ಡೇಟಾ" },
  "board.tool.predictRisk":         { en: "Risk Prediction", kn: "ಅಪಾಯ ಮುನ್ಸೂಚನೆ" },
  "board.tool.askClarification":    { en: "Clarify", kn: "ಸ್ಪಷ್ಟೀಕರಣ" },
  "board.tool.findSimilarCases":    { en: "Modus Operandi Link", kn: "ಅಪರಾಧ ವಿಧಾನ ಹೊಂದಾಣಿಕೆ" },
  "board.tool.buildCrewDossier":    { en: "Crew Dossier", kn: "ತಂಡದ ಕಡತ" },
  "board.tool.predictHotspots":     { en: "Hotspot Forecast", kn: "ಅಪರಾಧ ಕೇಂದ್ರ ಮುನ್ಸೂಚನೆ" },
  "board.linkedCases":              { en: "linked case(s)", kn: "ಹೊಂದಿದ ಪ್ರಕರಣ(ಗಳು)" },
  "board.clarify":                  { en: "Needs your input", kn: "ನಿಮ್ಮ ಉತ್ತರ ಅಗತ್ಯ" },
  "board.peopleMatch":              { en: "different people match", kn: "ವಿಭಿನ್ನ ವ್ಯಕ್ತಿಗಳು ಹೊಂದುತ್ತಾರೆ" },

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

  // Register FIR
  "nav.registerFir":    { en: "Register FIR", kn: "ಎಫ್‌ಐಆರ್ ದಾಖಲಿಸಿ" },
  "fir.title":          { en: "First Information Report", kn: "ಪ್ರಥಮ ಮಾಹಿತಿ ವರದಿ" },
  "fir.subtitle":       { en: "Register a new crime. It becomes queryable by the assistant immediately.",
                          kn: "ಹೊಸ ಅಪರಾಧವನ್ನು ದಾಖಲಿಸಿ. ಇದು ತಕ್ಷಣವೇ ಸಹಾಯಕನಿಗೆ ಲಭ್ಯವಾಗುತ್ತದೆ." },
  "fir.loading":        { en: "Loading reference lists…", kn: "ಉಲ್ಲೇಖ ಪಟ್ಟಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…" },
  "fir.loadFailed":     { en: "Could not load reference lists.", kn: "ಉಲ್ಲೇಖ ಪಟ್ಟಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ." },
  "fir.retry":          { en: "Retry", kn: "ಮರುಪ್ರಯತ್ನಿಸಿ" },
  "fir.sec.jurisdiction": { en: "Jurisdiction", kn: "ವ್ಯಾಪ್ತಿ" },
  "fir.sec.offence":    { en: "Offence", kn: "ಅಪರಾಧ" },
  "fir.sec.facts":      { en: "Brief facts", kn: "ಸಂಕ್ಷಿಪ್ತ ವಿವರಗಳು" },
  "fir.sec.complainant":{ en: "Complainant", kn: "ದೂರುದಾರ" },
  "fir.sec.accused":    { en: "Accused", kn: "ಆರೋಪಿಗಳು" },
  "fir.sec.victims":    { en: "Victims", kn: "ಸಂತ್ರಸ್ತರು" },
  "fir.sec.sections":   { en: "Sections of law", kn: "ಕಾನೂನು ಸೆಕ್ಷನ್‌ಗಳು" },
  "fir.district":       { en: "District", kn: "ಜಿಲ್ಲೆ" },
  "fir.station":        { en: "Police station", kn: "ಪೊಲೀಸ್ ಠಾಣೆ" },
  "fir.court":          { en: "Court", kn: "ನ್ಯಾಯಾಲಯ" },
  "fir.crimeGroup":     { en: "Crime group", kn: "ಅಪರಾಧ ಗುಂಪು" },
  "fir.crime":          { en: "Specific crime", kn: "ನಿರ್ದಿಷ್ಟ ಅಪರಾಧ" },
  "fir.registeredDate": { en: "Registration date", kn: "ದಾಖಲಾತಿ ದಿನಾಂಕ" },
  "fir.incidentDate":   { en: "Incident date", kn: "ಘಟನೆಯ ದಿನಾಂಕ" },
  "fir.category":       { en: "Case category", kn: "ಪ್ರಕರಣದ ವರ್ಗ" },
  "fir.gravity":        { en: "Gravity", kn: "ಗಂಭೀರತೆ" },
  "fir.latitude":       { en: "Latitude", kn: "ಅಕ್ಷಾಂಶ" },
  "fir.longitude":      { en: "Longitude", kn: "ರೇಖಾಂಶ" },
  "fir.briefFacts":     { en: "Brief facts of the case (min 20 characters)", kn: "ಪ್ರಕರಣದ ಸಂಕ್ಷಿಪ್ತ ವಿವರ (ಕನಿಷ್ಠ 20 ಅಕ್ಷರಗಳು)" },
  "fir.name":           { en: "Name", kn: "ಹೆಸರು" },
  "fir.age":            { en: "Age", kn: "ವಯಸ್ಸು" },
  "fir.gender":         { en: "Gender", kn: "ಲಿಂಗ" },
  "fir.gender.male":    { en: "Male", kn: "ಪುರುಷ" },
  "fir.gender.female":  { en: "Female", kn: "ಮಹಿಳೆ" },
  "fir.gender.other":   { en: "Transgender", kn: "ತೃತೀಯ ಲಿಂಗ" },
  "fir.personId":       { en: "Person ID (if known)", kn: "ವ್ಯಕ್ತಿ ID (ತಿಳಿದಿದ್ದರೆ)" },
  "fir.select":         { en: "— select —", kn: "— ಆಯ್ಕೆಮಾಡಿ —" },
  "fir.optional":       { en: "optional", kn: "ಐಚ್ಛಿಕ" },
  "fir.addRow":         { en: "+ Add", kn: "+ ಸೇರಿಸಿ" },
  "fir.remove":         { en: "Remove", kn: "ತೆಗೆದುಹಾಕಿ" },
  "fir.maxRows":        { en: "max 10", kn: "ಗರಿಷ್ಠ 10" },
  "fir.submit":         { en: "Register FIR", kn: "ಎಫ್‌ಐಆರ್ ದಾಖಲಿಸಿ" },
  "fir.submitting":     { en: "Registering…", kn: "ದಾಖಲಿಸಲಾಗುತ್ತಿದೆ…" },
  "fir.reset":          { en: "Clear form", kn: "ಫಾರ್ಮ್ ತೆರವುಗೊಳಿಸಿ" },
  "fir.error":          { en: "Registration failed", kn: "ದಾಖಲಾತಿ ವಿಫಲವಾಗಿದೆ" },
  "fir.success":        { en: "FIR registered", kn: "ಎಫ್‌ಐಆರ್ ದಾಖಲಾಗಿದೆ" },
  "fir.crimeNo":        { en: "Crime No.", kn: "ಅಪರಾಧ ಸಂಖ್ಯೆ" },
  "fir.openCase":       { en: "Open case", kn: "ಪ್ರಕರಣ ತೆರೆಯಿರಿ" },
  "fir.askAssistant":   { en: "Ask the assistant about it", kn: "ಸಹಾಯಕನನ್ನು ಈ ಬಗ್ಗೆ ಕೇಳಿ" },
  "fir.registerAnother":{ en: "Register another", kn: "ಇನ್ನೊಂದು ದಾಖಲಿಸಿ" },
  // Proactive alerts
  "alerts.title":       { en: "Alerts", kn: "ಎಚ್ಚರಿಕೆಗಳು" },
  "alerts.briefing":    { en: "Briefing", kn: "ಸಂಕ್ಷಿಪ್ತ ವರದಿ" },
  "alerts.new24h":      { en: "new in 24h", kn: "24 ಗಂಟೆಯಲ್ಲಿ ಹೊಸದು" },
  "alerts.empty":       { en: "No alerts. Detection runs on a schedule — findings appear here.",
                          kn: "ಎಚ್ಚರಿಕೆಗಳಿಲ್ಲ. ಪತ್ತೆ ನಿಗದಿತವಾಗಿ ನಡೆಯುತ್ತದೆ — ಫಲಿತಾಂಶಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ." },
  "alerts.markAll":     { en: "Mark all read", kn: "ಎಲ್ಲವನ್ನೂ ಓದಿದೆ ಎಂದು ಗುರುತಿಸಿ" },
  "alerts.run":         { en: "Run detection", kn: "ಪತ್ತೆ ಚಲಾಯಿಸಿ" },
  "alerts.running":     { en: "Scanning…", kn: "ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…" },
  "alerts.investigate": { en: "Investigate →", kn: "ತನಿಖೆ ಮಾಡಿ →" },
  "alerts.kind.spike":          { en: "SPIKE", kn: "ಏರಿಕೆ" },
  "alerts.kind.repeat_suspect": { en: "REPEAT", kn: "ಪುನರಾವರ್ತಿತ" },
  "alerts.kind.weekly_surge":   { en: "SURGE", kn: "ಉಲ್ಬಣ" },
  "alerts.kind.forecast":       { en: "FORECAST", kn: "ಮುನ್ಸೂಚನೆ" },
  "alerts.kind.mo_link":        { en: "MO LINK", kn: "ವಿಧಾನ ಸಂಪರ್ಕ" },
  "alerts.kind.duplicate":      { en: "DUPLICATE", kn: "ನಕಲಿ" },
  "alerts.kind.default":        { en: "ALERT", kn: "ಎಚ್ಚರಿಕೆ" },

  // Crew dossier — the multi-hop MO/co-accused walk
  "nav.crew":             { en: "Crew Dossier", kn: "ತಂಡದ ಕಡತ" },
  "crew.tag":             { en: "CREW DOSSIER", kn: "ತಂಡದ ಕಡತ" },
  "crew.subtitle":        { en: "Walk outward from one FIR or one person along co-accused links and repeated modus operandi — and see the series, not the single case.",
                            kn: "ಒಂದು ಎಫ್‌ಐಆರ್ ಅಥವಾ ಒಬ್ಬ ವ್ಯಕ್ತಿಯಿಂದ ಸಹ-ಆರೋಪಿ ಸಂಪರ್ಕ ಮತ್ತು ಪುನರಾವರ್ತಿತ ಅಪರಾಧ ವಿಧಾನದ ಮೂಲಕ ಹೊರಕ್ಕೆ ನಡೆದು — ಒಂದೇ ಪ್ರಕರಣವಲ್ಲ, ಇಡೀ ಸರಣಿಯನ್ನು ನೋಡಿ." },
  "crew.build":           { en: "Build crew dossier", kn: "ತಂಡದ ಕಡತ ಸಿದ್ಧಪಡಿಸಿ" },
  "crew.buildHint":       { en: "Follow this case outward — co-accused and matching narratives.",
                            kn: "ಈ ಪ್ರಕರಣವನ್ನು ಹೊರಕ್ಕೆ ಅನುಸರಿಸಿ — ಸಹ-ಆರೋಪಿಗಳು ಮತ್ತು ಹೊಂದುವ ವಿವರಣೆಗಳು." },
  "crew.exportPdf":       { en: "Export dossier as PDF", kn: "ಕಡತವನ್ನು PDF ಆಗಿ ರಫ್ತು ಮಾಡಿ" },
  "crew.close":           { en: "Close", kn: "ಮುಚ್ಚಿ" },
  "crew.loading":         { en: "Building dossier…", kn: "ಕಡತ ಸಿದ್ಧವಾಗುತ್ತಿದೆ…" },
  "crew.error":           { en: "Could not build the dossier.", kn: "ಕಡತ ಸಿದ್ಧಪಡಿಸಲಾಗಲಿಲ್ಲ." },
  "crew.empty":           { en: "Nothing connects to this seed — no co-accused and no matching narrative.",
                            kn: "ಈ ಮೂಲಕ್ಕೆ ಏನೂ ಸಂಪರ್ಕವಿಲ್ಲ — ಸಹ-ಆರೋಪಿಗಳಿಲ್ಲ, ಹೊಂದುವ ವಿವರಣೆಯೂ ಇಲ್ಲ." },
  "crew.truncated":       { en: "Walk stopped at the cap — the real network is larger.",
                            kn: "ನಡಿಗೆ ಮಿತಿಯಲ್ಲಿ ನಿಂತಿದೆ — ನಿಜವಾದ ಜಾಲ ಇನ್ನೂ ದೊಡ್ಡದು." },

  "crew.sum.cases":       { en: "Cases", kn: "ಪ್ರಕರಣಗಳು" },
  "crew.sum.members":     { en: "Members", kn: "ಸದಸ್ಯರು" },
  "crew.sum.districts":   { en: "Districts", kn: "ಜಿಲ್ಲೆಗಳು" },
  "crew.sum.arrested":    { en: "Arrested", kn: "ಬಂಧನ" },
  "crew.sum.chargesheeted": { en: "Chargesheeted", kn: "ದೋಷಾರೋಪ" },
  "crew.sum.open":        { en: "Open", kn: "ಬಾಕಿ" },
  "crew.span":            { en: "Active", kn: "ಸಕ್ರಿಯ" },
  "crew.crossDistrict":   { en: "CROSSES DISTRICT BOUNDARIES", kn: "ಜಿಲ್ಲಾ ಗಡಿ ದಾಟುತ್ತದೆ" },
  "crew.singleDistrict":  { en: "Contained within one district", kn: "ಒಂದೇ ಜಿಲ್ಲೆಯೊಳಗೆ ಸೀಮಿತ" },

  "crew.signature":       { en: "Signature", kn: "ವಿಶಿಷ್ಟ ಗುರುತು" },
  "crew.signatureNote":   { en: "Details repeated across the crew's own FIR narratives — their habit, in the files' own words.",
                            kn: "ತಂಡದ ಸ್ವಂತ ಎಫ್‌ಐಆರ್ ವಿವರಣೆಗಳಲ್ಲಿ ಪುನರಾವರ್ತಿತ ಅಂಶಗಳು — ಕಡತಗಳ ಸ್ವಂತ ಪದಗಳಲ್ಲಿ ಅವರ ಅಭ್ಯಾಸ." },

  "crew.members":         { en: "Members", kn: "ಸದಸ್ಯರು" },
  "crew.col.name":        { en: "Name", kn: "ಹೆಸರು" },
  "crew.col.personId":    { en: "Person ID", kn: "ವ್ಯಕ್ತಿ ID" },
  "crew.col.age":         { en: "Age / gender", kn: "ವಯಸ್ಸು / ಲಿಂಗ" },
  "crew.col.inCrew":      { en: "In crew", kn: "ತಂಡದಲ್ಲಿ" },
  "crew.col.total":       { en: "Total cases", kn: "ಒಟ್ಟು ಪ್ರಕರಣ" },
  "crew.col.districts":   { en: "Districts", kn: "ಜಿಲ್ಲೆಗಳು" },
  "crew.col.arrests":     { en: "Arrests", kn: "ಬಂಧನಗಳು" },

  "crew.timeline":        { en: "Case timeline", kn: "ಪ್ರಕರಣ ಕಾಲಾನುಕ್ರಮ" },
  "crew.link.seed":       { en: "SEED", kn: "ಮೂಲ" },
  "crew.link.coAccused":  { en: "CO-ACCUSED", kn: "ಸಹ-ಆರೋಪಿ" },
  "crew.link.mo":         { en: "MO", kn: "ವಿಧಾನ" },
  "crew.linkCrossDistrict": { en: "other district", kn: "ಬೇರೆ ಜಿಲ್ಲೆ" },

  "crew.seedPrompt":      { en: "Enter a Crime No. / case ID or a Person ID", kn: "ಅಪರಾಧ ಸಂಖ್ಯೆ / ಪ್ರಕರಣ ID ಅಥವಾ ವ್ಯಕ್ತಿ ID ನಮೂದಿಸಿ" },
  "crew.seedPlaceholder": { en: "e.g. 10423 or KA0193882", kn: "ಉದಾ. 10423 ಅಥವಾ KA0193882" },
  "crew.seedSubmit":      { en: "Build dossier", kn: "ಕಡತ ಸಿದ್ಧಪಡಿಸಿ" },
  "crew.seedIdle":        { en: "Give the walk a starting point — a case ID or a Person ID from the network view.",
                            kn: "ನಡಿಗೆಗೆ ಆರಂಭ ಬಿಂದು ಕೊಡಿ — ಪ್ರಕರಣ ID ಅಥವಾ ಜಾಲ ನೋಟದ ವ್ಯಕ್ತಿ ID." },

  // Crime map — layers
  "map.layer":            { en: "Layer", kn: "ಪದರ" },
  "map.layer.observed":   { en: "Observed", kn: "ದಾಖಲಾದದ್ದು" },
  "map.layer.predicted":  { en: "Predicted", kn: "ಮುನ್ಸೂಚಿತ" },
  "map.loading":          { en: "Loading crime map…", kn: "ಅಪರಾಧ ನಕ್ಷೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  "map.list.observed":    { en: "Districts by Crime Count", kn: "ಪ್ರಕರಣ ಸಂಖ್ಯೆಯಂತೆ ಜಿಲ್ಲೆಗಳು" },
  "map.list.predicted":   { en: "Districts by Projected Cases", kn: "ಮುನ್ಸೂಚಿತ ಪ್ರಕರಣಗಳಂತೆ ಜಿಲ್ಲೆಗಳು" },
  "map.rank":             { en: "Rank", kn: "ಶ್ರೇಣಿ" },
  "map.cases":            { en: "cases", kn: "ಪ್ರಕರಣಗಳು" },
  "map.openInGmaps":      { en: "Open in Google Maps ↗", kn: "ಗೂಗಲ್ ನಕ್ಷೆಯಲ್ಲಿ ತೆರೆಯಿರಿ ↗" },
  "map.scope":            { en: "Scope", kn: "ವ್ಯಾಪ್ತಿ" },

  // Predictive hotspots — a projection has to say how it was made
  "hotspot.loading":      { en: "Computing the forecast…", kn: "ಮುನ್ಸೂಚನೆ ಲೆಕ್ಕಿಸಲಾಗುತ್ತಿದೆ…" },
  "hotspot.error":        { en: "Could not load the forecast.", kn: "ಮುನ್ಸೂಚನೆ ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ." },
  "hotspot.empty":        { en: "No district has enough history to project.",
                            kn: "ಮುನ್ಸೂಚನೆ ನೀಡಲು ಯಾವ ಜಿಲ್ಲೆಗೂ ಸಾಕಷ್ಟು ಇತಿಹಾಸವಿಲ್ಲ." },
  "hotspot.observed30":   { en: "Last 30 days", kn: "ಕಳೆದ 30 ದಿನಗಳು" },
  "hotspot.predicted30":  { en: "Projected next 30 days", kn: "ಮುಂದಿನ 30 ದಿನಗಳ ಮುನ್ಸೂಚನೆ" },
  "hotspot.confidence":   { en: "Confidence", kn: "ವಿಶ್ವಾಸ" },
  "hotspot.confidence.low":    { en: "LOW", kn: "ಕಡಿಮೆ" },
  "hotspot.confidence.medium": { en: "MEDIUM", kn: "ಮಧ್ಯಮ" },
  "hotspot.confidence.high":   { en: "HIGH", kn: "ಹೆಚ್ಚು" },
  "hotspot.drivers":      { en: "Rising crime groups", kn: "ಏರುತ್ತಿರುವ ಅಪರಾಧ ಗುಂಪುಗಳು" },
  "hotspot.perMonth":     { en: "/month", kn: "/ತಿಂಗಳಿಗೆ" },
  "hotspot.trend":        { en: "Trend", kn: "ಪ್ರವೃತ್ತಿ" },
  "hotspot.fit":          { en: "Fit (R²)", kn: "ಹೊಂದಾಣಿಕೆ (R²)" },
  "hotspot.method":       { en: "How this was calculated", kn: "ಇದನ್ನು ಹೇಗೆ ಲೆಕ್ಕಿಸಲಾಗಿದೆ" },
  "hotspot.monthsFitted": { en: "Months fitted", kn: "ಬಳಸಿದ ತಿಂಗಳುಗಳು" },
  "hotspot.districtNote": { en: "The projection is per district × crime group, never per station.",
                            kn: "ಮುನ್ಸೂಚನೆ ಜಿಲ್ಲೆ × ಅಪರಾಧ ಗುಂಪಿನ ಮಟ್ಟದಲ್ಲಿದೆ, ಠಾಣೆಯ ಮಟ್ಟದಲ್ಲಿ ಅಲ್ಲ." },
  "hotspot.priorities":   { en: "Patrol Priorities", kn: "ಗಸ್ತು ಆದ್ಯತೆಗಳು" },
  "hotspot.prioritiesSubtitle": { en: "Ranked by the uplift a shift would absorb, discounted by how well the trend line fits.",
                            kn: "ಒಂದು ಪಾಳಿ ನಿಭಾಯಿಸಬೇಕಾದ ಹೆಚ್ಚಳದ ಆಧಾರದ ಮೇಲೆ ಶ್ರೇಣೀಕರಿಸಲಾಗಿದೆ, ಪ್ರವೃತ್ತಿ ರೇಖೆಯ ಹೊಂದಾಣಿಕೆಯಷ್ಟು ತೂಕ ನೀಡಿ." },
  "hotspot.prioritiesEmpty": { en: "No rising district × crime group clears the bar right now.",
                            kn: "ಸದ್ಯಕ್ಕೆ ಯಾವ ಜಿಲ್ಲೆ × ಅಪರಾಧ ಗುಂಪೂ ಆದ್ಯತೆಯ ಮಿತಿ ದಾಟಿಲ್ಲ." },
  "hotspot.stations":     { en: "Stations carrying the load", kn: "ಹೊರೆ ಹೊತ್ತ ಠಾಣೆಗಳು" },
  "hotspot.stationsNote": { en: "Station shares are the district's observed last 90 days — not a forecast.",
                            kn: "ಠಾಣೆಗಳ ಪಾಲು ಜಿಲ್ಲೆಯ ಕಳೆದ 90 ದಿನಗಳ ದಾಖಲೆ — ಮುನ್ಸೂಚನೆ ಅಲ್ಲ." },
  "hotspot.reason":       { en: "Why", kn: "ಏಕೆ" },
  "hotspot.close":        { en: "Close", kn: "ಮುಚ್ಚಿ" },

  // Answer feedback — sits under every answer, so the labels stay short
  "feedback.up":          { en: "Helpful", kn: "ಸಹಾಯಕ" },
  "feedback.down":        { en: "Not helpful", kn: "ಸಹಾಯಕವಲ್ಲ" },
  "feedback.recorded":    { en: "Thanks — recorded", kn: "ಧನ್ಯವಾದ — ದಾಖಲಾಗಿದೆ" },
  "feedback.prompt":      { en: "What was wrong?", kn: "ಏನು ತಪ್ಪಾಗಿತ್ತು?" },
  "feedback.send":        { en: "Send", kn: "ಕಳುಹಿಸಿ" },
  "feedback.skip":        { en: "Skip", kn: "ಬಿಟ್ಟುಬಿಡಿ" },
  "feedback.failed":      { en: "Could not record that", kn: "ಅದನ್ನು ದಾಖಲಿಸಲಾಗಲಿಲ್ಲ" },
  // FIR document intake
  "fir.upload.title":     { en: "Start from a document", kn: "ದಾಖಲೆಯಿಂದ ಪ್ರಾರಂಭಿಸಿ" },
  "fir.upload.hint":      { en: "Upload a scanned or typed FIR. Everything extracted is shown for checking before anything is saved.",
                            kn: "ಸ್ಕ್ಯಾನ್ ಮಾಡಿದ ಅಥವಾ ಟೈಪ್ ಮಾಡಿದ ಎಫ್‌ಐಆರ್ ಅಪ್‌ಲೋಡ್ ಮಾಡಿ. ಉಳಿಸುವ ಮೊದಲು ಹೊರತೆಗೆದ ಎಲ್ಲವನ್ನೂ ಪರಿಶೀಲನೆಗೆ ತೋರಿಸಲಾಗುತ್ತದೆ." },
  "fir.upload.choose":    { en: "Choose a file", kn: "ಕಡತ ಆಯ್ಕೆಮಾಡಿ" },
  "fir.upload.extracting":{ en: "Reading the document…", kn: "ದಾಖಲೆಯನ್ನು ಓದಲಾಗುತ್ತಿದೆ…" },
  "fir.upload.failed":    { en: "Could not read that document", kn: "ಆ ದಾಖಲೆಯನ್ನು ಓದಲಾಗಲಿಲ್ಲ" },
  "fir.upload.filled":    { en: "Fields filled from the document — check every one before registering",
                            kn: "ದಾಖಲೆಯಿಂದ ಭರ್ತಿ ಮಾಡಲಾಗಿದೆ — ದಾಖಲಿಸುವ ಮೊದಲು ಪ್ರತಿಯೊಂದನ್ನೂ ಪರಿಶೀಲಿಸಿ" },
  "fir.upload.unfilled":  { en: "Not found in the document", kn: "ದಾಖಲೆಯಲ್ಲಿ ಸಿಗಲಿಲ್ಲ" },
  "fir.upload.clear":     { en: "Discard extraction", kn: "ಹೊರತೆಗೆದದ್ದನ್ನು ತ್ಯಜಿಸಿ" },
  "fir.upload.source":    { en: "From the document", kn: "ದಾಖಲೆಯಿಂದ" },

  // Groundedness of the narrative
  "answer.grounded":      { en: "Figures check out", kn: "ಅಂಕಿಅಂಶಗಳು ಸರಿಹೊಂದಿವೆ" },
  "answer.ungrounded":    { en: "Unverified figure", kn: "ಪರಿಶೀಲಿಸದ ಅಂಕಿ" },
  "answer.groundedTip":   { en: "Every number in this answer was found in the data the tools returned.",
                            kn: "ಈ ಉತ್ತರದ ಪ್ರತಿಯೊಂದು ಸಂಖ್ಯೆಯೂ ಟೂಲ್‌ಗಳು ಹಿಂತಿರುಗಿಸಿದ ಡೇಟಾದಲ್ಲಿ ಕಂಡುಬಂದಿದೆ." },
  "answer.ungroundedTip": { en: "A figure in this answer was not found in the returned data. Treat it as unconfirmed.",
                            kn: "ಈ ಉತ್ತರದಲ್ಲಿನ ಒಂದು ಅಂಕಿ ಹಿಂತಿರುಗಿಸಿದ ಡೇಟಾದಲ್ಲಿ ಸಿಗಲಿಲ್ಲ. ಅದನ್ನು ಖಚಿತಪಡಿಸದ್ದೆಂದು ಪರಿಗಣಿಸಿ." },

  // Duplicate FIR detection
  "dup.title":            { en: "Possible duplicate filings", kn: "ಸಂಭಾವ್ಯ ಪುನರಾವರ್ತಿತ ದಾಖಲಾತಿಗಳು" },
  "dup.none":             { en: "No likely duplicate of this FIR", kn: "ಈ ಎಫ್‌ಐಆರ್‌ನ ಪುನರಾವರ್ತನೆ ಕಂಡುಬಂದಿಲ್ಲ" },
  "dup.checking":         { en: "Checking for duplicates…", kn: "ಪುನರಾವರ್ತನೆ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…" },
  "dup.likelihood":       { en: "Likelihood", kn: "ಸಾಧ್ಯತೆ" },
  "dup.sameStation":      { en: "Same station", kn: "ಅದೇ ಠಾಣೆ" },
  "dup.otherStation":     { en: "Different station", kn: "ಬೇರೆ ಠಾಣೆ" },
  "dup.why":              { en: "Why this matched", kn: "ಇದು ಏಕೆ ಹೊಂದಿಕೆಯಾಯಿತು" },
  "dup.open":             { en: "Open the other file", kn: "ಇನ್ನೊಂದು ಕಡತ ತೆರೆಯಿರಿ" },

  // Officer's desk
  "nav.command":          { en: "Command Centre", kn: "ಕಮಾಂಡ್ ಕೇಂದ್ರ" },
  "nav.desk":             { en: "My Desk", kn: "ನನ್ನ ಮೇಜು" },
  "desk.title":           { en: "Cases on my desk", kn: "ನನ್ನ ಮೇಜಿನ ಪ್ರಕರಣಗಳು" },
  "desk.subtitle":        { en: "What is open, what is overdue, and what is closest to slipping.",
                            kn: "ಯಾವುದು ಬಾಕಿ ಇದೆ, ಯಾವುದು ವಿಳಂಬವಾಗಿದೆ, ಮತ್ತು ಯಾವುದು ಕೈತಪ್ಪುವ ಹಂತದಲ್ಲಿದೆ." },
  "desk.empty":           { en: "Nothing pending in this scope", kn: "ಈ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಬಾಕಿ ಏನೂ ಇಲ್ಲ" },
  "desk.age":             { en: "Days since FIR", kn: "ಎಫ್‌ಐಆರ್ ನಂತರದ ದಿನಗಳು" },
  "desk.noArrest":        { en: "No arrest yet", kn: "ಇನ್ನೂ ಬಂಧನವಿಲ್ಲ" },
  "desk.csOverdue":       { en: "Chargesheet overdue", kn: "ಆರೋಪಪಟ್ಟಿ ವಿಳಂಬ" },
  "desk.csDue":           { en: "Chargesheet due soon", kn: "ಆರೋಪಪಟ್ಟಿ ಶೀಘ್ರದಲ್ಲಿ ಬಾಕಿ" },
  "desk.risk":            { en: "Chargesheet likelihood", kn: "ಆರೋಪಪಟ್ಟಿ ಸಾಧ್ಯತೆ" },
  "desk.filter.all":      { en: "All open", kn: "ಎಲ್ಲಾ ಬಾಕಿ" },
  "desk.filter.overdue":  { en: "Overdue", kn: "ವಿಳಂಬ" },
  "desk.filter.noArrest": { en: "No arrest", kn: "ಬಂಧನವಿಲ್ಲ" },
  "desk.court":           { en: "Court", kn: "ನ್ಯಾಯಾಲಯ" },
  // Identity resolution (same person across FIRs, without a PersonID)
  "identity.title":       { en: "Same person, other files", kn: "ಅದೇ ವ್ಯಕ್ತಿ, ಇತರ ಕಡತಗಳು" },
  "identity.hint":        { en: "Records that look like the same person by name, age and gender — the only identifying fields this register holds. Nothing is merged; the officer decides.",
                            kn: "ಹೆಸರು, ವಯಸ್ಸು ಮತ್ತು ಲಿಂಗದಿಂದ ಒಂದೇ ವ್ಯಕ್ತಿ ಎಂದು ಕಾಣುವ ದಾಖಲೆಗಳು — ಈ ದಾಖಲೆಯಲ್ಲಿ ಇರುವ ಗುರುತಿನ ಮಾಹಿತಿ ಅಷ್ಟೇ. ಯಾವುದನ್ನೂ ವಿಲೀನಗೊಳಿಸಿಲ್ಲ; ಅಧಿಕಾರಿ ನಿರ್ಧರಿಸುತ್ತಾರೆ." },
  "identity.confidence":  { en: "Confidence", kn: "ವಿಶ್ವಾಸ" },
  "identity.none":        { en: "No other records look like this person", kn: "ಈ ವ್ಯಕ್ತಿಯಂತೆ ಕಾಣುವ ಬೇರೆ ದಾಖಲೆಗಳಿಲ್ಲ" },
  "identity.checking":    { en: "Looking for the same person…", kn: "ಅದೇ ವ್ಯಕ್ತಿಯನ್ನು ಹುಡುಕಲಾಗುತ್ತಿದೆ…" },
  "identity.why":         { en: "What matched", kn: "ಏನು ಹೊಂದಿಕೆಯಾಯಿತು" },
  "identity.cases":       { en: "cases in this cluster", kn: "ಈ ಗುಂಪಿನಲ್ಲಿ ಪ್ರಕರಣಗಳು" },

  // Court pipeline
  "nav.pipeline":         { en: "Case Pipeline", kn: "ಪ್ರಕರಣ ಹರಿವು" },
  "pipeline.title":       { en: "From FIR to court", kn: "ಎಫ್‌ಐಆರ್‌ನಿಂದ ನ್ಯಾಯಾಲಯದವರೆಗೆ" },
  "pipeline.subtitle":    { en: "Where cases move quickly, and where they stop.", kn: "ಪ್ರಕರಣಗಳು ಎಲ್ಲಿ ವೇಗವಾಗಿ ಸಾಗುತ್ತವೆ, ಮತ್ತು ಎಲ್ಲಿ ನಿಲ್ಲುತ್ತವೆ." },
  "pipeline.registered":  { en: "FIR registered", kn: "ಎಫ್‌ಐಆರ್ ದಾಖಲು" },
  "pipeline.arrested":    { en: "Arrest made", kn: "ಬಂಧನ" },
  "pipeline.chargesheet": { en: "Chargesheet filed", kn: "ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಕೆ" },
  "pipeline.court":       { en: "Sent to court", kn: "ನ್ಯಾಯಾಲಯಕ್ಕೆ" },
  "pipeline.medianDays":  { en: "median days", kn: "ಸರಾಸರಿ ದಿನಗಳು" },
  "pipeline.bottleneck":  { en: "Slowest step", kn: "ಅತ್ಯಂತ ನಿಧಾನ ಹಂತ" },
  "pipeline.dropoff":     { en: "Cases that never reach this step", kn: "ಈ ಹಂತ ತಲುಪದ ಪ್ರಕರಣಗಳು" },
  "pipeline.empty":       { en: "Not enough completed cases to measure", kn: "ಅಳೆಯಲು ಸಾಕಷ್ಟು ಪೂರ್ಣ ಪ್ರಕರಣಗಳಿಲ್ಲ" },

  // Incident-level map
  "map.layer.incidents":  { en: "Incidents", kn: "ಘಟನೆಗಳು" },
  "map.sampleNote":       { en: "Ranked over the {n} most recent FIRs, not the whole corpus.",
                            kn: "ಇತ್ತೀಚಿನ {n} ಎಫ್‌ಐಆರ್‌ಗಳ ಆಧಾರದ ಮೇಲೆ, ಇಡೀ ದಾಖಲೆಯ ಮೇಲೆ ಅಲ್ಲ." },
  "map.incidentHint":     { en: "Each point is one FIR, placed at its recorded location.", kn: "ಪ್ರತಿ ಬಿಂದು ಒಂದು ಎಫ್‌ಐಆರ್, ಅದರ ದಾಖಲಿತ ಸ್ಥಳದಲ್ಲಿ." },
  "map.incidentCount":    { en: "incidents shown", kn: "ಘಟನೆಗಳು ತೋರಿಸಲಾಗಿದೆ" },
  "map.noCoords":         { en: "without recorded coordinates", kn: "ದಾಖಲಿತ ನಿರ್ದೇಶಾಂಕಗಳಿಲ್ಲದೆ" },

  // Time-of-day / day-of-week patterns
  "nav.patterns":         { en: "When Crime Happens", kn: "ಅಪರಾಧ ಯಾವಾಗ" },
  "patterns.title":       { en: "When crime happens", kn: "ಅಪರಾಧ ಯಾವಾಗ ನಡೆಯುತ್ತದೆ" },
  "patterns.subtitle":    { en: "The hotspot map answers where. This answers when — the other half of a shift plan.",
                            kn: "ನಕ್ಷೆ ಎಲ್ಲಿ ಎಂದು ಹೇಳುತ್ತದೆ. ಇದು ಯಾವಾಗ ಎಂದು ಹೇಳುತ್ತದೆ — ಪಾಳಿ ಯೋಜನೆಯ ಇನ್ನೊಂದು ಅರ್ಧ." },
  "patterns.hour":        { en: "Hour of day", kn: "ದಿನದ ಗಂಟೆ" },
  "patterns.weekday":     { en: "Day of week", kn: "ವಾರದ ದಿನ" },
  "patterns.peak":        { en: "Busiest window", kn: "ಅತ್ಯಂತ ಬಿಡುವಿಲ್ಲದ ಅವಧಿ" },
  "patterns.allCrime":    { en: "All crime", kn: "ಎಲ್ಲಾ ಅಪರಾಧ" },
  "patterns.empty":       { en: "No cases in this selection", kn: "ಈ ಆಯ್ಕೆಯಲ್ಲಿ ಪ್ರಕರಣಗಳಿಲ್ಲ" },
  "patterns.caveat":      { en: "Measured on the registration timestamp, which is when the FIR was written, not always when the offence happened.",
                            kn: "ಎಫ್‌ಐಆರ್ ಬರೆದ ಸಮಯದ ಆಧಾರದ ಮೇಲೆ ಅಳೆಯಲಾಗಿದೆ, ಇದು ಯಾವಾಗಲೂ ಅಪರಾಧ ನಡೆದ ಸಮಯವಲ್ಲ." },
  // Show-your-working trace under an answer
  "trace.show":           { en: "Show the working", kn: "ಕಾರ್ಯವಿಧಾನ ತೋರಿಸಿ" },
  "trace.hide":           { en: "Hide the working", kn: "ಕಾರ್ಯವಿಧಾನ ಮರೆಮಾಡಿ" },
  "trace.title":          { en: "How this answer was produced", kn: "ಈ ಉತ್ತರ ಹೇಗೆ ಬಂತು" },
  "trace.sql":            { en: "Query run against the database", kn: "ಡೇಟಾಬೇಸ್‌ನಲ್ಲಿ ಚಲಾಯಿಸಿದ ಪ್ರಶ್ನೆ" },
  "trace.rows":           { en: "rows returned", kn: "ಸಾಲುಗಳು ಬಂದವು" },
  "trace.tools":          { en: "Tools used", kn: "ಬಳಸಿದ ಸಾಧನಗಳು" },
  "trace.examples":       { en: "Examples the query was written from", kn: "ಪ್ರಶ್ನೆ ಬರೆಯಲು ಬಳಸಿದ ಉದಾಹರಣೆಗಳು" },
  "trace.scope":          { en: "Data the query could see", kn: "ಪ್ರಶ್ನೆಗೆ ಕಾಣುವ ಮಾಹಿತಿ" },
  "trace.timing":         { en: "Time taken", kn: "ತೆಗೆದುಕೊಂಡ ಸಮಯ" },
  "trace.repaired":       { en: "The first query failed and was corrected", kn: "ಮೊದಲ ಪ್ರಶ್ನೆ ವಿಫಲವಾಗಿ ಸರಿಪಡಿಸಲಾಯಿತು" },

  // Section suggestion on FIR registration
  "section.suggest":      { en: "Suggest sections from the facts", kn: "ವಿವರಗಳಿಂದ ಸೆಕ್ಷನ್ ಸೂಚಿಸಿ" },
  "section.suggesting":   { en: "Reading the facts…", kn: "ವಿವರಗಳನ್ನು ಓದಲಾಗುತ್ತಿದೆ…" },
  "section.why":          { en: "Why this section", kn: "ಈ ಸೆಕ್ಷನ್ ಏಕೆ" },
  "section.basedOn":      { en: "Applied in similar cases", kn: "ಸಮಾನ ಪ್ರಕರಣಗಳಲ್ಲಿ ಅನ್ವಯಿಸಲಾಗಿದೆ" },
  "section.confidence":   { en: "Confidence", kn: "ವಿಶ್ವಾಸ" },
  "section.none":         { en: "No section could be suggested from these facts", kn: "ಈ ವಿವರಗಳಿಂದ ಯಾವ ಸೆಕ್ಷನ್ ಸೂಚಿಸಲಾಗಲಿಲ್ಲ" },
  "section.add":          { en: "Add", kn: "ಸೇರಿಸಿ" },
  "section.caveat":       { en: "A suggestion from past filings, not legal advice. The officer decides what is charged.",
                            kn: "ಹಿಂದಿನ ದಾಖಲಾತಿಗಳಿಂದ ಸೂಚನೆ, ಕಾನೂನು ಸಲಹೆ ಅಲ್ಲ. ಏನನ್ನು ಆರೋಪಿಸಬೇಕೆಂದು ಅಧಿಕಾರಿ ನಿರ್ಧರಿಸುತ್ತಾರೆ." },

  // Repeat victimisation
  "nav.victims":          { en: "Repeat Victims", kn: "ಪುನರಾವರ್ತಿತ ಸಂತ್ರಸ್ತರು" },
  "victims.title":        { en: "People victimised more than once", kn: "ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಬಾರಿ ಸಂತ್ರಸ್ತರಾದವರು" },
  "victims.subtitle":     { en: "A small number of people absorb a large share of crime. These are the ones this data can see.",
                            kn: "ಕಡಿಮೆ ಸಂಖ್ಯೆಯ ಜನರು ಹೆಚ್ಚಿನ ಅಪರಾಧವನ್ನು ಅನುಭವಿಸುತ್ತಾರೆ. ಈ ಮಾಹಿತಿಯಲ್ಲಿ ಕಾಣುವವರು ಇವರು." },
  "victims.cases":        { en: "times victimised", kn: "ಬಾರಿ ಸಂತ್ರಸ್ತರಾಗಿದ್ದಾರೆ" },
  "victims.span":         { en: "Between", kn: "ನಡುವೆ" },
  "victims.empty":        { en: "No repeat victimisation found in this scope", kn: "ಈ ವ್ಯಾಪ್ತಿಯಲ್ಲಿ ಪುನರಾವರ್ತಿತ ಸಂತ್ರಸ್ತತೆ ಕಂಡುಬಂದಿಲ್ಲ" },
  "victims.caveat":       { en: "Matched on name, age and gender only — the victim record carries no address, so two people with the same name cannot always be told apart.",
                            kn: "ಹೆಸರು, ವಯಸ್ಸು ಮತ್ತು ಲಿಂಗದ ಆಧಾರದ ಮೇಲೆ ಮಾತ್ರ — ಸಂತ್ರಸ್ತ ದಾಖಲೆಯಲ್ಲಿ ವಿಳಾಸವಿಲ್ಲ, ಆದ್ದರಿಂದ ಒಂದೇ ಹೆಸರಿನ ಇಬ್ಬರನ್ನು ಯಾವಾಗಲೂ ಬೇರ್ಪಡಿಸಲಾಗದು." },
  "victims.confidence":   { en: "Match confidence", kn: "ಹೊಂದಾಣಿಕೆ ವಿಶ್ವಾಸ" },
  // Case handover brief
  "handover.title":       { en: "Handover brief", kn: "ಹಸ್ತಾಂತರ ಟಿಪ್ಪಣಿ" },
  "handover.build":       { en: "Prepare handover brief", kn: "ಹಸ್ತಾಂತರ ಟಿಪ್ಪಣಿ ಸಿದ್ಧಪಡಿಸಿ" },
  "handover.building":    { en: "Preparing…", kn: "ಸಿದ್ಧಪಡಿಸಲಾಗುತ್ತಿದೆ…" },
  "handover.whatHappened":{ en: "What happened", kn: "ಏನಾಯಿತು" },
  "handover.doneSoFar":   { en: "Done so far", kn: "ಇಲ್ಲಿಯವರೆಗೆ ಆಗಿದ್ದು" },
  "handover.outstanding": { en: "Outstanding", kn: "ಬಾಕಿ ಇರುವುದು" },
  "handover.linked":      { en: "Linked cases", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣಗಳು" },
  "handover.deadline":    { en: "Next deadline", kn: "ಮುಂದಿನ ಗಡುವು" },
  "handover.print":       { en: "Print", kn: "ಮುದ್ರಿಸಿ" },
  "handover.caveat":      { en: "Assembled from the case record. Check it before signing anything.",
                            kn: "ಪ್ರಕರಣ ದಾಖಲೆಯಿಂದ ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ. ಸಹಿ ಮಾಡುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ." },

  // Custody position
  "custody.title":        { en: "Custody position", kn: "ವಶದ ಸ್ಥಿತಿ" },
  "custody.none":         { en: "Never brought in", kn: "ಎಂದೂ ಹಾಜರುಪಡಿಸಿಲ್ಲ" },
  "custody.filter":       { en: "Custody", kn: "ವಶ" },
  "custody.csNoCustody":  { en: "Chargesheeted with nobody in custody", kn: "ಯಾರೂ ವಶದಲ್ಲಿಲ್ಲದೆ ಆರೋಪಪಟ್ಟಿ" },
  "custody.stale":        { en: "No custody action since", kn: "ಇಂದಿನಿಂದ ವಶದ ಕ್ರಮವಿಲ್ಲ" },
  "custody.caveat":       { en: "The record shows arrest and surrender only — it carries no bail or custody status.",
                            kn: "ದಾಖಲೆಯಲ್ಲಿ ಬಂಧನ ಮತ್ತು ಶರಣಾಗತಿ ಮಾತ್ರ — ಜಾಮೀನು ಅಥವಾ ವಶದ ಸ್ಥಿತಿ ಇಲ್ಲ." },

  // ── Detector findings ───────────────────────────────────────────────────
  // Rendered from Alert.params / InsightItem.params by lib/alertText.ts, not
  // written as prose by the detectors. `{name}` placeholders are filled by tf().
  "finding.spike.title":  { en: "Crime spike in {district}",
                            kn: "{district} ಜಿಲ್ಲೆಯಲ್ಲಿ ಅಪರಾಧ ಏರಿಕೆ" },
  "finding.spike.detail": { en: "{pct}% jump last month ({thisMonth} vs {lastMonth} the month before)",
                            kn: "ಕಳೆದ ತಿಂಗಳು {pct}% ಏರಿಕೆ ({thisMonth}, ಹಿಂದಿನ ತಿಂಗಳು {lastMonth})" },

  "finding.repeat_suspect.title":  { en: "Possible repeat accused: {name}",
                                     kn: "ಸಂಭಾವ್ಯ ಪುನರಾವರ್ತಿತ ಆರೋಪಿ: {name}" },
  "finding.repeat_suspect.detail": {
    en: "{caseCount} cases in the last 30 days name someone who scores as the same person (confidence {confidence} on the weakest link in the cluster; matched on {why}). {crimeTypes}. Identity is inferred from the name, age and gender on each FIR, not from a shared record — verify before treating these as one offender.",
    kn: "ಕಳೆದ 30 ದಿನಗಳಲ್ಲಿ {caseCount} ಪ್ರಕರಣಗಳು ಒಬ್ಬರೇ ವ್ಯಕ್ತಿ ಎಂದು ಅಂಕ ಪಡೆಯುವವರನ್ನು ಹೆಸರಿಸುತ್ತವೆ (ಗುಂಪಿನ ದುರ್ಬಲ ಕೊಂಡಿಯಲ್ಲಿ ವಿಶ್ವಾಸ {confidence}; {why} ಆಧಾರದ ಮೇಲೆ ಹೊಂದಾಣಿಕೆ). {crimeTypes}. ಗುರುತನ್ನು ಪ್ರತಿ ಎಫ್‌ಐಆರ್‌ನ ಹೆಸರು, ವಯಸ್ಸು ಮತ್ತು ಲಿಂಗದಿಂದ ಊಹಿಸಲಾಗಿದೆ, ಸಾಮಾನ್ಯ ದಾಖಲೆಯಿಂದ ಅಲ್ಲ — ಇವರನ್ನು ಒಬ್ಬನೇ ಅಪರಾಧಿ ಎಂದು ಪರಿಗಣಿಸುವ ಮೊದಲು ಪರಿಶೀಲಿಸಿ." },

  "finding.weekly_surge.title":  { en: "{crime} surging statewide",
                                   kn: "ರಾಜ್ಯಾದ್ಯಂತ {crime} ಹೆಚ್ಚಳ" },
  "finding.weekly_surge.detail": { en: "{pct}% more {crime} cases this week vs last week",
                                   kn: "ಕಳೆದ ವಾರಕ್ಕೆ ಹೋಲಿಸಿದರೆ ಈ ವಾರ {pct}% ಹೆಚ್ಚು {crime} ಪ್ರಕರಣಗಳು" },

  "finding.forecast.title":  { en: "{crime} rising in {district}",
                               kn: "{district} ಜಿಲ್ಲೆಯಲ್ಲಿ {crime} ಏರಿಕೆ" },
  "finding.forecast.detail": { en: "Trending up ~{slope}/month · projected {projected} next month (vs {recent} this month)",
                               kn: "ತಿಂಗಳಿಗೆ ~{slope} ಏರಿಕೆ · ಮುಂದಿನ ತಿಂಗಳು {projected} ಎಂದು ಅಂದಾಜು (ಈ ತಿಂಗಳು {recent})" },

  "finding.mo_link.title":  { en: "Cross-district MO lead: {label}",
                              kn: "ಅಂತರ-ಜಿಲ್ಲಾ ವಿಧಾನ ಸುಳಿವು: {label}" },
  "finding.mo_link.detail": {
    en: "{crimeGroup} in {district} ({registered}) is the closest narrative match to {matchLabel} in {matchDistrict}, and closer than 99% of cross-district nearest matches in the corpus. Same offence sub-head. Narratives never name the accused, so this is a method lead to check, not a link between people — neither station can see the other's file.",
    kn: "{district} ಜಿಲ್ಲೆಯ {crimeGroup} ({registered}) ಪ್ರಕರಣವು {matchDistrict} ಜಿಲ್ಲೆಯ {matchLabel} ಪ್ರಕರಣಕ್ಕೆ ಅತ್ಯಂತ ಹತ್ತಿರದ ವಿವರಣಾತ್ಮಕ ಹೊಂದಾಣಿಕೆಯಾಗಿದೆ — ಸಂಗ್ರಹದ 99% ಅಂತರ-ಜಿಲ್ಲಾ ಹೊಂದಾಣಿಕೆಗಳಿಗಿಂತ ಹತ್ತಿರ. ಒಂದೇ ಅಪರಾಧ ಉಪ-ಶೀರ್ಷಿಕೆ. ವಿವರಣೆಗಳು ಆರೋಪಿಯನ್ನು ಎಂದೂ ಹೆಸರಿಸುವುದಿಲ್ಲ, ಆದ್ದರಿಂದ ಇದು ಪರಿಶೀಲಿಸಬೇಕಾದ ವಿಧಾನದ ಸುಳಿವು, ವ್ಯಕ್ತಿಗಳ ನಡುವಿನ ಕೊಂಡಿಯಲ್ಲ — ಯಾವ ಠಾಣೆಯೂ ಇನ್ನೊಂದರ ಕಡತವನ್ನು ನೋಡಲಾಗದು." },

  "finding.duplicate.title":  { en: "Possible duplicate FIR: {label}",
                                kn: "ಸಂಭಾವ್ಯ ನಕಲಿ ಎಫ್‌ಐಆರ್: {label}" },
  "finding.duplicate.detail": {
    en: "{label} ({registered}) looks like the same incident as {matchLabel} ({matchRegistered}) — {where}. {pct}% likely: {why}.",
    kn: "{label} ({registered}) ಪ್ರಕರಣವು {matchLabel} ({matchRegistered}) ಪ್ರಕರಣದಂತೆಯೇ ಒಂದೇ ಘಟನೆ ಎಂದು ಕಾಣುತ್ತದೆ — {where}. {pct}% ಸಂಭವನೀಯತೆ: {why}." },
  // The far district's copy: same finding, name stripped.
  "finding.duplicate.detailUnnamed": {
    en: "{label} ({registered}) looks like the same incident as {matchLabel} ({matchRegistered}) — {where}. {pct}% likely: {why}. A person named in both files is out of your posting; the other station holds that record.",
    kn: "{label} ({registered}) ಪ್ರಕರಣವು {matchLabel} ({matchRegistered}) ಪ್ರಕರಣದಂತೆಯೇ ಒಂದೇ ಘಟನೆ ಎಂದು ಕಾಣುತ್ತದೆ — {where}. {pct}% ಸಂಭವನೀಯತೆ: {why}. ಎರಡೂ ಕಡತಗಳಲ್ಲಿ ಹೆಸರಿಸಲಾದ ವ್ಯಕ್ತಿ ನಿಮ್ಮ ವ್ಯಾಪ್ತಿಯ ಹೊರಗಿದ್ದಾರೆ; ಆ ದಾಖಲೆ ಇನ್ನೊಂದು ಠಾಣೆಯಲ್ಲಿದೆ." },
  // The "{where}" clause, built at render time so the connector word is in the
  // reader's language. Station names themselves are proper nouns and stay put.
  "finding.duplicate.bothAt": { en: "both at {station}", kn: "ಎರಡೂ {station} ಠಾಣೆಯಲ್ಲಿ" },
  "finding.duplicate.across": { en: "{station} and {matchStation}", kn: "{station} ಮತ್ತು {matchStation}" },
  "finding.duplicate.reasonFallback": { en: "the narratives and dates line up",
                                        kn: "ವಿವರಣೆಗಳು ಮತ್ತು ದಿನಾಂಕಗಳು ಹೊಂದಿಕೆಯಾಗುತ್ತವೆ" },

  // Why a pair scored as a duplicate — lib/duplicate-detect.ts labelFor()
  "dup.reason.narrative":    { en: "Narrative cosine {n} (unrelated same-type pairs median 0.84)",
                               kn: "ವಿವರಣೆಯ ಸಾಮ್ಯತೆ {n} (ಸಂಬಂಧವಿಲ್ಲದ ಒಂದೇ ಬಗೆಯ ಜೋಡಿಗಳ ಸರಾಸರಿ 0.84)" },
  "dup.reason.peopleNamed":  { en: "Same person named in both — {label}",
                               kn: "ಎರಡರಲ್ಲೂ ಒಬ್ಬರೇ ವ್ಯಕ್ತಿಯ ಹೆಸರು — {label}" },
  "dup.reason.people":       { en: "Complainant or victim name matches",
                               kn: "ದೂರುದಾರ ಅಥವಾ ಸಂತ್ರಸ್ತರ ಹೆಸರು ಹೊಂದಿಕೆಯಾಗುತ್ತದೆ" },
  "dup.reason.sameDate":     { en: "Same incident date", kn: "ಒಂದೇ ಘಟನೆಯ ದಿನಾಂಕ" },
  "dup.reason.dayGapOne":    { en: "Incidents 1 day apart", kn: "ಘಟನೆಗಳ ನಡುವೆ 1 ದಿನ ಅಂತರ" },
  "dup.reason.dayGap":       { en: "Incidents {n} days apart", kn: "ಘಟನೆಗಳ ನಡುವೆ {n} ದಿನಗಳ ಅಂತರ" },
  "dup.reason.sameStation":  { en: "Filed at the same station", kn: "ಒಂದೇ ಠಾಣೆಯಲ್ಲಿ ದಾಖಲು" },
  "dup.reason.sameDistrict": { en: "Filed at a station in the same district",
                               kn: "ಒಂದೇ ಜಿಲ್ಲೆಯ ಠಾಣೆಯಲ್ಲಿ ದಾಖಲು" },
  "dup.reason.crimeType":    { en: "Same crime sub-head", kn: "ಒಂದೇ ಅಪರಾಧ ಉಪ-ಶೀರ್ಷಿಕೆ" },

  // ── About the project ───────────────────────────────────────────────────
  // Product names (Next.js, Mistral AI, PgBouncer) are proper nouns and stay
  // in Latin script; only the prose around them has keys here.
  "about.tagline": {
    en: "Conversational crime intelligence for Karnataka Police — an agentic copilot that plans across SQL, RAG-grounded case retrieval, insights, network/map data, and risk prediction, streamed in real time.",
    kn: "ಕರ್ನಾಟಕ ಪೊಲೀಸರಿಗಾಗಿ ಸಂವಾದಾತ್ಮಕ ಅಪರಾಧ ಗುಪ್ತಚರ ವ್ಯವಸ್ಥೆ — SQL, RAG-ಆಧಾರಿತ ಪ್ರಕರಣ ಹುಡುಕಾಟ, ಒಳನೋಟಗಳು, ಜಾಲ/ನಕ್ಷೆ ಮಾಹಿತಿ ಮತ್ತು ಅಪಾಯ ಮುನ್ಸೂಚನೆಯ ನಡುವೆ ಯೋಜಿಸುವ ಏಜೆಂಟಿಕ್ ಸಹಾಯಕ, ನೈಜ ಸಮಯದಲ್ಲಿ ಪ್ರಸಾರ." },
  "about.stat.llm":      { en: "LLM Inference", kn: "LLM ಸಂಸ್ಕರಣೆ" },
  "about.stat.db":       { en: "DB Engine", kn: "ಡೇಟಾಬೇಸ್ ಎಂಜಿನ್" },
  "about.stat.latency":  { en: "Response time", kn: "ಪ್ರತಿಕ್ರಿಯೆ ಸಮಯ" },
  "about.stat.access":   { en: "DB Access", kn: "ಡೇಟಾಬೇಸ್ ಪ್ರವೇಶ" },
  "about.stat.latencyValue": { en: "< 2s avg", kn: "ಸರಾಸರಿ < 2ಸೆ" },
  "about.stat.accessValue":  { en: "Read-only", kn: "ಓದಲು-ಮಾತ್ರ" },

  "about.section.how":      { en: "HOW IT WORKS", kn: "ಇದು ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ" },
  "about.section.features": { en: "KEY FEATURES", kn: "ಪ್ರಮುಖ ವೈಶಿಷ್ಟ್ಯಗಳು" },
  "about.section.tech":     { en: "TECH STACK", kn: "ತಂತ್ರಜ್ಞಾನ ಶ್ರೇಣಿ" },

  "about.flow.1.title": { en: "You ask", kn: "ನೀವು ಕೇಳುತ್ತೀರಿ" },
  "about.flow.1.desc":  { en: "Type a question in plain English about Karnataka crime data",
                          kn: "ಕರ್ನಾಟಕದ ಅಪರಾಧ ಮಾಹಿತಿಯ ಬಗ್ಗೆ ಸರಳ ಭಾಷೆಯಲ್ಲಿ ಪ್ರಶ್ನೆ ಟೈಪ್ ಮಾಡಿ" },
  "about.flow.2.title": { en: "Agent plans", kn: "ಏಜೆಂಟ್ ಯೋಜಿಸುತ್ತದೆ" },
  "about.flow.2.desc":  { en: "Mistral decides which tools to call — SQL, related cases, insights, network/map, risk prediction — and calls them in parallel",
                          kn: "ಯಾವ ಸಾಧನಗಳನ್ನು ಬಳಸಬೇಕೆಂದು Mistral ನಿರ್ಧರಿಸುತ್ತದೆ — SQL, ಸಂಬಂಧಿತ ಪ್ರಕರಣಗಳು, ಒಳನೋಟಗಳು, ಜಾಲ/ನಕ್ಷೆ, ಅಪಾಯ ಮುನ್ಸೂಚನೆ — ಮತ್ತು ಅವನ್ನು ಸಮಾನಾಂತರವಾಗಿ ಕರೆಯುತ್ತದೆ" },
  "about.flow.3.title": { en: "Tools ground it", kn: "ಸಾಧನಗಳು ಆಧಾರ ಒದಗಿಸುತ್ತವೆ" },
  "about.flow.3.desc":  { en: "RAG retrieves similar past questions + case narratives to steer the SQL; query runs read-only via an AST-validated statement; results, cases, and insights come back live",
                          kn: "SQL ಅನ್ನು ಮಾರ್ಗದರ್ಶಿಸಲು RAG ಹಿಂದಿನ ಸಮಾನ ಪ್ರಶ್ನೆಗಳು ಮತ್ತು ಪ್ರಕರಣ ವಿವರಣೆಗಳನ್ನು ತರುತ್ತದೆ; ಪ್ರಶ್ನೆಯು AST-ಪರಿಶೀಲಿತ ಹೇಳಿಕೆಯ ಮೂಲಕ ಓದಲು-ಮಾತ್ರ ಚಲಿಸುತ್ತದೆ; ಫಲಿತಾಂಶಗಳು, ಪ್ರಕರಣಗಳು ಮತ್ತು ಒಳನೋಟಗಳು ನೇರವಾಗಿ ಬರುತ್ತವೆ" },
  "about.flow.4.title": { en: "AI synthesizes", kn: "AI ಸಂಯೋಜಿಸುತ್ತದೆ" },
  "about.flow.4.desc":  { en: "Mistral streams a narrative citing the real numbers, while each step pins to the live Case Board",
                          kn: "ನೈಜ ಸಂಖ್ಯೆಗಳನ್ನು ಉಲ್ಲೇಖಿಸಿ Mistral ವಿವರಣೆಯನ್ನು ಪ್ರಸಾರ ಮಾಡುತ್ತದೆ, ಮತ್ತು ಪ್ರತಿ ಹಂತವೂ ನೇರ ಪ್ರಕರಣ ಫಲಕಕ್ಕೆ ಸೇರುತ್ತದೆ" },

  "about.feature.copilot.title": { en: "Agentic Investigation Copilot", kn: "ಏಜೆಂಟಿಕ್ ತನಿಖಾ ಸಹಾಯಕ" },
  "about.feature.copilot.desc":  { en: "Ask a question in plain English. Mistral plans which tools to call — SQL query, related-case search, insights, network/map data — then synthesizes a grounded narrative.",
                                   kn: "ಸರಳ ಭಾಷೆಯಲ್ಲಿ ಪ್ರಶ್ನೆ ಕೇಳಿ. ಯಾವ ಸಾಧನಗಳನ್ನು ಬಳಸಬೇಕೆಂದು Mistral ಯೋಜಿಸುತ್ತದೆ — SQL ಪ್ರಶ್ನೆ, ಸಂಬಂಧಿತ ಪ್ರಕರಣ ಹುಡುಕಾಟ, ಒಳನೋಟಗಳು, ಜಾಲ/ನಕ್ಷೆ ಮಾಹಿತಿ — ನಂತರ ಆಧಾರಸಹಿತ ವಿವರಣೆಯನ್ನು ಸಂಯೋಜಿಸುತ್ತದೆ." },
  "about.feature.board.title": { en: "Live Case Board", kn: "ನೇರ ಪ್ರಕರಣ ಫಲಕ" },
  "about.feature.board.desc":  { en: "Every tool call the agent makes pins to a reasoning-trace panel in real time — pending, done, or failed — so investigators see exactly how an answer was derived.",
                                 kn: "ಏಜೆಂಟ್ ಮಾಡುವ ಪ್ರತಿ ಸಾಧನ ಕರೆಯೂ ನೈಜ ಸಮಯದಲ್ಲಿ ತಾರ್ಕಿಕ-ಜಾಡು ಫಲಕಕ್ಕೆ ಸೇರುತ್ತದೆ — ಬಾಕಿ, ಮುಗಿದಿದೆ ಅಥವಾ ವಿಫಲ — ಇದರಿಂದ ಉತ್ತರ ಹೇಗೆ ಬಂತು ಎಂಬುದು ತನಿಖಾಧಿಕಾರಿಗಳಿಗೆ ನಿಖರವಾಗಿ ಕಾಣುತ್ತದೆ." },
  "about.feature.stream.title": { en: "Streaming Intelligence", kn: "ನೇರ ಪ್ರಸಾರ ಗುಪ್ತಚರ" },
  "about.feature.stream.desc":  { en: "Reasoning steps and the AI narrative both stream over one Server-Sent Events connection — no waiting for the full response.",
                                  kn: "ತಾರ್ಕಿಕ ಹಂತಗಳು ಮತ್ತು AI ವಿವರಣೆ ಎರಡೂ ಒಂದೇ Server-Sent Events ಸಂಪರ್ಕದ ಮೂಲಕ ಪ್ರಸಾರವಾಗುತ್ತವೆ — ಪೂರ್ಣ ಉತ್ತರಕ್ಕಾಗಿ ಕಾಯುವ ಅಗತ್ಯವಿಲ್ಲ." },
  "about.feature.briefing.title": { en: "Proactive Briefings", kn: "ಮುಂಚಿತ ವರದಿಗಳು" },
  "about.feature.briefing.desc":  { en: "Crime spikes, repeat accuseds, and weekly surges are precomputed on a Zoho Catalyst Cron schedule and served from Catalyst Cache.",
                                    kn: "ಅಪರಾಧ ಏರಿಕೆಗಳು, ಪುನರಾವರ್ತಿತ ಆರೋಪಿಗಳು ಮತ್ತು ವಾರದ ಹೆಚ್ಚಳಗಳನ್ನು Zoho Catalyst Cron ವೇಳಾಪಟ್ಟಿಯಲ್ಲಿ ಮೊದಲೇ ಲೆಕ್ಕಹಾಕಿ Catalyst Cache ನಿಂದ ಒದಗಿಸಲಾಗುತ್ತದೆ." },
  "about.feature.viz.title": { en: "Smart Visualisation", kn: "ಸ್ಮಾರ್ಟ್ ದೃಶ್ಯೀಕರಣ" },
  "about.feature.viz.desc":  { en: "Query classifier auto-selects bar, pie, line, or network-graph rendering. District queries open on OpenStreetMap with Google Maps deep-links.",
                               kn: "ಪ್ರಶ್ನೆ ವರ್ಗೀಕರಣವು ಬಾರ್, ಪೈ, ಲೈನ್ ಅಥವಾ ಜಾಲ-ನಕ್ಷೆಯನ್ನು ತಾನಾಗಿಯೇ ಆಯ್ಕೆ ಮಾಡುತ್ತದೆ. ಜಿಲ್ಲಾ ಪ್ರಶ್ನೆಗಳು Google Maps ಕೊಂಡಿಗಳೊಂದಿಗೆ OpenStreetMap ನಲ್ಲಿ ತೆರೆಯುತ್ತವೆ." },
  "about.feature.casefile.title": { en: "Full Case File Modal", kn: "ಸಂಪೂರ್ಣ ಪ್ರಕರಣ ಕಡತ" },
  "about.feature.casefile.desc":  { en: "Every case row opens a rich modal: accused, victims, arrests, chargesheet, act sections, court — sourced from 8 joined tables.",
                                    kn: "ಪ್ರತಿ ಪ್ರಕರಣದ ಸಾಲು ವಿವರವಾದ ಕಿಟಕಿಯನ್ನು ತೆರೆಯುತ್ತದೆ: ಆರೋಪಿಗಳು, ಸಂತ್ರಸ್ತರು, ಬಂಧನಗಳು, ಆರೋಪಪಟ್ಟಿ, ಕಾಯ್ದೆ ಕಲಂಗಳು, ನ್ಯಾಯಾಲಯ — 8 ಜೋಡಿಸಿದ ಕೋಷ್ಟಕಗಳಿಂದ." },
  "about.feature.responsible.title": { en: "Responsible AI", kn: "ಜವಾಬ್ದಾರಿಯುತ AI" },
  "about.feature.responsible.desc":  { en: "Read-only database role. Generated SQL is parsed into an AST and rejected unless it's a single SELECT statement — no regex blocklist to evade. Sessions are HMAC-signed httpOnly cookies, not a spoofable header.",
                                       kn: "ಓದಲು-ಮಾತ್ರ ಡೇಟಾಬೇಸ್ ಪಾತ್ರ. ರಚಿಸಲಾದ SQL ಅನ್ನು AST ಆಗಿ ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತದೆ ಮತ್ತು ಅದು ಒಂದೇ SELECT ಹೇಳಿಕೆಯಾಗಿರದಿದ್ದರೆ ತಿರಸ್ಕರಿಸಲಾಗುತ್ತದೆ — ತಪ್ಪಿಸಿಕೊಳ್ಳಬಹುದಾದ ರೆಜೆಕ್ಸ್ ಪಟ್ಟಿ ಇಲ್ಲ. ಸೆಷನ್‌ಗಳು HMAC-ಸಹಿ ಮಾಡಿದ httpOnly ಕುಕೀಗಳು, ನಕಲಿ ಮಾಡಬಹುದಾದ ಹೆಡರ್ ಅಲ್ಲ." },

  "about.tech.frontend":      { en: "Frontend", kn: "ಮುಂಭಾಗ" },
  "about.tech.agentic":       { en: "Agentic AI", kn: "ಏಜೆಂಟಿಕ್ AI" },
  "about.tech.data":          { en: "Data & Backend", kn: "ಮಾಹಿತಿ ಮತ್ತು ಹಿಂಭಾಗ" },
  "about.tech.visualisation": { en: "Visualisation", kn: "ದೃಶ್ಯೀಕರಣ" },
  "about.tech.orchestrator":  { en: "Bounded agent loop (max 4 iterations), tools run in parallel",
                                kn: "ಸೀಮಿತ ಏಜೆಂಟ್ ಆವರ್ತನೆ (ಗರಿಷ್ಠ 4 ಸುತ್ತು), ಸಾಧನಗಳು ಸಮಾನಾಂತರವಾಗಿ ಚಲಿಸುತ್ತವೆ" },
  "about.tech.tools":         { en: "SQL query · related-case search · insights · hotspot forecast · network/map data · risk prediction · similar cases · crew dossier · clarification",
                                kn: "SQL ಪ್ರಶ್ನೆ · ಸಂಬಂಧಿತ ಪ್ರಕರಣ ಹುಡುಕಾಟ · ಒಳನೋಟಗಳು · ಕೇಂದ್ರಬಿಂದು ಮುನ್ಸೂಚನೆ · ಜಾಲ/ನಕ್ಷೆ ಮಾಹಿತಿ · ಅಪಾಯ ಮುನ್ಸೂಚನೆ · ಸಮಾನ ಪ್ರಕರಣಗಳು · ತಂಡದ ಕಡತ · ಸ್ಪಷ್ಟೀಕರಣ" },
  "about.tech.rag":           { en: "Mistral embeddings (mistral-embed, 1024-dim) — few-shot SQL grounding + pgvector case-narrative search, FTS/LLM fallback",
                                kn: "Mistral ಎಂಬೆಡಿಂಗ್‌ಗಳು (mistral-embed, 1024-ಆಯಾಮ) — few-shot SQL ಆಧಾರ ಮತ್ತು pgvector ಪ್ರಕರಣ-ವಿವರಣೆ ಹುಡುಕಾಟ, FTS/LLM ಪರ್ಯಾಯ" },
  "about.tech.quickml":       { en: "AutoML classifier — charge-sheet likelihood, trained on arrest + gravity + elapsed time",
                                kn: "AutoML ವರ್ಗೀಕರಣ — ಆರೋಪಪಟ್ಟಿ ಸಂಭವನೀಯತೆ, ಬಂಧನ, ಗಂಭೀರತೆ ಮತ್ತು ಕಳೆದ ಸಮಯದ ಆಧಾರದ ಮೇಲೆ ತರಬೇತಿ" },
  "about.tech.sse":           { en: "Live reasoning steps + token-by-token narrative over one connection",
                                kn: "ಒಂದೇ ಸಂಪರ್ಕದಲ್ಲಿ ನೇರ ತಾರ್ಕಿಕ ಹಂತಗಳು ಮತ್ತು ಪದ-ಪದದ ವಿವರಣೆ" },
  "about.tech.kspdb":         { en: "Real Karnataka Police data schema", kn: "ನೈಜ ಕರ್ನಾಟಕ ಪೊಲೀಸ್ ಮಾಹಿತಿ ರಚನೆ" },
  "about.tech.catalyst":      { en: "Cache (embeddings + insights) · Cron precompute · Data Store audit log",
                                kn: "ಸಂಗ್ರಹ (ಎಂಬೆಡಿಂಗ್ ಮತ್ತು ಒಳನೋಟಗಳು) · Cron ಪೂರ್ವಗಣನೆ · Data Store ಲೆಕ್ಕಪರಿಶೋಧನಾ ದಾಖಲೆ" },
  "about.tech.recharts":      { en: "Bar · Pie · Line charts — auto-selected",
                                kn: "ಬಾರ್ · ಪೈ · ಲೈನ್ ನಕ್ಷೆಗಳು — ತಾನಾಗಿಯೇ ಆಯ್ಕೆ" },
  "about.tech.leaflet":       { en: "Crime heatmap · Google Maps deep-links",
                                kn: "ಅಪರಾಧ ಸಾಂದ್ರತೆ ನಕ್ಷೆ · Google Maps ಕೊಂಡಿಗಳು" },
  "about.tech.cytoscape":     { en: "Criminal network graph · cose-bilkent layout",
                                kn: "ಅಪರಾಧಿ ಜಾಲ ನಕ್ಷೆ · cose-bilkent ವಿನ್ಯಾಸ" },
  "about.tech.drawer":        { en: "Full case file modal with all linked data",
                                kn: "ಎಲ್ಲಾ ಸಂಬಂಧಿತ ಮಾಹಿತಿಯೊಂದಿಗೆ ಸಂಪೂರ್ಣ ಪ್ರಕರಣ ಕಡತ" },

  "about.responsible.title": { en: "Responsible AI Design", kn: "ಜವಾಬ್ದಾರಿಯುತ AI ವಿನ್ಯಾಸ" },
  "about.responsible.body": {
    en: "Khabri AI operates on a read-only database role — no query can modify, insert, or delete data. Generated SQL is parsed into an AST (node-sql-parser) and rejected unless it resolves to a single SELECT statement, closing the gaps a regex blocklist can miss. Sessions are HMAC-SHA256-signed httpOnly cookies verified server-side — not a client-supplied header. Passwords use PBKDF2-SHA512 (100k iterations) stored in Neon — no third-party auth services.",
    kn: "Khabri AI ಓದಲು-ಮಾತ್ರ ಡೇಟಾಬೇಸ್ ಪಾತ್ರದಲ್ಲಿ ಕೆಲಸ ಮಾಡುತ್ತದೆ — ಯಾವ ಪ್ರಶ್ನೆಯೂ ಮಾಹಿತಿಯನ್ನು ಬದಲಿಸಲು, ಸೇರಿಸಲು ಅಥವಾ ಅಳಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ. ರಚಿಸಲಾದ SQL ಅನ್ನು AST (node-sql-parser) ಆಗಿ ವಿಶ್ಲೇಷಿಸಲಾಗುತ್ತದೆ ಮತ್ತು ಅದು ಒಂದೇ SELECT ಹೇಳಿಕೆಯಾಗಿ ಪರಿಹಾರವಾಗದಿದ್ದರೆ ತಿರಸ್ಕರಿಸಲಾಗುತ್ತದೆ — ರೆಜೆಕ್ಸ್ ಪಟ್ಟಿ ಬಿಡಬಹುದಾದ ಅಂತರಗಳನ್ನು ಇದು ಮುಚ್ಚುತ್ತದೆ. ಸೆಷನ್‌ಗಳು ಸರ್ವರ್‌ನಲ್ಲಿ ಪರಿಶೀಲಿಸಲಾದ HMAC-SHA256-ಸಹಿ ಮಾಡಿದ httpOnly ಕುಕೀಗಳು — ಕ್ಲೈಂಟ್ ಒದಗಿಸಿದ ಹೆಡರ್ ಅಲ್ಲ. ಪಾಸ್‌ವರ್ಡ್‌ಗಳು Neon ನಲ್ಲಿ ಸಂಗ್ರಹಿಸಲಾದ PBKDF2-SHA512 (100k ಸುತ್ತು) ಬಳಸುತ್ತವೆ — ಮೂರನೇ ವ್ಯಕ್ತಿಯ ದೃಢೀಕರಣ ಸೇವೆಗಳಿಲ್ಲ." },
  "about.footer": { en: "Built for Datathon 2026 · KSP × Hack2Skill Challenge 1 · Karnataka State Police Crime Intelligence",
                    kn: "Datathon 2026 ಗಾಗಿ ನಿರ್ಮಿಸಲಾಗಿದೆ · KSP × Hack2Skill ಚಾಲೆಂಜ್ 1 · ಕರ್ನಾಟಕ ರಾಜ್ಯ ಪೊಲೀಸ್ ಅಪರಾಧ ಗುಪ್ತಚರ" },

  // ── Case reports table ──────────────────────────────────────────────────
  "reports.filter":     { en: "Filter by district, crime type, or crime no…",
                          kn: "ಜಿಲ್ಲೆ, ಅಪರಾಧದ ಬಗೆ ಅಥವಾ ಅಪರಾಧ ಸಂಖ್ಯೆಯಿಂದ ಶೋಧಿಸಿ…" },
  "reports.count":      { en: "{n} cases", kn: "{n} ಪ್ರಕರಣಗಳು" },
  "reports.empty":      { en: "No cases found.", kn: "ಯಾವುದೇ ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ." },
  "reports.col.crimeNo":    { en: "Crime No.", kn: "ಅಪರಾಧ ಸಂಖ್ಯೆ" },
  "reports.col.date":       { en: "Date", kn: "ದಿನಾಂಕ" },
  "reports.col.crimeGroup": { en: "Crime Group", kn: "ಅಪರಾಧ ಗುಂಪು" },
  "reports.col.district":   { en: "District", kn: "ಜಿಲ್ಲೆ" },
  "reports.col.status":     { en: "Status", kn: "ಸ್ಥಿತಿ" },
  "reports.open":       { en: "OPEN", kn: "ತೆರೆಯಿರಿ" },

  // ── Criminal network ────────────────────────────────────────────────────
  "network.subtitle":    { en: "Persons linked by shared cases. Crews cluster together; click a node to isolate its associates.",
                           kn: "ಹಂಚಿಕೊಂಡ ಪ್ರಕರಣಗಳಿಂದ ಜೋಡಿಸಲ್ಪಟ್ಟ ವ್ಯಕ್ತಿಗಳು. ತಂಡಗಳು ಒಟ್ಟಿಗೆ ಗುಂಪಾಗುತ್ತವೆ; ಸಹಚರರನ್ನು ಪ್ರತ್ಯೇಕಿಸಲು ಒಂದು ಬಿಂದುವನ್ನು ಕ್ಲಿಕ್ ಮಾಡಿ." },
  "network.persons":     { en: "PERSONS", kn: "ವ್ಯಕ್ತಿಗಳು" },
  "network.links":       { en: "LINKS", kn: "ಕೊಂಡಿಗಳು" },
  "network.building":    { en: "Building co-offender network…", kn: "ಸಹ-ಅಪರಾಧಿ ಜಾಲವನ್ನು ನಿರ್ಮಿಸಲಾಗುತ್ತಿದೆ…" },
  "network.loadFailed":  { en: "Failed to load network data", kn: "ಜಾಲದ ಮಾಹಿತಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ" },
  "network.empty":       { en: "No recurring co-offender links found.", kn: "ಪುನರಾವರ್ತಿತ ಸಹ-ಅಪರಾಧಿ ಕೊಂಡಿಗಳು ಕಂಡುಬಂದಿಲ್ಲ." },
  "network.pickNode":    { en: "Click a person node to see who they're connected to and why.",
                           kn: "ಯಾರೊಂದಿಗೆ ಮತ್ತು ಏಕೆ ಸಂಬಂಧವಿದೆ ಎಂದು ನೋಡಲು ವ್ಯಕ್ತಿಯ ಬಿಂದುವನ್ನು ಕ್ಲಿಕ್ ಮಾಡಿ." },
  "network.person":      { en: "Person", kn: "ವ್ಯಕ್ತಿ" },
  "network.connections": { en: "Connections", kn: "ಸಂಪರ್ಕಗಳು" },
  "network.caseHistory": { en: "Case History", kn: "ಪ್ರಕರಣ ಇತಿಹಾಸ" },
  "network.loadingCases":{ en: "Loading cases…", kn: "ಪ್ರಕರಣಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗುತ್ತಿದೆ…" },
  "network.legend.person": { en: "Person · size = case count", kn: "ವ್ಯಕ್ತಿ · ಗಾತ್ರ = ಪ್ರಕರಣಗಳ ಸಂಖ್ಯೆ" },
  "network.legend.shared": { en: "Shared cases · thicker = more", kn: "ಹಂಚಿಕೊಂಡ ಪ್ರಕರಣಗಳು · ದಪ್ಪ = ಹೆಚ್ಚು" },
  "network.legend.kingpin":{ en: "Kingpin · 3+ associates", kn: "ಪ್ರಮುಖ ಸೂತ್ರಧಾರ · 3+ ಸಹಚರರು" },
  "network.hint":        { en: "Click a node to isolate · Drag to pan",
                           kn: "ಪ್ರತ್ಯೇಕಿಸಲು ಕ್ಲಿಕ್ ಮಾಡಿ · ಸರಿಸಲು ಎಳೆಯಿರಿ" },

  // ── Socio-demographic profiling ─────────────────────────────────────────
  "profiling.subtitle":   { en: "Who offends, who is victimised, who reports — and the typical offender behind each crime type.",
                            kn: "ಯಾರು ಅಪರಾಧ ಮಾಡುತ್ತಾರೆ, ಯಾರು ಸಂತ್ರಸ್ತರಾಗುತ್ತಾರೆ, ಯಾರು ದೂರು ನೀಡುತ್ತಾರೆ — ಮತ್ತು ಪ್ರತಿ ಅಪರಾಧದ ಹಿಂದಿನ ವಿಶಿಷ್ಟ ಅಪರಾಧಿ." },
  "profiling.loading":    { en: "Loading profiling…", kn: "ವಿಶ್ಲೇಷಣೆ ಲೋಡ್ ಆಗುತ್ತಿದೆ…" },
  "profiling.loadFailed": { en: "Failed to load profiling data", kn: "ವಿಶ್ಲೇಷಣೆಯ ಮಾಹಿತಿ ಲೋಡ್ ಆಗಲಿಲ್ಲ" },
  "profiling.accusedAge":     { en: "Accused · age distribution", kn: "ಆರೋಪಿಗಳು · ವಯಸ್ಸಿನ ಹಂಚಿಕೆ" },
  "profiling.accusedGender":  { en: "Accused · gender", kn: "ಆರೋಪಿಗಳು · ಲಿಂಗ" },
  "profiling.victimGender":   { en: "Victims · gender", kn: "ಸಂತ್ರಸ್ತರು · ಲಿಂಗ" },
  "profiling.occupation":     { en: "Complainants · occupation", kn: "ದೂರುದಾರರು · ವೃತ್ತಿ" },
  "profiling.religion":       { en: "Complainants · religion", kn: "ದೂರುದಾರರು · ಧರ್ಮ" },
  "profiling.caste":          { en: "Complainants · caste", kn: "ದೂರುದಾರರು · ಜಾತಿ" },
  "profiling.behavioural":    { en: "Behavioural profile · typical offender by crime type",
                                kn: "ವರ್ತನೆಯ ಚಿತ್ರಣ · ಅಪರಾಧದ ಬಗೆಯಂತೆ ವಿಶಿಷ್ಟ ಅಪರಾಧಿ" },
  "profiling.col.crimeGroup": { en: "Crime group", kn: "ಅಪರಾಧ ಗುಂಪು" },
  "profiling.col.avgAge":     { en: "Avg age", kn: "ಸರಾಸರಿ ವಯಸ್ಸು" },
  "profiling.col.malePct":    { en: "% male", kn: "% ಪುರುಷ" },
  "profiling.col.repeatPct":  { en: "% repeat offender", kn: "% ಪುನರಾವರ್ತಿತ ಅಪರಾಧಿ" },
  "identity.placeholder":     { en: "Accused record id, or a PersonID", kn: "ಆರೋಪಿ ದಾಖಲೆ ಸಂಖ್ಯೆ, ಅಥವಾ PersonID" },
  "identity.match":           { en: "MATCH", kn: "ಹೊಂದಿಸಿ" },
  "identity.failed":          { en: "Failed to resolve identity", kn: "ಗುರುತು ಪತ್ತೆ ಮಾಡಲಾಗಲಿಲ್ಲ" },
  "identity.checked":         { en: "{n} record(s) checked", kn: "{n} ದಾಖಲೆ(ಗಳು) ಪರಿಶೀಲಿಸಲಾಗಿದೆ" },
  "chart.cases":              { en: "Cases", kn: "ಪ್ರಕರಣಗಳು" },
  "chart.count":              { en: "Count", kn: "ಸಂಖ್ಯೆ" },

  // ── Case pipeline ───────────────────────────────────────────────────────
  "pipeline.allDistricts":   { en: "All districts", kn: "ಎಲ್ಲಾ ಜಿಲ್ಲೆಗಳು" },
  "pipeline.allCrimeGroups": { en: "All crime groups", kn: "ಎಲ್ಲಾ ಅಪರಾಧ ಗುಂಪುಗಳು" },
  "pipeline.byDistrict":     { en: "By district", kn: "ಜಿಲ್ಲೆಯಂತೆ" },
  "pipeline.byCrimeGroup":   { en: "By crime group", kn: "ಅಪರಾಧ ಗುಂಪಿನಂತೆ" },
  // ── Case file drawer ────────────────────────────────────────────────────
  "case.loading":       { en: "Retrieving case file…", kn: "ಪ್ರಕರಣ ಕಡತವನ್ನು ತರಲಾಗುತ್ತಿದೆ…" },
  "case.notFound":      { en: "Case not found", kn: "ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ" },
  "case.section.info":  { en: "Case Information", kn: "ಪ್ರಕರಣದ ಮಾಹಿತಿ" },
  "case.section.brief": { en: "Brief Facts", kn: "ಸಂಕ್ಷಿಪ್ತ ವಿವರ" },
  "case.section.chargesheet": { en: "Chargesheet", kn: "ಆರೋಪಪಟ್ಟಿ" },
  "case.registered":    { en: "Registered", kn: "ದಾಖಲಾದ ದಿನಾಂಕ" },
  "case.station":       { en: "Station", kn: "ಠಾಣೆ" },
  "case.district":      { en: "District", kn: "ಜಿಲ್ಲೆ" },
  "case.crimeGroup":    { en: "Crime Group", kn: "ಅಪರಾಧ ಗುಂಪು" },
  "case.crimeType":     { en: "Crime Type", kn: "ಅಪರಾಧದ ಬಗೆ" },
  "case.category":      { en: "Category", kn: "ವರ್ಗ" },
  "case.gravity":       { en: "Gravity", kn: "ಗಂಭೀರತೆ" },
  "case.officer":       { en: "Officer", kn: "ಅಧಿಕಾರಿ" },
  "case.caseNo":        { en: "Case No.", kn: "ಪ್ರಕರಣ ಸಂಖ್ಯೆ" },
  "case.crimeNo":       { en: "Crime No.", kn: "ಅಪರಾಧ ಸಂಖ್ಯೆ" },
  "case.status":        { en: "Status", kn: "ಸ್ಥಿತಿ" },
  "case.court":         { en: "Court", kn: "ನ್ಯಾಯಾಲಯ" },
  "case.type":          { en: "Type", kn: "ಬಗೆ" },
  "case.filedOn":       { en: "Filed On", kn: "ಸಲ್ಲಿಸಿದ ದಿನಾಂಕ" },
  "case.filedBy":       { en: "Filed By", kn: "ಸಲ್ಲಿಸಿದವರು" },
  "case.offence":       { en: "Offence", kn: "ಅಪರಾಧ" },
  "case.sections":      { en: "Sections", kn: "ಕಲಂಗಳು" },
  "case.complainant":   { en: "Complainant", kn: "ದೂರುದಾರ" },
  "case.victims":       { en: "Victims", kn: "ಸಂತ್ರಸ್ತರು" },
  "case.accused":       { en: "Accused", kn: "ಆರೋಪಿಗಳು" },
  "case.arrest":        { en: "Arrest", kn: "ಬಂಧನ" },
  "case.noAction":      { en: "No arrest and no chargesheet on the record.",
                          kn: "ದಾಖಲೆಯಲ್ಲಿ ಬಂಧನವೂ ಇಲ್ಲ, ಆರೋಪಪಟ್ಟಿಯೂ ಇಲ್ಲ." },
  "case.noLinked":      { en: "No linked case found.", kn: "ಸಂಬಂಧಿತ ಪ್ರಕರಣ ಸಿಗಲಿಲ್ಲ." },
  "case.briefFailed":   { en: "Failed to assemble the brief", kn: "ಟಿಪ್ಪಣಿ ಸಿದ್ಧಪಡಿಸಲಾಗಲಿಲ್ಲ" },
  "case.linked.method": { en: "Same method", kn: "ಒಂದೇ ವಿಧಾನ" },
  "case.linked.crew":   { en: "Crew — other files", kn: "ತಂಡ — ಇತರ ಕಡತಗಳು" },
  "case.linked.dup":    { en: "Possible duplicate FIR", kn: "ಸಂಭಾವ್ಯ ನಕಲಿ ಎಫ್‌ಐಆರ್" },
  "case.print.method":  { en: "Linked — same method", kn: "ಸಂಬಂಧ — ಒಂದೇ ವಿಧಾನ" },
  "case.print.dup":     { en: "Linked — possible duplicate FIR", kn: "ಸಂಬಂಧ — ಸಂಭಾವ್ಯ ನಕಲಿ ಎಫ್‌ಐಆರ್" },

  "case.print.crew":    { en: "Linked — crew's other files", kn: "ಸಂಬಂಧ — ತಂಡದ ಇತರ ಕಡತಗಳು" },
  "case.print.header":  { en: "KSP Intelligence — Handover Brief", kn: "KSP ಗುಪ್ತಚರ — ಹಸ್ತಾಂತರ ಟಿಪ್ಪಣಿ" },
  "case.print.assembled": { en: "Assembled {when}.", kn: "{when} ರಂದು ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ." },
  "case.print.arrest":  { en: "Arrest", kn: "ಬಂಧನ" },
  "case.print.overdue": { en: "{n} days overdue", kn: "{n} ದಿನ ವಿಳಂಬ" },
  "case.print.left":    { en: "{n} days left", kn: "{n} ದಿನ ಬಾಕಿ" },
  "case.print.limit":   { en: "({n}-day limit, basis: {basis})", kn: "({n}-ದಿನಗಳ ಮಿತಿ, ಆಧಾರ: {basis})" },

  // ── Command centre ──────────────────────────────────────────────────────
  // ── Crew dossier (print) ────────────────────────────────────────────────
  // Only the columns the print table adds; the on-screen dossier's labels are
  // already keyed above and are reused rather than duplicated.
  "crew.print.summary":       { en: "Summary", kn: "ಸಾರಾಂಶ" },
  "crew.col.date":            { en: "Date", kn: "ದಿನಾಂಕ" },
  "crew.col.crimeType":       { en: "Crime type", kn: "ಅಪರಾಧದ ಬಗೆ" },
  "crew.col.districtStation": { en: "District / station", kn: "ಜಿಲ್ಲೆ / ಠಾಣೆ" },
  "crew.col.linkedBy":        { en: "Linked by", kn: "ಕೊಂಡಿಯ ಆಧಾರ" },
  "crew.link.narrative":      { en: "Closest narrative", kn: "ಅತಿ ಹತ್ತಿರದ ವಿವರಣೆ" },

  // ── Chat suggestions ────────────────────────────────────────────────────
  // The agent answers in either language, so the starter questions are offered
  // in the officer's.
  "suggest.1": { en: "Which district had the most FIRs last month?", kn: "ಕಳೆದ ತಿಂಗಳು ಯಾವ ಜಿಲ್ಲೆಯಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಎಫ್‌ಐಆರ್ ದಾಖಲಾಗಿವೆ?" },
  "suggest.2": { en: "List top 5 repeat accused by number of cases", kn: "ಪ್ರಕರಣಗಳ ಸಂಖ್ಯೆಯಂತೆ ಅಗ್ರ 5 ಪುನರಾವರ್ತಿತ ಆರೋಪಿಗಳನ್ನು ಪಟ್ಟಿ ಮಾಡಿ" },
  "suggest.3": { en: "How many cases are still under investigation?", kn: "ಎಷ್ಟು ಪ್ರಕರಣಗಳು ಇನ್ನೂ ತನಿಖೆಯಲ್ಲಿವೆ?" },
  "suggest.4": { en: "Which crime head has the highest chargesheet rate?", kn: "ಯಾವ ಅಪರಾಧ ಶೀರ್ಷಿಕೆಯಲ್ಲಿ ಆರೋಪಪಟ್ಟಿ ಪ್ರಮಾಣ ಅತಿ ಹೆಚ್ಚು?" },
  "suggest.5": { en: "Show districts with rising crime this quarter", kn: "ಈ ತ್ರೈಮಾಸಿಕದಲ್ಲಿ ಅಪರಾಧ ಏರುತ್ತಿರುವ ಜಿಲ್ಲೆಗಳನ್ನು ತೋರಿಸಿ" },
  "suggest.6": { en: "List accused with cases in more than one district", kn: "ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಜಿಲ್ಲೆಗಳಲ್ಲಿ ಪ್ರಕರಣವಿರುವ ಆರೋಪಿಗಳನ್ನು ಪಟ್ಟಿ ಮಾಡಿ" },
  "suggest.7": { en: "What's the average time to chargesheet by district?", kn: "ಜಿಲ್ಲೆಯಂತೆ ಆರೋಪಪಟ್ಟಿಗೆ ತಗಲುವ ಸರಾಸರಿ ಸಮಯ ಎಷ್ಟು?" },
  "suggest.8": { en: "Show victim demographics for cases filed this year", kn: "ಈ ವರ್ಷ ದಾಖಲಾದ ಪ್ರಕರಣಗಳ ಸಂತ್ರಸ್ತರ ಜನಸಂಖ್ಯಾ ವಿವರ ತೋರಿಸಿ" },
  "chat.noBody":     { en: "No response body", kn: "ಪ್ರತಿಕ್ರಿಯೆ ಬರಲಿಲ್ಲ" },
  "chat.stopVoice":  { en: "Stop listening", kn: "ಆಲಿಸುವುದನ್ನು ನಿಲ್ಲಿಸಿ" },
  "chat.startVoice": { en: "Speak your query", kn: "ನಿಮ್ಮ ಪ್ರಶ್ನೆಯನ್ನು ಹೇಳಿ" },
  "chat.readAloud":  { en: "Read aloud", kn: "ಗಟ್ಟಿಯಾಗಿ ಓದಿ" },
  "patterns.monthOfYear": { en: "Month of year", kn: "ವರ್ಷದ ತಿಂಗಳು" },
  "fir.searchSections":   { en: "Search sections by act, number or description",
                            kn: "ಕಾಯ್ದೆ, ಸಂಖ್ಯೆ ಅಥವಾ ವಿವರಣೆಯಿಂದ ಕಲಂಗಳನ್ನು ಹುಡುಕಿ" },
  "chat.networkError": { en: "Network error", kn: "ಜಾಲ ದೋಷ" },

  "desk.openCases":        { en: "Open cases", kn: "ತೆರೆದ ಪ್ರಕರಣಗಳು" },
  "command.cases":         { en: "{n} cases", kn: "{n} ಪ್ರಕರಣಗಳು" },
  "command.in24h":         { en: "{n} in 24h", kn: "24 ಗಂಟೆಗಳಲ್ಲಿ {n}" },
  "command.checksFailing": { en: "{n} checks failing", kn: "{n} ಪರಿಶೀಲನೆಗಳು ವಿಫಲ" },
  "command.dataQuality":   { en: "Data quality", kn: "ಮಾಹಿತಿ ಗುಣಮಟ್ಟ" },
  "command.people":        { en: "people · {pct}% of cases", kn: "ಜನರು · ಪ್ರಕರಣಗಳ {pct}%" },
  "command.flat":          { en: "No window stands out — the spread is within ordinary variation (p={p}).",
                             kn: "ಯಾವುದೇ ಅವಧಿ ಎದ್ದು ಕಾಣುವುದಿಲ್ಲ — ಹಂಚಿಕೆ ಸಾಮಾನ್ಯ ವ್ಯತ್ಯಾಸದ ಮಿತಿಯಲ್ಲಿದೆ (p={p})." },
  "command.onBaseline":    { en: "+{pct}% on baseline · p<0.05", kn: "ಆಧಾರರೇಖೆಯ ಮೇಲೆ +{pct}% · p<0.05" },

  // ── When crime happens ──────────────────────────────────────────────────
  // The axis word ("hour", "day of week") is substituted, so each language
  // controls where it sits in the sentence.
  "patterns.axis.hour": { en: "hour", kn: "ಗಂಟೆ" },
  "patterns.axis.week": { en: "week", kn: "ವಾರ" },
  "patterns.axis.year": { en: "year", kn: "ವರ್ಷ" },
  "patterns.peakLift":     { en: "{observed} cases against {expected} expected — {sign}{pct}% on the {axis} baseline",
                             kn: "{expected} ನಿರೀಕ್ಷಿತಕ್ಕೆ ಎದುರಾಗಿ {observed} ಪ್ರಕರಣಗಳು — {axis} ಆಧಾರರೇಖೆಯ ಮೇಲೆ {sign}{pct}%" },
  "patterns.insufficient": { en: "Too few cases in this selection to test — no window is claimed.",
                             kn: "ಪರೀಕ್ಷಿಸಲು ಈ ಆಯ್ಕೆಯಲ್ಲಿ ತೀರಾ ಕಡಿಮೆ ಪ್ರಕರಣಗಳಿವೆ — ಯಾವುದೇ ಅವಧಿಯನ್ನು ಹೇಳಲಾಗಿಲ್ಲ." },
  "patterns.flat":         { en: "No window stands out: the spread across the {axis} is within what ordinary variation produces (χ²={chi2}, df={df}, p={p}). The tallest bar is not a pattern.",
                             kn: "ಯಾವುದೇ ಅವಧಿ ಎದ್ದು ಕಾಣುವುದಿಲ್ಲ: {axis} ವ್ಯಾಪ್ತಿಯ ಹಂಚಿಕೆ ಸಾಮಾನ್ಯ ವ್ಯತ್ಯಾಸದ ಮಿತಿಯಲ್ಲಿದೆ (χ²={chi2}, df={df}, p={p}). ಅತಿ ಎತ್ತರದ ಬಾರ್ ಒಂದು ಮಾದರಿಯಲ್ಲ." },
  "patterns.cases":        { en: "{n} cases", kn: "{n} ಪ್ರಕರಣಗಳು" },
  "patterns.cellTitle":    { en: "{weekday} {hour} — {n} cases", kn: "{weekday} {hour} — {n} ಪ್ರಕರಣಗಳು" },
  "patterns.loadFailed":   { en: "Could not load patterns.", kn: "ಮಾದರಿಗಳನ್ನು ಲೋಡ್ ಮಾಡಲಾಗಲಿಲ್ಲ." },
  "patterns.heatNote":     { en: "Darker is busier. Both axes are read off the same instant, so one cell is one claim.",
                             kn: "ಗಾಢವಾದಷ್ಟೂ ಹೆಚ್ಚು ಕಾರ್ಯಬಾಹುಳ್ಯ. ಎರಡೂ ಅಕ್ಷಗಳನ್ನು ಒಂದೇ ಕ್ಷಣದಿಂದ ಓದಲಾಗುತ್ತದೆ, ಆದ್ದರಿಂದ ಒಂದು ಕೋಶ ಒಂದು ಹೇಳಿಕೆ." },
  "patterns.noHour":       { en: "Hour of day is unavailable in this corpus. CrimeRegisteredDate is a DATE column — it stores no time — and every value in {source}, the one timestamp column that could carry a clock, falls at midnight. An hour chart drawn on that would be a single bar dressed up as a finding, so it is withheld. Day of week and month below are unaffected.",
                             kn: "ಈ ಸಂಗ್ರಹದಲ್ಲಿ ದಿನದ ಗಂಟೆ ಲಭ್ಯವಿಲ್ಲ. CrimeRegisteredDate ಎಂಬುದು DATE ಕಾಲಂ — ಅದು ಸಮಯವನ್ನು ಸಂಗ್ರಹಿಸುವುದಿಲ್ಲ — ಮತ್ತು ಗಡಿಯಾರವನ್ನು ಹೊಂದಬಹುದಾದ ಏಕೈಕ ಕಾಲಂ {source} ನಲ್ಲಿನ ಪ್ರತಿ ಮೌಲ್ಯವೂ ಮಧ್ಯರಾತ್ರಿಗೆ ಬರುತ್ತದೆ. ಅದರ ಮೇಲೆ ಚಿತ್ರಿಸಿದ ಗಂಟೆಯ ನಕ್ಷೆ ಒಂದೇ ಬಾರ್ ಅನ್ನು ಶೋಧನೆಯಂತೆ ತೋರಿಸುತ್ತದೆ, ಆದ್ದರಿಂದ ಅದನ್ನು ತಡೆಹಿಡಿಯಲಾಗಿದೆ. ಕೆಳಗಿನ ವಾರದ ದಿನ ಮತ್ತು ತಿಂಗಳು ಇದರಿಂದ ಪ್ರಭಾವಿತವಾಗಿಲ್ಲ." },

  // ── Repeat victims ──────────────────────────────────────────────────────
  "victims.ofVictims":     { en: "{n} of {total} victims", kn: "{total} ಸಂತ್ರಸ್ತರಲ್ಲಿ {n}" },
  "victims.repeatCaption": { en: "victimised more than once", kn: "ಒಂದಕ್ಕಿಂತ ಹೆಚ್ಚು ಬಾರಿ ಸಂತ್ರಸ್ತರಾದವರು" },
  "victims.ofCases":       { en: "{n} of {total} cases", kn: "{total} ಪ್ರಕರಣಗಳಲ್ಲಿ {n}" },
  "victims.absorbCaption": { en: "of the crime they absorb", kn: "ಅವರು ಅನುಭವಿಸುವ ಅಪರಾಧದ ಪಾಲು" },
  "victims.againstOne":    { en: "cases against one person", kn: "ಒಬ್ಬ ವ್ಯಕ್ತಿಯ ವಿರುದ್ಧದ ಪ್ರಕರಣಗಳು" },
  "victims.mostCaption":   { en: "the most victimised individual here", kn: "ಇಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಸಂತ್ರಸ್ತರಾದ ವ್ಯಕ್ತಿ" },
  "victims.minCases":      { en: "Min cases", kn: "ಕನಿಷ್ಠ ಪ್ರಕರಣಗಳು" },
  "victims.years":         { en: "{n} yrs", kn: "{n} ವರ್ಷ" },
  "victims.days":          { en: "{n} days", kn: "{n} ದಿನಗಳು" },
  "victims.cappedCommon":  { en: "Confidence held down — this name is common in the register",
                             kn: "ವಿಶ್ವಾಸವನ್ನು ಕಡಿಮೆ ಇರಿಸಲಾಗಿದೆ — ಈ ಹೆಸರು ದಾಖಲೆಯಲ್ಲಿ ಸಾಮಾನ್ಯವಾಗಿದೆ" },
  "victims.cappedMononym": { en: "Confidence held down — a single given name is not an identity",
                             kn: "ವಿಶ್ವಾಸವನ್ನು ಕಡಿಮೆ ಇರಿಸಲಾಗಿದೆ — ಕೇವಲ ಒಂದು ಹೆಸರು ಗುರುತಲ್ಲ" },

  "pipeline.longest":        { en: "Longest at the slowest step", kn: "ಅತ್ಯಂತ ನಿಧಾನ ಹಂತದಲ್ಲಿ ಅತಿ ಹೆಚ್ಚು ಕಾಲ" },
  "pipeline.negativeHint":   { en: "Milestone dated before the one it follows — excluded from the median rather than clamped to zero.",
                               kn: "ಹಿಂದಿನ ಹಂತಕ್ಕಿಂತ ಮೊದಲಿನ ದಿನಾಂಕವಿರುವ ಮೈಲಿಗಲ್ಲು — ಶೂನ್ಯಕ್ಕೆ ಇಳಿಸುವ ಬದಲು ಸರಾಸರಿಯಿಂದ ಹೊರಗಿಡಲಾಗಿದೆ." },
  // Server-side methodology notes, rendered here so the numbers in them can be
  // placed where each language wants them (see lib/pipeline.ts).
  "pipeline.note.court": {
    en: "Not measurable from this schema. CaseMaster.CourtID is the court with jurisdiction, set on every case including False Case ones, and Court carries no date column — there is no committal, hearing or disposal date to measure against. Shown so the missing step is visible rather than silently dropped.",
    kn: "ಈ ರಚನೆಯಿಂದ ಅಳೆಯಲಾಗದು. CaseMaster.CourtID ಎಂಬುದು ವ್ಯಾಪ್ತಿ ಹೊಂದಿರುವ ನ್ಯಾಯಾಲಯ, ಸುಳ್ಳು ಪ್ರಕರಣ ಸೇರಿದಂತೆ ಪ್ರತಿ ಪ್ರಕರಣಕ್ಕೂ ಇದನ್ನು ನಿಗದಿಪಡಿಸಲಾಗಿದೆ, ಮತ್ತು Court ನಲ್ಲಿ ದಿನಾಂಕದ ಕಾಲಂ ಇಲ್ಲ — ಅಳೆಯಲು ಯಾವುದೇ ಒಪ್ಪಿಸುವಿಕೆ, ವಿಚಾರಣೆ ಅಥವಾ ಇತ್ಯರ್ಥದ ದಿನಾಂಕವಿಲ್ಲ. ಕಾಣೆಯಾದ ಹಂತವು ಮೌನವಾಗಿ ಬಿಟ್ಟುಹೋಗದೆ ಕಾಣುವಂತೆ ಇದನ್ನು ತೋರಿಸಲಾಗಿದೆ." },
  // Two keys purely for the English singular ("1 duration was excluded");
  // Kannada uses the same clause for both counts.
  "pipeline.methodOne": {
    en: "FIRs registered in the last {windowMonths} months. Arrest = earliest ArrestSurrenderDate on the case; chargesheet = earliest ChargesheetDetails.csdate. Durations are medians and p90s, never means. 1 duration was excluded as negative (a milestone dated before the one it follows). Drop-off counts cases that have not reached the stage YET as well as those that never will — a case registered last week is not a failure, and the schema carries no expected-completion date to separate them. The court stage is named but not measured: CaseMaster.CourtID is a jurisdiction set on every case and Court has no date column.",
    kn: "ಕಳೆದ {windowMonths} ತಿಂಗಳಲ್ಲಿ ದಾಖಲಾದ ಎಫ್‌ಐಆರ್‌ಗಳು. ಬಂಧನ = ಪ್ರಕರಣದ ಮೊದಲ ArrestSurrenderDate; ಆರೋಪಪಟ್ಟಿ = ಮೊದಲ ChargesheetDetails.csdate. ಅವಧಿಗಳು ಮಧ್ಯಕ ಮತ್ತು p90, ಎಂದಿಗೂ ಸರಾಸರಿ ಅಲ್ಲ. 1 ಅವಧಿಯನ್ನು ಋಣಾತ್ಮಕವೆಂದು ಹೊರಗಿಡಲಾಗಿದೆ (ಹಿಂದಿನ ಹಂತಕ್ಕಿಂತ ಮೊದಲಿನ ದಿನಾಂಕವಿರುವ ಮೈಲಿಗಲ್ಲು). ಇಳಿಕೆಯ ಎಣಿಕೆಯಲ್ಲಿ ಇನ್ನೂ ಆ ಹಂತ ತಲುಪದ ಪ್ರಕರಣಗಳೂ, ಎಂದಿಗೂ ತಲುಪದವೂ ಸೇರಿವೆ — ಕಳೆದ ವಾರ ದಾಖಲಾದ ಪ್ರಕರಣ ವೈಫಲ್ಯವಲ್ಲ, ಮತ್ತು ಅವನ್ನು ಬೇರ್ಪಡಿಸಲು ರಚನೆಯಲ್ಲಿ ನಿರೀಕ್ಷಿತ ಪೂರ್ಣಗೊಳಿಸುವ ದಿನಾಂಕವಿಲ್ಲ. ನ್ಯಾಯಾಲಯದ ಹಂತವನ್ನು ಹೆಸರಿಸಲಾಗಿದೆ ಆದರೆ ಅಳೆಯಲಾಗಿಲ್ಲ: CaseMaster.CourtID ಪ್ರತಿ ಪ್ರಕರಣಕ್ಕೂ ನಿಗದಿಪಡಿಸಿದ ವ್ಯಾಪ್ತಿ ಮತ್ತು Court ನಲ್ಲಿ ದಿನಾಂಕದ ಕಾಲಂ ಇಲ್ಲ." },
  "pipeline.method": {
    en: "FIRs registered in the last {windowMonths} months. Arrest = earliest ArrestSurrenderDate on the case; chargesheet = earliest ChargesheetDetails.csdate. Durations are medians and p90s, never means. {negatives} durations were excluded as negative (a milestone dated before the one it follows). Drop-off counts cases that have not reached the stage YET as well as those that never will — a case registered last week is not a failure, and the schema carries no expected-completion date to separate them. The court stage is named but not measured: CaseMaster.CourtID is a jurisdiction set on every case and Court has no date column.",
    kn: "ಕಳೆದ {windowMonths} ತಿಂಗಳಲ್ಲಿ ದಾಖಲಾದ ಎಫ್‌ಐಆರ್‌ಗಳು. ಬಂಧನ = ಪ್ರಕರಣದ ಮೊದಲ ArrestSurrenderDate; ಆರೋಪಪಟ್ಟಿ = ಮೊದಲ ChargesheetDetails.csdate. ಅವಧಿಗಳು ಮಧ್ಯಕ ಮತ್ತು p90, ಎಂದಿಗೂ ಸರಾಸರಿ ಅಲ್ಲ. {negatives} ಅವಧಿಗಳನ್ನು ಋಣಾತ್ಮಕವೆಂದು ಹೊರಗಿಡಲಾಗಿದೆ (ಹಿಂದಿನ ಹಂತಕ್ಕಿಂತ ಮೊದಲಿನ ದಿನಾಂಕವಿರುವ ಮೈಲಿಗಲ್ಲು). ಇಳಿಕೆಯ ಎಣಿಕೆಯಲ್ಲಿ ಇನ್ನೂ ಆ ಹಂತ ತಲುಪದ ಪ್ರಕರಣಗಳೂ, ಎಂದಿಗೂ ತಲುಪದವೂ ಸೇರಿವೆ — ಕಳೆದ ವಾರ ದಾಖಲಾದ ಪ್ರಕರಣ ವೈಫಲ್ಯವಲ್ಲ, ಮತ್ತು ಅವನ್ನು ಬೇರ್ಪಡಿಸಲು ರಚನೆಯಲ್ಲಿ ನಿರೀಕ್ಷಿತ ಪೂರ್ಣಗೊಳಿಸುವ ದಿನಾಂಕವಿಲ್ಲ. ನ್ಯಾಯಾಲಯದ ಹಂತವನ್ನು ಹೆಸರಿಸಲಾಗಿದೆ ಆದರೆ ಅಳೆಯಲಾಗಿಲ್ಲ: CaseMaster.CourtID ಪ್ರತಿ ಪ್ರಕರಣಕ್ಕೂ ನಿಗದಿಪಡಿಸಿದ ವ್ಯಾಪ್ತಿ ಮತ್ತು Court ನಲ್ಲಿ ದಿನಾಂಕದ ಕಾಲಂ ಇಲ್ಲ." },
} as const;

export type StringKey = keyof typeof STRINGS;

export function t(key: StringKey, lang: Lang): string {
  return STRINGS[key][lang] ?? STRINGS[key].en;
}

/**
 * Renders a string that may or may not be a translation key. Used where one
 * list mixes prose with things that must never be translated — "Bounded agent
 * loop (max 4 iterations)" has a key; "App Router · Turbopack · SSR + RSC" is
 * four product names and is written literally.
 */
export function tk(s: string, lang: Lang): string {
  return s in STRINGS ? t(s as StringKey, lang) : s;
}

export type Params = Record<string, string | number | null | undefined>;

/**
 * `t` with `{placeholder}` substitution, for strings whose numbers and names
 * are only known at runtime. Kannada puts them in a different order than
 * English, which is the whole reason the detectors store parameters and let
 * this build the sentence rather than concatenating one server-side.
 *
 * An unknown placeholder is left as written — a visible `{foo}` is a bug
 * report, where an empty string would read as a finished sentence.
 */
export function tf(key: StringKey, lang: Lang, params: Params): string {
  return t(key, lang).replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    return v === null || v === undefined ? whole : String(v);
  });
}

// ── Data values ─────────────────────────────────────────────────────────────
// The reference tables are English-only in the KSP schema, so the labels are
// mapped here rather than joined. Every set is closed and small; these are the
// complete contents of CrimeHead.CrimeGroupName, CaseStatusMaster,
// District, OccupationMaster and ReligionMaster as of 2026-08-29.

export const CRIME_GROUP_KN: Record<string, string> = {
  "Crimes Against Body": "ದೇಹದ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು",
  "Crimes Against Property": "ಆಸ್ತಿ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು",
  "Crimes Against Women": "ಮಹಿಳೆಯರ ವಿರುದ್ಧದ ಅಪರಾಧಗಳು",
  "Cybercrimes": "ಸೈಬರ್ ಅಪರಾಧಗಳು",
  "Economic Offences": "ಆರ್ಥಿಕ ಅಪರಾಧಗಳು",
  "Narcotics": "ಮಾದಕ ವಸ್ತು ಅಪರಾಧಗಳು",
  "Other IPC Crimes": "ಇತರ ಐಪಿಸಿ ಅಪರಾಧಗಳು",
  "Road Accidents": "ರಸ್ತೆ ಅಪಘಾತಗಳು",
};

export const STATUS_KN: Record<string, string> = {
  "Under Investigation": "ತನಿಖೆಯಲ್ಲಿದೆ",
  "Charge Sheeted": "ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "Closed": "ಮುಕ್ತಾಯಗೊಂಡಿದೆ",
  "False Case": "ಸುಳ್ಳು ಪ್ರಕರಣ",
  // ChargesheetDetails.cstype labels (lib/caseStatus.ts CSTYPE)
  "Chargesheet Filed": "ಆರೋಪಪಟ್ಟಿ ಸಲ್ಲಿಸಲಾಗಿದೆ",
  "Undetected": "ಪತ್ತೆಯಾಗಿಲ್ಲ",
};

export const DISTRICT_KN: Record<string, string> = {
  "Bagalkote": "ಬಾಗಲಕೋಟೆ",
  "Ballari": "ಬಳ್ಳಾರಿ",
  "Belagavi": "ಬೆಳಗಾವಿ",
  "Bengaluru Rural": "ಬೆಂಗಳೂರು ಗ್ರಾಮಾಂತರ",
  "Bengaluru Urban": "ಬೆಂಗಳೂರು ನಗರ",
  "Bidar": "ಬೀದರ್",
  "Chamarajanagara": "ಚಾಮರಾಜನಗರ",
  "Chikkaballapura": "ಚಿಕ್ಕಬಳ್ಳಾಪುರ",
  "Chikkamagaluru": "ಚಿಕ್ಕಮಗಳೂರು",
  "Dakshina Kannada": "ದಕ್ಷಿಣ ಕನ್ನಡ",
  "Davangere": "ದಾವಣಗೆರೆ",
  "Dharwad": "ಧಾರವಾಡ",
  "Gadag": "ಗದಗ",
  "Hassan": "ಹಾಸನ",
  "Haveri": "ಹಾವೇರಿ",
  "Kalaburagi": "ಕಲಬುರಗಿ",
  "Kodagu": "ಕೊಡಗು",
  "Kolar": "ಕೋಲಾರ",
  "Koppal": "ಕೊಪ್ಪಳ",
  "Mandya": "ಮಂಡ್ಯ",
  "Mysuru": "ಮೈಸೂರು",
  "Raichur": "ರಾಯಚೂರು",
  "Ramanagara": "ರಾಮನಗರ",
  "Shivamogga": "ಶಿವಮೊಗ್ಗ",
  "Tumakuru": "ತುಮಕೂರು",
  "Udupi": "ಉಡುಪಿ",
  "Uttara Kannada": "ಉತ್ತರ ಕನ್ನಡ",
  "Vijayanagara": "ವಿಜಯನಗರ",
  "Vijayapura": "ವಿಜಯಪುರ",
  "Yadgir": "ಯಾದಗಿರಿ",
};

export const OCCUPATION_KN: Record<string, string> = {
  "Business": "ವ್ಯಾಪಾರ",
  "Daily Wage Labour": "ದಿನಗೂಲಿ ಕಾರ್ಮಿಕ",
  "Farmer": "ರೈತ",
  "Government Employee": "ಸರ್ಕಾರಿ ನೌಕರ",
  "Private Employee": "ಖಾಸಗಿ ನೌಕರ",
  "Student": "ವಿದ್ಯಾರ್ಥಿ",
  "Unemployed": "ನಿರುದ್ಯೋಗಿ",
};

export const RELIGION_KN: Record<string, string> = {
  "Buddhist": "ಬೌದ್ಧ",
  "Christian": "ಕ್ರಿಶ್ಚಿಯನ್",
  "Hindu": "ಹಿಂದೂ",
  "Jain": "ಜೈನ",
  "Muslim": "ಮುಸ್ಲಿಂ",
  "Other": "ಇತರ",
};

export const GENDER_KN: Record<string, string> = {
  "Male": "ಪುರುಷ",
  "Female": "ಮಹಿಳೆ",
  "Transgender": "ತೃತೀಯ ಲಿಂಗಿ",
};

/** Stand-ins a detector writes when the record has no crime group or no date.
 *  Kept here so they translate like any other value rather than freezing as
 *  English inside a Kannada sentence. */
export const PLACEHOLDER_KN: Record<string, string> = {
  "Case": "ಪ್ರಕರಣ",
  "recent": "ಇತ್ತೀಚಿನ",
};

// ponytail: one flat namespace, because no value appears in two of the sets
// above. Split into per-domain lookups if a literal ever collides.
const VALUE_KN: Record<string, string> = {
  ...PLACEHOLDER_KN,
  ...CRIME_GROUP_KN,
  ...STATUS_KN,
  ...DISTRICT_KN,
  ...OCCUPATION_KN,
  ...RELIGION_KN,
  ...GENDER_KN,
};

/**
 * Translates a value that came out of the database — a district, a crime
 * group, a case status. Unknown values pass through unchanged: a district
 * added to the reference table after this map was written should render as
 * its English name, not vanish.
 */
export function tv(value: string | null | undefined, lang: Lang): string {
  if (!value) return "";
  if (lang === "en") return value;
  return VALUE_KN[value] ?? value;
}

// ponytail: no number-formatting helper. `kn-IN` formats 1234567 as 1,234,567
// — Western grouping — while `en-IN` gives the 12,34,567 that Karnataka police
// records actually use. Numbers keep their existing en-IN formatting in both
// languages; revisit only if a reviewer asks for Kannada digits (-u-nu-knda).

/** BCP-47 locale for dates. Month and weekday names come from the locale;
 *  numbers deliberately do not — see the note above on lakh grouping. */
export function dateLocale(lang: Lang): string {
  return lang === "kn" ? "kn-IN" : "en-IN";
}

/** BCP-47 locale for Web Speech STT/TTS. */
export function speechLocale(lang: Lang): string {
  return lang === "kn" ? "kn-IN" : "en-IN";
}
