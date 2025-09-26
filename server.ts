import { sql, serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";

// FIXME: assert database is sqlite

const MASTER_TOKEN  = process.env.MASTER_TOKEN;
console.log('Starting up');

type Entry = {
  email: String,
  nickname: String,
  dept?: String,
  studentId?: String,
};

async function register(entry: Entry) {
  console.log(`REG: ${JSON.stringify(entry)}`)
  await sql`
    INSERT INTO entries (email, nickname, dept, studentId, createdAt)
    VALUES (${entry.email}, ${entry.nickname}, ${entry.dept ?? null}, ${entry.studentId ?? null}, datetime('now', 'utc'))
  `;
}

/* DB Migration */
await sql`
CREATE TABLE IF NOT EXISTS _db_version (
  version INTEGER PRIMARY KEY
)`.simple();

// Right now we don't care about versions

await sql`
CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  nickname TEXT NOT NULL,
  dept TEXT,
  studentId TEXT,
  createdAt TEXT,

  UNIQUE(email)
)`.simple();

console.log('Migration complete');

Bun.serve({
  routes: {
    "/": index,
    "/api/register": {
      POST: async (req) => {
        // Parse JSON body
        const payload: any = await req.json(); 
        if(!payload.email || !payload.nickname) {
          return new Response("Missing required fields", { status: 400 });
        }
        try {
          await register(payload as Entry);
        } catch(e) {
          console.error(e);
          return new Response("Failed to register (maybe duplicate email?)", { status: 409 });
        }
        return new Response("", { status: 204 });
      }
    },

    "/api/list": {
      GET: async (req) => {
        const auth = req.headers.get("Authorization");
        if(!auth || auth !== `Bearer ${MASTER_TOKEN}`) {
          return new Response("Mismatched Bearer token", { status: 401 });
        }

        const since = new URL(req.url).searchParams.get("since");
        let entries: Entry[];
        if(since)
          entries = await sql`SELECT * FROM entries WHERE createdAt > datetime(${since}, 'utc') ORDER BY createdAt DESC`;
        else 
          entries = await sql`SELECT * FROM entries ORDER BY createdAt DESC`;

        return Response.json(entries);
      }
    }
  },
  development: process.env.ENV !== "production",
  port: parseInt(process.env.PORT ?? "3000"),
  hostname: process.env.HOST ?? "127.0.0.1",
});
