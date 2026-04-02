import path from "path";

export const VOICE_DIR = path.join(
  process.env.DATABASE_PATH ? path.dirname(process.env.DATABASE_PATH) : "data",
  "voice"
);
