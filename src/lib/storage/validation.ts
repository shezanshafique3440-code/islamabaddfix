import { AppError } from '../errors';

/**
 * Upload validation.
 *
 * Three independent checks, because any one of them alone is bypassable:
 *  1. Declared MIME type is on the allow-list for this purpose.
 *  2. File extension matches that MIME type.
 *  3. Magic bytes match the declared type — a .jpg that is really a script
 *     fails here even if the client lied in both of the above.
 */

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] as const;
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const;
export const DOCUMENT_MIME_TYPES = ['application/pdf', ...IMAGE_MIME_TYPES] as const;

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024; // 40 MB — short clips only
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

const EXTENSIONS: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic', 'heif'],
  'video/mp4': ['mp4', 'm4v'],
  'video/quicktime': ['mov'],
  'video/webm': ['webm'],
  'application/pdf': ['pdf'],
};

/** Leading-byte signatures. `offset` handles container formats like MP4/HEIC. */
const SIGNATURES: Array<{ mime: string; bytes: number[]; offset: number }> = [
  { mime: 'image/jpeg', bytes: [0xff, 0xd8, 0xff], offset: 0 },
  { mime: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 },
  { mime: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46], offset: 0 },
  // RIFF....WEBP
  { mime: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
  // ISO base media: "ftyp" at offset 4 covers MP4, MOV and HEIC.
  { mime: 'iso-bmff', bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 },
  // EBML header for WebM/Matroska.
  { mime: 'video/webm', bytes: [0x1a, 0x45, 0xdf, 0xa3], offset: 0 },
];

function matches(buffer: Buffer, signature: { bytes: number[]; offset: number }): boolean {
  if (buffer.length < signature.offset + signature.bytes.length) return false;
  return signature.bytes.every((byte, i) => buffer[signature.offset + i] === byte);
}

export interface UploadConstraints {
  allowedMimeTypes: readonly string[];
  maxBytes: number;
}

export function validateUpload(
  file: { name: string; type: string; size: number },
  buffer: Buffer,
  constraints: UploadConstraints,
): { mimeType: string } {
  if (file.size <= 0) {
    throw new AppError('VALIDATION_ERROR', 'The file is empty.');
  }
  if (file.size > constraints.maxBytes) {
    const mb = Math.round(constraints.maxBytes / (1024 * 1024));
    throw new AppError('PAYLOAD_TOO_LARGE', `A file cannot be larger than ${mb} MB.`);
  }
  if (buffer.length !== file.size) {
    throw new AppError('VALIDATION_ERROR', 'The file size does not match the size declared.');
  }

  const declared = file.type.toLowerCase().split(';')[0]!.trim();
  if (!constraints.allowedMimeTypes.includes(declared)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      `That file type is not allowed (${declared || 'unknown'}).`,
    );
  }

  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  const validExtensions = EXTENSIONS[declared] ?? [];
  if (!validExtensions.includes(extension)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      `The file extension ".${extension}" does not match that file type.`,
    );
  }

  assertMagicBytes(buffer, declared);
  return { mimeType: declared };
}

function assertMagicBytes(buffer: Buffer, declared: string): void {
  const isoBmff =
    declared === 'video/mp4' || declared === 'video/quicktime' || declared === 'image/heic';
  const expected = isoBmff ? 'iso-bmff' : declared;
  const signature = SIGNATURES.find((s) => s.mime === expected);
  // No signature on file for this type: the MIME + extension checks stand alone.
  if (!signature) return;
  if (!matches(buffer, signature)) {
    throw new AppError(
      'UNSUPPORTED_MEDIA_TYPE',
      'The file contents do not match its type. Please upload a real image or video.',
    );
  }
}

export const CONSTRAINTS = {
  image: { allowedMimeTypes: IMAGE_MIME_TYPES, maxBytes: MAX_IMAGE_BYTES },
  video: { allowedMimeTypes: VIDEO_MIME_TYPES, maxBytes: MAX_VIDEO_BYTES },
  media: {
    allowedMimeTypes: [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES],
    maxBytes: MAX_VIDEO_BYTES,
  },
  document: { allowedMimeTypes: DOCUMENT_MIME_TYPES, maxBytes: MAX_DOCUMENT_BYTES },
} as const satisfies Record<string, UploadConstraints>;
