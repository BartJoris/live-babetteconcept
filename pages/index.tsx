// pages/index.tsx

import { useState } from 'react';
import { useRouter } from 'next/router';
import { odooLogin } from '../lib/odoo';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const uid = await odooLogin(username, password);
      if (uid) {
        localStorage.setItem('odoo_uid', uid.toString());
        localStorage.setItem('odoo_user', username);
        localStorage.setItem('odoo_pass', password);
        router.push('/dashboard');
      } else {
        setError('Ongeldige login');
      }
    } catch (err) {
      setError('Fout bij inloggen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="max-w-sm w-full bg-white p-6 rounded-2xl shadow-xl">
        <h1 className="text-2xl font-bold mb-4 text-center">Login Babette</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="text"
            placeholder="Gebruikersnaam"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2"
            required
          />
          <input
            type="password"
            placeholder="Wachtwoord"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-4 py-2"
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg"
          >
            {loading ? 'Inloggen...' : 'Inloggen'}
          </button>
        </form>
      </div>
    </div>
  );
}
