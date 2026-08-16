import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');
  
  const email = searchParams.get('email') || '';

  useEffect(() => {
    if (!email) {
      navigate('/login');
    }
  }, [email, navigate]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (otp.length !== 6) {
      setError('OTP must be 6 digits');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/auth/verify-email', { email, otp });
      
      // Login user automatically after verification
      login(response.data.token, undefined, response.data.user);
      
      // Show success and redirect
      setMessage('Email verified successfully! Redirecting...');
      setTimeout(() => {
        navigate('/');
      }, 1500);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setError('');
    setMessage('');

    try {
      setResending(true);
      await api.post('/auth/resend-otp', { email });
      setMessage('OTP sent! Check your email.');
      setOtp('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resend OTP');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">📧</div>
          <h1 className="text-4xl font-black text-white mb-2">
            Verify Your Email
          </h1>
          <p className="text-gray-400">
            We've sent a 6-digit verification code to
          </p>
          <p className="text-lg font-bold text-accent-400 mt-1">
            {email}
          </p>
        </div>

        {/* Verification Form */}
        <div className="glass rounded-3xl p-8 border border-white/[0.08]">
          <form onSubmit={handleVerify} className="space-y-6">
            {/* OTP Input */}
            <div>
              <label className="block text-sm font-bold text-gray-400 mb-2">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(value);
                  setError('');
                }}
                placeholder="000000"
                maxLength={6}
                className="w-full px-6 py-4 text-center text-3xl font-black tracking-widest border border-white/[0.1] bg-white/[0.05] rounded-2xl focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 transition text-white placeholder-gray-500"
                disabled={loading}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <p className="text-red-400 font-semibold text-sm">⚠️ {error}</p>
              </div>
            )}

            {/* Success Message */}
            {message && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
                <p className="text-emerald-400 font-semibold text-sm">✓ {message}</p>
              </div>
            )}

            {/* Verify Button */}
            <button
              type="submit"
              disabled={loading || otp.length !== 6}
              className="w-full btn-accent font-black py-4 rounded-2xl transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '🔄 Verifying...' : '✓ Verify Email'}
            </button>
          </form>

          {/* Resend OTP */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-400 mb-3">
              Didn't receive the code?
            </p>
            <button
              onClick={handleResendOTP}
              disabled={resending}
              className="text-accent-400 hover:text-accent-300 font-bold text-sm transition disabled:opacity-50"
            >
              {resending ? '📤 Sending...' : '📧 Resend OTP'}
            </button>
          </div>

          {/* Info & Backup Notice */}
          <div className="mt-6 bg-accent-500/10 border border-accent-500/20 rounded-xl p-4">
            <p className="text-xs text-accent-300">
              <strong>Note:</strong> The verification code expires in 5 minutes. 
              If you don't see the email, check your spam/junk folder or click <strong>Resend OTP</strong>.
            </p>
          </div>

          {/* Back to Login */}
          <div className="mt-6 text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-gray-400 hover:text-white font-semibold text-sm transition"
            >
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
