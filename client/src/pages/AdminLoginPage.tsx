import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [expiresIn, setExpiresIn] = useState(300);

  // Handle sending OTP
  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    try {
      const response = await axios.post('/admin/send-otp', { email });
      setSuccess(response.data.message);
      setExpiresIn(response.data.expiresIn || 300);
      setStep('otp');
      
      // Start countdown
      const interval = setInterval(() => {
        setExpiresIn((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  // Handle OTP input
  const handleOTPChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return; // Only allow digits

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1); // Only take last character
    setOtp(newOtp);

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      nextInput?.focus();
    }
  };

  // Handle OTP paste
  const handleOTPPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = pastedData.split('').concat(Array(6).fill('')).slice(0, 6);
    setOtp(newOtp);
  };

  // Handle OTP verification
  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const otpCode = otp.join('');
    if (otpCode.length !== 6) {
      setError('Please enter all 6 digits');
      setLoading(false);
      return;
    }

    try {
      const response = await axios.post('/admin/verify-otp', { email, otp: otpCode });
      
      // Store token and admin info
      localStorage.setItem('adminToken', response.data.token);
      localStorage.setItem('adminUser', JSON.stringify(response.data.admin));
      
      // Redirect to admin dashboard
      navigate('/admin/dashboard');
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid OTP');
      setOtp(['', '', '', '', '', '']); // Clear OTP on error
      document.getElementById('otp-0')?.focus();
    } finally {
      setLoading(false);
    }
  };

  // Handle back to email
  const handleBackToEmail = () => {
    setStep('email');
    setOtp(['', '', '', '', '', '']);
    setError('');
    setSuccess('');
  };

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-white text-5xl font-black tracking-tighter mb-2">🔐 Admin Portal</h1>
          <p className="text-gray-400">Secure OTP Verification</p>
        </div>

        <div className="glass rounded-3xl p-8 shadow-2xl">
          {step === 'email' ? (
            <>
              <h2 className="text-2xl font-bold text-white mb-6 text-center">Admin Login</h2>
              
              <form onSubmit={handleSendOTP}>
                <div className="mb-6">
                  <label className="block text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                    ADMIN EMAIL
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-2xl border border-white/[0.08] bg-white/[0.05] focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 focus:outline-none font-semibold text-white placeholder-gray-500 transition"
                    placeholder="admin@busapp.com"
                    required
                    disabled={loading}
                  />
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-500/10 border-l-4 border-red-500 text-red-400 rounded-lg">
                    <p className="font-semibold">{error}</p>
                  </div>
                )}

                {success && (
                  <div className="mb-4 p-4 bg-emerald-500/10 border-l-4 border-emerald-500 text-emerald-400 rounded-lg">
                    <p className="font-semibold">{success}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full btn-accent py-3 rounded-2xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? 'Sending...' : 'Send Verification Code'}
                </button>
              </form>

              <div className="mt-6 text-center">
                <button
                  onClick={() => navigate('/')}
                  className="text-accent-400 hover:text-accent-300 font-semibold transition"
                >
                  ← Back to Main Site
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-white mb-2 text-center">Verify OTP</h2>
              <p className="text-gray-400 text-center mb-6">
                Enter the 6-digit code sent to<br />
                <span className="font-semibold text-accent-400">{email}</span>
              </p>

              <form onSubmit={handleVerifyOTP}>
                <div className="mb-6">
                  <div className="flex gap-2 justify-center" onPaste={handleOTPPaste}>
                    {otp.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOTPChange(index, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !digit && index > 0) {
                            const prevInput = document.getElementById(`otp-${index - 1}`);
                            prevInput?.focus();
                          }
                        }}
                        className="w-12 h-14 text-center text-2xl font-bold border border-white/[0.1] bg-white/[0.05] rounded-xl focus:border-accent-500 focus:outline-none text-white transition"
                        disabled={loading}
                      />
                    ))}
                  </div>
                </div>

                <div className="mb-4 text-center">
                  {expiresIn > 0 ? (
                    <p className="text-sm text-gray-400">
                      Code expires in: <span className="font-bold text-accent-400">{formatTime(expiresIn)}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-red-400 font-semibold">Code expired!</p>
                  )}
                </div>

                {error && (
                  <div className="mb-4 p-4 bg-red-500/10 border-l-4 border-red-500 text-red-400 rounded-lg">
                    <p className="font-semibold">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || expiresIn === 0}
                  className="w-full btn-accent py-3 rounded-2xl font-bold transition disabled:opacity-50 disabled:cursor-not-allowed mb-3"
                >
                  {loading ? 'Verifying...' : 'Verify & Login'}
                </button>

                <button
                  type="button"
                  onClick={handleBackToEmail}
                  disabled={loading}
                  className="w-full bg-white/[0.05] text-gray-300 py-3 rounded-2xl font-bold hover:bg-white/[0.1] transition disabled:opacity-50 border border-white/[0.06]"
                >
                  ← Back to Email
                </button>
              </form>

              <div className="mt-4 text-center">
                <button
                  onClick={handleBackToEmail}
                  className="text-sm text-accent-400 hover:text-accent-300 font-semibold transition"
                >
                  Didn't receive code? Try again
                </button>
              </div>
            </>
          )}
        </div>

        <div className="mt-6 text-center text-white text-sm">
          <p>🔒 Secured with OTP verification</p>
          <p className="mt-2 text-gray-500">Only authorized admin emails can access this portal</p>
        </div>
      </div>
    </div>
  );
}
