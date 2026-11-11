// Integration tests must never touch the dev or production database.
export function testDatabaseUrl(): string {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error("TEST_DATABASE_URL is not set");
  const url = new URL(raw);
  // pg lets query parameters (e.g. ?database=...) override the path, so allow none.
  if (url.search) throw new Error("TEST_DATABASE_URL must not have query parameters");
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!name.endsWith("_test")) {
    throw new Error(`Refusing to run tests against "${name}": database name must end in _test`);
  }
  return raw;
}
