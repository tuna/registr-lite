# registr-lite-lite

## Deployment

1. `cp .env.example .env`, edit `.env` and fill in token. Add `HOST=0.0.0.0` because bun actually does dest address validation.
2. `docker run --rm -it -v $(pwd):/app -p 3000:3000 -w /app oven/bun:1 bun /app/server.ts`

The database file is `./db.sqlite`. Don't lose it!

## Email templates

The Bun backend stores configuration in SQLite's `configuration` table and sends
mail with Nodemailer. The Preact admin page manages these values through
`/api/config`; both automatic and manual notifications use `mail.ts`.

In admin settings, upload an `.eml` file, inspect its preview, then click **Save
EML**. **Remove EML / use text** restores the existing text / Markdown email.
Uploads are limited to 10 MiB, including attachments.

The `email_eml` config key holds the complete file as padded base64 text. No
database migration is needed. The existing authenticated config API accepts
`{"key":"email_eml","value":"<base64>"}`; use `"value":""` to disable it.

- A valid, nonempty `email_eml` takes precedence over `email` and `email_title`.
- An absent key or exactly empty value uses the existing `email_title` and
  `email` message (plain text plus Markdown-rendered HTML).
- Invalid base64, malformed headers, or broken MIME structure produce an error;
  they never trigger fallback. Invalid uploads are rejected before saving.
  A failed notification does not undo registration or mark it as emailed.

The EML is sent as a complete message, including its **Subject**, visible
**From**, **To**, **Cc**, and any other headers. Prepare these headers for reuse;
existing recipients, dates, message IDs, and signatures are preserved. The
configured `email_from` controls the SMTP envelope sender, and the selected
registrant is the only SMTP delivery recipient. `email_title` is ignored in EML
mode. SMTP connection and authentication settings are still required.

[Nodemailer supports raw EML buffers with an explicit SMTP envelope](https://nodemailer.com/message/custom-source).
[MailParser](https://nodemailer.com/extras/mailparser) decodes MIME, charsets,
attachments, and embedded images for the authenticated `/api/mail/preview`
endpoint. Structural validation supplements MailParser's permissive parsing.
The preview uses sanitized HTML inside a sandboxed iframe; embedded images work,
but external images, scripts, and document stylesheets are blocked or removed.
It is an approximation of how an email client will render the message.

Run `bun test` and `bunx tsc --noEmit` to check the implementation. Tests use a
local buffer transport and a temporary SQLite database; they send no email.
