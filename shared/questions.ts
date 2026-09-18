// Jev question set for Semantic Physics. Authored by lead; do not rephrase.
// All questions are asked in ONE /v1/systemone call against state = { object: "<noun as typed by user>" }.
// Jev reads literally: each instruction states one concrete condition.

export type NoulQ = { type: "noul"; instructions: string };
export type ScoreQ = { type: "score"; instructions: string; criteria: string[] };
export type ChoiceQ = { type: "choice"; instructions: string; criteria: Record<string, string> };

export const OBJECT_QUESTIONS = {
  // ---- Nouls: behavior flags (probability 0-1) ----
  floats: { type: "noul", instructions: "If this object is placed in a bathtub of water, does it float on the surface rather than sink?" },
  flammable: { type: "noul", instructions: "If this object touches an open flame for a few seconds, does it catch fire and keep burning?" },
  magnetic: { type: "noul", instructions: "Is this object pulled toward a strong permanent magnet?" },
  fragile: { type: "noul", instructions: "If this object is dropped from shoulder height onto concrete, does it break, shatter, or crack?" },
  bouncy: { type: "noul", instructions: "If this object is dropped onto a hard floor, does it visibly bounce back up?" },
  sticky: { type: "noul", instructions: "Does this object stick to surfaces it touches (tacky, adhesive, gooey)?" },
  alive: { type: "noul", instructions: "Is this object a living creature that can move on its own?" },
  melts: { type: "noul", instructions: "If this object is held next to a hot heat lamp for a minute, does it melt, soften, or turn to liquid?" },
  dissolves: { type: "noul", instructions: "If this object is left in water for a few minutes, does it dissolve or fall apart?" },
  conductive: { type: "noul", instructions: "Does electricity flow through this object easily (is it an electrical conductor)?" },
  explosive: { type: "noul", instructions: "If this object is heated in a fire, does it explode or burst?" },
  edible: { type: "noul", instructions: "Is this object something a human would normally eat or drink?" },
  liquid: { type: "noul", instructions: "Is this object a liquid at room temperature?" },
  gas: { type: "noul", instructions: "Is this object a gas or vapor at room temperature (lighter than air, rises)?" },
  lighter_than_air: { type: "noul", instructions: "Does this object float upward in air on its own, like a helium balloon or a bubble?" },

  // ---- Scores: continuous physical properties ----
  weight: {
    type: "score",
    instructions: "How heavy is a typical instance of this object?",
    criteria: [
      "Feather-light: under 50 grams (a coin, a leaf, a pencil)",
      "Light: 50 grams to 2 kilograms, lifted easily with one hand (a book, a bottle, a cat)",
      "Medium: 2 to 20 kilograms, lifted with two hands (a suitcase, a dog, a microwave)",
      "Heavy: 20 to 200 kilograms, needs two people (a fridge, a person, a piano)",
      "Massive: over 200 kilograms, needs machinery (a car, a boulder, an elephant)",
    ],
  },
  size: {
    type: "score",
    instructions: "How large is a typical instance of this object in its longest dimension?",
    criteria: [
      "Tiny: under 5 centimeters (a coin, a bee, a key)",
      "Small: 5 to 30 centimeters (a mug, a phone, a shoe)",
      "Medium: 30 centimeters to 1 meter (a chair, a dog, a guitar)",
      "Large: 1 to 3 meters (a person, a sofa, a fridge)",
      "Huge: over 3 meters (a car, a tree, a whale)",
    ],
  },
  hardness: {
    type: "score",
    instructions: "How hard and rigid is the surface of this object?",
    criteria: [
      "Very soft, squishy or fluffy (a pillow, jelly, a sponge)",
      "Soft but holds shape (rubber, leather, a ripe fruit)",
      "Firm (wood, hard plastic, bone)",
      "Hard (glass, ceramic, most metals)",
      "Extremely hard (steel, granite, diamond)",
    ],
  },
  roundness: {
    type: "score",
    instructions: "How round is the overall shape of this object?",
    criteria: [
      "Long and thin like a rod or plank (a pencil, a ladder, a snake)",
      "Boxy with flat sides and corners (a book, a brick, a fridge)",
      "Irregular or lumpy (a rock, a cat, a shoe)",
      "Round or spherical (a ball, an orange, a bubble)",
    ],
  },

  // ---- Choice: material class -> color/palette + sound ----
  material: {
    type: "choice",
    instructions: "Which material category best describes what this object is mostly made of?",
    criteria: {
      metal: "Metal such as steel, iron, aluminum, copper, gold",
      wood: "Wood, bamboo, cork, paper or cardboard",
      stone: "Stone, rock, ceramic, concrete, brick, glass",
      plastic: "Plastic, rubber, foam, synthetic fabric",
      organic: "Living or once-living matter: plants, animals, food, cloth, leather",
      liquid: "A liquid or gel",
      gas: "A gas, vapor, smoke or air",
      energy: "Fire, light, electricity, plasma, or an abstract concept with no material",
    },
  },
} as const satisfies Record<string, NoulQ | ScoreQ | ChoiceQ>;

// Pairwise interaction questions, asked when two bodies collide for the first time.
// state = { a: "<noun A>", b: "<noun B>" }. Results cached by sorted pair key.
export const INTERACTION_QUESTIONS = {
  a_eats_b: { type: "noul", instructions: "Would `a` eat, consume, or swallow `b` if they met?" },
  b_eats_a: { type: "noul", instructions: "Would `b` eat, consume, or swallow `a` if they met?" },
  a_dissolves_b: { type: "noul", instructions: "If `a` and `b` touch, does `b` dissolve, melt, or get destroyed by `a`?" },
  b_dissolves_a: { type: "noul", instructions: "If `a` and `b` touch, does `a` dissolve, melt, or get destroyed by `b`?" },
  stick_together: { type: "noul", instructions: "If `a` and `b` touch, do they stick together and stay attached?" },
  ignite: { type: "noul", instructions: "If `a` and `b` touch, does one of them set the other on fire?" },
  a_scared_of_b: { type: "noul", instructions: "Is `a` a living creature that would flee or run away from `b`?" },
  b_scared_of_a: { type: "noul", instructions: "Is `b` a living creature that would flee or run away from `a`?" },
} as const satisfies Record<string, NoulQ>;

// ---- Mapping (code owns all math) ----
// weight score w in [0,4]: mass = 0.1 * 6^w  (0.1 .. ~130)
// size score s in [0,4]: radius px = 10 + 12*s  (10 .. 58)
// hardness h in [0,4]: friction = 0.9 - 0.18*h ; shatter threshold speed = 4 + 3*h (only used if fragile>0.5)
// restitution = bouncy>0.5 ? 0.85 : 0.1 + 0.1*(bouncy)  ; sticky>0.6 -> restitution 0, friction 1, frictionStatic 10
// roundness r: <0.75 rod (rect 4:1), <1.75 box (rect 1:1 rounded), <2.5 irregular (hexagon w/ jitter), else circle
// floats>0.5 -> buoyancy force in water = mass*g*1.6 ; else sink (density irrelevant; water just adds drag 0.05)
// flammable>0.5 & touches fire -> burning state: emit particles, lose 5% mass/s, after 6s -> ash (tiny gray, mass 0.1)
// magnetic>0.5 -> force toward magnet ∝ mass / dist^2 within 300px
// alive>0.6 -> random impulses every 0.8-2s (hop), flees per interaction questions
// melts>0.5 & within heat lamp zone for 3s -> body becomes liquid blob (restitution 0, friction 0.01, color desaturated)
// dissolves>0.5 & in water 4s -> shrink to 0 and remove
// explosive>0.6 & burning -> after 2s burst: remove body, apply radial impulse to neighbors
// liquid>0.6 at spawn -> spawn as cluster of 8 tiny circles (blob) instead of one body
// gas>0.6 at spawn -> negative gravity, fades out over 8s
// Thresholds are constants in one file so they can be tuned.
