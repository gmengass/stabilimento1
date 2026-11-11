import { testDatabaseUrl } from "./integration/test-database";

// Anything that reads DATABASE_URL (e.g. getDb()) must hit the test database or nothing.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = testDatabaseUrl();
} else {
  delete process.env.DATABASE_URL;
}
