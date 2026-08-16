import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTimeRange } from '../utils/timeFormat';

interface DayAvailability {
  schedule_id: number;
  travel_date: string;
  departure_time: string;
  arrival_time: string;
  base_price: number;
  total_seats: number;
  booked_seats_count: number;
  available_seats: number;
  booked_seat_numbers: string[];
  booking_allowed?: boolean;
}

export default function AvailabilityCalendarPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [availability, setAvailability] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState(true);

  const routeId = searchParams.get('routeId');
  const busId = searchParams.get('busId');
  const busName = searchParams.get('busName');
  const fromCity = searchParams.get('from');
  const toCity = searchParams.get('to');

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (routeId && busId) {
      fetchAvailability();
    }
  }, [routeId, busId, isAuthenticated]);

  const fetchAvailability = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/buses/availability/${routeId}/${busId}`);
      setAvailability(response.data.availability || []);
    } catch (error) {
      console.error('Failed to fetch availability:', error);
    } finally {
      setLoading(false);
    }
  };

  const getAvailabilityColor = (availableSeats: number) => {
    const percentage = (availableSeats / 40) * 100;
    if (percentage > 75) return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
    if (percentage > 50) return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400';
    if (percentage > 25) return 'bg-orange-500/10 border-orange-500/30 text-orange-400';
    if (percentage > 0) return 'bg-red-500/10 border-red-500/30 text-red-400';
    return 'bg-white/[0.02] border-white/[0.06] text-gray-500';
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    return {
      day: date.getDate(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      full: date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    };
  };

  const handleBookSeats = (scheduleId: number, travelDate?: string, bookingAllowed?: boolean) => {
    // Prevent booking for departed buses
    if (bookingAllowed === false) {
      alert('⚠️ BOOKING CLOSED\n\nThis bus has already departed. Please select a different schedule.');
      return;
    }
    
    if (travelDate) {
      const confirmed = confirm(
        `Confirm your travel date:\n\n📅 ${new Date(travelDate + 'T00:00:00').toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}\n\n🚌 ${busName}\n\nProceed to seat selection?`
      );
      if (!confirmed) return;
    }
    navigate(`/seats/${scheduleId}`);
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
      {/* Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center mb-2">
            <button
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white font-semibold flex items-center gap-2 transition"
            >
              ← Back
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
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">
              30-Day Seat Availability
            </h1>
            <p className="text-gray-400">
              {fromCity} → {toCity} • {busName}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Instruction Banner */}
        <div className="bg-accent-500/10 border border-accent-500/20 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-4">
            <span className="text-5xl">👆</span>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-accent-400 mb-3">
                Select Your Travel Date
              </h2>
              <div className="text-accent-300/80 mb-3 text-lg">
                <strong>Step 1:</strong> Choose a date from the calendar below<br/>
                <strong>Step 2:</strong> Click on the date card to proceed to seat selection
              </div>
              <div className="bg-accent-500/10 border border-accent-500/20 rounded-xl p-3 inline-block">
                <div className="text-sm font-bold text-accent-400">
                  📅 Cards are color-coded by seat availability
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="glass rounded-2xl p-6 mb-6 border border-white/[0.06]">
          <h3 className="text-sm font-bold tracking-widest uppercase text-gray-400 mb-4">
            Availability Legend
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border-2 border-emerald-500/30"></div>
              <span className="text-sm font-semibold text-gray-300">75%+ Available</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border-2 border-yellow-500/30"></div>
              <span className="text-sm font-semibold text-gray-300">50-75% Available</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-500/10 border-2 border-orange-500/30"></div>
              <span className="text-sm font-semibold text-gray-300">25-50% Available</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 border-2 border-red-500/30"></div>
              <span className="text-sm font-semibold text-gray-300">1-25% Available</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/[0.02] border-2 border-white/[0.06]"></div>
              <span className="text-sm font-semibold text-gray-300">Sold Out</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {availability.map((day) => {
            const dateInfo = formatDate(day.travel_date);
            const todayLocal = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
            const isToday = day.travel_date === todayLocal;
            const isDeparted = day.booking_allowed === false;

            return (
              <div
                key={day.schedule_id}
                className={`rounded-2xl p-4 border-2 transition-all hover:scale-105 ${
                  isDeparted ? 'opacity-50 cursor-not-allowed bg-white/[0.02] border-white/[0.06]' :
                  `cursor-pointer ${getAvailabilityColor(day.available_seats)}`
                } ${isToday ? 'ring-4 ring-accent-500' : ''}`}
                onClick={() => !isDeparted && handleBookSeats(day.schedule_id, day.travel_date, day.booking_allowed)}
              >
                {/* Date Header */}
                <div className="text-center mb-3">
                  <div className="text-xs font-bold opacity-70 uppercase">{dateInfo.weekday}</div>
                  <div className="text-3xl font-black">{dateInfo.day}</div>
                  <div className="text-xs font-bold opacity-70 uppercase">{dateInfo.month}</div>
                  {isToday && (
                    <div className="mt-1 px-2 py-1 bg-accent-600 text-white text-xs font-bold rounded-full">
                      TODAY
                    </div>
                  )}
                  {isDeparted && (
                    <div className="mt-1 px-2 py-1 bg-red-500 text-white text-xs font-bold rounded-full">
                      DEPARTED
                    </div>
                  )}
                </div>

                {/* Time */}
                <div className="text-center mb-3 pb-3 border-b-2 border-current opacity-20">
                  <div className="text-xs font-bold">
                    {formatTimeRange(day.departure_time, day.arrival_time)}
                  </div>
                </div>

                {/* Availability */}
                <div className="text-center">
                  <div className="text-2xl font-black mb-1">
                    {day.available_seats}<span className="text-sm">/40</span>
                  </div>
                  <div className="text-xs font-bold opacity-70">Seats Available</div>
                </div>

                {/* Price */}
                <div className="text-center mt-3 pt-3 border-t-2 border-current opacity-20">
                  <div className="text-lg font-black">₹{day.base_price}</div>
                </div>

                {/* Book Button */}
                {!isDeparted && day.available_seats > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleBookSeats(day.schedule_id, day.travel_date, day.booking_allowed);
                    }}
                    className="w-full mt-3 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-black py-3 rounded-xl transition shadow-lg"
                  >
                    ✓ SELECT THIS DATE
                  </button>
                )}
                {!isDeparted && day.available_seats === 0 && (
                  <div className="w-full mt-3 bg-white/[0.03] text-gray-500 font-bold py-2 rounded-xl text-center cursor-not-allowed border border-white/[0.04]">
                    Sold Out
                  </div>
                )}
                {isDeparted && (
                  <div className="w-full mt-3 bg-red-500/10 text-red-400 font-bold py-2 rounded-xl text-center border border-red-500/20">
                    🚫 Departed
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* No Availability */}
        {availability.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📅</div>
            <h3 className="text-2xl font-bold text-white mb-2">No Schedules Available</h3>
            <p className="text-gray-400">This bus has no upcoming schedules for the next 30 days.</p>
          </div>
        )}
      </div>
    </div>
  );
}
