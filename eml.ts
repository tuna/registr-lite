import { simpleParser } from 'mailparser';
import { parseHeaderValue } from 'nodemailer/lib/mime-funcs';
import sanitizeHtml from 'sanitize-html';

export const MAX_EML_BYTES = 10 * 1024 * 1024;

export class EmlError extends Error {
  constructor(message: string) {
    super(`Invalid email_eml: ${message}`);
    this.name = 'EmlError';
  }
}

function decodeBase64(value: string): Buffer {
  const compact = value.replace(/[\t\r\n ]/g, '');
  const decoded = Buffer.from(compact, 'base64');
  // Buffer.from silently ignores invalid characters and truncated input.
  if (decoded.toString('base64') !== compact) {
    throw new EmlError('expected padded base64 text');
  }
  return decoded;
}

// MailParser deliberately tolerates damaged mail. Check the structure first so
// a corrupt upload cannot silently replace the configured fallback message.
function validateMime(source: string, depth = 0): void {
  if (depth > 30) throw new EmlError('MIME nesting is too deep');
  const separator = source.indexOf('\n\n');
  const headerlessPart = depth > 0 && source.startsWith('\n');
  if (separator < 0 && !headerlessPart) {
    throw new EmlError('missing the blank line between headers and body');
  }
  const headerBlock = headerlessPart ? '' : source.slice(0, separator);
  const body = source.slice(headerlessPart ? 1 : separator + 2);
  const headers = new Map<string, string>();
  for (const line of headerBlock.replace(/\n[\t ]+/g, ' ').split('\n')) {
    if (!line && headerlessPart) continue;
    const match = /^([\x21-\x39\x3b-\x7e]+):[\t ]*([^\x00-\x08\x0b-\x1f\x7f]*)$/.exec(line);
    if (!match) throw new EmlError('malformed message headers');
    const key = match[1]!.toLowerCase();
    if (headers.has(key) && ['content-type', 'content-transfer-encoding', 'mime-version'].includes(key)) {
      throw new EmlError(`duplicate ${key} header`);
    }
    headers.set(key, match[2]!);
  }
  if (depth === 0 && !['from', 'to', 'subject', 'date', 'mime-version', 'content-type'].some(key => headers.has(key))) {
    throw new EmlError('no message or MIME headers found');
  }

  const contentType = parseHeaderValue(headers.get('content-type') ?? 'text/plain');
  const type = contentType.value.toLowerCase();
  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(type)) {
    throw new EmlError('malformed Content-Type');
  }
  const encoding = (headers.get('content-transfer-encoding') ?? '7bit').trim().toLowerCase();
  if (!['7bit', '8bit', 'binary', 'base64', 'quoted-printable'].includes(encoding)) {
    throw new EmlError('unsupported Content-Transfer-Encoding');
  }
  if (encoding === 'base64') decodeBase64(body);
  if (encoding === 'quoted-printable' && /=(?![0-9a-f]{2}|\n)/i.test(body)) {
    throw new EmlError('malformed quoted-printable body');
  }

  if (type.startsWith('multipart/')) {
    const boundary = contentType.params.boundary;
    if (!boundary || /[\r\n]/.test(boundary) || ['base64', 'quoted-printable'].includes(encoding)) {
      throw new EmlError('invalid multipart boundary or encoding');
    }
    let part: string[] | null = null;
    let count = 0;
    for (const line of body.split('\n')) {
      const delimiter = line.replace(/[\t ]+$/, '');
      if (delimiter === `--${boundary}` || delimiter === `--${boundary}--`) {
        if (part !== null) {
          validateMime(part.join('\n'), depth + 1);
          count++;
        }
        if (delimiter === `--${boundary}--`) {
          if (!count) throw new EmlError('multipart message has no parts');
          return;
        }
        part = [];
      } else {
        part?.push(line);
      }
    }
    throw new EmlError('multipart message is missing its closing boundary');
  }
}

export async function parseEml(value: string) {
  if (value.length > Math.ceil(MAX_EML_BYTES / 3) * 4 + 1024 * 1024) {
    throw new EmlError('file exceeds 10 MiB');
  }
  const raw = decodeBase64(value);
  if (!raw.length) throw new EmlError('file is empty');
  if (raw.length > MAX_EML_BYTES) throw new EmlError('file exceeds 10 MiB');
  // Latin-1 preserves every byte while checking MIME syntax. Send the original
  // buffer, leaving encodings, attachments, and line endings untouched.
  validateMime(raw.toString('latin1').replace(/\r\n/g, '\n'));
  try {
    const parsed = await simpleParser(raw, { skipHtmlToText: true, skipTextToHtml: true });
    return { raw, parsed };
  } catch {
    throw new EmlError('could not parse the MIME message');
  }
}

export async function previewEml(value: string) {
  const { parsed } = await parseEml(value);
  const html = parsed.html === false ? null : sanitizeHtml(parsed.html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['style', 'class'],
      img: ['src', 'alt', 'width', 'height'],
      td: ['style', 'class', 'colspan', 'rowspan', 'align', 'valign'],
      th: ['style', 'class', 'colspan', 'rowspan', 'align', 'valign'],
    },
    allowedSchemes: ['https', 'http', 'mailto'],
    allowedSchemesByTag: { img: ['data'] },
    allowProtocolRelative: false,
  });
  return {
    subject: parsed.subject ?? '',
    from: parsed.from?.text ?? '',
    html,
    text: parsed.text ?? '',
    attachments: parsed.attachments.map(a => ({
      filename: a.filename ?? 'attachment', contentType: a.contentType, size: a.size,
    })),
  };
}
