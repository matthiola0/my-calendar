import { startGoogleOAuth } from '../../../google-oauth';

export async function GET(request: Request) {
  return startGoogleOAuth(request);
}
