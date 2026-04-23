'use client';
import { Suspense, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@partnerradar/ui';
import { tenant } from '@partnerradar/config';

// Next 15 requires hooks that read the URL (useSearchParams, usePathname
// as a router event listener, etc.) to be wrapped in a Suspense boundary
// so prerender can bail out cleanly. The form itself is the part that
// needs Suspense — the static wrapper can prerender fine.
export default function LoginPage() {
  const t = tenant();
  return (
    <main className="flex min-h-screen items-center justify-center bg-nav-bg p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="text-2xl font-semibold text-white">{t.brandName}</div>
          <div className="mt-1 text-xs text-nav-muted">Prospecting CRM</div>
        </div>
        <Suspense fallback={<LoginCardSkeleton />}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-nav-muted">
          © {new Date().getFullYear()} {t.legalName}
        </p>
      </div>
    </main>
  );
}

function LoginCardSkeleton() {
  return (
    <Card className="bg-white">
      <div className="h-[260px] animate-pulse" />
    </Card>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (!res?.ok) {
      setError('Invalid email or password.');
      return;
    }
    router.push(params.get('from') ?? '/radar');
  }

  return (
    <Card className="bg-white">
      <h1 className="mb-4 text-lg font-semibold text-gray-900">Sign in</h1>
      <form onSubmit={submit} className="space-y-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Email</span>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </label>
        {error && <div className="text-xs text-danger">{error}</div>}
        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>
      <div className="mt-4 text-xs text-gray-500">
        <div className="mb-1 font-medium text-gray-600">Demo logins</div>
        <ul className="space-y-0.5">
          <li>
            <code>admin@demo.com</code> · Admin
          </li>
          <li>
            <code>manager@demo.com</code> · Manager
          </li>
          <li>
            <code>rep@demo.com</code> · Rep
          </li>
          <li>
            password: <code>Demo1234!</code>
          </li>
        </ul>
      </div>
    </Card>
  );
}
