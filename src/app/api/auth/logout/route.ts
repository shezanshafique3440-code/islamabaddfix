import { ok, route } from '@/lib/http';
import { logoutSession } from '@/lib/auth/service';
import { clearAuthCookies, readAuthCookies } from '@/lib/auth/cookies';

export const POST = route(async () => {
  const { refreshToken } = await readAuthCookies();
  await logoutSession(refreshToken);
  await clearAuthCookies();
  return ok({ loggedOut: true });
});
