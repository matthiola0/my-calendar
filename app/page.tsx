import Daybook from './daybook';
import { requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  return <Daybook userName={user.displayName} />;
}
