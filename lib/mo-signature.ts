import { createHash } from "node:crypto";

// Deterministic modus-operandi signature for a (repeat offender, crime group)
// series. Two layers, so the linker can be scored on both:
//   crew traits    - vehicle, time window, signature habit: the same for every
//                    case in the series, whatever the specific offence label.
//                    These are what make "same crew" recoverable from text.
//   offence traits - method and target: chosen per SPECIFIC crime type, so a
//                    case labelled Cheating reads like cheating, not burglary.
// Used by scripts/enrich-briefs.ts.

export const CREW_TRAITS = ["vehicle", "time", "signature"] as const;
export const OFFENCE_TRAITS = ["method", "target"] as const;

type CrewSet = Record<(typeof CREW_TRAITS)[number], string[]>;
type OffenceSet = Record<(typeof OFFENCE_TRAITS)[number], string[]>;

const CREW: Record<string, CrewSet> = {
  "Crimes Against Property": {
    vehicle: ["two men on a black Pulsar without a number plate", "a white Bolero with tinted glass", "on foot through the back lane", "an auto-rickshaw waiting at the corner", "a red Activa with a cloth over the plate"],
    time: ["between 1 and 3 am", "in the late afternoon while the house was empty", "during a wedding in the family", "just before dawn", "on a Sunday evening during the serial hour"],
    signature: ["took only gold and left the cash untouched", "cut the CCTV cable before entering", "posed as courier delivery staff", "left the kitchen tap running", "locked the dog in the bathroom"],
  },
  Cybercrimes: {
    vehicle: ["a virtual number starting +91 70", "a Telegram handle that changed weekly", "a Truecaller-verified business profile", "a WhatsApp DP showing a bank logo"],
    time: ["on the first week of the month", "late on weekday evenings", "within minutes of a bank SMS", "on bank holidays"],
    signature: ["the caller spoke fluent Kannada and quoted the victim's correct address", "the amount was always just under one lakh", "the victim was kept on the call for hours", "the same mule account in Jharkhand was used"],
  },
  "Crimes Against Body": {
    vehicle: ["a single motorcycle for arriving and fleeing", "a Tata Sumo with five men", "on foot from the neighbouring lane", "a tractor trailer"],
    time: ["after the evening bar closing", "at the weekly market", "during the village festival night", "early morning at the fields"],
    signature: ["the victim's phone was taken", "witnesses were threatened to stay silent", "the attack was filmed on a phone", "the accused shouted the same slogan"],
  },
  "Crimes Against Women": {
    vehicle: ["a grey Swift seen circling twice", "the same autorickshaw at the bus stop", "on foot following from the college gate", "a two-wheeler with a pillion"],
    time: ["after the evening tuition", "late at night in the marital home", "during festival crowds", "on the morning commute"],
    signature: ["threats using private photographs", "the victim's family was warned off", "repeated calls from changing numbers", "the accused's relatives were present"],
  },
  "Economic Offences": {
    vehicle: ["an office on the main road that closed overnight", "a registered society as the front", "a WhatsApp investor group", "an agent collecting cash receipts door to door"],
    time: ["around the festival season", "at the quarter end", "after a free seminar at a hotel", "over three months of weekly collections"],
    signature: ["investors were paid for the first three months", "documents carried a forged sub-registrar seal", "the same notary appeared on every paper", "collections were always in cash"],
  },
  Narcotics: {
    vehicle: ["a two-wheeler's side box", "a food delivery bag", "the Goa night bus luggage hold", "a courier parcel marked as spices"],
    time: ["on Friday and Saturday nights", "around college exam season", "on the monthly market day", "after midnight near the highway dhaba"],
    signature: ["orders were taken on Instagram", "the buyer paid through a QR code at a tea stall", "small quantities packed in foil", "a lookout stood at the lane entrance"],
  },
  "Road Accidents": {
    vehicle: ["a speeding tipper lorry", "a private bus", "a car driven by a drunk driver", "a two-wheeler without headlights"],
    time: ["in heavy rain after dark", "at the school closing hour", "on the early morning highway stretch", "during the festival procession"],
    signature: ["the driver fled leaving the vehicle", "the vehicle had no valid insurance", "no helmet was worn", "the number plate was bent to hide a digit"],
  },
  "Other IPC Crimes": {
    vehicle: ["a group of ten to fifteen men", "two local men known in the area", "an organised gang", "a mob that gathered after a rumour"],
    time: ["every Monday", "on the eve of the local election", "after the evening prayer", "on market day"],
    signature: ["a known local strongman's name was invoked", "the demand was for exactly five thousand rupees", "a video of the gathering was circulated", "the threat was repeated over the phone"],
  },
};

const OFFENCE: Record<string, OffenceSet> = {
  // Crimes Against Body
  Murder: { method: ["stabbed with a machete after an argument", "struck on the head with a wooden club", "strangled and left in the field", "run over deliberately"], target: ["a rival from a land dispute", "a money lender", "an estranged relative", "a shopkeeper who refused to pay"] },
  "Attempt to Murder": { method: ["slashed with a sickle", "attacked with an iron rod", "shot at with a country-made pistol", "set upon with stones"], target: ["a neighbour over a boundary wall", "a former business partner", "a witness in a pending case", "a rival gang member"] },
  "Culpable Homicide": { method: ["a blow in a sudden quarrel", "pushed during a scuffle", "a single knife wound in a fight", "beaten in a drunken brawl"], target: ["a drinking companion", "a tenant", "a co-worker", "a relative at a family function"] },
  "Grievous Hurt": { method: ["beaten with rods", "acid thrown", "hacked on the arm", "assaulted with a cricket bat"], target: ["a shop owner", "a farmer at the fields", "a youth at the bus stand", "a college student"] },
  "Simple Hurt": { method: ["slapped and pushed", "beaten with fists", "hit with a slipper", "kicked during an argument"], target: ["a neighbour", "an auto driver", "a customer", "a relative"] },
  Kidnapping: { method: ["lured with a promise of a job", "dragged into a car", "taken from school in a fake pickup", "held for ransom"], target: ["a minor girl", "a businessman's son", "a school boy", "a young woman"] },
  // Crimes Against Property
  Theft: { method: ["picked the pocket in a crowd", "snatched the chain from a moving bike", "lifted the bag from a bus seat", "broke the lock of a parked scooter"], target: ["commuters at the bus stand", "women on morning walks", "temple visitors", "parked two-wheelers"] },
  Burglary: { method: ["cut the rear window grille", "drilled out the door lock", "climbed the balcony from the compound wall", "pried open the shutter with an iron rod"], target: ["locked houses of families away on travel", "ground-floor flats", "small jewellery shops", "elderly people living alone"] },
  Robbery: { method: ["held a knife and demanded the phone", "snatched the bag at a signal", "threatened with a rod on a lonely road", "stopped the bike and took the wallet"], target: ["late-night riders", "petrol pump attendants", "delivery boys", "women returning from work"] },
  Dacoity: { method: ["five armed men stormed the house", "looted a jewellery shop at gunpoint", "waylaid a truck on the highway", "tied up the family and ransacked the house"], target: ["a wealthy trader's house", "a gold shop", "a goods lorry", "a cooperative bank branch"] },
  Cheating: { method: ["took an advance for a non-existent plot", "sold a fake gold ornament", "promised a government job for a fee", "collected money for a bogus tour package"], target: ["a farmer", "a retired teacher", "job seekers", "pilgrims"] },
  "Criminal Breach of Trust": { method: ["siphoned society funds", "failed to return gold pledged with him", "sold a vehicle entrusted for repair", "pocketed chit fund instalments"], target: ["society members", "a widow", "a customer", "chit subscribers"] },
  // Crimes Against Women
  Rape: { method: ["under a promise of marriage", "after spiking a drink", "by an acquaintance at a rented room", "during a visit to a relative's house"], target: ["a young woman", "a college student", "a domestic worker", "a minor"] },
  "Assault on Women": { method: ["grabbed and molested on a bus", "stalked and assaulted near the college", "outraged modesty at the workplace", "assaulted in a lift"], target: ["a commuter", "a student", "an employee", "a neighbour"] },
  "Domestic Violence": { method: ["beaten for refusing to bring money", "locked in a room", "burned with a hot ladle", "thrown out of the house at night"], target: ["the wife", "the daughter-in-law", "a live-in partner", "the elderly mother"] },
  "Dowry Harassment": { method: ["demanded a car after the wedding", "taunted for bringing less gold", "demanded money for the husband's business", "harassed over a scooter"], target: ["the newly married wife", "the bride's family", "the daughter-in-law", "a wife of two years"] },
  "Eve Teasing": { method: ["passed lewd remarks", "followed on a two-wheeler", "sent obscene messages", "whistled and blocked the way"], target: ["college girls", "a working woman", "schoolgirls", "a nurse on night duty"] },
  Abduction: { method: ["taken away in a car", "lured by a friend", "forced into an auto", "taken on the pretext of a temple visit"], target: ["a minor girl", "a young woman", "a daughter against the family's wish", "a student"] },
  // Cybercrimes
  "Identity Theft": { method: ["cloned the Aadhaar details", "took over the WhatsApp account", "used the PAN to open loan accounts", "created a fake Facebook profile"], target: ["a retired officer", "a student", "a small trader", "a housewife"] },
  "Online Fraud": { method: ["an SMS about KYC expiry", "a fake work-from-home job offer", "a call threatening electricity disconnection", "a buyer on OLX sending a UPI collect request"], target: ["a pensioner", "a home-maker", "a young job seeker", "a shopkeeper"] },
  Hacking: { method: ["phished the email password", "installed a remote access app", "exploited the shop's billing software", "reset the bank PIN via a SIM swap"], target: ["a company account", "a school's portal", "a shop's UPI terminal", "a personal email"] },
  Cyberstalking: { method: ["created fake profiles in her name", "sent hundreds of messages from new numbers", "posted morphed photos", "tracked her location through an app"], target: ["a college student", "an ex-colleague", "a social media influencer", "a neighbour"] },
  "Data Theft": { method: ["copied the customer database to a pen drive", "exported client files before resigning", "scraped the hospital records", "sold the coaching centre's student list"], target: ["a software firm", "a hospital", "a bank branch", "a coaching institute"] },
  // Economic Offences
  "Bank Fraud": { method: ["forged loan documents", "cloned debit cards at a skimmer", "diverted NEFT transfers", "opened accounts with fake KYC"], target: ["a nationalised bank branch", "a cooperative bank", "account holders", "an NBFC"] },
  "Investment Fraud": { method: ["a chit fund promising 20 percent monthly returns", "a bogus crypto trading app", "a multi-level marketing scheme", "fake fixed deposit certificates"], target: ["retirees", "small investors", "IT employees", "farmers with land sale money"] },
  Forgery: { method: ["forged a sale deed", "faked a will", "made a duplicate RC book", "forged signatures on cheques"], target: ["a property owner", "legal heirs", "a vehicle buyer", "a company"] },
  Counterfeiting: { method: ["printed fake 500 rupee notes", "sold counterfeit branded goods", "faked stamp papers", "made duplicate excise labels"], target: ["market traders", "a retail chain", "the sub-registrar office", "liquor shops"] },
  "Tax Evasion": { method: ["under-invoiced sales", "ran a parallel cash book", "claimed fake GST input credit", "routed sales through shell firms"], target: ["the GST department", "the commercial taxes office", "the excise department", "the income tax office"] },
  // Road Accidents
  "Fatal Accident": { method: ["rammed a parked lorry", "hit a pedestrian crossing the road", "skidded on a wet curve", "collided head-on while overtaking"], target: ["a two-wheeler rider", "a pedestrian", "a family in a car", "a cyclist"] },
  "Grievous Injury Accident": { method: ["overturned at the curve", "hit a divider at speed", "side-swiped a bike", "ran into a median"], target: ["passengers of a bus", "a pillion rider", "a roadside vendor", "a school child"] },
  "Simple Injury Accident": { method: ["brushed a pedestrian", "skidded at low speed", "bumped a scooter at a signal", "reversed into a parked bike"], target: ["a pedestrian", "a scooter rider", "a cyclist", "a passenger"] },
  "Hit and Run": { method: ["fled after hitting a pedestrian", "drove away after knocking down a rider", "abandoned the vehicle and ran", "sped off from the accident spot"], target: ["a morning walker", "a night-shift worker", "a cyclist", "a child near the school"] },
  // Narcotics
  "Cannabis Possession": { method: ["found with ganja in a backpack", "stored ganja in the hostel room", "carried ganja in a lunch box", "hid ganja in the scooter"], target: ["a student", "a labourer", "a young man near the bus stand", "a hostel resident"] },
  Trafficking: { method: ["moved MDMA from Goa by bus", "couriered drugs in parcels", "carried hashish oil in a car's door panel", "ferried ganja from Andhra in a truck"], target: ["city pubs", "college hostels", "a resort", "a peddler network"] },
  Peddling: { method: ["sold near the college gate", "delivered on order via Instagram", "sold from a paan shop", "supplied at weekend parties"], target: ["students", "IT employees", "party goers", "daily wage workers"] },
  Consumption: { method: ["found intoxicated on the road", "consumed in a parked car", "caught smoking in a park", "found with residue at a PG"], target: ["a youth", "a techie", "a student", "a driver"] },
  // Other IPC Crimes
  Rioting: { method: ["stones were thrown at shops", "vehicles were set on fire", "a road was blocked with burning tyres", "a procession turned violent"], target: ["a market street", "a bus depot", "a community hall", "a police outpost"] },
  "Unlawful Assembly": { method: ["gathered with sticks outside the house", "blocked the highway", "assembled at the temple square shouting slogans", "surrounded the panchayat office"], target: ["a rival family", "a contractor", "a government office", "a rival group"] },
  Extortion: { method: ["demanded weekly hafta from shopkeepers", "threatened to burn the shop", "demanded money to let construction continue", "claimed protection money in a gang's name"], target: ["shopkeepers", "a builder", "a bar owner", "a transport operator"] },
  "Criminal Intimidation": { method: ["threatened over a phone call", "left a warning note", "brandished a knife", "threatened to kill the family"], target: ["a complainant in another case", "a journalist", "a neighbour", "a tenant"] },
};

const GENERIC_OFFENCE: OffenceSet = {
  method: ["used threats and force", "acted with two accomplices", "struck during a crowd", "used a pretext to gain entry"],
  target: ["a local resident", "a shopkeeper", "a commuter", "a family"],
};

function pick<T>(arr: T[], seed: string, salt: string): T {
  const h = createHash("sha256").update(`${seed}:${salt}`).digest();
  return arr[h.readUInt32BE(0) % arr.length];
}

export function moSignature(seriesKey: string, crimeGroup: string, crimeType = ""): Record<string, string> {
  const crew = CREW[crimeGroup] ?? CREW["Other IPC Crimes"];
  const offence = OFFENCE[crimeType] ?? GENERIC_OFFENCE;
  const out: Record<string, string> = {};
  for (const t of CREW_TRAITS) out[t] = pick(crew[t], seriesKey, t);
  // Offence traits are salted with the crime type so a series' Burglary and
  // Cheating cases read differently while each stays deterministic.
  for (const t of OFFENCE_TRAITS) out[t] = pick(offence[t], `${seriesKey}|${crimeType}`, t);
  return out;
}
