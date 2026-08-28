import { finishGoogleOAuth } from '../../../../google-oauth';

export async function GET(request: Request) {
  return finishGoogleOAuth(request);
}
