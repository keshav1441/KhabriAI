import { createHash } from "node:crypto";

// Deterministic modus-operandi signature for a (repeat offender, crime group)
// series: the same key always yields the same traits, so every FIR in the
// series describes the same method. Used by scripts/enrich-briefs.ts.

type Trait = Record<string, string[]>;

const TRAITS: Record<string, Trait> = {
  "Crimes Against Property": {
    entry: ["cut the rear window grille", "used a duplicate key", "drilled out the door lock", "climbed the balcony from the compound wall", "pried open the shutter with an iron rod"],
    time: ["between 1 and 3 am", "in the late afternoon while the house was empty", "during a wedding in the family", "just before dawn"],
    target: ["locked houses of families away on travel", "ground-floor flats", "small jewellery shops", "two-wheelers parked near bus stands", "elderly people living alone"],
    vehicle: ["two men on a black Pulsar without a number plate", "a white Bolero with tinted glass", "on foot through the back lane", "an auto-rickshaw waiting at the corner"],
    signature: ["took only gold and left the cash untouched", "cut the CCTV cable before entering", "posed as courier delivery staff", "left the kitchen tap running"],
  },
  Cybercrimes: {
    lure: ["an SMS about KYC expiry", "a fake work-from-home job offer", "a call threatening electricity disconnection", "a buyer on OLX sending a UPI collect request", "a matrimonial profile"],
    channel: ["a WhatsApp video call", "a link to a cloned bank page", "an APK sent on Telegram", "a screen-sharing app"],
    route: ["withdrawn from ATMs in Jharkhand within an hour", "moved through three mule accounts", "converted to crypto on a P2P exchange", "spent on gift-card purchases"],
    signature: ["the caller spoke fluent Kannada and quoted the victim's correct address", "the amount was always just under one lakh", "the victim was kept on the call for hours", "the same virtual number was used"],
  },
  "Crimes Against Body": {
    weapon: ["a machete", "a wooden club", "an iron rod", "bare hands and a stone"],
    pretext: ["an old land dispute", "a quarrel over a lent motorcycle", "an argument at a liquor shop", "a property partition feud"],
    place: ["outside a bar on the highway", "near the village lake", "at a bus shelter", "in the victim's own courtyard"],
    signature: ["the accused arrived and fled on a single motorcycle", "the victim's phone was taken", "witnesses were threatened to stay silent", "the attack was filmed on a phone"],
  },
  "Crimes Against Women": {
    pretext: ["a promise of marriage", "demands for additional dowry", "a job interview", "following the victim from a bus stop"],
    place: ["the marital home", "a PG hostel", "a secluded stretch near the college", "a rented room"],
    signature: ["threats using private photographs", "the victim's family was warned off", "repeated calls from changing numbers", "the accused's relatives were present"],
  },
  "Economic Offences": {
    scheme: ["a chit fund promising 20 percent monthly returns", "a fake land registration", "a forged cheque book", "a bogus investment app", "an agency selling non-existent plots"],
    front: ["an office on the main road that closed overnight", "a registered society", "a WhatsApp investor group", "an agent collecting cash receipts"],
    signature: ["investors were paid for the first three months", "documents carried a forged sub-registrar seal", "the same notary appeared on every paper", "collections were always in cash"],
  },
  Narcotics: {
    substance: ["ganja", "MDMA pills", "hashish oil", "synthetic drugs in capsule form"],
    method: ["hidden in a two-wheeler's side box", "delivered through a food delivery bag", "stashed in a rented room near the college", "sold near a pub on weekends"],
    signature: ["orders were taken on Instagram", "the buyer paid through a QR code at a tea stall", "the supply came on the Goa bus", "small quantities packed in foil"],
  },
  "Road Accidents": {
    vehicle: ["a speeding tipper lorry", "a private bus", "a car driven by a drunk driver", "a two-wheeler without headlights"],
    place: ["at the ring road junction", "on the state highway near a curve", "outside the school gate", "at an unmanned level crossing"],
    signature: ["the driver fled leaving the vehicle", "no helmet was worn", "the vehicle had no valid insurance", "it happened in heavy rain after dark"],
  },
  "Other IPC Crimes": {
    group: ["a group of ten to fifteen men", "two local men known in the area", "an organised gang", "a mob that gathered after a rumour"],
    method: ["demanding weekly hafta from shopkeepers", "blocking the road with stones", "threatening over a phone call", "gathering outside the house at night"],
    signature: ["a known local strongman's name was invoked", "the demand was for exactly five thousand rupees", "the threat was repeated every Monday", "a video of the gathering was circulated"],
  },
};

function pick<T>(arr: T[], seed: string, salt: string): T {
  const h = createHash("sha256").update(`${seed}:${salt}`).digest();
  return arr[h.readUInt32BE(0) % arr.length];
}

export function moSignature(seriesKey: string, crimeGroup: string): Record<string, string> {
  const traits = TRAITS[crimeGroup] ?? TRAITS["Other IPC Crimes"];
  const out: Record<string, string> = {};
  for (const [name, options] of Object.entries(traits)) out[name] = pick(options, seriesKey, name);
  return out;
}
