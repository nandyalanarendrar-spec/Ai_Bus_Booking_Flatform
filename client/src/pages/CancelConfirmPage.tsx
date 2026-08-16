import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTo12Hour } from '../utils/timeFormat';

type CancelStage = 'confirm' | 'processing' | 'success' | 'error';

interface BookingDetails {
  pnr: string;
  from_city: string;
  to_city: string;
  bus_name: string;
  bus_number: string;
  operator: string;
  travel_date: string;
  departure_time: string;
  arrival_time: string;
  seat_numbers: string;
  passenger_name: string;
  total_price: number;
}

interface RefundDetails {
  refundAmount: number;
  refundPercentage: number;
  hoursUntilDeparture: number;
}

export default function CancelConfirmPage() {
  const { pnr } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [stage, setStage] = useState<CancelStage>('confirm');
  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [refund, setRefund] = useState<RefundDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resultRefund, setResultRefund] = useState<{ amount: number; percentage: number } | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchCancelPreview();
  }, [isAuthenticated, pnr]);

  const fetchCancelPreview = async () => {
    try {
      const response = await api.get(`/buses/cancel-preview/${pnr}`);
      setBooking(response.data.booking);
      setRefund(response.data.refund);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load booking details');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirmChecked) return;
    setStage('processing');

    try {
      const response = await api.post(`/buses/cancel/${pnr}`);
      setResultRefund({
        amount: response.data.refundAmount,
        percentage: response.data.refundPercentage,
      });

      // Update chat messages in sessionStorage to reflect completed cancellation
      ['chatbot_messages', 'aiagent_messages'].forEach(key => {
        try {
          const saved = sessionStorage.getItem(key);
          if (saved) {
            const msgs = JSON.parse(saved);
            for (let i = msgs.length - 1; i >= 0; i--) {
              if (msgs[i].structuredData?.status === 'pending_cancellation' &&
                  msgs[i].structuredData?.pendingCancellation?.pnr === pnr) {
                const pc = msgs[i].structuredData.pendingCancellation;
                msgs[i].structuredData = {
                  status: 'cancellation_completed',
                  pnr: pnr,
                };
                msgs[i].content = `❌ **Booking Cancelled**\n\n**PNR**: ${pnr}\n\n**Refund Details:**\n• Original amount: ₹${pc.totalPrice}\n• Refund (${response.data.refundPercentage}%): ₹${response.data.refundAmount}\n• Cancellation fee: ₹${pc.totalPrice - response.data.refundAmount}\n\n**Cancelled Journey:**\n• ${pc.fromCity} → ${pc.toCity}\n• Date: ${pc.travelDate}\n• Seats: ${Array.isArray(pc.seats) ? pc.seats.join(', ') : pc.seats}\n\nRefund will be processed in 3-7 business days.`;
                break;
              }
            }
            sessionStorage.setItem(key, JSON.stringify(msgs));
          }
        } catch {}
      });

      setTimeout(() => setStage('success'), 1200);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Cancellation failed');
      setStage('error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/60 font-medium">Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (error && stage !== 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Unable to Cancel</h2>
          <p className="text-red-300 font-medium mb-8">{error}</p>
          <button
            onClick={() => navigate('/my-bookings')}
            className="px-8 py-3 bg-white text-gray-900 font-black rounded-2xl hover:bg-gray-100 transition active:scale-95"
          >
            Back to My Bookings
          </button>
        </div>
      </div>
    );
  }

  // ─── Processing ─────────────────────────────────────────────
  if (stage === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-950 via-amber-900 to-orange-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 rounded-full border-4 border-amber-300/20"></div>
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-white animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-3xl">🔄</span>
            </div>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Processing Cancellation</h2>
          <p className="text-amber-200 font-medium">Please wait while we process your refund...</p>
          <div className="mt-6 flex justify-center gap-1">
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Success ────────────────────────────────────────────────
  if (stage === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-950 via-green-900 to-teal-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <div className="relative w-28 h-28 mx-auto mb-6">
              <div className="absolute inset-0 bg-green-500/20 rounded-full animate-ping"></div>
              <div className="relative w-28 h-28 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-2xl shadow-green-500/30">
                <svg className="w-14 h-14 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <h1 className="text-3xl font-black text-white mb-2">Cancellation Complete</h1>
            <p className="text-green-200 font-medium text-lg">Your booking has been cancelled</p>
          </div>

          {/* Refund details card */}
          <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-6 border border-white/20 mb-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-green-200 text-sm font-medium">PNR</span>
                <span className="text-white font-black">{pnr}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-green-200 text-sm font-medium">Original Amount</span>
                <span className="text-white/60 font-bold line-through">₹{booking?.total_price}</span>
              </div>
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-green-200 text-sm font-medium">Refund Rate</span>
                <span className="text-white font-bold">{resultRefund?.percentage}%</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-200 text-sm font-medium">Refund Amount</span>
                <span className="text-white font-black text-2xl">₹{resultRefund?.amount}</span>
              </div>
            </div>
          </div>

          <div className="bg-green-500/10 backdrop-blur-sm rounded-2xl p-4 border border-green-500/20 mb-6">
            <p className="text-green-200 text-sm text-center font-medium">
              💰 Refund of ₹{resultRefund?.amount} will be credited to your account within 3-5 business days
            </p>
          </div>

          <button
            onClick={() => navigate('/my-bookings')}
            className="w-full py-4 bg-white text-green-900 font-black rounded-2xl text-lg hover:bg-green-50 transition-all active:scale-95"
          >
            Back to My Bookings
          </button>
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────
  if (stage === 'error') {
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
          <h1 className="text-3xl font-black text-white mb-2">Cancellation Failed</h1>
          <p className="text-red-200 font-medium text-lg mb-8">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setStage('confirm');
                setError('');
              }}
              className="w-full py-4 bg-white text-red-900 font-black rounded-2xl text-lg hover:bg-red-50 transition-all active:scale-95"
            >
              Try Again
            </button>
            <button
              onClick={() => navigate('/my-bookings')}
              className="w-full py-4 bg-white/10 text-white font-bold rounded-2xl text-lg hover:bg-white/20 transition-all border border-white/20"
            >
              Back to My Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Confirm Screen (Main) ─────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-gray-900 to-slate-900 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate('/my-bookings')}
          className="text-white/80 hover:text-white font-bold flex items-center gap-2 transition"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <span className="text-white/60 text-sm font-medium">Cancel Booking</span>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-12">
        {/* Warning icon */}
        <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-amber-500/20">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
        </div>

        <h1 className="text-2xl font-black text-white mb-1 text-center">Cancel Booking?</h1>
        <p className="text-white/50 text-sm text-center mb-8">This action cannot be undone</p>

        {/* Booking details card */}
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 overflow-hidden mb-6">
          {/* Journey header */}
          <div className="bg-white/5 px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-white font-black text-lg">{booking?.from_city} → {booking?.to_city}</div>
                <div className="text-white/50 text-sm font-medium">{booking?.bus_name} • {booking?.bus_number}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-white/40 font-medium">PNR</div>
                <div className="text-white font-black">{booking?.pnr}</div>
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="px-6 py-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">📅 Travel Date</span>
              <span className="text-white font-bold text-sm">
                {booking?.travel_date
                  ? new Date(booking.travel_date).toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : '—'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">🕐 Departure</span>
              <span className="text-white font-bold text-sm">{formatTo12Hour(booking?.departure_time || '')}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">👤 Passenger</span>
              <span className="text-white font-bold text-sm">{booking?.passenger_name}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/50 text-sm">💺 Seats</span>
              <span className="text-white font-bold text-sm">{booking?.seat_numbers.split(',').join(', ')}</span>
            </div>
          </div>
        </div>

        {/* Refund breakdown card */}
        <div className="w-full max-w-md bg-white/5 backdrop-blur-xl rounded-3xl border border-white/10 p-6 mb-6">
          <div className="text-xs font-bold tracking-widest uppercase text-white/40 mb-4">
            Refund Breakdown
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Booking Amount</span>
              <span className="text-white font-bold">₹{booking?.total_price}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Hours Until Departure</span>
              <span className="text-amber-400 font-bold">{refund?.hoursUntilDeparture}h</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-white/60 text-sm">Refund Rate</span>
              <span className={`font-bold ${refund && refund.refundPercentage >= 75 ? 'text-green-400' : refund && refund.refundPercentage >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                {refund?.refundPercentage}%
              </span>
            </div>
            <div className="pt-3 border-t border-white/10 flex justify-between items-center">
              <span className="text-white font-bold">Refund Amount</span>
              <span className="text-green-400 font-black text-2xl">₹{refund?.refundAmount}</span>
            </div>
            {refund && refund.refundPercentage < 100 && (
              <div className="text-xs text-amber-300/70 font-medium text-center pt-1">
                Deduction of ₹{(booking?.total_price || 0) - refund.refundAmount} ({100 - refund.refundPercentage}%) as per cancellation policy
              </div>
            )}
          </div>
        </div>

        {/* Confirmation checkbox */}
        <div className="w-full max-w-md mb-6">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative mt-0.5">
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={e => setConfirmChecked(e.target.checked)}
                className="sr-only"
              />
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all
                ${confirmChecked
                  ? 'bg-red-500 border-red-500'
                  : 'border-white/30 group-hover:border-white/50'}`}
              >
                {confirmChecked && (
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
            <span className="text-white/60 text-sm font-medium leading-tight">
              I understand that this cancellation is irreversible and I will receive a refund of{' '}
              <span className="text-green-400 font-bold">₹{refund?.refundAmount}</span> ({refund?.refundPercentage}%)
            </span>
          </label>
        </div>

        {/* Action buttons */}
        <div className="w-full max-w-md space-y-3">
          <button
            onClick={handleCancel}
            disabled={!confirmChecked}
            className="w-full py-4 bg-gradient-to-r from-red-500 to-rose-500 hover:from-red-400 hover:to-rose-400 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed text-white font-black text-lg rounded-2xl transition-all active:scale-95 shadow-xl shadow-red-500/20 disabled:shadow-none"
          >
            Confirm Cancellation
          </button>
          <button
            onClick={() => navigate('/my-bookings')}
            className="w-full py-4 bg-white/5 text-white/80 font-bold rounded-2xl text-lg hover:bg-white/10 transition-all border border-white/10"
          >
            Keep My Booking
          </button>
        </div>
      </div>
    </div>
  );
}
