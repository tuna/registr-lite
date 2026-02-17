import { sql, serve } from "bun";

export class Configuration {
  private cache: Map<string, string> = new Map();

  async load(key: string): Promise<string | null> {
    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }
    
    const result = await sql`SELECT value FROM configuration WHERE key = ${key}`.values();
    if (result.length > 0) {
      const value = result[0][0] as string;
      this.cache.set(key, value);
      return value;
    }
    return null;
  }

  async list(): Promise<{ key: string; value: string }[]> {
    const results: [string, string][] = await sql`SELECT key, value FROM configuration`.values();
    const mapped = results.map(row => ({ key: row[0] as string, value: row[1] as string }));
    // Update cache
    for (const { key, value } of mapped) {
      this.cache.set(key, value);
    }
    return mapped;
  }

  async save(key: string, value: string): Promise<void> {
    await sql`
      INSERT INTO configuration (key, value)
      VALUES (${key}, ${value})
      ON CONFLICT(key) DO UPDATE SET value = ${value}
    `;
    this.cache.set(key, value);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

const config = new Configuration();

export default config;