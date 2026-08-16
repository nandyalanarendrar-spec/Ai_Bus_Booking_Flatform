import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

interface Stats {
  totalBuses: number;
  totalBookings: number;
  todayBookings: number;
  totalRevenue: number;
}

interface Bus {
  id: number;
  bus_number: string;
  bus_name: string;
  bus_type: string;
  has_ac: number;
  is_sleeper: number;
  is_daily_service?: number;
  total_seats: number;
  operator: string;
  rating: number;
}

interface Route {
  id: number;
  from_city: string;
  to_city: string;
  distance_km: number;
  duration_hours: number;
}

interface Schedule {
  id: number;
  route_id: number;
  bus_id: number;
  bus_number: string;
  bus_name: string;
  bus_type: string;
  operator: string;
  departure_time: string;
  arrival_time: string;
  base_price: number;
  available_seats: number;
  total_seats: number;
  from_city: string;
  to_city: string;
  travel_date: string;
  is_daily_service?: number;
}

interface Booking {
  id: number;
  pnr: string;
  passenger_name: string;
  passenger_age: number;
  passenger_gender: string;
  seat_numbers: string;
  total_price: number;
  booking_status: string;
  username: string;
  email: string;
  phone: string;
  from_city: string;
  to_city: string;
  travel_date: string;
  departure_time: string;
  arrival_time: string;
  bus_number: string;
  bus_name: string;
  operator: string;
  created_at: string;
}

interface SeatStatus {
  seat_number: string;
  seat_type: string;
  deck: string;
  status: 'available' | 'booked' | 'held';
  booking_info: {
    passenger_name: string;
    username: string;
    email: string;
    pnr: string;
    booking_status: string;
  } | null;
}

type TimePeriod = 'AM' | 'PM';

const busBrands = ['Volvo', 'Scania', 'Mercedes-Benz', 'BharatBenz', 'TATA Motors', 'Ashok Leyland', 'Eicher'];

const scheduleDateShortcuts = [
  { label: 'Today', offset: 0 },
  { label: 'Tomorrow', offset: 1 },
  { label: 'In 3 days', offset: 3 },
  { label: 'In 7 days', offset: 7 },
  { label: 'In 15 days', offset: 15 },
];

interface CalendarDayItem {
  dateStr: string;
  dayName: string;
  monthName: string;
  dayNum: number;
  isWeekend: boolean;
}

function getLocalDateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getUpcomingDays(count = 35): CalendarDayItem[] {
  const days: CalendarDayItem[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    const monthName = d.toLocaleDateString('en-US', { month: 'short' });
    const dayNum = d.getDate();
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    days.push({ dateStr, dayName, monthName, dayNum, isWeekend });
  }
  return days;
}

function formatTimeTo12Hour(hourInput: string, minuteInput: string, period: TimePeriod) {
  const hour = Number(hourInput) % 12;
  const normalizedHour = hour === 0 ? 12 : hour;
  const hour24 = period === 'PM' ? normalizedHour % 12 + 12 : normalizedHour % 12;

  return `${String(hour24).padStart(2, '0')}:${minuteInput.padStart(2, '0')}`;
}

const emptyBusForm = {
  bus_number: '',
  bus_name: '',
  bus_type: 'Volvo',
  has_ac: true,
  is_sleeper: false,
  total_seats: 40,
};

const emptyScheduleForm = {
  route_id: '',
  bus_id: '',
  travel_date: '',
  base_price: '',
};

const DashboardPage: React.FC = () => {
  const { company, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'buses' | 'schedules' | 'bookings' | 'seats' | 'my-requests'>('overview');
  const [requestTab, setRequestTab] = useState<'places' | 'routes'>('places');
  const [stats, setStats] = useState<Stats | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [placesList, setPlacesList] = useState<any[]>([]);
  const [myPlaceRequests, setMyPlaceRequests] = useState<any[]>([]);
  const [myRouteRequests, setMyRouteRequests] = useState<any[]>([]);
  
  // Request Modals state
  const [showPlaceReqModal, setShowPlaceReqModal] = useState(false);
  const [showRouteReqModal, setShowRouteReqModal] = useState(false);
  const [placeReqForm, setPlaceReqForm] = useState({
    place_name: '',
    district: '',
    state: 'Andhra Pradesh',
    bus_station: '',
    reason: ''
  });
  const [routeReqForm, setRouteReqForm] = useState({
    source_place_id: '',
    destination_place_id: '',
    reason: ''
  });

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [seatStatus, setSeatStatus] = useState<SeatStatus[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const travelDateInputRef = useRef<HTMLInputElement>(null);

  const [busForm, setBusForm] = useState(emptyBusForm);
  const [editingBusId, setEditingBusId] = useState<number | null>(null);

  const [scheduleForm, setScheduleForm] = useState(emptyScheduleForm);
  const [departureTimeForm, setDepartureTimeForm] = useState({ hour: '08', minute: '00', period: 'AM' as TimePeriod });
  const [arrivalTimeForm, setArrivalTimeForm] = useState({ hour: '10', minute: '00', period: 'AM' as TimePeriod });
  const [scheduleMode, setScheduleMode] = useState<'single' | 'calendar' | 'daily' | 'daily30'>('single');
  const [selectedCalendarDates, setSelectedCalendarDates] = useState<Set<string>>(() => new Set([getLocalDateString(0)]));
  
  // Daily Run state
  const [dailyStartDate, setDailyStartDate] = useState(() => getLocalDateString(0));
  const [dailyDurationDays, setDailyDurationDays] = useState<number>(30);
  const [dailyPattern, setDailyPattern] = useState<'everyday' | 'weekdays' | 'weekends' | 'alternate'>('everyday');

  const upcomingDaysList = useMemo(() => getUpcomingDays(35), []);

  const toggleCalendarDate = (dateStr: string) => {
    setSelectedCalendarDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) {
        next.delete(dateStr);
      } else {
        next.add(dateStr);
      }
      return next;
    });
  };

  const selectCalendarPreset = (preset: '7days' | '15days' | '30days' | 'weekdays' | 'weekends' | 'clear') => {
    if (preset === 'clear') {
      setSelectedCalendarDates(new Set());
      return;
    }
    const newSet = new Set<string>();
    upcomingDaysList.forEach((d, idx) => {
      if (preset === '7days' && idx < 7) newSet.add(d.dateStr);
      if (preset === '15days' && idx < 15) newSet.add(d.dateStr);
      if (preset === '30days' && idx < 30) newSet.add(d.dateStr);
      if (preset === 'weekdays' && !d.isWeekend && idx < 30) newSet.add(d.dateStr);
      if (preset === 'weekends' && d.isWeekend && idx < 30) newSet.add(d.dateStr);
    });
    setSelectedCalendarDates(newSet);
  };

  const generatedDailyDates = useMemo(() => {
    const dates: string[] = [];
    if (!dailyStartDate) return dates;
    const parts = dailyStartDate.split('-').map(Number);
    const start = new Date(parts[0], parts[1] - 1, parts[2]);

    for (let i = 0; i < dailyDurationDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      
      let include = false;
      if (dailyPattern === 'everyday') include = true;
      else if (dailyPattern === 'weekdays' && !isWeekend) include = true;
      else if (dailyPattern === 'weekends' && isWeekend) include = true;
      else if (dailyPattern === 'alternate' && i % 2 === 0) include = true;

      if (include) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        dates.push(dateStr);
      }
    }
    return dates;
  }, [dailyStartDate, dailyDurationDays, dailyPattern]);
  const [bookingFilterRoute, setBookingFilterRoute] = useState('');
  const [bookingFilterDate, setBookingFilterDate] = useState('');
  const [bookingFilterBus, setBookingFilterBus] = useState('');
  const [scheduleFilterRoute, setScheduleFilterRoute] = useState('');
  const [scheduleFilterDate, setScheduleFilterDate] = useState('');

  const sortedSeatStatus = useMemo(
    () =>
      [...seatStatus].sort((a, b) => {
        const seatA = Number(a.seat_number.replace(/\D/g, ''));
        const seatB = Number(b.seat_number.replace(/\D/g, ''));
        return seatA - seatB;
      }),
    [seatStatus]
  );

  const placesArray = useMemo(() => {
    if (Array.isArray(placesList)) return placesList;
    if (placesList && Array.isArray((placesList as any).places)) return (placesList as any).places;
    return [];
  }, [placesList]);

  useEffect(() => {
    void fetchPlacesList();
    const interval = setInterval(() => {
      void fetchPlacesList();
    }, 5000);

    const onFocus = () => void fetchPlacesList();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'place_updated') void fetchPlacesList();
    };

    window.addEventListener('focus', onFocus);
    window.addEventListener('storage', onStorage);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      void fetchStats();
    }
    if (activeTab === 'buses') {
      void fetchBuses();
    }
    if (activeTab === 'schedules') {
      void Promise.all([fetchRoutes(), fetchBuses(), fetchSchedules(), fetchPlacesList()]);
    }
    if (activeTab === 'bookings') {
      void Promise.all([fetchRoutes(), fetchBuses(), fetchBookings()]);
    }
    if (activeTab === 'seats') {
      void Promise.all([fetchRoutes(), fetchBuses(), fetchSchedules()]);
    }
    if (activeTab === 'my-requests') {
      void Promise.all([fetchMyPlaceRequests(), fetchMyRouteRequests(), fetchPlacesList()]);
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'schedules') {
      void fetchSchedules();
    }
  }, [scheduleFilterRoute, scheduleFilterDate]);

  useEffect(() => {
    if (activeTab === 'bookings') {
      void fetchBookings();
    }
  }, [bookingFilterRoute, bookingFilterDate, bookingFilterBus]);

  useEffect(() => {
    if (activeTab === 'seats' && selectedScheduleId) {
      void fetchSeatStatus();
    }
  }, [selectedScheduleId]);

  const selectedBusOptions = useMemo(() => buses, [buses]);

  const fetchStats = async () => {
    setError('');
    try {
      const response = await api.get('/company/dashboard/stats');
      setStats(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load dashboard stats');
    }
  };

  const fetchBuses = async () => {
    try {
      const response = await api.get('/company/buses');
      setBuses(response.data);
      if (!scheduleForm.bus_id && response.data.length > 0) {
        setScheduleForm((current) => ({ ...current, bus_id: String(response.data[0].id) }));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load buses');
    }
  };

  const fetchRoutes = async () => {
    try {
      const response = await api.get('/company/routes');
      setRoutes(response.data);
      if (!scheduleForm.route_id && response.data.length > 0) {
        setScheduleForm((current) => ({ ...current, route_id: String(response.data[0].id) }));
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load routes');
    }
  };

  const fetchPlacesList = async () => {
    try {
      const response = await api.get('/places');
      setPlacesList(response.data?.places || response.data || []);
    } catch { /* silent */ }
  };

  const fetchMyPlaceRequests = async () => {
    try {
      const response = await api.get('/company/place-requests/my');
      setMyPlaceRequests(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load place requests');
    }
  };

  const fetchMyRouteRequests = async () => {
    try {
      const response = await api.get('/company/route-requests/my');
      setMyRouteRequests(response.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load route requests');
    }
  };

  const handlePlaceRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/company/place-requests', placeReqForm);
      try { localStorage.setItem('request_updated', Date.now().toString()); } catch {}
      setSuccessMsg(res.data.message || 'Place request submitted successfully!');
      setShowPlaceReqModal(false);
      setPlaceReqForm({ place_name: '', district: '', state: 'Andhra Pradesh', bus_station: '', reason: '' });
      fetchMyPlaceRequests();
      setActiveTab('my-requests');
      setRequestTab('places');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit place request');
    }
  };

  const handleRouteRequestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    try {
      const res = await api.post('/company/route-requests', routeReqForm);
      try { localStorage.setItem('request_updated', Date.now().toString()); } catch {}
      setSuccessMsg(res.data.message || 'Route request submitted successfully!');
      setShowRouteReqModal(false);
      setRouteReqForm({ source_place_id: '', destination_place_id: '', reason: '' });
      fetchMyRouteRequests();
      setActiveTab('my-requests');
      setRequestTab('routes');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit route request');
    }
  };

  const fetchSchedules = async () => {
    setIsLoading(true);
    setError('');
    try {
      const params: Record<string, string> = {};
      if (scheduleFilterRoute) params.route_id = scheduleFilterRoute;
      if (scheduleFilterDate) params.travel_date = scheduleFilterDate;

      const response = await api.get('/company/schedules', { params });
      setSchedules(response.data);
      if (!selectedScheduleId && response.data.length > 0) {
        setSelectedScheduleId(String(response.data[0].id));
      } else if (selectedScheduleId && response.data.length > 0) {
        const existsInFilteredResult = response.data.some((item: Schedule) => String(item.id) === selectedScheduleId);
        if (!existsInFilteredResult) {
          setSelectedScheduleId(String(response.data[0].id));
        }
      } else if (response.data.length === 0) {
        setSelectedScheduleId('');
        setSeatStatus([]);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load schedules');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const params: Record<string, string> = {};
      if (bookingFilterRoute) params.route_id = bookingFilterRoute;
      if (bookingFilterDate) params.travel_date = bookingFilterDate;
      if (bookingFilterBus) params.bus_id = bookingFilterBus;

      const response = await api.get('/company/bookings', { params });
      setBookings(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load bookings');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSeatStatus = async () => {
    if (!selectedScheduleId) return;

    setIsLoading(true);
    setError('');
    try {
      const response = await api.get('/company/seat-status', {
        params: { schedule_id: selectedScheduleId },
      });
      setSeatStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load seat status');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBusSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    try {
      if (editingBusId) {
        await api.put(`/company/buses/${editingBusId}`, {
          bus_name: busForm.bus_name,
          bus_type: busForm.bus_type,
          has_ac: busForm.has_ac,
          is_sleeper: busForm.is_sleeper,
        });
      } else {
        await api.post('/company/buses', busForm);
      }

      setBusForm(emptyBusForm);
      setEditingBusId(null);
      await Promise.all([fetchBuses(), fetchStats()]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save bus');
    }
  };

  const handleEditBus = (bus: Bus) => {
    setEditingBusId(bus.id);
    setBusForm({
      bus_number: bus.bus_number,
      bus_name: bus.bus_name,
      bus_type: bus.bus_type,
      has_ac: Boolean(bus.has_ac),
      is_sleeper: Boolean(bus.is_sleeper),
      total_seats: bus.total_seats,
    });
    setActiveTab('buses');
  };

  const handleDeleteBus = async (busId: number) => {
    if (!window.confirm('Delete this bus and all its schedules/bookings?')) return;

    setError('');
    try {
      await api.delete(`/company/buses/${busId}`);
      await Promise.all([fetchBuses(), fetchStats(), fetchSchedules(), fetchBookings()]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete bus');
    }
  };

  const handleScheduleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    let datesToSubmit: string[] = [];
    if (scheduleMode === 'single') {
      if (!scheduleForm.travel_date) {
        setError('Please select a travel date');
        return;
      }
      datesToSubmit = [scheduleForm.travel_date];
    } else if (scheduleMode === 'calendar') {
      datesToSubmit = Array.from(selectedCalendarDates).sort();
      if (datesToSubmit.length === 0) {
        setError('Please select at least one date from the calendar grid');
        return;
      }
    } else if (scheduleMode === 'daily') {
      datesToSubmit = generatedDailyDates;
      if (datesToSubmit.length === 0) {
        setError('No dates generated for Daily Run');
        return;
      }
    } else if (scheduleMode === 'daily30') {
      datesToSubmit = Array.from({ length: 30 }, (_, i) => getLocalDateString(i));
    }

    try {
      await api.post('/company/schedules', {
        route_id: Number(scheduleForm.route_id),
        bus_id: Number(scheduleForm.bus_id),
        departure_time: formatTimeTo12Hour(departureTimeForm.hour, departureTimeForm.minute, departureTimeForm.period),
        arrival_time: formatTimeTo12Hour(arrivalTimeForm.hour, arrivalTimeForm.minute, arrivalTimeForm.period),
        base_price: Number(scheduleForm.base_price),
        travel_date: datesToSubmit.length === 1 ? datesToSubmit[0] : datesToSubmit,
        is_daily_service: scheduleMode === 'daily30' ? 1 : 0,
      });

      setScheduleForm((current) => ({
        ...emptyScheduleForm,
        route_id: current.route_id || (routes[0] ? String(routes[0].id) : ''),
        bus_id: current.bus_id || (buses[0] ? String(buses[0].id) : ''),
      }));
      setDepartureTimeForm({ hour: '08', minute: '00', period: 'AM' });
      setArrivalTimeForm({ hour: '10', minute: '00', period: 'AM' });
      setScheduleMode('single');
      await Promise.all([fetchSchedules(), fetchStats()]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add schedule');
    }
  };

  const applyScheduleDateShortcut = (offsetDays: number) => {
    setScheduleMode('single');
    setScheduleForm((current) => ({
      ...current,
      travel_date: getLocalDateString(offsetDays),
    }));
  };

  const handleDeleteSchedule = async (scheduleId: number, travelDate: string) => {
    setError('');
    setSuccessMsg('');

    try {
      const response = await api.delete(`/company/schedules/${scheduleId}`);
      setSuccessMsg(response.data?.message || `Schedule on ${travelDate} deleted successfully`);
      await Promise.all([fetchSchedules(), fetchStats()]);
    } catch (err: any) {
      console.error('Delete schedule error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to delete schedule');
    }
  };

  const handleRemoveRouteService = async (busId: number, routeId: number, busName: string, routeName: string) => {
    setError('');
    setSuccessMsg('');

    try {
      const response = await api.post('/company/schedules/remove-route-service', {
        bus_id: busId,
        route_id: routeId,
      });
      setSuccessMsg(response.data?.message || `Successfully removed ${busName} from route ${routeName}`);
      await Promise.all([fetchSchedules(), fetchStats()]);
    } catch (err: any) {
      console.error('Remove route service error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to remove route service');
    }
  };

  const handleLogout = () => {
    logout();
  };

  const handleViewSeatsFromSchedule = async (scheduleId: number) => {
    const id = String(scheduleId);
    setSelectedScheduleId(id);
    setActiveTab('seats');
    setError('');

    setIsLoading(true);
    try {
      const response = await api.get('/company/seat-status', {
        params: { schedule_id: id },
      });
      setSeatStatus(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load seat status');
    } finally {
      setIsLoading(false);
    }
  };

  const renderSeatLayout = () => {
    const lowerSeats = sortedSeatStatus.filter((seat) => seat.deck === 'lower').slice(0, 30);
    const rows: SeatStatus[][] = [];

    for (let index = 0; index < lowerSeats.length; index += 4) {
      rows.push(lowerSeats.slice(index, index + 4));
    }

    if (!rows.length) {
      return <div className="text-slate-500">No seats found for this schedule.</div>;
    }

    const getSeatClass = (status: SeatStatus['status']) => {
      if (status === 'booked') {
        return 'bg-rose-500/20 border-rose-400/40 text-rose-100';
      }
      if (status === 'held') {
        return 'bg-amber-500/20 border-amber-400/40 text-amber-100';
      }
      return 'bg-emerald-500/20 border-emerald-400/40 text-emerald-100';
    };

    return (
      <div className="space-y-3">
        <div className="bg-slate-950 rounded-t-3xl p-4 text-center border border-slate-800">
          <div className="w-16 h-16 bg-slate-800 rounded-full mx-auto flex items-center justify-center text-2xl">🚌</div>
          <div className="text-slate-400 text-xs font-bold mt-2">DRIVER</div>
        </div>

        <div className="text-center py-2 bg-slate-950 rounded-xl border border-slate-800">
          <span className="text-xs font-bold text-slate-500">ENTRANCE</span>
        </div>

        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex gap-3 justify-center">
            <div className="flex gap-2">
              {row.slice(0, 2).map((seat) => (
                <div
                  key={seat.seat_number}
                  className={`w-12 h-12 rounded-xl border-2 font-bold text-xs flex items-center justify-center ${getSeatClass(seat.status)}`}
                  title={seat.booking_info ? `${seat.booking_info.passenger_name} (${seat.booking_info.pnr})` : seat.status}
                >
                  {seat.seat_number}
                </div>
              ))}
            </div>

            <div className="w-8 flex items-center justify-center">
              <div className="h-1 w-full bg-slate-700 rounded" />
            </div>

            <div className="flex gap-2">
              {row.slice(2, 4).map((seat) => (
                <div
                  key={seat.seat_number}
                  className={`w-12 h-12 rounded-xl border-2 font-bold text-xs flex items-center justify-center ${getSeatClass(seat.status)}`}
                  title={seat.booking_info ? `${seat.booking_info.passenger_name} (${seat.booking_info.pnr})` : seat.status}
                >
                  {seat.seat_number}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const companyTitle = company ? company.name : 'Company Owner Portal';

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-400">Bus Owner Portal</p>
            <h1 className="text-2xl font-semibold mt-1">{companyTitle}</h1>
            <p className="text-sm text-slate-400">Manage only your own buses, schedules, and bookings.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-sm font-medium">{company?.email}</div>
              <div className="text-xs text-slate-500">Company-level access</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-rose-200 flex items-center justify-between">
            <span>❌ {error}</span>
            <button type="button" onClick={() => setError('')} className="text-rose-400 font-bold ml-2">✕</button>
          </div>
        )}

        {successMsg && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-emerald-200 flex items-center justify-between">
            <span>✅ {successMsg}</span>
            <button type="button" onClick={() => setSuccessMsg('')} className="text-emerald-400 font-bold ml-2">✕</button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {['overview', 'buses', 'schedules', 'bookings', 'seats', 'my-requests'].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab as typeof activeTab)}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {tab === 'my-requests' ? 'My Requests 📩' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total Buses', value: stats?.totalBuses ?? 0 },
              { label: 'Total Bookings', value: stats?.totalBookings ?? 0 },
              { label: 'Today Bookings', value: stats?.todayBookings ?? 0 },
              { label: 'Revenue', value: `₹${stats?.totalRevenue ?? 0}` },
            ].map((card) => (
              <div key={card.label} className="rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl shadow-slate-950/20">
                <div className="text-sm text-slate-400">{card.label}</div>
                <div className="mt-3 text-3xl font-semibold">{card.value}</div>
              </div>
            ))}

            <div className="md:col-span-2 xl:col-span-4 rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 to-slate-900 p-6">
              <h2 className="text-lg font-semibold">What this portal controls</h2>
              <p className="mt-2 text-sm text-slate-300 max-w-3xl">
                This portal is isolated per company. Each company owner can add, edit, and delete only their own buses,
                create schedules for platform routes, inspect bookings, and review seat occupancy for their fleet.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'buses' && (
          <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <form onSubmit={handleBusSubmit} className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">{editingBusId ? 'Edit Bus' : 'Add Bus'}</h2>
                <p className="text-sm text-slate-400">Bus number, name, and type are required.</p>
              </div>

              <label className="block text-sm">
                <span className="text-slate-400">Bus Number</span>
                <input
                  value={busForm.bus_number}
                  onChange={(e) => setBusForm({ ...busForm, bus_number: e.target.value })}
                  disabled={editingBusId !== null}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 disabled:opacity-60"
                  placeholder="TS07AB5678"
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="text-slate-400">Bus Name</span>
                <input
                  value={busForm.bus_name}
                  onChange={(e) => setBusForm({ ...busForm, bus_name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  placeholder="Orange Express"
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="text-slate-400 font-medium">Bus Manufacturer / Brand</span>
                <select
                  value={busForm.bus_type}
                  onChange={(e) => setBusForm({ ...busForm, bus_type: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {busBrands.map((brand) => (
                    <option key={brand} value={brand}>
                      {brand}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-slate-400">Total Seats</span>
                <input
                  type="number"
                  min={1}
                  value={busForm.total_seats}
                  onChange={(e) => setBusForm({ ...busForm, total_seats: Number(e.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
              </label>

              <div className="block text-sm">
                <span className="text-slate-400 font-medium">Comfort Class & Seating Layout (Select One)</span>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {[
                    { key: 'ac_sleeper', label: 'A/C Sleeper (2+1)', icon: '❄️ 🛏️', has_ac: true, is_sleeper: true },
                    { key: 'ac_seating', label: 'A/C Seater (2+2)', icon: '❄️ 💺', has_ac: true, is_sleeper: false },
                    { key: 'nonac_sleeper', label: 'Non-A/C Sleeper (2+1)', icon: '🍃 🛏️', has_ac: false, is_sleeper: true },
                    { key: 'nonac_seating', label: 'Non-A/C Seater (2+2)', icon: '🍃 💺', has_ac: false, is_sleeper: false },
                  ].map((cat) => {
                    const isSelected = busForm.has_ac === cat.has_ac && busForm.is_sleeper === cat.is_sleeper;
                    return (
                      <label
                        key={cat.key}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300 font-semibold shadow-sm'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="busCategory"
                          value={cat.key}
                          checked={isSelected}
                          onChange={() => setBusForm({ ...busForm, has_ac: cat.has_ac, is_sleeper: cat.is_sleeper })}
                          className="accent-cyan-500"
                        />
                        <span className="text-xs font-medium">{cat.icon} {cat.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button type="submit" className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
                  {editingBusId ? 'Update Bus' : 'Create Bus'}
                </button>
                {editingBusId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBusId(null);
                      setBusForm(emptyBusForm);
                    }}
                    className="rounded-xl border border-slate-700 px-4 py-3 font-medium"
                  >
                    Reset
                  </button>
                )}
              </div>
            </form>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Your Fleet</h2>
                  <p className="text-sm text-slate-400">Only buses under your company account are shown here.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void fetchBuses()}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-sm"
                >
                  Refresh
                </button>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {buses.map((bus) => (
                  <div key={bus.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{bus.bus_name}</div>
                        <div className="text-sm text-slate-400">{bus.bus_number}</div>
                      </div>
                      <span className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-300">
                        {bus.bus_type}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400">
                      Seats: {bus.total_seats} · {bus.has_ac ? 'AC' : 'Non-AC'} · {bus.is_sleeper ? 'Sleeper' : 'Seating'}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setScheduleForm((prev) => ({ ...prev, bus_id: String(bus.id) }));
                          setActiveTab('schedules');
                        }}
                        className="rounded-xl border border-cyan-500/50 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-300 hover:bg-cyan-500/20 font-semibold"
                      >
                        + Add Schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditBus(bus)}
                        className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteBus(bus.id)}
                        className="rounded-xl border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}

                {!buses.length && <div className="text-slate-500">No buses found for this company.</div>}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedules' && (
          <div className="space-y-6">
            {/* Interactive Visual Schedule Guide */}
            <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 p-6 shadow-2xl">
              <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                  <span className="px-3 py-1 bg-cyan-400 text-slate-950 text-xs font-extrabold rounded-full uppercase tracking-wider">
                    Quick Schedule Guide
                  </span>
                  <h2 className="text-xl font-bold mt-2 text-white">How to Add Schedules to Buses 🗓️</h2>
                  <p className="text-slate-300 text-sm mt-1">Easily publish single-date departures, custom date calendars, or 30-day auto-rolling daily services.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-xs mb-2">1</div>
                  <div className="font-semibold text-sm text-cyan-300">Select Route & Bus</div>
                  <div className="text-xs text-slate-400 mt-1">Pick your target bus and the source to destination city route.</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-xs mb-2">2</div>
                  <div className="font-semibold text-sm text-cyan-300">Choose Timings & Price</div>
                  <div className="text-xs text-slate-400 mt-1">Set departure & arrival times and specify the base ticket fare (₹).</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-xs mb-2">3</div>
                  <div className="font-semibold text-sm text-cyan-300">Select Frequency Mode</div>
                  <div className="text-xs text-slate-400 mt-1">Pick Single Date, Multi-Date Calendar, or Daily Auto-Rolling Service.</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-400 text-slate-950 font-black flex items-center justify-center text-xs mb-2">4</div>
                  <div className="font-semibold text-sm text-cyan-300">Publish Schedule</div>
                  <div className="text-xs text-slate-400 mt-1">Click Save Schedule to generate live seats on the passenger booking app!</div>
                </div>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
            <form onSubmit={handleScheduleSubmit} className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold">Add Schedule</h2>
                <p className="text-sm text-slate-400">Pick one of the platform routes and one of your buses.</p>
              </div>

              <label className="block text-sm">
                <span className="text-slate-400">Route</span>
                <select
                  value={scheduleForm.route_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, route_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  required
                >
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.from_city} → {route.to_city}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm">
                <span className="text-slate-400">Bus</span>
                <select
                  value={scheduleForm.bus_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, bus_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  required
                >
                  {selectedBusOptions.map((bus) => (
                    <option key={bus.id} value={bus.id}>
                      {bus.bus_number} · {bus.bus_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="block text-sm">
                <span className="text-slate-400">Scheduling Mode</span>
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-950 p-1.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => setScheduleMode('single')}
                    className={`py-2 px-2 rounded-lg text-center text-xs font-medium transition-all ${
                      scheduleMode === 'single'
                        ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single Date
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('calendar')}
                    className={`py-2 px-2 rounded-lg text-center text-xs font-medium transition-all ${
                      scheduleMode === 'calendar'
                        ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Multi Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('daily')}
                    className={`py-2 px-2 rounded-lg text-center text-xs font-medium transition-all ${
                      scheduleMode === 'daily'
                        ? 'bg-gradient-to-r from-cyan-500 to-cyan-400 text-slate-950 font-bold shadow-md'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Daily Run 🚌
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleMode('daily30')}
                    className={`py-2 px-2 rounded-lg text-center text-xs font-medium transition-all ${
                      scheduleMode === 'daily30'
                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-400 text-slate-950 font-bold shadow-md'
                        : 'text-emerald-400 hover:text-emerald-300'
                    }`}
                  >
                    Daily Service 30D ⭐
                  </button>
                </div>
              </div>

              {scheduleMode === 'single' && (
                <label className="block text-sm">
                  <span className="text-slate-400">Travel Date</span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {scheduleDateShortcuts.map((shortcut) => (
                      <button
                        key={shortcut.label}
                        type="button"
                        onClick={() => applyScheduleDateShortcut(shortcut.offset)}
                        className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
                      >
                        {shortcut.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => travelDateInputRef.current?.showPicker?.()}
                      className="rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-200 hover:bg-cyan-500/20"
                    >
                      Open calendar
                    </button>
                  </div>
                  <input
                    type="date"
                    ref={travelDateInputRef}
                    value={scheduleForm.travel_date}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, travel_date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                    required={scheduleMode === 'single'}
                  />
                </label>
              )}

              {scheduleMode === 'calendar' && (
                <div className="space-y-3 border border-slate-800 bg-slate-950/70 p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Select Dates from Calendar
                    </span>
                    <span className="text-xs font-semibold text-cyan-400 bg-cyan-400/10 px-2.5 py-1 rounded-full border border-cyan-500/20">
                      {selectedCalendarDates.size} dates selected
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 py-1">
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('7days')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                    >
                      + Next 7 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('15days')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                    >
                      + Next 15 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('30days')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                    >
                      + Next 30 Days
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('weekdays')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                    >
                      Mon-Fri
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('weekends')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white transition-all"
                    >
                      Sat-Sun
                    </button>
                    <button
                      type="button"
                      onClick={() => selectCalendarPreset('clear')}
                      className="px-2.5 py-1 text-xs rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition-all"
                    >
                      Clear
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1.5 max-h-[220px] overflow-y-auto pr-1 pt-1">
                    {upcomingDaysList.map((day) => {
                      const isSelected = selectedCalendarDates.has(day.dateStr);
                      return (
                        <button
                          key={day.dateStr}
                          type="button"
                          onClick={() => toggleCalendarDate(day.dateStr)}
                          className={`p-2 rounded-xl text-center flex flex-col items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-cyan-500 text-slate-950 font-bold border-2 border-cyan-300 shadow-lg shadow-cyan-500/20 scale-95'
                              : 'bg-slate-900 border border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          <span className={`text-[10px] uppercase font-bold ${isSelected ? 'text-slate-950' : 'text-slate-500'}`}>
                            {day.dayName}
                          </span>
                          <span className="text-sm font-extrabold my-0.5">{day.dayNum}</span>
                          <span className={`text-[9px] ${isSelected ? 'text-slate-900 font-semibold' : 'text-slate-500'}`}>
                            {day.monthName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-cyan-400 mt-2 italic leading-relaxed">
                    ✨ Click any date card to toggle selection. Schedules for all highlighted dates will be created automatically.
                  </p>
                </div>
              )}

              {scheduleMode === 'daily' && (
                <div className="space-y-4 border border-slate-800 bg-slate-950/70 p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                      Daily Run (Recurring Setup)
                    </span>
                    <span className="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                      🚌 {generatedDailyDates.length} Runs Planned
                    </span>
                  </div>

                  <div className="space-y-3">
                    <label className="block text-xs">
                      <span className="text-slate-400">Start Date</span>
                      <input
                        type="date"
                        value={dailyStartDate}
                        onChange={(e) => setDailyStartDate(e.target.value)}
                        className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
                        required={scheduleMode === 'daily'}
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block text-xs">
                        <span className="text-slate-400">Duration Period</span>
                        <select
                          value={dailyDurationDays}
                          onChange={(e) => setDailyDurationDays(Number(e.target.value))}
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                        >
                          <option value={7}>Next 7 Days</option>
                          <option value={15}>Next 15 Days</option>
                          <option value={30}>Next 30 Days (1 Month)</option>
                        </select>
                      </label>

                      <label className="block text-xs">
                        <span className="text-slate-400">Run Frequency</span>
                        <select
                          value={dailyPattern}
                          onChange={(e) => setDailyPattern(e.target.value as any)}
                          className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-100"
                        >
                          <option value="everyday">Everyday (Daily)</option>
                          <option value="weekdays">Weekdays Only (Mon-Fri)</option>
                          <option value="weekends">Weekends Only (Sat-Sun)</option>
                          <option value="alternate">Alternate Days (1 day gap)</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 space-y-2">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Generated Run Dates Preview:</span>
                    <div className="flex flex-wrap gap-1.5 max-h-[90px] overflow-y-auto pr-1">
                      {generatedDailyDates.map((dateStr) => (
                        <span key={dateStr} className="text-[11px] bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 px-2 py-0.5 rounded-full">
                          {dateStr}
                        </span>
                      ))}
                    </div>
                  </div>

                  <p className="text-[11px] text-emerald-400 italic leading-relaxed">
                    🚀 Daily Run feature will automatically create {generatedDailyDates.length} recurring schedules for your fleet bus.
                  </p>
                </div>
              )}

              {scheduleMode === 'daily30' && (
                <div className="space-y-4 border border-emerald-500/30 bg-emerald-500/5 p-4 rounded-2xl">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-300 uppercase tracking-wider">
                      ⭐ Daily Service Mode (Rolling 30-Day Window)
                    </span>
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-400/20 px-3 py-1 rounded-full border border-emerald-400/30">
                      30 Schedules Auto-Generated
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    This bus will run <strong>every day continuously for the 30-day window</strong>. When today ends, today's schedule and past bookings are automatically deleted, and Day 31 is added automatically to maintain an exact 30-day seat booking window!
                  </p>

                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      30-Day Seat Booking Window Preview ({getLocalDateString(0)} → {getLocalDateString(29)}):
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-[100px] overflow-y-auto pr-1 pt-1">
                      {Array.from({ length: 30 }, (_, i) => getLocalDateString(i)).map((dateStr, idx) => (
                        <span key={dateStr} className="text-[11px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                          Day {idx + 1}: {dateStr}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="text-slate-400">Departure</span>
                  <div className="mt-1 grid grid-cols-[1fr_1fr_90px] gap-2">
                    <select
                      value={departureTimeForm.hour}
                      onChange={(e) => setDepartureTimeForm({ ...departureTimeForm, hour: e.target.value })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Departure hour"
                    >
                      {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((hour) => (
                        <option key={hour} value={hour}>{hour}</option>
                      ))}
                    </select>
                    <select
                      value={departureTimeForm.minute}
                      onChange={(e) => setDepartureTimeForm({ ...departureTimeForm, minute: e.target.value })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Departure minute"
                    >
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((minute) => (
                        <option key={minute} value={minute}>{minute}</option>
                      ))}
                    </select>
                    <select
                      value={departureTimeForm.period}
                      onChange={(e) => setDepartureTimeForm({ ...departureTimeForm, period: e.target.value as TimePeriod })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Departure period"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </label>
                <label className="block text-sm">
                  <span className="text-slate-400">Arrival</span>
                  <div className="mt-1 grid grid-cols-[1fr_1fr_90px] gap-2">
                    <select
                      value={arrivalTimeForm.hour}
                      onChange={(e) => setArrivalTimeForm({ ...arrivalTimeForm, hour: e.target.value })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Arrival hour"
                    >
                      {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0')).map((hour) => (
                        <option key={hour} value={hour}>{hour}</option>
                      ))}
                    </select>
                    <select
                      value={arrivalTimeForm.minute}
                      onChange={(e) => setArrivalTimeForm({ ...arrivalTimeForm, minute: e.target.value })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Arrival minute"
                    >
                      {['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'].map((minute) => (
                        <option key={minute} value={minute}>{minute}</option>
                      ))}
                    </select>
                    <select
                      value={arrivalTimeForm.period}
                      onChange={(e) => setArrivalTimeForm({ ...arrivalTimeForm, period: e.target.value as TimePeriod })}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-3"
                      aria-label="Arrival period"
                    >
                      <option value="AM">AM</option>
                      <option value="PM">PM</option>
                    </select>
                  </div>
                </label>
              </div>

              <label className="block text-sm">
                <span className="text-slate-400">Base Price</span>
                <input
                  type="number"
                  min={1}
                  value={scheduleForm.base_price}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, base_price: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                  required
                />
              </label>

              <button type="submit" className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950">
                Create Schedule
              </button>
            </form>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <select
                  value={scheduleFilterRoute}
                  onChange={(e) => setScheduleFilterRoute(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  <option value="">All routes</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.from_city} → {route.to_city}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={scheduleFilterDate}
                  onChange={(e) => setScheduleFilterDate(e.target.value)}
                  className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                />
                <button
                  type="button"
                  onClick={async () => {
                    await fetchSchedules();
                    if (selectedScheduleId) {
                      await fetchSeatStatus();
                    }
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-3 text-sm"
                >
                  Refresh Schedules
                </button>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {schedules.map((schedule) => (
                  <div key={schedule.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-5 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold flex items-center gap-2">
                        <span>{schedule.from_city} → {schedule.to_city}</span>
                        {schedule.is_daily_service === 1 && (
                          <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded-full font-semibold">
                            ⭐ Daily Service (30D)
                          </span>
                        )}
                      </div>
                      <div className="text-xs rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-300">
                        {schedule.travel_date}
                      </div>
                    </div>
                    <div className="text-sm text-slate-400">
                      {schedule.bus_number} · {schedule.bus_name} · {schedule.bus_type}
                    </div>
                    <div className="text-sm text-slate-400">
                      {schedule.departure_time} to {schedule.arrival_time} · ₹{schedule.base_price} · {schedule.available_seats}/{schedule.total_seats} seats left
                    </div>
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => void handleViewSeatsFromSchedule(schedule.id)}
                        className="rounded-xl border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-xs text-slate-200 transition-all font-medium"
                      >
                        View Seats
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteSchedule(schedule.id, schedule.travel_date)}
                        className="rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-3 py-1.5 text-xs text-rose-300 transition-all font-medium"
                        title="Delete schedule on this specific date"
                      >
                        🗑️ Delete Date Schedule
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRemoveRouteService(Number(schedule.bus_id), Number(schedule.route_id), schedule.bus_name, `${schedule.from_city} → ${schedule.to_city}`)}
                        className="rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 px-3 py-1.5 text-xs text-amber-300 transition-all font-medium"
                        title="Permanently remove all schedules for this bus on this route"
                      >
                        🚫 Stop Route Service
                      </button>
                    </div>
                  </div>
                ))}

                {!schedules.length && <div className="text-slate-500">No schedules found for the selected filters.</div>}
              </div>
            </div>
          </div>
        </div>
        )}

        {activeTab === 'bookings' && (
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4 overflow-x-auto">
            <div className="grid gap-4 md:grid-cols-3">
              <select
                value={bookingFilterRoute}
                onChange={(e) => setBookingFilterRoute(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                <option value="">All routes</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.from_city} → {route.to_city}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={bookingFilterDate}
                onChange={(e) => setBookingFilterDate(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              />
              <select
                value={bookingFilterBus}
                onChange={(e) => setBookingFilterBus(e.target.value)}
                className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
              >
                <option value="">All buses</option>
                {buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.bus_number} · {bus.bus_name}
                  </option>
                ))}
              </select>
            </div>

            <table className="min-w-full text-sm">
              <thead className="text-slate-400">
                <tr className="border-b border-slate-800">
                  <th className="py-3 text-left font-medium">PNR</th>
                  <th className="py-3 text-left font-medium">Passenger</th>
                  <th className="py-3 text-left font-medium">Route</th>
                  <th className="py-3 text-left font-medium">Bus</th>
                  <th className="py-3 text-left font-medium">Seats</th>
                  <th className="py-3 text-left font-medium">Status</th>
                  <th className="py-3 text-left font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-slate-800/70">
                    <td className="py-3">{booking.pnr}</td>
                    <td className="py-3">
                      <div className="font-medium text-slate-100">{booking.passenger_name}</div>
                      <div className="text-xs text-slate-500">{booking.email}</div>
                    </td>
                    <td className="py-3">
                      {booking.from_city} → {booking.to_city}
                      <div className="text-xs text-slate-500">{booking.travel_date} · {booking.departure_time}</div>
                    </td>
                    <td className="py-3">{booking.bus_number}</td>
                    <td className="py-3">{booking.seat_numbers}</td>
                    <td className="py-3">{booking.booking_status}</td>
                    <td className="py-3">₹{booking.total_price}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {!bookings.length && <div className="text-slate-500">No bookings found.</div>}
          </div>
        )}

        {activeTab === 'seats' && (
          <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 space-y-4">
              <h2 className="text-lg font-semibold">Seat Occupancy</h2>
              <label className="block text-sm">
                <span className="text-slate-400">Schedule</span>
                <select
                  value={selectedScheduleId}
                  onChange={(e) => setSelectedScheduleId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"
                >
                  {schedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.bus_number} · {schedule.from_city} → {schedule.to_city} · {schedule.travel_date}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => void fetchSeatStatus()}
                className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950"
              >
                Load Seats
              </button>
              <p className="text-sm text-slate-400">
                This view shows which seats are booked for the selected company bus schedule.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
              <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-slate-300">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-400" /> Available</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-400" /> Booked</div>
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded bg-amber-400" /> Held</div>
              </div>

              {renderSeatLayout()}

              {!!sortedSeatStatus.filter((seat) => seat.status === 'booked').length && (
                <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {sortedSeatStatus
                    .filter((seat) => seat.status === 'booked' && seat.booking_info)
                    .map((seat) => (
                      <div key={`${seat.seat_number}-booking`} className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-xs">
                        <div className="font-semibold text-rose-100">{seat.seat_number}</div>
                        <div className="text-slate-300">{seat.booking_info?.passenger_name}</div>
                        <div className="text-slate-400">PNR: {seat.booking_info?.pnr}</div>
                      </div>
                    ))}
                </div>
              )}

              {!seatStatus.length && <div className="text-slate-500">Select a schedule and load seats.</div>}
            </div>
          </div>
        )}

        {activeTab === 'my-requests' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-6">
              <div>
                <h2 className="text-xl font-bold text-slate-100">My Requests</h2>
                <p className="text-sm text-slate-400">Request new places or routes from the Platform Owner and track their approval status</p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowPlaceReqModal(true)}
                  className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-sm transition-all shadow"
                >
                  ➕ Request New Place
                </button>
                <button
                  type="button"
                  onClick={() => setShowRouteReqModal(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm transition-all shadow"
                >
                  🛣️ Request New Route
                </button>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 border-b border-slate-800 pb-3">
              <button
                type="button"
                onClick={() => setRequestTab('places')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  requestTab === 'places' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Place Requests ({myPlaceRequests.length})
              </button>
              <button
                type="button"
                onClick={() => setRequestTab('routes')}
                className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
                  requestTab === 'routes' ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Route Requests ({myRouteRequests.length})
              </button>
            </div>

            {/* Places Requests Table */}
            {requestTab === 'places' && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 overflow-x-auto">
                {myPlaceRequests.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">No place requests submitted yet. Click "Request New Place" above.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3 text-left font-medium">Place Name</th>
                        <th className="py-3 text-left font-medium">State & District</th>
                        <th className="py-3 text-left font-medium">Bus Station / Reason</th>
                        <th className="py-3 text-left font-medium">Status</th>
                        <th className="py-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myPlaceRequests.map((req) => (
                        <tr key={req.id} className="border-b border-slate-800/70">
                          <td className="py-3 font-semibold text-slate-100">{req.place_name}</td>
                          <td className="py-3 text-slate-300">{req.state} {req.district ? `(${req.district})` : ''}</td>
                          <td className="py-3 text-slate-400 text-xs max-w-xs">
                            {req.bus_station && <div>🚏 {req.bus_station}</div>}
                            {req.reason && <div className="italic">"{req.reason}"</div>}
                          </td>
                          <td className="py-3">
                            <span className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase ${
                              req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                              req.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                              'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            }`}>
                              {req.status}
                            </span>
                            {req.rejection_reason && <div className="text-xs text-rose-400 mt-1">Reason: {req.rejection_reason}</div>}
                          </td>
                          <td className="py-3 text-right">
                            {req.status === 'approved' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setShowRouteReqModal(true);
                                }}
                                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 font-semibold rounded-lg text-xs border border-cyan-500/40"
                              >
                                🛣️ Request Route
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Routes Requests Table */}
            {requestTab === 'routes' && (
              <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 overflow-x-auto">
                {myRouteRequests.length === 0 ? (
                  <div className="text-slate-500 text-center py-8">No route requests submitted yet. Click "Request New Route" above.</div>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="py-3 text-left font-medium">Route Connection</th>
                        <th className="py-3 text-left font-medium">Reason</th>
                        <th className="py-3 text-left font-medium">Status</th>
                        <th className="py-3 text-right font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {myRouteRequests.map((req) => (
                        <tr key={req.id} className="border-b border-slate-800/70">
                          <td className="py-3 font-semibold text-slate-100">
                            📍 {req.source_name || req.from_city || (req.source_place_id ? `City #${req.source_place_id}` : 'Source City')} <span className="text-cyan-400">→</span> 📍 {req.destination_name || req.to_city || (req.destination_place_id ? `City #${req.destination_place_id}` : 'Destination City')}
                          </td>
                          <td className="py-3 text-slate-400 text-xs max-w-xs">{req.reason || 'No reason provided'}</td>
                          <td className="py-3">
                            <span className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase ${
                              req.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                              req.status === 'rejected' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                              'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                            }`}>
                              {req.status}
                            </span>
                            {req.rejection_reason && <div className="text-xs text-rose-400 mt-1">Reason: {req.rejection_reason}</div>}
                          </td>
                          <td className="py-3 text-right">
                            {req.status === 'approved' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTab('schedules');
                                }}
                                className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-semibold rounded-lg text-xs border border-emerald-500/40"
                              >
                                🚌 Add Bus / Schedule
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        )}

        {/* MODAL: REQUEST NEW PLACE */}
        {showPlaceReqModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-100">Request New Place 📍</h3>
                <button type="button" onClick={() => setShowPlaceReqModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>

              <form onSubmit={handlePlaceRequestSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">City / Place Name *</label>
                  <input
                    type="text"
                    value={placeReqForm.place_name}
                    onChange={(e) => setPlaceReqForm({ ...placeReqForm, place_name: e.target.value })}
                    placeholder="e.g. Amalapuram"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-slate-100"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">State *</label>
                    <input
                      type="text"
                      value={placeReqForm.state}
                      onChange={(e) => setPlaceReqForm({ ...placeReqForm, state: e.target.value })}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">District</label>
                    <input
                      type="text"
                      value={placeReqForm.district}
                      onChange={(e) => setPlaceReqForm({ ...placeReqForm, district: e.target.value })}
                      placeholder="e.g. East Godavari"
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Bus Station / Landmark (Optional)</label>
                  <input
                    type="text"
                    value={placeReqForm.bus_station}
                    onChange={(e) => setPlaceReqForm({ ...placeReqForm, bus_station: e.target.value })}
                    placeholder="e.g. RTC Complex"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Request (Optional)</label>
                  <textarea
                    value={placeReqForm.reason}
                    onChange={(e) => setPlaceReqForm({ ...placeReqForm, reason: e.target.value })}
                    placeholder="Why should this place be added?"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPlaceReqModal(false)}
                    className="px-4 py-2 border border-slate-700 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs shadow"
                  >
                    Submit Place Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: REQUEST NEW ROUTE */}
        {showRouteReqModal && (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-slate-100">Request New Route 🛣️</h3>
                <button type="button" onClick={() => setShowRouteReqModal(false)} className="text-slate-400 hover:text-slate-200">✕</button>
              </div>

              <form onSubmit={handleRouteRequestSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Source Place *</label>
                  <select
                    value={routeReqForm.source_place_id}
                    onChange={(e) => setRouteReqForm({ ...routeReqForm, source_place_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    <option value="">-- Choose Source City --</option>
                    {placesArray.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.state})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Destination Place *</label>
                  <select
                    value={routeReqForm.destination_place_id}
                    onChange={(e) => setRouteReqForm({ ...routeReqForm, destination_place_id: e.target.value })}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    required
                  >
                    <option value="">-- Choose Destination City --</option>
                    {placesArray.map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.state})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Reason for Request (Optional)</label>
                  <textarea
                    value={routeReqForm.reason}
                    onChange={(e) => setRouteReqForm({ ...routeReqForm, reason: e.target.value })}
                    placeholder="e.g. High demand passenger route"
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                    rows={2}
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowRouteReqModal(false)}
                    className="px-4 py-2 border border-slate-700 rounded-xl text-xs text-slate-300 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs shadow"
                  >
                    Submit Route Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {isLoading && <div className="text-sm text-slate-500">Loading data...</div>}
      </div>
    </div>
  );
};

export default DashboardPage;