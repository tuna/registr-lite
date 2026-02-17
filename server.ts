import { sql, serve } from "bun";
import { Database } from "bun:sqlite";
import index from "./index.html";
import TelegramBot from "node-telegram-bot-api";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

// FIXME: assert database is sqlite

const MASTER_TOKEN  = process.env.MASTER_TOKEN;
const BOT_TOKEN = process.env.BOT_TOKEN;
const GROUPS = (process.env.GROUPS ?? '').split(',').map(s => parseInt(s, 10));
console.log('Starting up');

// We're mostly sending, so no webhook
const bot = BOT_TOKEN ? new TelegramBot(BOT_TOKEN, { polling: true }) : null;
bot?.on('channel_post', (msg) => {
  console.log(`Telegram Channel Post: ${msg.chat.id}: ${msg.text}`);
})
bot?.on('message', (msg) => {
  console.log(`Telegram Message: ${msg.chat.id}: ${msg.text}`);
});

if (bot) {
  for (const g of GROUPS) {
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

class Configuration {
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

async function sendEmailToEntry(email: string): Promise<void> {
  // Load email configuration
  const emailContent = await config.load('email');
  if (!emailContent) {
    console.log('No email configuration found, skipping email');
    return;
  }

  // Load SMTP configuration
  const smtpServer = await config.load('smtp_server');
  const smtpUsername = await config.load('smtp_username');
  const smtpPassword = await config.load('smtp_password');
  const emailFrom = await config.load('email_from');

  if (!smtpServer || !smtpUsername || !smtpPassword || !emailFrom) {
    console.log('SMTP configuration incomplete, skipping email');
    console.log(`Missing: ${!smtpServer ? 'smtp_server ' : ''}${!smtpUsername ? 'smtp_username ' : ''}${!smtpPassword ? 'smtp_password ' : ''}${!emailFrom ? 'email_from' : ''}`);
    return;
  }

  try {
    // Create transporter with STARTTLS enforced
    const transporter: Transporter = nodemailer.createTransport({
      host: smtpServer,
      port: 587, // Standard STARTTLS port
      secure: false, // Use STARTTLS (not SSL)
      requireTLS: true, // Enforce STARTTLS
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
      },
    });

    // Send email
    const info = await transporter.sendMail({
      from: emailFrom,
      to: email,
      subject: 'Registration Confirmation',
      text: emailContent,
      html: emailContent.replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;')
                        .replace(/"/g, '&quot;')
                        .replace(/'/g, '&#39;')
                        .replace(/\n/g, '<br>'),
    });

    console.log(`Email sent to ${email}: ${info.messageId}`);

    // Mark as emailed
    await sql`UPDATE entries SET emailed = 1 WHERE email = ${email}`;
  } catch (error) {
    console.error(`Failed to send email to ${email}:`, error);
    // Don't throw - we don't want to fail the registration if email fails
  }
}

async function checkAndSendEmail(email: string): Promise<void> {
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
    await sendEmailToEntry(email);
  }
}

/* DB Migration */
type Migration = {
  version: number;
  up: () => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    up: async () => {
      console.log('Running migration 1: Create initial entries table');
      await sql`
        CREATE TABLE IF NOT EXISTS entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          nickname TEXT NOT NULL,
          dept TEXT,
          studentId TEXT,
          createdAt TEXT,
          UNIQUE(email)
        )
      `.simple();
    }
  },
  {
    version: 2,
    up: async () => {
      console.log('Running migration 2: Add emailed and archived columns to entries');
      await sql`ALTER TABLE entries ADD COLUMN emailed INTEGER DEFAULT 0`.simple();
      await sql`ALTER TABLE entries ADD COLUMN archived INTEGER DEFAULT 0`.simple();
    }
  },
  {
    version: 3,
    up: async () => {
      console.log('Running migration 3: Create configuration table');
      await sql`
        CREATE TABLE IF NOT EXISTS configuration (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        )
      `.simple();
    }
  }
];

async function runMigrations(): Promise<void> {
  // Check if _db_version table exists
  const tables = await sql`
    SELECT name FROM sqlite_master WHERE type='table' AND name='_db_version'
  `.values();

  let currentVersion = 0;

  if (tables.length === 0) {
    // Missing _db_version table = blank database
    console.log('No _db_version table found, creating...');
    await sql`
      CREATE TABLE _db_version (
        version INTEGER PRIMARY KEY
      )
    `.simple();
  } else {
    // _db_version exists, check current version
    const versionResult = await sql`SELECT MAX(version) as max_version FROM _db_version`.values();
    if (versionResult.length > 0 && versionResult[0][0] !== null) {
      currentVersion = versionResult[0][0] as number;
    }
    // Empty _db_version table = initial table already created, start from version 1
  }

  console.log(`Current database version: ${currentVersion}`);

  // Run migrations
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      await migration.up();
      await sql`INSERT INTO _db_version (version) VALUES (${migration.version})`;
      console.log(`Migration ${migration.version} completed`);
    }
  }

  console.log('All migrations complete');
}

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
          await checkAndSendEmail(payload.email);
        } catch(e) {
          console.error('Failed to send email:', e);
          // Don't fail registration if email fails
        }

        if (bot) {
          for (const g of GROUPS) {
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
      }
    }
  },
  development: process.env.ENV !== "production",
  port: parseInt(process.env.PORT ?? "3000"),
  hostname: process.env.HOST ?? "127.0.0.1",
});
