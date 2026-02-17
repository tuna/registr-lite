# Migration Framework Implementation

## Overview
This document describes the lightweight database migration framework implemented for registr-lite, along with new features for configuration management and automatic email sending.

## Features Implemented

### 1. Lightweight Migration Framework

The migration system supports schema upgrades only (no downgrades) and handles three scenarios:

- **Blank Database** (no `_db_version` table): Creates the version table and runs all migrations
- **Existing Database with Empty `_db_version`**: Assumes initial schema exists, runs migrations 2+
- **Database with Existing Versions**: Runs only new migrations not yet applied

#### Migration Structure
```typescript
type Migration = {
  version: number;
  up: () => Promise<void>;
};

const migrations: Migration[] = [
  { version: 1, up: async () => { /* Create entries table */ } },
  { version: 2, up: async () => { /* Add emailed, archived columns */ } },
  { version: 3, up: async () => { /* Create configuration table */ } }
];
```

#### Current Migrations

**Migration 1**: Initial entries table
- Creates `entries` table with: id, email, nickname, dept, studentId, createdAt
- Uses `CREATE TABLE IF NOT EXISTS` for safety

**Migration 2**: Add tracking columns
- Adds `emailed` INTEGER column (default 0)
- Adds `archived` INTEGER column (default 0)

**Migration 3**: Configuration table
- Creates `configuration` table with key-value string storage
- Key is PRIMARY KEY for uniqueness

### 2. Configuration Management

#### Configuration Class
```typescript
class Configuration {
  async load(key: string): Promise<string | null>
  async save(key: string, value: string): Promise<void>
  clearCache(): void
}
```

Features:
- In-memory caching for performance
- Persistent storage in SQLite
- Thread-safe for single instance use

#### Configuration Keys
- `email`: Email content to send to new registrations
- `trusted_domains`: Comma-separated list of domains for auto-emailing

### 3. Administrative API

**Endpoint**: `POST /api/config`

**Authentication**: Bearer token (MASTER_TOKEN environment variable)

**Request Body**:
```json
{
  "key": "string",
  "value": "string"
}
```

**Validation**:
- Requires Bearer token authentication
- Key and value must be non-empty strings
- Type checking ensures strings (rejects numbers, objects, arrays)

**Responses**:
- 204: Configuration saved successfully
- 400: Missing or invalid key/value
- 401: Unauthorized (missing or invalid token)
- 500: Server error

### 4. Automatic Email Functionality

When a user registers:
1. Check if their email domain is in `trusted_domains` configuration
2. If yes, send email content from `email` configuration
3. Mark `emailed = 1` in database
4. Email failure doesn't prevent registration

#### Helper Function
```typescript
function extractDomain(email: string): string | null
```
- Safely parses email domain
- Returns null for invalid emails

## Database Schema

### entries table
```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  nickname TEXT NOT NULL,
  dept TEXT,
  studentId TEXT,
  createdAt TEXT,
  emailed INTEGER DEFAULT 0,    -- Added in migration 2
  archived INTEGER DEFAULT 0,   -- Added in migration 2
  UNIQUE(email)
)
```

### configuration table
```sql
CREATE TABLE configuration (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
)
```

### _db_version table
```sql
CREATE TABLE _db_version (
  version INTEGER PRIMARY KEY
)
```

## Testing

All features have been tested:
- ✅ Migrations on blank database
- ✅ Migrations on existing database with data
- ✅ Configuration API with authentication
- ✅ Type validation for configuration values
- ✅ Email auto-send for trusted domains
- ✅ No email for non-trusted domains
- ✅ INTEGER consistency in database (0/1 for booleans)
- ✅ Security: unauthorized access rejected
- ✅ CodeQL security scan: 0 vulnerabilities

## Usage Examples

### Set Configuration
```bash
curl -X POST http://localhost:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "email", "value": "Welcome to our service!"}'

curl -X POST http://localhost:3000/api/config \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "trusted_domains", "value": "tsinghua.edu.cn,pku.edu.cn"}'
```

### Register User
```bash
curl -X POST http://localhost:3000/api/register \
  -H "Content-Type: application/json" \
  -d '{"email": "student@tsinghua.edu.cn", "nickname": "Zhang Wei", "dept": "CS"}'
```

For users with trusted domains (tsinghua.edu.cn, pku.edu.cn), an email will be sent automatically and `emailed` will be set to 1.

## Implementation Notes

- SQLite uses INTEGER for booleans (0 = false, 1 = true)
- All database operations use parameterized queries (safe from SQL injection)
- Configuration caching improves performance
- Migration version tracking uses MAX(version) for reliability
- Email sending is currently logged (TODO: implement actual SMTP)
- Registration succeeds even if email sending fails (best-effort)
