import { deleteAppSession } from '../../../lib/auth';

export async function POST(request: Request) {
  const cookie = await deleteAppSession(request);
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } },
  );
}
