import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTo12Hour, formatTimeRange } from '../utils/timeFormat';

// Generate a unique session ID for this browser tab
// This ensures same user on different tabs sees held seats as unavailable
function generateSessionId(): string {
  return 'sess_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9);
}

interface Seat {
  id: number;
  seat_number: string;
  seat_type: string;
  deck: string;
  status: 'available' | 'booked' | 'held' | 'held-by-you';
  expiresAt?: string;
}

export default function SeatSelectionPage() {
  const { scheduleId } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [seats, setSeats] = useState<Seat[]>([]);
  const [schedule, setSchedule] = useState<any>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [holdExpiry, setHoldExpiry] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Heatmap state
  const [seatRatings, setSeatRatings] = useState<Record<string, { avg: number; count: number }>>({});
  const [showHeatmap, setShowHeatmap] = useState(false);

  // Group booking state
  const [groupMode, setGroupMode] = useState(false);
  const [groupSize, setGroupSize] = useState(2);
  const [suggestedCluster, setSuggestedCluster] = useState<string[]>([]);
  const [clusterInfo, setClusterInfo] = useState<string>('');

  // Unique session ID per tab — stable for the lifetime of this component
  const sessionId = useMemo(() => generateSessionId(), []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    fetchSeats();

    // Poll every 2 seconds for real-time seat status updates across all sessions
    pollRef.current = setInterval(() => {
      fetchSeatsQuiet();
    }, 2000);

    // Cleanup on unmount: release all held seats and stop polling
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      // Release only THIS session's seats on page leave
      api.post('/buses/release-all-seats', { scheduleId: Number(scheduleId), sessionId }).catch(() => {});
    };
  }, [scheduleId, isAuthenticated]);

  // Countdown timer for hold expiry
  useEffect(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (!holdExpiry) {
      setCountdown(0);
      return;
    }
    const updateCountdown = () => {
      const remaining = Math.max(0, Math.floor((new Date(holdExpiry).getTime() - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining <= 0) {
        // Hold expired - deselect seats and refresh
        setSelectedSeats([]);
        setHoldExpiry(null);
        fetchSeatsQuiet();
      }
    };
    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [holdExpiry]);

  const fetchSeats = async () => {
    try {
      const response = await api.get(`/buses/seats/${scheduleId}?sessionId=${sessionId}`);
      const fetchedSeats = response.data.seats || [];
      setSeats(fetchedSeats);
      setSchedule(response.data.schedule);
      // Restore selected seats from held-by-you status (only from this session)
      const myHeldSeats = fetchedSeats
        .filter((s: Seat) => s.status === 'held-by-you')
        .map((s: Seat) => s.seat_number);
      if (myHeldSeats.length > 0) {
        setSelectedSeats(myHeldSeats);
        const firstExpiry = fetchedSeats.find((s: Seat) => s.status === 'held-by-you')?.expiresAt;
        if (firstExpiry) setHoldExpiry(firstExpiry);
      }
    } catch (error) {
      console.error('Failed to fetch seats:', error);
    } finally {
      setLoading(false);
    }
  };

  // Quiet refresh that doesn't reset loading state
  const fetchSeatsQuiet = async () => {
    try {
      const response = await api.get(`/buses/seats/${scheduleId}?sessionId=${sessionId}`);
      const fetchedSeats = response.data.seats || [];
      setSeats(fetchedSeats);
      setSchedule(response.data.schedule);
    } catch (error) {
      console.error('Failed to refresh seats:', error);
    }
  };

  // Fetch seat reviews for heatmap
  const fetchSeatReviews = async (busId: number) => {
    try {
      const response = await api.get(`/buses/seat-reviews/${busId}`);
      const reviews = response.data.reviews || [];
      const ratingsMap: Record<string, { avg: number; count: number }> = {};
      reviews.forEach((r: any) => {
        ratingsMap[r.seat_number] = { avg: r.avg_rating, count: r.review_count };
      });
      setSeatRatings(ratingsMap);
    } catch { /* silent */ }
  };

  // Load reviews when schedule loads
  useEffect(() => {
    if (schedule?.bus_id) fetchSeatReviews(schedule.bus_id);
  }, [schedule?.bus_id]);

  // Find best group of adjacent seats
  const findGroupSeats = async () => {
    try {
      const response = await api.post('/buses/find-group-seats', {
        scheduleId: Number(scheduleId),
        groupSize
      });
      setSuggestedCluster(response.data.cluster || []);
      setClusterInfo(response.data.description || '');
    } catch (error: any) {
      alert(error.response?.data?.error || 'Could not find group seats');
    }
  };

  // Auto-select suggested cluster seats
  const selectClusterSeats = async () => {
    for (const seatNum of suggestedCluster) {
      if (!selectedSeats.includes(seatNum)) {
        await toggleSeat(seatNum, 'available');
      }
    }
    setSuggestedCluster([]);
    setClusterInfo('');
    setGroupMode(false);
  };

  // Get heatmap color for a seat based on rating
  const getHeatmapOverlay = (seatNumber: string): string => {
    if (!showHeatmap) return '';
    const rating = seatRatings[seatNumber];
    if (!rating) return '';
    if (rating.avg >= 4.5) return 'ring-2 ring-emerald-400/60';
    if (rating.avg >= 3.5) return 'ring-2 ring-green-400/40';
    if (rating.avg >= 2.5) return 'ring-2 ring-yellow-400/40';
    if (rating.avg >= 1.5) return 'ring-2 ring-orange-400/40';
    return 'ring-2 ring-red-400/40';
  };

  const toggleSeat = async (seatNumber: string, status: string) => {
    // Check if booking is allowed (bus hasn't departed)
    if (schedule && schedule.booking_allowed === false) {
      return;
    }
    
    // Can only select available seats or deselect own held seats
    if (status !== 'available' && status !== 'held-by-you') return;

    if (selectedSeats.includes(seatNumber)) {
      // Deselect - release the hold
      try {
        await api.post('/buses/release-seat', {
          scheduleId: Number(scheduleId),
          seatNumber,
          sessionId
        });
        const newSelected = selectedSeats.filter(s => s !== seatNumber);
        setSelectedSeats(newSelected);
        if (newSelected.length === 0) setHoldExpiry(null);
        fetchSeatsQuiet();
      } catch (error) {
        console.error('Failed to release seat:', error);
      }
    } else {
      if (selectedSeats.length < 6) {
        // Select - create a hold
        try {
          const response = await api.post('/buses/hold-seat', {
            scheduleId: Number(scheduleId),
            seatNumber,
            sessionId
          });
          setSelectedSeats([...selectedSeats, seatNumber]);
          setHoldExpiry(response.data.expiresAt);
          fetchSeatsQuiet();
        } catch (error: any) {
          if (error.response?.status === 409) {
            alert('This seat is currently unavailable. It may be held by another user or your other session.');
            fetchSeatsQuiet();
          } else {
            console.error('Failed to hold seat:', error);
            alert('Failed to select seat. Please try again.');
          }
        }
      }
    }
  };

  // Deselect a specific seat (from the booking summary panel)
  const deselectSeat = async (seatNumber: string) => {
    try {
      await api.post('/buses/release-seat', {
        scheduleId: Number(scheduleId),
        seatNumber,
        sessionId
      });
      const newSelected = selectedSeats.filter(s => s !== seatNumber);
      setSelectedSeats(newSelected);
      if (newSelected.length === 0) setHoldExpiry(null);
      fetchSeatsQuiet();
    } catch (error) {
      console.error('Failed to release seat:', error);
    }
  };

  // Deselect all seats at once
  const deselectAllSeats = async () => {
    try {
      await api.post('/buses/release-all-seats', {
        scheduleId: Number(scheduleId),
        sessionId
      });
      setSelectedSeats([]);
      setHoldExpiry(null);
      fetchSeatsQuiet();
    } catch (error) {
      console.error('Failed to release all seats:', error);
    }
  };

  const handleProceed = async () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    if (selectedSeats.length === 0) return;

    // Confirm travel date before proceeding
    if (schedule) {
      const travelDateFormatted = new Date(schedule.travel_date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      const confirmMessage = `Please confirm your travel date:\n\n` +
        `📅 ${travelDateFormatted}\n` +
        `🕐 Departure: ${formatTo12Hour(schedule.departure_time)}\n` +
        `💺 Seats: ${selectedSeats.join(', ')}\n\n` +
        `Proceed to passenger details?`;

      if (!confirm(confirmMessage)) {
        return;
      }
    }

    try {
      // Lock seats
      await api.post('/buses/lock-seats', {
        scheduleId: Number(scheduleId),
        seatNumbers: selectedSeats
      });

      // Navigate to booking form
      navigate(`/booking/new?scheduleId=${scheduleId}&seats=${selectedSeats.join(',')}`);
    } catch (error) {
      console.error('Failed to lock seats:', error);
      alert('Failed to lock seats. Please try again.');
    }
  };

  const getSeatColor = (seat: Seat) => {
    // If booking is not allowed, make all seats appear disabled
    if (schedule && schedule.booking_allowed === false) {
      return 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed';
    }
    
    if (selectedSeats.includes(seat.seat_number)) {
      return 'bg-accent-600 border-accent-500 text-white shadow-lg shadow-accent-600/30';
    }
    if (seat.status === 'booked') {
      return 'bg-gray-600 border-gray-500 text-gray-400 cursor-not-allowed';
    }
    if (seat.status === 'held') {
      return 'bg-amber-500/30 border-amber-500/50 text-amber-400 cursor-not-allowed';
    }
    if (seat.status === 'held-by-you') {
      return 'bg-accent-600 border-accent-500 text-white shadow-lg shadow-accent-600/30';
    }
    // Highlight suggested group seats
    if (suggestedCluster.includes(seat.seat_number)) {
      return 'bg-emerald-500/20 border-emerald-400/60 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer animate-pulse';
    }
    return 'bg-white/[0.05] border-white/[0.1] text-gray-300 hover:border-accent-500/50 hover:bg-white/[0.08] cursor-pointer';
  };

  // Helper to get seat type based on 2+2 layout
  const getSeatTypeLabel = (seatNumber: string): string => {
    const num = parseInt(seatNumber.replace(/\D/g, ''));
    const posInGroup = ((num - 1) % 4) + 1;
    return (posInGroup === 1 || posInGroup === 4) ? 'W' : 'A';
  };

  const getSeatTypeFullLabel = (seatNumber: string): string => {
    const num = parseInt(seatNumber.replace(/\D/g, ''));
    const posInGroup = ((num - 1) % 4) + 1;
    return (posInGroup === 1 || posInGroup === 4) ? 'Window' : 'Aisle';
  };

  // Organize seats into 2+2 layout (40 seats)
  const renderSeatLayout = () => {
    const lowerSeats = seats.filter(s => s.deck === 'lower')
      .sort((a, b) => {
        const numA = parseInt(a.seat_number.replace(/\D/g, ''));
        const numB = parseInt(b.seat_number.replace(/\D/g, ''));
        return numA - numB;
      })
      .slice(0, 30);
    const rows = [];

    for (let i = 0; i < 30; i += 4) {
      rows.push(lowerSeats.slice(i, i + 4));
    }

    return (
      <div className="space-y-3">
        {/* Cockpit */}
        <div className="bg-surface-800 rounded-t-3xl p-4 text-center border border-white/[0.06]">
          <div className="w-16 h-16 bg-surface-700 rounded-full mx-auto flex items-center justify-center">
            <span className="text-2xl">🚗</span>
          </div>
          <div className="text-gray-400 text-xs font-bold mt-2">DRIVER</div>
        </div>

        {/* Entrance */}
        <div className="text-center py-2 bg-white/[0.03] rounded-xl border border-white/[0.04]">
          <span className="text-xs font-bold text-gray-500">🚪 ENTRANCE</span>
        </div>

        {/* Column Labels */}
        <div className="flex gap-3 justify-center text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          <div className="flex gap-2">
            <div className="w-12 text-center">Window</div>
            <div className="w-12 text-center">Aisle</div>
          </div>
          <div className="w-8"></div>
          <div className="flex gap-2">
            <div className="w-12 text-center">Aisle</div>
            <div className="w-12 text-center">Window</div>
          </div>
        </div>

        {/* Seats Grid */}
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-3 justify-center">
            {/* Left side (2 seats) */}
            <div className="flex gap-2">
              {row.slice(0, 2).map((seat) => (
                seat && (
                  <button
                    key={seat.id}
                    onClick={() => toggleSeat(seat.seat_number, seat.status)}
                    disabled={seat.status !== 'available' && !selectedSeats.includes(seat.seat_number) && !suggestedCluster.includes(seat.seat_number)}
                    className={`w-12 h-12 rounded-xl border-2 font-bold text-xs transition-all hover:scale-110 relative ${getSeatColor(seat)} ${getHeatmapOverlay(seat.seat_number)}`}
                    title={`${seat.seat_number} - ${getSeatTypeFullLabel(seat.seat_number)}${seatRatings[seat.seat_number] ? ` · ⭐${seatRatings[seat.seat_number].avg} (${seatRatings[seat.seat_number].count} reviews)` : ''}`}
                  >
                    <span>{seat.seat_number}</span>
                    {showHeatmap && seatRatings[seat.seat_number] && (
                      <span className="absolute -top-1 -right-1 text-[7px] bg-black/80 text-yellow-300 px-1 rounded font-bold">⭐{seatRatings[seat.seat_number].avg}</span>
                    )}
                    <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold ${
                      selectedSeats.includes(seat.seat_number) ? 'text-white/70' :
                      seat.status === 'booked' ? 'text-white/60' : 'text-gray-400'
                    }`}>{getSeatTypeLabel(seat.seat_number)}</span>
                  </button>
                )
              ))}
            </div>

            {/* Aisle */}
            <div className="w-8 flex items-center justify-center">
              <div className="h-1 w-full bg-white/[0.06] rounded"></div>
            </div>

            {/* Right side (2 seats) */}
            <div className="flex gap-2">
              {row.slice(2, 4).map((seat) => (
                seat && (
                  <button
                    key={seat.id}
                    onClick={() => toggleSeat(seat.seat_number, seat.status)}
                    disabled={seat.status !== 'available' && !selectedSeats.includes(seat.seat_number) && !suggestedCluster.includes(seat.seat_number)}
                    className={`w-12 h-12 rounded-xl border-2 font-bold text-xs transition-all hover:scale-110 relative ${getSeatColor(seat)} ${getHeatmapOverlay(seat.seat_number)}`}
                    title={`${seat.seat_number} - ${getSeatTypeFullLabel(seat.seat_number)}${seatRatings[seat.seat_number] ? ` · ⭐${seatRatings[seat.seat_number].avg} (${seatRatings[seat.seat_number].count} reviews)` : ''}`}
                  >
                    <span>{seat.seat_number}</span>
                    {showHeatmap && seatRatings[seat.seat_number] && (
                      <span className="absolute -top-1 -right-1 text-[7px] bg-black/80 text-yellow-300 px-1 rounded font-bold">⭐{seatRatings[seat.seat_number].avg}</span>
                    )}
                    <span className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 text-[8px] font-bold ${
                      selectedSeats.includes(seat.seat_number) ? 'text-white/70' :
                      seat.status === 'booked' ? 'text-white/60' : 'text-gray-400'
                    }`}>{getSeatTypeLabel(seat.seat_number)}</span>
                  </button>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
    );
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
          {schedule && (
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-white mb-1">
                Select Your Seats
              </h1>
              <div className="flex gap-4 items-center text-sm">
                <span className="bg-accent-500/10 text-accent-400 px-3 py-1 rounded-full font-semibold border border-accent-500/20">
                  📅 {new Date(schedule.travel_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                  })}
                </span>
                <span className="text-gray-400">
                  🕐 {formatTimeRange(schedule.departure_time, schedule.arrival_time)}
                </span>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Bus Departed Warning */}
        {schedule && schedule.booking_allowed === false && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <span className="text-4xl">🚫</span>
              <div className="flex-1">
                <div className="font-bold text-red-400 text-xl mb-2">Booking Closed – Bus Already Departed</div>
                <div className="text-red-400/80 mb-3">
                  This bus departed on <span className="font-bold text-red-300">
                    {new Date(schedule.travel_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span> at <span className="font-bold">{formatTo12Hour(schedule.departure_time)}</span>
                </div>
                <div className="text-sm text-red-400/70 flex items-center gap-2">
                  <span>💡</span>
                  <span>Please select a different bus schedule for future travel</span>
                </div>
                <button
                  onClick={() => navigate(-1)}
                  className="mt-4 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all"
                >
                  ← Back to Search Results
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Travel Date Notice */}
        {schedule && schedule.booking_allowed !== false && (
          <div className="bg-accent-500/10 border border-accent-500/20 rounded-2xl p-6 mb-6">
            <div className="flex items-start gap-4">
              <span className="text-4xl">📅</span>
              <div className="flex-1">
                <div className="font-bold text-accent-400 text-lg mb-2">Confirm Your Travel Date</div>
                <div className="text-accent-300/80 mb-3">
                  You are selecting seats for <span className="font-bold text-accent-300">
                    {new Date(schedule.travel_date).toLocaleDateString('en-US', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span> at <span className="font-bold">{formatTo12Hour(schedule.departure_time)}</span>
                </div>
                <div className="text-sm text-accent-400/70 flex items-center gap-2">
                  <span>💡</span>
                  <span>Please verify this is your intended travel date before proceeding</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-6">
          {/* Bus Chassis UI */}
          <div className="md:col-span-2">
            {/* Heatmap & Group Booking Controls */}
            <div className="glass rounded-2xl p-4 mb-4 border border-white/[0.06]">
              <div className="flex flex-wrap items-center gap-3">
                {/* Heatmap Toggle */}
                <button
                  onClick={() => setShowHeatmap(!showHeatmap)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    showHeatmap
                      ? 'bg-gradient-to-r from-orange-500/20 to-red-500/20 text-orange-300 border border-orange-500/30'
                      : 'bg-white/[0.03] text-gray-400 border border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  <span>🔥</span>
                  <span>{showHeatmap ? 'Heatmap ON' : 'Seat Heatmap'}</span>
                </button>

                <div className="h-6 w-px bg-white/10" />

                {/* Group Booking Toggle */}
                <button
                  onClick={() => { setGroupMode(!groupMode); setSuggestedCluster([]); setClusterInfo(''); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                    groupMode
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-white/[0.03] text-gray-400 border border-white/[0.06] hover:bg-white/[0.06]'
                  }`}
                >
                  <span>👥</span>
                  <span>{groupMode ? 'Group Mode ON' : 'Group Booking'}</span>
                </button>

                {/* Heatmap Legend (inline) */}
                {showHeatmap && (
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-[10px] text-gray-500">Rating:</span>
                    <div className="flex gap-1">
                      <div className="w-4 h-4 rounded ring-2 ring-red-400/40 bg-white/5" title="1-1.5★"></div>
                      <div className="w-4 h-4 rounded ring-2 ring-orange-400/40 bg-white/5" title="1.5-2.5★"></div>
                      <div className="w-4 h-4 rounded ring-2 ring-yellow-400/40 bg-white/5" title="2.5-3.5★"></div>
                      <div className="w-4 h-4 rounded ring-2 ring-green-400/40 bg-white/5" title="3.5-4.5★"></div>
                      <div className="w-4 h-4 rounded ring-2 ring-emerald-400/60 bg-white/5" title="4.5-5★"></div>
                    </div>
                    <span className="text-[10px] text-gray-500">Low → High</span>
                  </div>
                )}
              </div>

              {/* Group Booking Panel */}
              {groupMode && (
                <div className="mt-3 pt-3 border-t border-white/[0.06]">
                  <div className="flex items-center gap-3 flex-wrap">
                    <label className="text-xs text-gray-400 font-semibold">Group Size:</label>
                    <div className="flex gap-1">
                      {[2, 3, 4, 5, 6, 7, 8].map(n => (
                        <button
                          key={n}
                          onClick={() => { setGroupSize(n); setSuggestedCluster([]); }}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                            groupSize === n
                              ? 'bg-emerald-500 text-white'
                              : 'bg-white/[0.05] text-gray-400 hover:bg-white/[0.1]'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={findGroupSeats}
                      className="ml-auto px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-500 text-white text-xs font-bold rounded-xl hover:from-emerald-500 hover:to-teal-400 transition-all active:scale-95"
                    >
                      🔍 Find Best {groupSize} Seats
                    </button>
                  </div>
                  {suggestedCluster.length > 0 && (
                    <div className="mt-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-emerald-300 text-sm font-bold">Suggested: {suggestedCluster.join(', ')}</p>
                          <p className="text-emerald-400/60 text-xs mt-0.5">{clusterInfo}</p>
                        </div>
                        <button
                          onClick={selectClusterSeats}
                          className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-xl hover:bg-emerald-400 transition-all active:scale-95"
                        >
                          ✓ Select All
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-gradient-to-b from-surface-800 via-surface-700 to-surface-800 rounded-3xl p-6 shadow-2xl overflow-x-auto scrollbar-hide border border-white/[0.06]">
              {renderSeatLayout()}
            </div>

            {/* Legend */}
            <div className="glass rounded-3xl p-6 mt-6 border border-white/[0.06]">
              <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
                LEGEND
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white/[0.05] border-2 border-white/[0.1] rounded-xl"></div>
                  <span className="text-sm font-semibold text-gray-300">Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-accent-600 border-2 border-accent-500 rounded-xl"></div>
                  <span className="text-sm font-semibold text-gray-300">Selected</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-600 border-2 border-gray-500 rounded-xl"></div>
                  <span className="text-sm font-semibold text-gray-300">Booked</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white/[0.05] border-2 border-white/[0.1] rounded-xl flex items-center justify-center text-[9px] font-bold text-gray-500">W</div>
                  <span className="text-sm font-semibold text-gray-300">Window</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-white/[0.05] border-2 border-white/[0.1] rounded-xl flex items-center justify-center text-[9px] font-bold text-gray-500">A</div>
                  <span className="text-sm font-semibold text-gray-300">Aisle</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-amber-500/30 border-2 border-amber-500/50 rounded-xl"></div>
                  <span className="text-sm font-semibold text-gray-300">Held (by others)</span>
                </div>
                {groupMode && (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-emerald-500/20 border-2 border-emerald-400/60 rounded-xl animate-pulse"></div>
                    <span className="text-sm font-semibold text-emerald-300">Group Suggested</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Booking Summary */}
          <div>
            <div className="glass rounded-3xl p-6 sticky top-6 border border-white/[0.06]">
              <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
                BOOKING SUMMARY
              </h3>

              {selectedSeats.length > 0 ? (
                <>
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="text-sm text-gray-400">Selected Seats</div>
                      <button
                        onClick={deselectAllSeats}
                        className="text-xs text-red-400 hover:text-red-300 font-bold hover:underline"
                      >
                        Clear All ✕
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSeats.map((seat) => (
                        <span key={seat} className="inline-flex items-center gap-1 px-3 py-1 bg-accent-600 text-white rounded-full text-sm font-bold group">
                          {seat} <span className="text-white/70 text-xs">({getSeatTypeFullLabel(seat)})</span>
                          <button
                            onClick={(e) => { e.stopPropagation(); deselectSeat(seat); }}
                            className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/40 text-white text-xs font-bold transition"
                            title={`Remove seat ${seat}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Hold timer */}
                  {countdown > 0 && (
                    <div className="mb-4 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                      <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
                        <span>⏱️</span>
                        <span>Seats held for {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}</span>
                      </div>
                      <div className="text-xs text-amber-400/70 mt-1">Complete booking before timer expires</div>
                    </div>
                  )}

                  <div className="border-t border-white/[0.06] pt-4 mb-4">
                    <div className="flex justify-between mb-2">
                      <span className="text-gray-400">Seats ({selectedSeats.length})</span>
                      <span className="font-bold text-white">₹{schedule ? schedule.base_price * selectedSeats.length : 0}</span>
                    </div>
                    <div className="flex justify-between text-xl font-extrabold text-accent-400">
                      <span>TOTAL</span>
                      <span>₹{schedule ? schedule.base_price * selectedSeats.length : 0}</span>
                    </div>
                  </div>

                  <button
                    onClick={handleProceed}
                    className="w-full btn-accent py-4 rounded-2xl uppercase tracking-wider"
                  >
                    Proceed to Book
                  </button>
                </>
              ) : (
                <div className="text-center py-8">
                  <div className="text-4xl mb-3">💺</div>
                  <p className="text-gray-400">Select seats to continue</p>
                  <p className="text-xs text-gray-500 mt-2">Max 6 seats</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
