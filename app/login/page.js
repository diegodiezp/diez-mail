'use client';
// 1.x rendered a second <html> inside the layout and loaded a Google font
// for this one screen. 2.0 is a normal page in the app's own type.

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
        setError(res.status === 429 ? 'Too many attempts. Try again later.' : 'Wrong password');
        setPassword('');
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-[320px]">
        <h1 className="text-center text-[28px] tracking-tight mb-1">diez <span className="text-gallery-light">mail</span></h1>
        <p className="text-center text-xs text-gallery-mid mb-8">Collectors, signals and campaigns</p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            className="input-field py-3 text-base"
          />
          <button type="submit" disabled={loading || !password} className="btn-primary w-full py-3">
            {loading ? 'Checking…' : 'Enter'}
          </button>
          {error && <p className="text-center text-sm text-gallery-danger">{error}</p>}
        </form>
      </div>
    </div>
  );
}
