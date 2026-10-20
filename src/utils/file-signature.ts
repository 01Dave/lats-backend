/**
 * Content-based file type detection (magic bytes), deliberately free of
 * any Prisma/env dependency so it's independently unit-testable — same
 * convention as roles.ts / cors.ts / pagination.ts.
 *
 * Why this exists: the upload middleware's fileFilter only sees the
 * Content-Type header the CLIENT claims, which anyone can set to anything.
 * A text file renamed to .pdf and sent as application/pdf would otherwise
 * be accepted and stored. This looks at the actual first bytes instead.
 *
 * Limits worth knowing: this proves the file STARTS like a PDF/JPEG/PNG,
 * not that the whole file is valid or safe (a file can begin with a real
 * PDF header and still contain junk or something malicious after it).
 * It closes the "renamed text file" gap; it is not malware scanning.
 */
export type DetectedFileType = "pdf" | "jpeg" | "png";

// Declared MIME type -> the detected type it must match.
const MIME_TO_DETECTED: Record<string, DetectedFileType> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpeg",
  "image/png": "png",
};

function startsWith(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) {
    return false;
  }
  return signature.every((byte, i) => buffer[i] === byte);
}

export function detectFileType(buffer: Buffer): DetectedFileType | null {
  // "%PDF-"
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "pdf";
  }
  // 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "png";
  }
  // FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) {
    return "jpeg";
  }
  return null;
}

/**
 * True only when the file's actual bytes identify as the same type the
 * client declared. Unknown declared types never match.
 */
export function contentMatchesDeclaredType(buffer: Buffer, declaredMimeType: string): boolean {
  const expected = MIME_TO_DETECTED[declaredMimeType];
  if (!expected) {
    return false;
  }
  return detectFileType(buffer) === expected;
}
