import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegisterOpen, setIsRegisterOpen] = useState(false);
  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerCompanyName, setRegisterCompanyName] = useState('');
  const [registerCompanyEmail, setRegisterCompanyEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerAddress, setRegisterAddress] = useState('');
  const [registerFleetSize, setRegisterFleetSize] = useState('');
  const [registerGstLicenseNumber, setRegisterGstLicenseNumber] = useState('');
  const [registerBusTypes, setRegisterBusTypes] = useState('');
  const [registerDescription, setRegisterDescription] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed');
    } finally {
      setIsLoading(false);
    }
  };

  const openRegisterModal = () => {
    setRegisterCompanyEmail(email);
    setRegisterPassword(password);
    setRegisterError('');
    setRegisterSuccess('');
    setIsRegisterOpen(true);
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError('');
    setRegisterSuccess('');
    setRegisterLoading(true);

    try {
      const response = await api.post('/company/register', {
        companyName: registerCompanyName,
        companyEmail: registerCompanyEmail,
        password: registerPassword,
        phone: registerPhone,
        address: registerAddress,
        fleetSize: Number(registerFleetSize),
        companyDescription: registerDescription,
        gstLicenseNumber: registerGstLicenseNumber,
        busTypes: registerBusTypes.split(',').map((item) => item.trim()).filter(Boolean),
      });

      const successMessage = response.data?.message || 'Your registration request has been sent to the platform owner for approval.';
      setRegisterSuccess(successMessage);
      window.alert(successMessage);
      setIsRegisterOpen(false);
      setRegisterCompanyName('');
      setRegisterCompanyEmail('');
      setRegisterPassword('');
      setRegisterPhone('');
      setRegisterAddress('');
      setRegisterFleetSize('');
      setRegisterGstLicenseNumber('');
      setRegisterBusTypes('');
      setRegisterDescription('');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Registration failed';
      setRegisterError(message);
      window.alert(message);
    } finally {
      setRegisterLoading(false);
    }
  };

  const companies = [
    { name: 'Orange Travels', email: 'orange@gmail.com', color: 'bg-orange-500' },
    { name: 'VRL Travels', email: 'vrl@gmail.com', color: 'bg-blue-500' },
    { name: 'Kaveri Travels', email: 'kaveri@gmail.com', color: 'bg-green-500' },
    { name: 'RedBus Fleet', email: 'redfleet@gmail.com', color: 'bg-red-500' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500 rounded-full opacity-10 blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500 rounded-full opacity-10 blur-3xl"></div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-2xl">
            <span className="text-4xl">🚌</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Bus Operator Portal</h1>
          <p className="text-slate-400">Sign in to manage your company fleet</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-800/70 backdrop-blur-xl border border-slate-700 rounded-2xl p-8 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Company Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="company@gmail.com"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
                ⚠️ {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In →'}
            </button>

            <button
              type="button"
              onClick={openRegisterModal}
              className="w-full py-3 bg-slate-900/70 hover:bg-slate-900 border border-slate-700 text-slate-200 font-semibold rounded-xl transition-all duration-200 hover:border-cyan-400/60 hover:shadow-[0_0_30px_rgba(34,211,238,0.12)]"
            >
              Register New Company
            </button>
          </form>

          {/* Quick login hints */}
          <div className="mt-6 pt-6 border-t border-slate-700">
            <p className="text-xs text-slate-500 text-center mb-3">Quick Login (Demo Companies)</p>
            <div className="grid grid-cols-2 gap-2">
              {companies.map((c) => (
                <button
                  key={c.email}
                  type="button"
                  onClick={() => { setEmail(c.email); setPassword(c.email.split('@')[0] + '123'); }}
                  className="flex items-center gap-2 px-3 py-2 bg-slate-700/40 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs text-slate-300 hover:text-white transition-all"
                >
                  <div className={`w-2 h-2 rounded-full ${c.color}`}></div>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs mt-6">
          🔒 Secure company portal — powered by Prajwalan
        </p>
      </div>

      {isRegisterOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 backdrop-blur-md px-3 py-4 sm:items-center sm:px-6 sm:py-6">
          <div className="my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900/95 shadow-2xl shadow-cyan-950/30 sm:max-h-[min(90dvh,46rem)]">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900/95 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-white">Register New Company</h2>
                <p className="text-sm text-slate-400">Submit your company for platform owner approval</p>
              </div>
              <button
                type="button"
                onClick={() => setIsRegisterOpen(false)}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-300 transition hover:border-slate-500 hover:text-white"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleRegisterSubmit} className="grid max-h-[calc(100dvh-9rem)] flex-1 gap-4 overflow-y-auto px-5 py-5 pb-6 sm:px-6 sm:py-6 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span>Company Name</span>
                <input
                  value={registerCompanyName}
                  onChange={(e) => setRegisterCompanyName(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Company Email</span>
                <input
                  type="email"
                  value={registerCompanyEmail}
                  onChange={(e) => setRegisterCompanyEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Password</span>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={(e) => setRegisterPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Phone Number</span>
                <input
                  value={registerPhone}
                  onChange={(e) => setRegisterPhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Company Address</span>
                <input
                  value={registerAddress}
                  onChange={(e) => setRegisterAddress(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>Fleet Size</span>
                <input
                  type="number"
                  min="1"
                  value={registerFleetSize}
                  onChange={(e) => setRegisterFleetSize(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span>GST/License Number</span>
                <input
                  value={registerGstLicenseNumber}
                  onChange={(e) => setRegisterGstLicenseNumber(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Optional"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Bus Types</span>
                <input
                  value={registerBusTypes}
                  onChange={(e) => setRegisterBusTypes(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  placeholder="Sleeper, Seater, AC"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300 md:col-span-2">
                <span>Description / About Company</span>
                <textarea
                  value={registerDescription}
                  onChange={(e) => setRegisterDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none transition focus:border-cyan-400"
                  required
                />
              </label>

              {registerError && <div className="md:col-span-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{registerError}</div>}
              {registerSuccess && <div className="md:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">{registerSuccess}</div>}

              <div className="md:col-span-2 flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setIsRegisterOpen(false)}
                  className="rounded-xl border border-slate-700 px-5 py-3 text-slate-300 transition hover:border-slate-500 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerLoading}
                  className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 px-5 py-3 font-semibold text-white transition hover:shadow-lg hover:shadow-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {registerLoading ? 'Sending Request...' : 'Send Registration Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginPage;
