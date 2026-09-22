import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  port: number;
  nodeEnv: string;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  fileStorageDir: string;
}

/**
 * Fails fast at boot if a required env var is missing, rather than
 * surfacing a confusing error later at first use.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env: EnvConfig = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "12h",
  // Local-disk document storage (Step 3 decision — see file-storage.ts for
  // why this sits behind an interface rather than being used directly).
  fileStorageDir: process.env.FILE_STORAGE_DIR ?? "./uploads",
};
