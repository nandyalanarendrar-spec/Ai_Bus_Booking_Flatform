import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTo12Hour } from '../utils/timeFormat';

interface Booking {
  id: number;
  pnr: string;
  from_city: string;
  to_city: string;
  travel_date: string;
  departure_time: string;
  bus_name: string;
  seat_numbers: string;
  total_price: number;
  booking_status: string;
}

export default function MyBookingsPage() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchBookings();
  }, [isAuthenticated]);

  const fetchBookings = async () => {
    try {
      const response = await api.get('/buses/my-bookings');
      setBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = (pnr: string) => {
    navigate(`/cancel-confirm/${pnr}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient">
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => navigate('/')}
              className="text-gray-400 hover:text-white font-semibold flex items-center gap-2 transition"
            >
              ← Back to Home
            </button>
            <div className="flex gap-2 items-center">
              <button
                onClick={() => { logout(); navigate('/'); }}
                className="btn-ghost px-4 py-2 text-xs text-red-400 hover:text-red-300"
              >
                Logout
              </button>
            </div>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            My Bookings
          </h1>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {bookings.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center border border-white/[0.06]">
            <div className="text-6xl mb-4">📋</div>
            <h3 className="text-2xl font-bold text-white mb-2">No bookings yet</h3>
            <p className="text-gray-500 mb-6">Start your journey by booking a bus</p>
            <button
              onClick={() => navigate('/')}
              className="btn-primary px-8 py-3"
            >
              Book Now
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <div key={booking.id} className="glass rounded-3xl p-6 border border-white/[0.06] hover:border-white/[0.1] transition-all">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-2xl font-bold tracking-tight text-white">
                        {booking.from_city} → {booking.to_city}
                      </h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                        booking.booking_status === 'confirmed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                      }`}>
                        {booking.booking_status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-gray-500 mb-2">{booking.bus_name}</p>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-400">
                      <span>📅 {booking.travel_date}</span>
                      <span>🕐 {formatTo12Hour(booking.departure_time)}</span>
                      <span>💺 {booking.seat_numbers}</span>
                    </div>
                  </div>

                  <div className="text-center md:text-right">
                    <div className="text-xs text-gray-500 mb-1">PNR</div>
                    <div className="text-xl font-bold text-white mb-2">{booking.pnr}</div>
                    <div className="text-2xl font-extrabold text-accent-400 mb-4">₹{booking.total_price}</div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => navigate(`/booking/${booking.pnr}`)}
                        className="btn-ghost px-6 py-2 text-xs"
                      >
                        View Details
                      </button>
                      {booking.booking_status === 'confirmed' && (
                        <button
                          onClick={() => handleCancel(booking.pnr)}
                          className="px-6 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold rounded-xl transition border border-red-500/20 text-xs"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
