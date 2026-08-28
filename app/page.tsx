import AuthScreen from './components/auth-screen';
import Daybook from './components/daybook';
import { getCurrentUser } from './lib/auth';
import { isGoogleAuthConfigured } from './lib/google-oauth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <AuthScreen googleEnabled={isGoogleAuthConfigured()} />;
  return <Daybook userName={user.displayName} />;
}
