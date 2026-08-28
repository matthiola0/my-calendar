import { startGoogleOAuth } from '../../../lib/google-oauth';

export async function GET(request: Request) {
  return startGoogleOAuth(request);
}
