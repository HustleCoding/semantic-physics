export type NoulAnswer = {
  type: "noul";
  noul: number;
};

export type ScoreAnswer = {
  type: "score";
  score: number;
  confidence?: number;
  legend?: Record<string, string>;
  probabilities?: Record<string, number>;
};

export type ChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export type Answer = NoulAnswer | ScoreAnswer | ChoiceAnswer;
export type AnswerMap = Record<string, Answer>;

export type JudgeResponse = {
  object: string;
  answers: AnswerMap;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  latencyMs: number;
  cached?: boolean;
  mock?: boolean;
};

export type InteractionResponse = {
  a: string;
  b: string;
  answers: AnswerMap;
  usage?: { input_tokens?: number; output_tokens?: number };
  model?: string;
  latencyMs: number;
  cached?: boolean;
  mock?: boolean;
};

export type PhysicsMaterial =
  | "metal"
  | "wood"
  | "stone"
  | "plastic"
  | "organic"
  | "liquid"
  | "gas"
  | "energy";

export type PhysicsObject = {
  id: string;
  noun: string;
  body: Matter.Body;
  answers: AnswerMap;
  material: PhysicsMaterial;
  state: {
    burning: boolean;
    burned: boolean;
    burnTime: number;
    inWaterTime: number;
    inHeatTime: number;
    gasTime: number;
    melted: boolean;
    dead: boolean;
    spawnedAt: number;
    nextHop: number;
    interactionKeys: Set<string>;
  };
  baseMass: number;
  color: string;
  clusterId?: string;
};
