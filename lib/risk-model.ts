// Local, interpretable chargesheet-likelihood model.
//
// Coefficients are NOT guessed — they are read straight off the seed data's
// generative process (prisma/seed.ts ~L286-291), so the score matches how the
// synthetic outcomes were actually produced:
//   arrested        → chargesheet weight = 20 + 60*timeFactor  of  (68 + 60*timeFactor)
//   not arrested    → chargesheet weight = 2  of  100  (= 0.02)
//   timeFactor      = min(daysSinceRegistered / 180, 1)
// This doubles as the Explainable-AI layer: it returns per-feature contributions,
// not just a number. In production the Catalyst QuickML model supersedes it
// (lib/agent/tools.ts runPredictRisk), but this keeps prediction working — and
// explainable — in a local demo.

export interface RiskContribution {
  label: string;
  sign: "+" | "-";
  strength: number; // 0..1, for display weighting only
}

export interface RiskPrediction {
  label: string;
  probability: number; // 0..1
  contributions: RiskContribution[];
  source: "local";
}

export interface RiskFeatures {
  hasArrest: boolean;
  daysSinceRegistered: number;
  heinous: boolean;
  victimCount: number;
  accusedCount: number;
}

export function predictChargesheetRisk(f: RiskFeatures): RiskPrediction {
  const tf = Math.min(Math.max(f.daysSinceRegistered, 0) / 180, 1);
  const probability = f.hasArrest ? (20 + 60 * tf) / (68 + 60 * tf) : 0.02;

  const label =
    probability >= 0.5 ? "Likely charge-sheeted" :
    probability >= 0.25 ? "Moderate likelihood" :
    "Unlikely to be charge-sheeted";

  const contributions: RiskContribution[] = [];
  contributions.push(
    f.hasArrest
      ? { label: "Arrest made (precondition for chargesheet)", sign: "+", strength: 0.9 }
      : { label: "No arrest yet — chargesheet is rare without one", sign: "-", strength: 0.9 }
  );
  if (f.hasArrest) {
    contributions.push({
      label: `Investigation time elapsed (${Math.round(tf * 100)}% of the ~180-day window)`,
      sign: tf >= 0.5 ? "+" : "-",
      strength: Math.abs(tf - 0.35),
    });
  }
  if (f.heinous) {
    contributions.push({ label: "Heinous offence — higher investigative priority", sign: "+", strength: 0.25 });
  }
  if (f.accusedCount > 1) {
    contributions.push({ label: `Multiple accused (${f.accusedCount}) named`, sign: "+", strength: 0.1 });
  }

  return { label, probability, contributions, source: "local" };
}

// ponytail: one runnable self-check — monotonicity is the property that matters.
export function _selfCheck() {
  const arrested = predictChargesheetRisk({ hasArrest: true, daysSinceRegistered: 200, heinous: true, victimCount: 1, accusedCount: 2 });
  const notArrested = predictChargesheetRisk({ hasArrest: false, daysSinceRegistered: 200, heinous: true, victimCount: 1, accusedCount: 2 });
  const early = predictChargesheetRisk({ hasArrest: true, daysSinceRegistered: 10, heinous: false, victimCount: 1, accusedCount: 1 });
  console.assert(arrested.probability > notArrested.probability, "arrest must raise chargesheet probability");
  console.assert(arrested.probability > early.probability, "more elapsed time must raise probability when arrested");
  console.assert(arrested.probability <= 1 && notArrested.probability >= 0, "probability in [0,1]");
  return { arrested: arrested.probability, notArrested: notArrested.probability, early: early.probability };
}

if (typeof require !== "undefined" && require.main === module) {
  console.log(_selfCheck());
}
