import path from "node:path";

/** Directory for SQLite DB and other persisted files. Override with DATA_DIR. */
export function getDataDir(): string {
  return process.env.DATA_DIR
    ? path.resolve(process.env.DATA_DIR)
    : path.join(process.cwd(), "data");
}

/** SQLite database file path. Override with DATABASE_PATH or derive from DATA_DIR. */
export function getDatabasePath(): string {
  return process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(getDataDir(), "scanner.db");
}

export function getSocialNotesPath(): string {
  return path.join(getDataDir(), "social-notes.json");
}
