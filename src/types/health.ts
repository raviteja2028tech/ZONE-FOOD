/** Shapes returned by the database health checks (shared by API routes and UI). */

export interface PostgresHealth {
  status: "up" | "down";
  latencyMs: number;
  version?: string;
  database?: string;
  extensions?: { name: string; version: string }[];
  migrationsApplied?: number;
  tableCount?: number;
  error?: string;
}

export interface MongoCollectionHealth {
  name: string;
  documents: number;
}

export interface MongoHealth {
  status: "up" | "down";
  latencyMs: number;
  version?: string;
  database?: string;
  collections?: MongoCollectionHealth[];
  error?: string;
}

export interface ConfigHealth {
  status: "ok" | "invalid";
  issues: string[];
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "down";
  checkedAt: string;
  config: ConfigHealth;
  postgres: PostgresHealth;
  mongo: MongoHealth;
}
