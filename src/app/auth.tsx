import { AuthScreen } from '@/components/auth-screen';
import { router } from 'expo-router';

export default function AuthRoute() {
  return <AuthScreen onSuccess={() => router.replace('/')} />;
}
