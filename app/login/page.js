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

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-gallery-bg px-5 py-10 safe-px">
      <div className="w-full max-w-[320px]">
        <h1 className="font-serif italic text-3xl text-center text-gallery-black mb-8">
          Diez Mail
        </h1>

        <form onSubmit={handleSubmit} autoComplete="on">
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="input-field mb-3 py-3"
          />

          <button
            type="submit"
            disabled={loading || !password}
            className="btn-primary w-full justify-center py-3"
          >
            {loading ? 'Verifying...' : 'Enter'}
          </button>

          {error && (
            <p className="text-gallery-accent text-sm text-center mt-3">{error}</p>
          )}
        </form>
      </div>
    </div>
  );
}
