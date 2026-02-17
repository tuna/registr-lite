import { sql } from "bun";
import index from "./frontend/index.html";
import TelegramBot from "node-telegram-bot-api";
import { runMigrations } from "./migrations";
import config from "./configuration";
import { send } from "./mail";

// FIXME: assert database is sqlite

const MASTER_TOKEN  = process.env.MASTER_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const BOT_GROUPS = (process.env.BOT_GROUPS ?? '').split(',').map(s => parseInt(s, 10));
const BOT_SERVER = process.env.BOT_SERVER;
console.log('Starting up');

// We're mostly sending, so no webhook
const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, {
  polling: true,
  baseApiUrl: BOT_SERVER,
}) : null;
bot?.on('channel_post', (msg) => {
  console.log(`Telegram Channel Post: ${msg.chat.id}: ${msg.text}`);
})
bot?.on('message', (msg) => {
  console.log(`Telegram Message: ${msg.chat.id}: ${msg.text}`);
});

if (bot) {
  for (const g of BOT_GROUPS) {
    bot.sendMessage(g, 'Bot restarted');
  }
}

type Entry = {
  email: String,
  nickname: String,
  dept?: String,
  studentId?: String,
  emailed?: number,
  archived?: number,
};

async function register(entry: Entry) {
  console.log(`REG: ${JSON.stringify(entry)}`)
  await sql`
    INSERT INTO entries (email, nickname, dept, studentId, createdAt, emailed, archived)
    VALUES (${entry.email}, ${entry.nickname}, ${entry.dept ?? null}, ${entry.studentId ?? null}, datetime('now', 'utc'), 0, 0)
  `;
}

function extractDomain(email: string): string | null {
  const emailParts = email.split('@');
  if (emailParts.length !== 2 || !emailParts[1]) {
    return null;
  }
  return emailParts[1];
}

async function mail(email: string): Promise<void> {
  await send(email);
  await sql`UPDATE entries SET emailed = 1 WHERE email = ${email}`;
}

async function automail(email: string): Promise<void> {
  const trustedDomainsStr = await config.load('trusted_domains');
  if (!trustedDomainsStr) {
    return;
  }

  const trustedDomains = trustedDomainsStr.split(',').map(d => d.trim());
  const emailDomain = extractDomain(email);
  if (!emailDomain) {
    return;
  }

  if (trustedDomains.includes(emailDomain)) {
    await mail(email);
  }
}

/* DB Migration */
await runMigrations();

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

        // Check and send email if from trusted domain
        try {
          await automail(payload.email);
        } catch(e) {
          console.error('Failed to send email:', e);
          // Don't fail registration if email fails
        }

        if (bot) {
          for (const g of BOT_GROUPS) {
            try {
              bot.sendMessage(
                g,
                `New Registration:\n<strong>${payload.nickname}</strong>\n${payload.email}` +
                (payload.dept ? `\nDepartment: ${payload.dept}` : '') +
                (payload.studentId ? `\nStudent ID: ${payload.studentId}` : ''),
                {
                  parse_mode: 'HTML'
                }
              );
            } catch(e) {
              console.error(`Failed to send to TG group ${g}:`, e);
              // Other than logging, silently ignore these errors.
            }
          }
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
    },

    "/api/config": {
      POST: async (req) => {
        const auth = req.headers.get("Authorization");
        if(!auth || auth !== `Bearer ${MASTER_TOKEN}`) {
          return new Response("Mismatched Bearer token", { status: 401 });
        }

        const payload: any = await req.json();
        if(!payload.key || !payload.value || 
           typeof payload.key !== 'string' || typeof payload.value !== 'string' ||
           payload.key.trim() === '' || payload.value.trim() === '') {
          return new Response("Missing or empty key or value", { status: 400 });
        }

        try {
          await config.save(payload.key, payload.value);
          return new Response("", { status: 204 });
        } catch(e) {
          console.error(e);
          return new Response("Failed to save configuration", { status: 500 });
        }
      },

      GET: async (req: Bun.BunRequest<'/api/config'>) => {
        const auth = req.headers.get("Authorization");
        if(!auth || auth !== `Bearer ${MASTER_TOKEN}`) {
          return new Response("Mismatched Bearer token", { status: 401 });
        }

        try {
          const configs = await config.list();
          return Response.json(configs);
        } catch(e) {
          console.error(e);
          return new Response("Failed to fetch configuration", { status: 500 });
        }
      }
    }
  },
  development: process.env.ENV !== "production",
  port: parseInt(process.env.PORT ?? "3000"),
  hostname: process.env.HOST ?? "127.0.0.1",
});
