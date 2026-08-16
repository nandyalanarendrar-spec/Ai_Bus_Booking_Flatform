import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');

  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeMsg, setChangeMsg] = useState('');
  const [changeError, setChangeError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);
        navigate('/');
      } else {
        const response = await api.post('/auth/register', { username, email, password });
        if (response.data.requiresVerification) {
          navigate(`/verify-email?email=${encodeURIComponent(email)}`);
        } else {
          if (response.data.token) {
            login(response.data.token, undefined, response.data.user);
            navigate('/');
          }
        }
      }
    } catch (err: any) {
      const errorData = err.response?.data;
      if (errorData?.requiresVerification) {
        navigate(`/verify-email?email=${encodeURIComponent(errorData.email)}`);
      } else {
        setError(errorData?.error || 'Authentication failed');
      }
    } finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    setForgotError(''); setForgotMsg('');
    if (!forgotEmail.trim()) { setForgotError('Please enter your email'); return; }
    setForgotLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail.trim() });
      setForgotMsg(res.data.message);
    } catch (err: any) {
      setForgotError(err.response?.data?.error || 'Failed to reset password');
    } finally { setForgotLoading(false); }
  };

  const handleChangePassword = async () => {
    setChangeError(''); setChangeMsg('');
    if (!currentPass || !newPass || !confirmPass) { setChangeError('All fields are required'); return; }
    if (newPass.length < 6) { setChangeError('Min 6 characters'); return; }
    if (newPass !== confirmPass) { setChangeError('Passwords do not match'); return; }
    setChangeLoading(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: currentPass, newPassword: newPass });
      setChangeMsg(res.data.message); setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: any) {
      setChangeError(err.response?.data?.error || 'Failed to change password');
    } finally { setChangeLoading(false); }
  };

  const inputClass = "w-full px-4 py-3.5 rounded-xl border border-white/[0.08] bg-white/[0.03] text-white placeholder-gray-600 focus:border-accent-500/40 focus:outline-none focus:ring-1 focus:ring-accent-500/20 font-medium transition-all";

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center px-4 relative overflow-hidden">
      {/* Decorative */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-accent-600/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[400px] h-[400px] bg-primary-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-md w-full relative z-10">
        {/* Brand */}
        <div className="text-center mb-8">
          <button onClick={() => navigate('/')} className="inline-flex items-center gap-2 group mb-4">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            </div>
            <span className="text-white text-2xl font-extrabold tracking-tight">BusGo</span>
          </button>
          <p className="text-gray-500 text-sm">AI-Powered Bus Reservations</p>
        </div>

        {/* Card */}
        <div className="glass rounded-3xl p-8 border border-white/[0.06]">
          {/* Tabs */}
          <div className="flex gap-2 mb-6 bg-white/[0.03] rounded-xl p-1">
            <button
              onClick={() => setIsLogin(true)}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                isLogin ? 'bg-gradient-to-r from-accent-600 to-accent-500 text-white shadow-lg shadow-accent-600/20' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Login
            </button>
            <button
              onClick={() => setIsLogin(false)}
              className={`flex-1 py-3 rounded-lg font-semibold text-sm transition-all duration-200 ${
                !isLogin ? 'bg-gradient-to-r from-accent-600 to-accent-500 text-white shadow-lg shadow-accent-600/20' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-gray-400 text-xs font-semibold tracking-widest uppercase mb-2">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="Enter username" required />
            </div>

            {!isLogin && (
              <div className="mb-4">
                <label className="block text-gray-400 text-xs font-semibold tracking-widest uppercase mb-2">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} placeholder="Enter email" required />
              </div>
            )}

            <div className="mb-6">
              <label className="block text-gray-400 text-xs font-semibold tracking-widest uppercase mb-2">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="Enter password" required minLength={6} />
              {!isLogin && password.length > 0 && password.length < 6 && (
                <p className="text-xs text-red-400 mt-1.5 font-medium">Password must be at least 6 characters</p>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium border border-red-500/10">{error}</div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full btn-primary py-4 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
            >
              {loading ? (isLogin ? 'Logging in...' : 'Creating account...') : (isLogin ? 'Login' : 'Create Account')}
            </button>
          </form>

          <div className="flex items-center justify-between mt-5">
            {isLogin && (
              <button
                onClick={() => { setShowForgot(true); setForgotMsg(''); setForgotError(''); setForgotEmail(''); }}
                className="text-sm text-accent-400 hover:text-accent-300 font-medium transition"
              >
                Forgot Password?
              </button>
            )}
            {isAuthenticated && (
              <button
                onClick={() => { setShowChangePass(true); setChangeMsg(''); setChangeError(''); setCurrentPass(''); setNewPass(''); setConfirmPass(''); }}
                className="text-sm text-accent-400 hover:text-accent-300 font-medium transition ml-auto"
              >
                Change Password
              </button>
            )}
          </div>

          <button onClick={() => navigate('/')} className="w-full mt-4 text-gray-500 hover:text-gray-300 font-semibold text-sm flex items-center justify-center gap-1.5 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Back to Home
          </button>
        </div>

        {!isLogin && (
          <div className="bg-white/[0.03] rounded-2xl p-4 mt-5 border border-white/[0.06] text-center">
            <p className="text-gray-400 text-sm">
              <span className="text-accent-400 font-semibold">Email Verification Required</span>
              <br />After registration, you'll receive a verification code via email.
            </p>
          </div>
        )}
      </div>

      {/* ── Forgot Password Modal ── */}
      {showForgot && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowForgot(false)}>
          <div className="bg-surface-800 rounded-3xl p-7 max-w-sm w-full shadow-2xl border border-white/[0.06] animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-1">Forgot Password</h2>
            <p className="text-gray-500 text-sm mb-5">Enter your email and we'll send a new temporary password.</p>
            <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="Enter your email" className={inputClass + ' mb-4'} />
            {forgotError && <div className="mb-3 p-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium border border-red-500/10">{forgotError}</div>}
            {forgotMsg && <div className="mb-3 p-3 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-medium border border-emerald-500/10">{forgotMsg}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowForgot(false)} className="flex-1 btn-ghost py-3 text-sm">Cancel</button>
              <button onClick={handleForgotPassword} disabled={forgotLoading} className="flex-1 btn-primary py-3 text-sm disabled:opacity-50">
                {forgotLoading ? 'Sending...' : 'Send Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {showChangePass && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowChangePass(false)}>
          <div className="bg-surface-800 rounded-3xl p-7 max-w-sm w-full shadow-2xl border border-white/[0.06] animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-1">Change Password</h2>
            <p className="text-gray-500 text-sm mb-5">Enter your current password and choose a new one.</p>
            <input type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} placeholder="Current password" className={inputClass + ' mb-3'} />
            <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New password (min 6)" className={inputClass + ' mb-3'} minLength={6} />
            <input type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Confirm new password" className={inputClass + ' mb-4'} minLength={6} />
            {changeError && <div className="mb-3 p-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium border border-red-500/10">{changeError}</div>}
            {changeMsg && <div className="mb-3 p-3 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-medium border border-emerald-500/10">{changeMsg}</div>}
            <div className="flex gap-3">
              <button onClick={() => setShowChangePass(false)} className="flex-1 btn-ghost py-3 text-sm">Cancel</button>
              <button onClick={handleChangePassword} disabled={changeLoading} className="flex-1 btn-primary py-3 text-sm disabled:opacity-50">
                {changeLoading ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
