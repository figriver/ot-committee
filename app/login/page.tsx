import { LoginForm } from './login-form';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}) {
  const sp = await searchParams;
  const notice =
    sp.error === 'not_allowed'
      ? 'That account isn’t approved for access yet. Ask an admin to invite your email.'
      : sp.error === 'link_invalid'
        ? 'That login link was invalid or has expired. Request a new one below.'
        : null;

  return (
    <div className="auth-wrap">
      <div className="auth-toggle">
        <ThemeToggle />
      </div>
      <LoginForm notice={notice} />
    </div>
  );
}
