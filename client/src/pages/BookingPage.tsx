import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';import { formatTo12Hour, formatTimeRange } from '../utils/timeFormat';
export default function BookingPage() {
  const { pnr } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout } = useAuth();
  const [booking, setBooking] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // For new booking
  const scheduleId = searchParams.get('scheduleId');
  const seats = searchParams.get('seats')?.split(',') || [];
  
  // State for each passenger (one per seat)
  const [passengers, setPassengers] = useState<Array<{
    seatNumber: string;
    name: string;
    age: string;
    gender: string;
  }>>(seats.map(seat => ({
    seatNumber: seat,
    name: '',
    age: '',
    gender: ''
  })));
  
  const [scheduleDetails, setScheduleDetails] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (pnr && pnr !== 'new') {
      fetchBooking();
    } else if (scheduleId) {
      fetchScheduleDetails();
    } else {
      setLoading(false);
    }
  }, [pnr, isAuthenticated, scheduleId]);

  const fetchBooking = async () => {
    try {
      const response = await api.get(`/buses/booking/${pnr}`);
      setBooking(response.data.booking);
    } catch (error) {
      console.error('Failed to fetch booking:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchScheduleDetails = async () => {
    try {
      const response = await api.get(`/buses/seats/${scheduleId}`);
      setScheduleDetails(response.data.schedule);
    } catch (error) {
      console.error('Failed to fetch schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePassenger = (index: number, field: string, value: string) => {
    const updated = [...passengers];
    updated[index] = { ...updated[index], [field]: value };
    setPassengers(updated);
  };

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate schedule details loaded
    if (!scheduleDetails) {
      alert('Unable to verify travel date. Please try again.');
      return;
    }

    // Validate all passengers have names (age and gender mandatory for manual booking)
    for (let i = 0; i < passengers.length; i++) {
      if (!passengers[i].name || !passengers[i].age || !passengers[i].gender) {
        alert(`Please fill in all details for passenger ${i + 1} (Seat ${passengers[i].seatNumber})`);
        return;
      }
    }

    // Navigate to payment page with booking data
    navigate('/payment', {
      state: {
        bookingData: {
          scheduleId: Number(scheduleId),
          passengers: passengers.map(p => ({
            seatNumber: p.seatNumber,
            name: p.name,
            age: Number(p.age),
            gender: p.gender
          })),
          totalPrice: scheduleDetails.base_price * seats.length,
          busName: scheduleDetails.bus_name,
          busNumber: scheduleDetails.bus_number,
          fromCity: scheduleDetails.from_city,
          toCity: scheduleDetails.to_city,
          travelDate: scheduleDetails.travel_date,
          departureTime: scheduleDetails.departure_time,
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // New booking form
  if (pnr === 'new') {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-6">
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

          <div className="glass rounded-3xl p-8 border border-white/[0.06]">
            <h1 className="text-3xl font-extrabold tracking-tight text-white mb-6">
              Complete Your Booking
            </h1>

            {!scheduleDetails && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 mb-6">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">⚠️</span>
                  <div>
                    <div className="font-bold text-amber-400 mb-1">Warning: Travel Date Not Loaded</div>
                    <div className="text-sm text-amber-400/70">
                      Unable to load travel date. Please go back and select a bus again.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {scheduleDetails && (
              <div className="bg-accent-500/10 rounded-2xl p-6 mb-6 border border-accent-500/20">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-2xl">✅</span>
                  <div className="text-xs font-bold tracking-widest uppercase text-gray-400">
                    CONFIRM YOUR JOURNEY DETAILS
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Travel Date</div>
                    <div className="text-2xl font-extrabold text-accent-400">
                      {new Date(scheduleDetails.travel_date).toLocaleDateString('en-US', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-gray-400 mb-1">Departure Time</div>
                    <div className="text-2xl font-extrabold text-white">
                      {formatTo12Hour(scheduleDetails.departure_time)}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-accent-500/20">
                  <div className="text-xs font-bold text-accent-400/80 flex items-center gap-2">
                    <span>💡</span>
                    <span>Please verify the travel date above before proceeding</span>
                  </div>
                </div>
              </div>
            )}

            <form onSubmit={handleBooking}>
              <h2 className="text-lg font-bold text-white mb-4">Passenger Information</h2>
              <div className="text-sm text-gray-400 mb-6">
                Please provide details for each passenger. All fields are mandatory.
              </div>

              {passengers.map((passenger, index) => {
                const num = parseInt(passenger.seatNumber.replace(/\D/g, ''));
                const posInGroup = ((num - 1) % 4) + 1;
                const seatType  = (posInGroup === 1 || posInGroup === 4) ? 'Window' : 'Aisle';

                return (
                  <div key={passenger.seatNumber} className="mb-6 pb-6 border-b border-white/[0.06] last:border-b-0">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="bg-accent-600 text-white px-3 py-1 rounded-lg font-bold text-sm">
                        Seat {passenger.seatNumber} <span className="text-white/70 text-xs">({seatType})</span>
                      </div>
                      <div className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                        Passenger {index + 1}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                          FULL NAME *
                        </label>
                        <input
                          type="text"
                          value={passenger.name}
                          onChange={(e) => updatePassenger(index, 'name', e.target.value)}
                          className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-accent-500 focus:outline-none font-semibold text-white placeholder-gray-500"
                          placeholder="Enter full name"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                            AGE *
                          </label>
                          <input
                            type="number"
                            value={passenger.age}
                            onChange={(e) => updatePassenger(index, 'age', e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-accent-500 focus:outline-none font-semibold text-white"
                            placeholder="Age"
                            required
                            min="1"
                            max="120"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                            GENDER *
                          </label>
                          <select
                            value={passenger.gender}
                            onChange={(e) => updatePassenger(index, 'gender', e.target.value)}
                            className="w-full px-4 py-3 rounded-2xl bg-white/[0.05] border border-white/[0.1] focus:border-accent-500 focus:outline-none font-semibold text-white"
                            required
                          >
                            <option value="" className="bg-surface-800">Select</option>
                            <option value="Male" className="bg-surface-800">Male</option>
                            <option value="Female" className="bg-surface-800">Female</option>
                            <option value="Other" className="bg-surface-800">Other</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <div className="bg-white/[0.03] rounded-2xl p-4 mb-6 border border-white/[0.04]">
                <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                  BOOKING SUMMARY
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Total Passengers</span>
                  <span className="font-bold text-white">{passengers.length}</span>
                </div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-gray-400">Seats</span>
                  <span className="font-bold text-white">{seats.join(', ')}</span>
                </div>
                {scheduleDetails && (
                  <div className="mt-3 flex justify-between items-center pt-3 border-t border-white/[0.06]">
                    <span className="text-gray-400">Total Price</span>
                    <span className="text-2xl font-extrabold text-accent-400">
                      ₹{scheduleDetails.base_price * seats.length}
                    </span>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={!scheduleDetails}
                className="w-full btn-accent py-4 rounded-2xl disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
              >
                {!scheduleDetails ? 'Please Wait - Loading Travel Date...' : 'Proceed to Payment →'}
              </button>
              
              {!scheduleDetails && (
                <div className="mt-4 text-center text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <span className="animate-pulse">⏳</span>
                    Loading journey details...
                  </span>
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    );
  }

  // View booking
  if (!booking) {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-2xl font-bold text-white">Booking not found</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button
            onClick={() => navigate('/my-bookings')}
            className="text-gray-400 hover:text-white font-semibold flex items-center gap-2 transition"
          >
            ← Back to My Bookings
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

        <div className="glass rounded-3xl p-8 border border-white/[0.06]">
          <div className="text-center mb-6">
            <div className="text-6xl mb-4">✅</div>
            <h1 className="text-3xl font-extrabold tracking-tight text-accent-400 mb-2">
              Booking Confirmed!
            </h1>
            <div className="text-4xl font-extrabold text-white">{booking.pnr}</div>
          </div>

          <div className="space-y-4">
            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.04]">
              <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                JOURNEY DETAILS
              </div>
              <div className="text-2xl font-bold text-white mb-1">
                {booking.from_city} → {booking.to_city}
              </div>
              <div className="text-gray-400">{booking.travel_date}</div>
              <div className="text-gray-400">{formatTimeRange(booking.departure_time, booking.arrival_time)}</div>
            </div>

            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.04]">
              <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                BUS DETAILS
              </div>
              <div className="font-bold text-white">{booking.bus_name}</div>
              <div className="text-gray-400">{booking.bus_number} • {booking.operator}</div>
            </div>

            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.04]">
              <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">
                PASSENGER
              </div>
              <div className="font-bold text-white">{booking.passenger_name}</div>
              <div className="text-gray-400">{booking.passenger_age} years • {booking.passenger_gender}</div>
            </div>

            <div className="bg-white/[0.03] rounded-2xl p-4 border border-white/[0.04]">
              <div className="flex justify-between items-center">
                <div>
                  <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">
                    SEATS
                  </div>
                  <div className="font-bold text-white">{booking.seat_numbers}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-1">
                    TOTAL PAID
                  </div>
                  <div className="text-2xl font-extrabold text-accent-400">₹{booking.total_price}</div>
                </div>
              </div>
            </div>

            <div className="bg-accent-500/10 rounded-2xl p-4 border border-accent-500/20">
              <div className="text-sm font-bold text-accent-400 mb-2">📋 Important Instructions:</div>
              <ul className="text-sm text-accent-300/70 space-y-1">
                <li>• Carry a valid photo ID</li>
                <li>• Reach boarding point 15 minutes early</li>
                <li>• Show this PNR at boarding</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
