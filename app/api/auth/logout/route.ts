import { deletePasswordSession } from '../../../auth';

export async function POST(request: Request) {
  const cookie = await deletePasswordSession(request);
  return Response.json(
    { ok: true },
    { headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } },
  );
}
