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
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,500;1,400;1,500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fafafa',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Helvetica Neue, sans-serif',
      }}>
        <div style={{ width: '100%', maxWidth: '320px', padding: '0 20px' }}>
          <h1 style={{
            fontFamily: 'EB Garamond, Georgia, serif',
            fontStyle: 'italic',
            fontSize: '28px',
            fontWeight: 400,
            textAlign: 'center',
            marginBottom: '32px',
            color: '#1a1a1a',
          }}>
            Diez Mail
          </h1>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoFocus
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                border: '1px solid #e0e0e0',
                backgroundColor: '#ffffff',
                color: '#1a1a1a',
                outline: 'none',
                boxSizing: 'border-box',
                marginBottom: '12px',
              }}
            />

            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 500,
                backgroundColor: '#1a1a1a',
                color: '#ffffff',
                border: 'none',
                cursor: loading || !password ? 'not-allowed' : 'pointer',
                opacity: loading || !password ? 0.4 : 1,
              }}
            >
              {loading ? 'Verifying...' : 'Enter'}
            </button>

            {error && (
              <p style={{
                color: '#c45a3c',
                fontSize: '13px',
                textAlign: 'center',
                marginTop: '12px',
              }}>
                {error}
              </p>
            )}
          </form>
        </div>
      </body>
    </html>
  );
}
