import "server-only";
import { MongoClient, type Db } from "mongodb";
import { getEnv } from "@/lib/env/server";

/**
 * MongoDB access via the official driver. Collections and validators are created by Part 1
 * (`scripts/mongo_init.py`); the app only reads/writes documents.
 */

const globalForMongo = globalThis as unknown as { __zonefoodMongo?: Promise<MongoClient> };

function buildUri(): string {
  const env = getEnv();
  const user = encodeURIComponent(env.MONGO_INITDB_ROOT_USERNAME);
  const pass = encodeURIComponent(env.MONGO_INITDB_ROOT_PASSWORD);
  return `mongodb://${user}:${pass}@${env.MONGO_HOST}:${env.MONGO_PORT}/?authSource=admin`;
}

export function getMongoClient(): Promise<MongoClient> {
  if (!globalForMongo.__zonefoodMongo) {
    const client = new MongoClient(buildUri(), {
      appName: "zonefood-web",
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      maxPoolSize: 10,
    });
    const connecting = client.connect();
    // If the first connect fails, forget it so the next request retries instead of reusing a rejected promise.
    connecting.catch(() => {
      globalForMongo.__zonefoodMongo = undefined;
    });
    globalForMongo.__zonefoodMongo = connecting;
  }
  return globalForMongo.__zonefoodMongo;
}

export async function getMongoDb(): Promise<Db> {
  const client = await getMongoClient();
  return client.db(getEnv().MONGO_DB);
}

export async function closeMongo(): Promise<void> {
  const pending = globalForMongo.__zonefoodMongo;
  globalForMongo.__zonefoodMongo = undefined;
  if (pending) await (await pending).close();
}
