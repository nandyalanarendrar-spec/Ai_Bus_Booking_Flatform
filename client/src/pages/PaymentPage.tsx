import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

type PaymentStage = 'pin' | 'processing' | 'success' | 'failed';

interface Passenger {
  seatNumber: string;
  name: string;
  age: number;
  gender: string;
}

interface BookingData {
  scheduleId: number;
  passengers: Passenger[];
  totalPrice: number;
  busName?: string;
  busNumber?: string;
  fromCity?: string;
  toCity?: string;
  travelDate?: string;
  departureTime?: string;
}

export default function PaymentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const [stage, setStage] = useState<PaymentStage>('pin');
  const [pinValue, setPinValue] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [resultPnrs, setResultPnrs] = useState<Array<{ pnr: string; seatNumber: string; passengerName: string }>>([]);
  const [shake, setShake] = useState(false);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  const bookingData: BookingData | null = location.state?.bookingData || null;

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!bookingData) {
      navigate('/');
      return;
    }
  }, [isAuthenticated, bookingData]);

  useEffect(() => {
    // Auto-focus input
    if (stage === 'pin') {
      setTimeout(() => pinInputRef.current?.focus(), 300);
    }
  }, [stage]);

  const handlePayment = async () => {
    if (pinValue.length < 6) {
      setError('PIN must be at least 6 characters');
      return;
    }

    setStage('processing');

    try {
      // Step 1: Verify PIN (password)
      await api.post('/buses/verify-pin', { pin: pinValue });

      // Step 2: Create the bookings (one per passenger)
      const response = await api.post('/buses/book', {
        scheduleId: bookingData!.scheduleId,
        passengers: bookingData!.passengers
      });

      setResultPnrs(response.data.bookings);
      
      // Update chat messages in sessionStorage to reflect completed booking
      ['chatbot_messages', 'aiagent_messages'].forEach(key => {
        try {
          const saved = sessionStorage.getItem(key);
          if (saved) {
            const msgs = JSON.parse(saved);
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].structuredData?.status === 'pending_payment') {
                msgs[i].structuredData = {
                  status: 'booking_completed',
                  bookingGroupId: response.data.bookingGroupId,
                  bookings: response.data.bookings
                };
                const pnrList = response.data.bookings.map((b: any) => `${b.pnr} (${b.passengerName})`).join(', ');
                msgs[i].content = `✅ **Booking Confirmed!**\n\n**PNRs**: ${pnrList}\n\n**Journey:**\n• ${bookingData!.fromCity} → ${bookingData!.toCity}\n• Date: ${bookingData!.travelDate}\n• Bus: ${bookingData!.busName}\n• Passengers: ${response.data.bookings.length}\n\n**Amount Paid:** ₹${bookingData!.totalPrice}\n\n🎉 Your booking is confirmed! Each passenger has a unique PNR for individual cancellation.`;
                break;
              }
            }
            sessionStorage.setItem(key, JSON.stringify(msgs));
          }
        } catch {}
      });
      
      // Brief delay for the processing animation
      setTimeout(() => setStage('success'), 1500);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Payment failed';
      
      if (errorMsg === 'Invalid UPI PIN') {
        setAttempts(prev => prev + 1);
        setPinValue('');
        setError(attempts >= 1 ? `Wrong PIN (${attempts + 1}/3 attempts)` : 'Incorrect PIN. Try again.');
        setShake(true);
        setTimeout(() => setShake(false), 600);
        
        if (attempts >= 2) {
          setStage('failed');
          setError('Too many incorrect attempts');
          return;
        }
        
        setStage('pin');
        setTimeout(() => pinInputRef.current?.focus(), 100);
      } else {
        setStage('failed');
        setError(errorMsg);
      }
    }
  };

  if (!bookingData) return null;

  // ─── Processing Animation ───────────────────────────────────
  if (stage === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-violet-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            {/* Spinning ring */}
            <div className="absolute inset-0 rounded-full border-4 border-purple-300/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin"></div>
            {/* Center icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">💳</span>
            </div>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Processing Payment</h2>
          <p className="text-purple-200 font-medium">Authorizing ₹{bookingData.totalPrice}...</p>
          <div className="mt-6 flex justify-center gap-1">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success Screen ─────────────────────────────────────────
  if (stage === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-green-900 to-teal-950 flex items-center justify-center px-4">
        <div className="max-w-2xl w-full">
          {/* Success animation */}
          <div className="text-center mb-8">
            <div className="relative w-28 h-28 mx-auto mb-6">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
              <div className="relative w-28 h-28 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30">
                <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-black text-white mb-2">Payment Successful!</h1>
            <p className="text-green-200 font-medium text-lg">₹{bookingData.totalPrice} paid via UPI</p>
          </div>

          {/* Transaction details card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20 mb-6">
            <div className="space-y-4">
              <div className="pb-3 border-b border-white/10">
                <div className="text-green-200 text-sm font-medium mb-2">Bookings Created</div>
                <div className="space-y-2">
                  {resultPnrs.map((booking, idx) => (
                    <div key={idx} className="bg-white/5 rounded-xl p-3 flex justify-between items-center">
                      <div>
                        <div className="text-white font-bold">{booking.passengerName}</div>
                        <div className="text-green-300 text-xs">Seat {booking.seatNumber}</div>
                      </div>
                      <div className="text-green-400 font-black text-sm tracking-wider">{booking.pnr}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-green-200 text-sm font-medium">Route</span>
                <span className="text-white font-bold">{bookingData.fromCity} → {bookingData.toCity}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-green-200 text-sm font-medium">Total Passengers</span>
                <span className="text-white font-bold">{resultPnrs.length}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-200 text-sm font-medium">Amount Paid</span>
                <span className="text-white font-black text-xl">₹{bookingData.totalPrice}</span>
              </div>
            </div>
          </div>

          {/* Info box */}
          <div className="bg-green-400/10 border border-green-400/20 rounded-2xl p-4 mb-6">
            <div className="text-sm text-green-200">
              <div className="font-bold mb-1">✅ Individual PNRs Generated</div>
              <div className="text-green-300/80 text-xs">Each passenger has a unique PNR. You can cancel individual passengers independently using their PNR.</div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              onClick={() => navigate('/my-bookings')}
              className="w-full py-4 bg-white text-green-900 font-black rounded-2xl text-lg hover:bg-green-50 transition-all active:scale-95"
            >
              View All My Bookings
            </button>
            <button
              onClick={() => navigate('/')}
              className="w-full py-4 bg-white/10 text-white font-bold rounded-2xl text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Failed Screen ──────────────────────────────────────────
  if (stage === 'failed') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-950 via-rose-900 to-red-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="relative w-28 h-28 mx-auto mb-6">
            <div className="absolute inset-0 bg-red-500/20 rounded-full animate-pulse"></div>
            <div className="relative w-28 h-28 bg-gradient-to-br from-red-400 to-rose-500 rounded-full flex items-center justify-center shadow-2xl shadow-red-500/30">
              <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-black text-white mb-2">Payment Failed</h1>
          <p className="text-red-200 font-medium text-lg mb-8">{error || 'Transaction could not be completed'}</p>

          <div className="space-y-3">
            <button
              onClick={() => {
                setStage('pin');
                setPinValue('');
                setError('');
                setAttempts(0);
              }}
              className="w-full py-4 bg-white text-red-900 font-black rounded-2xl text-lg hover:bg-red-50 transition-all active:scale-95"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate(-1)}
              className="w-full py-4 bg-white/10 text-white font-bold rounded-2xl text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── PIN Entry Screen (Main) ────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-purple-900 to-violet-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate(-1)}
          className="text-white/80 hover:text-white font-bold flex items-center gap-2 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-white/60 text-sm font-medium">Secure Payment</span>
        </div>
      </div>

      {/* Payment content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {/* Amount display */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full mb-4">
            <span className="text-white/60 text-sm font-medium">Paying to</span>
            <span className="text-white font-bold text-sm">SmartBus Travel</span>
          </div>
          <div className="text-6xl font-black text-white tracking-tight mb-1">
            ₹{bookingData.totalPrice}
          </div>
          <p className="text-purple-200 font-medium">
            {bookingData.fromCity} → {bookingData.toCity} • {bookingData.passengers.length} passenger{bookingData.passengers.length > 1 ? 's' : ''}
          </p>
        </div>

        {/* Journey summary card */}
        <div className="w-full max-w-sm bg-white/8 backdrop-blur-xl rounded-2xl p-5 border border-white/10 mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-purple-500/30 rounded-xl flex items-center justify-center">
              <span className="text-xl">🚌</span>
            </div>
            <div>
              <div className="text-white font-bold text-sm">{bookingData.busName || 'Bus'}</div>
              <div className="text-purple-300 text-xs">{bookingData.busNumber || ''}</div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-purple-300 text-xs mb-1">Date</div>
              <div className="text-white font-bold text-xs">
                {bookingData.travelDate
                  ? new Date(bookingData.travelDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '—'}
              </div>
            </div>
            <div>
              <div className="text-purple-300 text-xs mb-1">Seats</div>
              <div className="text-white font-bold text-xs">{bookingData.passengers.map(p => p.seatNumber).join(', ')}</div>
            </div>
            <div>
              <div className="text-purple-300 text-xs mb-1">Passengers</div>
              <div className="text-white font-bold text-xs truncate">{bookingData.passengers.length}</div>
            </div>
          </div>
        </div>

        {/* PIN entry */}
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h2 className="text-white font-bold text-lg mb-1">Enter UPI PIN</h2>
            <p className="text-purple-300 text-sm">Enter your account password to authorize</p>
          </div>

          {/* Password input */}
          <div className={`mb-6 ${shake ? 'animate-shake' : ''}`}>
            <input
              ref={pinInputRef}
              type="password"
              value={pinValue}
              onChange={e => { setPinValue(e.target.value); setError(''); }}
              onKeyDown={e => { if (e.key === 'Enter' && pinValue.length >= 6) handlePayment(); }}
              placeholder="Enter your password"
              className={`w-full h-14 text-center text-lg font-bold rounded-xl border-2 bg-white/5 text-white outline-none transition-all placeholder-white/30
                ${pinValue ? 'border-purple-400 bg-white/10' : 'border-white/20'}
                ${error ? 'border-red-400' : ''}
                focus:border-purple-400 focus:bg-white/10 focus:ring-2 focus:ring-purple-400/30`}
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="text-center mb-4">
              <p className="text-red-400 font-bold text-sm flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </p>
            </div>
          )}

          {/* Pay button */}
          <button
            onClick={handlePayment}
            disabled={pinValue.length < 6}
            className="w-full py-4 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all active:scale-95 shadow-xl shadow-purple-500/25 disabled:shadow-none"
          >
            Pay ₹{bookingData.totalPrice}
          </button>

          {/* Security footer */}
          <div className="flex items-center justify-center gap-2 mt-6">
            <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span className="text-white/40 text-xs font-medium">Secured by SmartBus Pay</span>
          </div>
        </div>
      </div>

      {/* Custom shake animation */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 90% { transform: translateX(-4px); }
          20%, 80% { transform: translateX(4px); }
          30%, 70% { transform: translateX(-8px); }
          40%, 60% { transform: translateX(8px); }
          50% { transform: translateX(-8px); }
        }
        .animate-shake {
          animation: shake 0.6s ease-in-out;
        }
      `}</style>
    </div>
  );
}
