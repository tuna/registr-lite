# registr-lite-lite

## Deployment

1. `cp .env.example .env`, edit `.env` and fill in token. Add `HOST=0.0.0.0` because bun actually does dest address validation.
2. `docker run --rm -it -v $(pwd):/app -p 3000:3000 -w /app oven/bun:1 bun /app/server.ts`

The database file is `./db.sqlite`. Don't lose it!
