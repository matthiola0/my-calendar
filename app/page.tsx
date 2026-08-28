import Daybook from './daybook';
import AuthScreen from './auth-screen';
import { getCurrentUser } from './auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) return <AuthScreen />;
  return <Daybook userName={user.displayName} authType={user.authType} />;
}
