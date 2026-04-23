'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@partnerradar/ui';
import { tenant } from '@partnerradar/config';

export default function LoginPage() {
  const t = tenant();
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
    <main className="min-h-screen bg-nav-bg flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-2xl font-semibold text-white">{t.brandName}</div>
          <div className="text-xs text-nav-muted mt-1">Prospecting CRM</div>
        </div>
        <Card className="bg-white">
          <h1 className="text-lg font-semibold text-gray-900 mb-4">Sign in</h1>
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
            <div className="font-medium text-gray-600 mb-1">Demo logins</div>
            <ul className="space-y-0.5">
              <li><code>admin@demo.com</code> · Admin</li>
              <li><code>manager@demo.com</code> · Manager</li>
              <li><code>rep@demo.com</code> · Rep</li>
              <li>password: <code>Demo1234!</code></li>
            </ul>
          </div>
        </Card>
        <p className="text-center text-xs text-nav-muted mt-6">
          © {new Date().getFullYear()} {t.legalName}
        </p>
      </div>
    </main>
  );
}
