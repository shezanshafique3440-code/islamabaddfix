import { prisma } from '@/lib/db';
import { getAuthContext } from '@/lib/auth/session';
import { canReadFile } from '@/lib/storage/access';
import { readFileBytes } from '@/lib/storage';
import { fail, route } from '@/lib/http';
import { AppError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';

type Params = { params: Promise<{ id: string }> };

/**
 * Authorized file read.
 *
 * This is the only way private media leaves the system. The storage root is not
 * web-served, so there is no path that bypasses the check below.
 *
 * A denied read on a private file is logged: repeated failures against
 * verification documents are exactly the signal an operator wants to see.
 */
export const GET = route(async (_request, { params }: Params) => {
  const { id } = await params;

  const file = await prisma.uploadedFile.findUnique({ where: { id } });
  if (!file || file.deletedAt) {
    throw new AppError('NOT_FOUND', 'File not found.');
  }

  const ctx = await getAuthContext();
  const viewer = ctx ? { userId: ctx.user.id, role: ctx.role, providerId: ctx.providerId } : null;

  if (!(await canReadFile(file, viewer))) {
    await recordAudit({
      action: AUDIT_ACTIONS.FILE_ACCESS_DENIED,
      entity: 'UploadedFile',
      entityId: file.id,
      actorUserId: viewer?.userId ?? null,
      actorRole: viewer?.role ?? null,
      metadata: { purpose: file.purpose, visibility: file.visibility },
    });
    // 404 rather than 403: existence of someone's document is itself private.
    return fail(new AppError('NOT_FOUND', 'File not found.'));
  }

  const { body, contentType } = await readFileBytes(file);

  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(body.length),
      // Never inline-render user uploads; a crafted SVG or HTML file would run
      // in this origin. Images are still displayable via <img src>.
      'Content-Disposition': `inline; filename="${encodeURIComponent(file.originalName)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control':
        file.visibility === 'PUBLIC'
          ? 'public, max-age=86400, immutable'
          : 'private, no-store, max-age=0',
    },
  });
});
