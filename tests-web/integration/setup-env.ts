import nextEnv from "@next/env";

// Same loader Next.js uses, so tests read the project's .env exactly as the app does.
nextEnv.loadEnvConfig(process.cwd());

// All integration tests run against the disposable database created by global-setup.ts.
if (process.env.ZF_TEST_USE_WORKING_DB !== "1") {
  process.env.POSTGRES_DB = "zonefood_webtest";
  process.env.MONGO_DB = "zonefood_webtest";
}
