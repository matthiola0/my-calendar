import Daybook from './daybook';
import AuthScreen from './auth-screen';
import { getCurrentUser } from './auth';
import { isGoogleAuthConfigured } from './google-oauth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <AuthScreen googleEnabled={isGoogleAuthConfigured()} />;
  return <Daybook userName={user.displayName} authType={user.authType} />;
}
