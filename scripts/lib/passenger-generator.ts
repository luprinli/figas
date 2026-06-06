import type { PassengerProfile } from "./types.js";
import { randomInt } from "./date-utils.js";

// ---------------------------------------------------------------------------
// Name pools — Falkland Islands–appropriate British/English names
// ---------------------------------------------------------------------------

const MALE_FIRST_NAMES = [
  "James",
  "John",
  "Robert",
  "Michael",
  "William",
  "David",
  "Richard",
  "Thomas",
  "Paul",
  "Mark",
  "Andrew",
  "Stephen",
  "Peter",
  "Simon",
  "Christopher",
  "Daniel",
  "Matthew",
  "Anthony",
  "Alan",
  "Brian",
  "Kevin",
  "Ian",
  "Graham",
  "Stuart",
  "Colin",
  "Gordon",
  "Malcolm",
  "Douglas",
  "Bruce",
  "Craig",
  "Neil",
  "Ross",
  "Scott",
  "Grant",
  "Keith",
];

const FEMALE_FIRST_NAMES = [
  "Mary",
  "Patricia",
  "Jennifer",
  "Linda",
  "Barbara",
  "Elizabeth",
  "Susan",
  "Margaret",
  "Sarah",
  "Karen",
  "Lisa",
  "Helen",
  "Sandra",
  "Donna",
  "Carol",
  "Ruth",
  "Sharon",
  "Michelle",
  "Laura",
  "Amanda",
  "Angela",
  "Diane",
  "Catherine",
  "Frances",
  "Ann",
  "Jane",
  "Alison",
  "Fiona",
  "Julie",
  "Heather",
  "Lynn",
  "Wendy",
  "Deborah",
  "Pamela",
  "Tracy",
];

const LAST_NAMES = [
  "Barton",
  "Bourdon",
  "Clement",
  "Davies",
  "Halford",
  "Hollingshead",
  "Lee",
  "McPhee",
  "Peck",
  "Phillips",
  "Pitman",
  "Pollard",
  "Rendell",
  "Roberts",
  "Stevens",
  "Summers",
  "Tait",
  "Vidal",
  "Ward",
  "White",
  "Evans",
  "Jones",
  "Williams",
  "Brown",
  "Taylor",
  "Wilson",
  "Clark",
  "Hall",
  "Thompson",
  "Morrison",
  "Anderson",
  "Campbell",
  "Murray",
  "Scott",
  "Reid",
  "Ross",
  "Young",
  "Watson",
  "Miller",
  "Smith",
];

// ---------------------------------------------------------------------------
// Passenger category definitions
// ---------------------------------------------------------------------------

interface CategoryDef {
  name: string;
  probability: number; // 0–1, must sum to 1 across all categories
  isMale: boolean | null; // true = male, false = female, null = freight only
  ageRange: [number, number];
  weightRange: [number, number];
  baggageRange: [number, number];
  freightRange: [number, number];
  specialReqChance: number; // 0–1
  specialReqText: string;
}

const CATEGORIES: CategoryDef[] = [
  {
    name: "Adult Male",
    probability: 0.3,
    isMale: true,
    ageRange: [18, 65],
    weightRange: [65, 90],
    baggageRange: [10, 23],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Adult Female",
    probability: 0.25,
    isMale: false,
    ageRange: [18, 65],
    weightRange: [50, 75],
    baggageRange: [10, 23],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Senior",
    probability: 0.1,
    isMale: null, // randomly pick
    ageRange: [65, 85],
    weightRange: [55, 80],
    baggageRange: [8, 18],
    freightRange: [0, 0],
    specialReqChance: 0.1,
    specialReqText: "requires assistance",
  },
  {
    name: "Child (5-12)",
    probability: 0.1,
    isMale: null,
    ageRange: [5, 12],
    weightRange: [18, 40],
    baggageRange: [5, 12],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Child (2-4)",
    probability: 0.08,
    isMale: null,
    ageRange: [2, 4],
    weightRange: [12, 18],
    baggageRange: [3, 8],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Infant (under 2)",
    probability: 0.05,
    isMale: null,
    ageRange: [0, 1],
    weightRange: [5, 12],
    baggageRange: [0, 5],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Heavy Baggage",
    probability: 0.07,
    isMale: null,
    ageRange: [25, 55],
    weightRange: [70, 100],
    baggageRange: [30, 50],
    freightRange: [0, 0],
    specialReqChance: 0,
    specialReqText: "",
  },
  {
    name: "Freight Only",
    probability: 0.05,
    isMale: null,
    ageRange: [0, 0],
    weightRange: [0, 0],
    baggageRange: [0, 0],
    freightRange: [20, 200],
    specialReqChance: 0,
    specialReqText: "",
  },
];

// ---------------------------------------------------------------------------
// Weighted random pick
// ---------------------------------------------------------------------------

function pickWeightedIndex(probabilities: number[]): number {
  const total = probabilities.reduce((s, p) => s + p, 0);
  let r = Math.random() * total;
  for (let i = 0; i < probabilities.length; i++) {
    r -= probabilities[i];
    if (r <= 0) return i;
  }
  return probabilities.length - 1;
}

// ---------------------------------------------------------------------------
// Date of birth from age
// ---------------------------------------------------------------------------

function dateOfBirthFromAge(ageYears: number): string {
  const now = new Date();
  const year = now.getFullYear() - ageYears;
  const month = randomInt(1, 12);
  const day = randomInt(1, 28); // safe for all months
  const y = String(year);
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Generate a single passenger
// ---------------------------------------------------------------------------

export function generatePassenger(): PassengerProfile {
  const catIdx = pickWeightedIndex(CATEGORIES.map((c) => c.probability));
  const cat = CATEGORIES[catIdx];

  // Determine gender for name selection
  let isMale: boolean;
  if (cat.isMale === true) isMale = true;
  else if (cat.isMale === false) isMale = false;
  else isMale = Math.random() < 0.5;

  // Pick name
  const firstNames = isMale ? MALE_FIRST_NAMES : FEMALE_FIRST_NAMES;
  const firstName = firstNames[randomInt(0, firstNames.length - 1)];
  const lastName = LAST_NAMES[randomInt(0, LAST_NAMES.length - 1)];

  // Age / DOB
  const age = randomInt(cat.ageRange[0], cat.ageRange[1]);
  const dateOfBirth = dateOfBirthFromAge(age);

  // Weight / baggage / freight
  const weightKg =
    cat.weightRange[0] === 0 && cat.weightRange[1] === 0
      ? 0
      : randomInt(cat.weightRange[0], cat.weightRange[1]);
  const baggageKg =
    cat.baggageRange[0] === 0 && cat.baggageRange[1] === 0
      ? 0
      : randomInt(cat.baggageRange[0], cat.baggageRange[1]);
  const freightKg =
    cat.freightRange[0] === 0 && cat.freightRange[1] === 0
      ? 0
      : randomInt(cat.freightRange[0], cat.freightRange[1]);

  // Freight description for freight-only
  const freightDescription =
    freightKg > 0 ? generateFreightDescription() : null;

  return {
    first_name: firstName,
    last_name: lastName,
    category: cat.name,
    date_of_birth: dateOfBirth,
    weight_kg: weightKg,
    baggage_kg: baggageKg,
    freight_kg: freightKg,
    freight_description: freightDescription,
  };
}

// ---------------------------------------------------------------------------
// Generate multiple passengers
// ---------------------------------------------------------------------------

export function generatePassengers(count: number): PassengerProfile[] {
  return Array.from({ length: count }, () => generatePassenger());
}

// ---------------------------------------------------------------------------
// Passenger count picker (weighted)
// ---------------------------------------------------------------------------

/**
 * Pick number of passengers per booking using weighted distribution:
 * - 1 (solo): 35%
 * - 2 (pair): 30%
 * - 3–4 (family/small group): 20%
 * - 5–8 (large group): 15%
 */
export function pickPassengerCount(): number {
  const r = Math.random();
  if (r < 0.35) return 1;
  if (r < 0.65) return 2;
  if (r < 0.85) return randomInt(3, 4);
  return randomInt(5, 8);
}

// ---------------------------------------------------------------------------
// Freight description generator
// ---------------------------------------------------------------------------

const FREIGHT_DESCRIPTIONS = [
  "Agricultural supplies",
  "Medical supplies",
  "Vehicle parts",
  "Building materials",
  "Food provisions",
  "Postal mail",
  "Electronics equipment",
  "Farming equipment",
  "Fuel containers",
  "Livestock feed",
  "Office supplies",
  "Personal effects",
  "Sporting goods",
  "Tools and hardware",
  "Water containers",
];

function generateFreightDescription(): string {
  return FREIGHT_DESCRIPTIONS[
    randomInt(0, FREIGHT_DESCRIPTIONS.length - 1)
  ];
}
