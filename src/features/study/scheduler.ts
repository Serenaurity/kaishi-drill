import {
  FSRSVersion,
  Rating as FsrsRating,
  State as FsrsState,
  fsrs,
  generatorParameters,
  type Card,
  type Grade,
  type StepUnit,
} from "ts-fsrs";
import type { Rating, ScheduleRecord } from "../../domain/models";

export interface SchedulerConfig {
  desiredRetention: number;
  maximumIntervalDays: number;
  enableFuzz: boolean;
  enableShortTerm: boolean;
  learningSteps: string[];
  relearningSteps: string[];
  parameters?: number[];
}

export interface SchedulePreview {
  dueAt: string;
  scheduledDays: number;
}

export interface ScheduleResult {
  previous: ScheduleRecord;
  next: ScheduleRecord;
  preview: SchedulePreview;
}

export interface Scheduler {
  preview(card: ScheduleRecord, reviewedAt: Date): Record<Rating, SchedulePreview>;
  answer(card: ScheduleRecord, rating: Rating, reviewedAt: Date): ScheduleResult;
}

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  desiredRetention: 0.9,
  maximumIntervalDays: 36_500,
  enableFuzz: true,
  enableShortTerm: true,
  learningSteps: ["1m", "10m"],
  relearningSteps: ["10m"],
};

const RATINGS: readonly Rating[] = ["again", "hard", "good", "easy"];
const FSRS_RATING: Record<Rating, Grade> = {
  again: FsrsRating.Again,
  hard: FsrsRating.Hard,
  good: FsrsRating.Good,
  easy: FsrsRating.Easy,
};
const FSRS_STATE: Record<ScheduleRecord["state"], FsrsState> = {
  new: FsrsState.New,
  learning: FsrsState.Learning,
  review: FsrsState.Review,
  relearning: FsrsState.Relearning,
};
const KAISHI_STATE: Record<FsrsState, ScheduleRecord["state"]> = {
  [FsrsState.New]: "new",
  [FsrsState.Learning]: "learning",
  [FsrsState.Review]: "review",
  [FsrsState.Relearning]: "relearning",
};

const VERSION_MATCH = FSRSVersion.match(/(\d+\.\d+\.\d+)/);
const SCHEDULER_VERSION = VERSION_MATCH?.[1] ?? "5.2.3";

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function sha256Hex(value: string): string {
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
    0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
    0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
    0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
    0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const bytes = [...new TextEncoder().encode(value)];
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x1_0000_0000);
  const low = bitLength >>> 0;
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((high >>> shift) & 0xff);
  for (let shift = 24; shift >= 0; shift -= 8) bytes.push((low >>> shift) & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] =
        ((bytes[start]! << 24) | (bytes[start + 1]! << 16) |
          (bytes[start + 2]! << 8) | bytes[start + 3]!) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15]!;
      const y = words[index - 2]!;
      const sigma0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const sigma1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e!, 6) ^ rotateRight(e!, 11) ^ rotateRight(e!, 25);
      const choose = (e! & f!) ^ (~e! & g!);
      const temporary1 = (h! + sum1 + choose + constants[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a!, 2) ^ rotateRight(a!, 13) ^ rotateRight(a!, 22);
      const majority = (a! & b!) ^ (a! & c!) ^ (b! & c!);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d! + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    hash[0] = (hash[0]! + a!) >>> 0;
    hash[1] = (hash[1]! + b!) >>> 0;
    hash[2] = (hash[2]! + c!) >>> 0;
    hash[3] = (hash[3]! + d!) >>> 0;
    hash[4] = (hash[4]! + e!) >>> 0;
    hash[5] = (hash[5]! + f!) >>> 0;
    hash[6] = (hash[6]! + g!) >>> 0;
    hash[7] = (hash[7]! + h!) >>> 0;
  }
  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
}

function parseSteps(values: string[], field: string): StepUnit[] {
  if (!values.every((value) => /^\d+(?:\.\d+)?[mhd]$/.test(value))) {
    throw new Error(`${field} contains an invalid learning step`);
  }
  return values as StepUnit[];
}

function createParameters(config: SchedulerConfig) {
  if (!(config.desiredRetention > 0 && config.desiredRetention <= 1)) {
    throw new Error("Desired retention must be greater than zero and at most one");
  }
  if (!Number.isInteger(config.maximumIntervalDays) || config.maximumIntervalDays < 1) {
    throw new Error("Maximum interval must be a positive whole number of days");
  }
  return generatorParameters({
    request_retention: config.desiredRetention,
    maximum_interval: config.maximumIntervalDays,
    enable_fuzz: config.enableFuzz,
    enable_short_term: config.enableShortTerm,
    learning_steps: parseSteps(config.learningSteps, "Learning steps"),
    relearning_steps: parseSteps(config.relearningSteps, "Relearning steps"),
    w: config.parameters,
  });
}

function parametersHash(config: SchedulerConfig): string {
  const parameters = createParameters(config);
  return sha256Hex(JSON.stringify({
    requestRetention: parameters.request_retention,
    maximumInterval: parameters.maximum_interval,
    enableFuzz: parameters.enable_fuzz,
    enableShortTerm: parameters.enable_short_term,
    learningSteps: [...parameters.learning_steps],
    relearningSteps: [...parameters.relearning_steps],
    weights: [...parameters.w],
  }));
}

function toFsrsCard(schedule: ScheduleRecord): Card {
  return {
    due: new Date(schedule.dueAt),
    stability: schedule.stability,
    difficulty: schedule.difficulty,
    elapsed_days: schedule.elapsedDays,
    scheduled_days: schedule.scheduledDays,
    learning_steps: 0,
    reps: schedule.reps,
    lapses: schedule.lapses,
    state: FSRS_STATE[schedule.state],
    last_review: schedule.lastReviewAt ? new Date(schedule.lastReviewAt) : undefined,
  };
}

function fromFsrsCard(
  card: Card,
  previous: ScheduleRecord,
  hash: string,
): ScheduleRecord {
  return {
    skillCardId: previous.skillCardId,
    revision: previous.revision + 1,
    state: KAISHI_STATE[card.state],
    dueAt: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewAt: card.last_review?.toISOString(),
    scheduler: "ts-fsrs",
    schedulerVersion: SCHEDULER_VERSION,
    parametersHash: hash,
    seededFromAnki: previous.seededFromAnki,
  };
}

export function createScheduler(config: SchedulerConfig): Scheduler {
  const parameters = createParameters(config);
  const hash = parametersHash(config);
  const engine = fsrs(parameters);

  function preview(card: ScheduleRecord, reviewedAt: Date): Record<Rating, SchedulePreview> {
    const result = engine.repeat(toFsrsCard(card), reviewedAt);
    return Object.fromEntries(
      RATINGS.map((rating) => {
        const next = result[FSRS_RATING[rating]].card;
        return [rating, { dueAt: next.due.toISOString(), scheduledDays: next.scheduled_days }];
      }),
    ) as Record<Rating, SchedulePreview>;
  }

  return {
    preview,
    answer(card, rating, reviewedAt) {
      const next = engine.next(toFsrsCard(card), reviewedAt, FSRS_RATING[rating]).card;
      return {
        previous: structuredClone(card),
        next: fromFsrsCard(next, card, hash),
        preview: { dueAt: next.due.toISOString(), scheduledDays: next.scheduled_days },
      };
    },
  };
}

const DEFAULT_PARAMETERS_HASH = parametersHash(DEFAULT_SCHEDULER_CONFIG);

export function createNewSchedule(skillCardId: string, now: Date): ScheduleRecord {
  return {
    skillCardId,
    revision: 0,
    state: "new",
    dueAt: now.toISOString(),
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 0,
    lapses: 0,
    scheduler: "ts-fsrs",
    schedulerVersion: SCHEDULER_VERSION,
    parametersHash: DEFAULT_PARAMETERS_HASH,
    seededFromAnki: false,
  };
}
