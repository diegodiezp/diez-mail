'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        window.location.href = '/';
      } else {
        setError('Wrong password');
        setPassword('');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  // Heights subtract the root layout's own vertical padding (py-6 / sm:py-8)
  // so the form centres without pushing the page into a scroll.
  return (
    <div className="flex items-center justify-center min-h-[calc(100svh-3rem)] sm:min-h-[calc(100svh-4rem)]">
      <div className="w-full max-w-[320px]">
        <h1 className="font-serif italic text-3xl text-center mb-8">Diez Mail</h1>

        <form onSubmit={handleSubmit}>
          {/* text-base keeps the font at 16px: below that, iOS Safari zooms the
              page in on focus and the viewport never zooms back out. */}
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="input-field text-base mb-3"
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full justify-center"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>

          {error && (
            <p className="text-sm text-center text-gallery-accent mt-3">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
