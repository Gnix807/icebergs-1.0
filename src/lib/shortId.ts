import { randomBytes } from 'crypto';

const CHARS = '23456789abcdefghijkmnpqrstuvwxyz'; // no 0/O/1/I/l for readability

export function shortId(len = 8): string {
  const bytes = randomBytes(len);
  let id = '';
  for (let i = 0; i < len; i++) {
    id += CHARS[bytes[i] % CHARS.length];
  }
  return id;
}

export function ideaId(): string {
  return 'i_' + shortId(8);
}
