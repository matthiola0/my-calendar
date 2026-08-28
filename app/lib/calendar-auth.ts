import { env } from 'cloudflare:workers';
import { getCurrentUser } from './auth';

const OWNER_ID = 'owner';

export async function getAuthorizedOwnerId(request: Request) {
  const authorization = request.headers.get('authorization');
  const suppliedToken = authorization?.startsWith('Bearer ')
    ? authorization.slice(7)
    : '';

  if (
    suppliedToken &&
    env.AGENT_API_TOKEN &&
    constantTimeEqual(suppliedToken, env.AGENT_API_TOKEN)
  ) {
    return OWNER_ID;
  }

  return (await getCurrentUser(request))?.ownerId ?? null;
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}
