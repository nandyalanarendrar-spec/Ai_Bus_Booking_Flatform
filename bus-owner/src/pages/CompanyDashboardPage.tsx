import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

interface Bus {
  id: number;
  bus_number: string;
  bus_name: string;
  bus_type: string;
  has_ac: number;
  is_sleeper: number;
  total_seats: number;
  rating?: number;
}

interface Route {
  id: number;
  from_city: string;
  to_city: string;
  distance_km: number;
  duration_hours: number;
}

interface Place {
  id: number;
  name: string;
  state: string;
  code?: string;
}

interface PlaceRequest {
  id: number;
  place_name: string;
  state: string;
  district?: string;
  bus_station?: string;
  reason?: string;
  status: string;
  rejection_reason?: string;
  created_at: string;
}

interface RouteRequest {
  id: number;
  source_place_id: number;
  destination_place_id: number;
  source_name: string;
  destination_name: string;
  reason?: string;
  status: string;
  rejection_reason?: string;
  created_at: string;
}

interface Schedule {
  id: number;
  bus_id: number;
  route_id: number;
  bus_name: string;
  bus_number: string;
  from_city: string;
  to_city: string;
  departure_time: string;
  arrival_time: string;
  base_price: number;
  travel_date: string;
  available_seats: number;
  total_seats: number;
}

interface Booking {
  id: number;
  pnr: string;
  passenger_name: string;
  seat_numbers: string;
  total_price: number;
  booking_status: string;
  from_city: string;
  to_city: string;
  travel_date: string;
  departure_time: string;
  bus_number: string;
  bus_name: string;
  created_at: string;
}

const CompanyDashboardPage: React.FC = () => {
  const { company, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'buses' | 'schedules' | 'place-requests' | 'route-requests' | 'bookings' | 'seat-status'>('overview');

  // Stats & messages
  const [stats, setStats] = useState<any>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Data lists
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [myPlaceRequests, setMyPlaceRequests] = useState<PlaceRequest[]>([]);
  const [myRouteRequests, setMyRouteRequests] = useState<RouteRequest[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  // Modals
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [showPlaceReqModal, setShowPlaceReqModal] = useState(false);
  const [showRouteReqModal, setShowRouteReqModal] = useState(false);

  // Form states
  const [busForm, setBusForm] = useState({
    bus_number: '',
    bus_name: '',
    bus_type: 'AC Sleeper',
    has_ac: 1,
    is_sleeper: 1,
    total_seats: 30,
  });

  const [scheduleForm, setScheduleForm] = useState({
    bus_id: '',
    route_id: '',
    departure_time: '06:00',
    arrival_time: '12:00',
    base_price: 500,
    travel_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    is_daily_service: true,
  });

  const [placeReqForm, setPlaceReqForm] = useState({
    place_name: '',
    state: '',
    district: '',
    bus_station: '',
    reason: '',
  });

  const [routeReqForm, setRouteReqForm] = useState({
    source_place_id: '',
    destination_place_id: '',
    reason: '',
  });

  // Seat layout view state
  const [selectedScheduleId, setSelectedScheduleId] = useState<number | null>(null);
  const [seatLayout, setSeatLayout] = useState<any[]>([]);

  useEffect(() => {
    fetchStats();
    fetchBuses();
    fetchRoutes();
    fetchPlaces();
    fetchMyPlaceRequests();
    fetchMyRouteRequests();

    const interval = setInterval(() => {
      fetchMyPlaceRequests();
      fetchMyRouteRequests();
      fetchPlaces();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchStats();
    } else if (activeTab === 'buses') {
      fetchBuses();
    } else if (activeTab === 'schedules') {
      fetchSchedules();
    } else if (activeTab === 'place-requests') {
      fetchMyPlaceRequests();
    } else if (activeTab === 'route-requests') {
      fetchMyRouteRequests();
      fetchPlaces();
    } else if (activeTab === 'bookings') {
      fetchBookings();
    }
  }, [activeTab]);

  const clearMessages = () => {
    setError('');
    setSuccessMsg('');
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/company/dashboard/stats');
      setStats(res.data);
    } catch (err: any) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const fetchBuses = async () => {
    try {
      const res = await api.get('/company/buses');
      setBuses(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch buses:', err);
    }
  };

  const fetchRoutes = async () => {
    try {
      const res = await api.get('/company/routes');
      setRoutes(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch routes:', err);
    }
  };

  const fetchPlaces = async () => {
    try {
      const res = await api.get('/places');
      const data = res.data?.places || (Array.isArray(res.data) ? res.data : []);
      setPlaces(data);
    } catch (err: any) {
      console.error('Failed to fetch places:', err);
    }
  };

  const fetchMyPlaceRequests = async () => {
    try {
      const res = await api.get('/company/place-requests/my');
      setMyPlaceRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch place requests:', err);
    }
  };

  const fetchMyRouteRequests = async () => {
    try {
      const res = await api.get('/company/route-requests/my');
      setMyRouteRequests(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch route requests:', err);
    }
  };

  const fetchSchedules = async () => {
    try {
      const res = await api.get('/company/schedules');
      setSchedules(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch schedules:', err);
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await api.get('/company/bookings');
      setBookings(Array.isArray(res.data) ? res.data : []);
    } catch (err: any) {
      console.error('Failed to fetch bookings:', err);
    }
  };

  // Add Bus
  const handleAddBus = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    try {
      await api.post('/company/buses', busForm);
      setSuccessMsg('Bus added successfully!');
      setShowAddBusModal(false);
      setBusForm({ bus_number: '', bus_name: '', bus_type: 'AC Sleeper', has_ac: 1, is_sleeper: 1, total_seats: 30 });
      fetchBuses();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add bus');
    }
  };

  // Add Schedule
  const handleAddSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!scheduleForm.bus_id || !scheduleForm.route_id) {
      setError('Please select bus and route');
      return;
    }
    try {
      await api.post('/company/schedules', {
        bus_id: Number(scheduleForm.bus_id),
        route_id: Number(scheduleForm.route_id),
        departure_time: scheduleForm.departure_time,
        arrival_time: scheduleForm.arrival_time,
        base_price: Number(scheduleForm.base_price),
        dates: [scheduleForm.travel_date],
        is_daily_service: scheduleForm.is_daily_service ? 1 : 0,
      });
      setSuccessMsg('Schedule created successfully!');
      setShowAddScheduleModal(false);
      fetchSchedules();
      fetchStats();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create schedule');
    }
  };

  // Submit Place Request
  const handleSubmitPlaceReq = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!placeReqForm.place_name || !placeReqForm.state) {
      setError('Place name and state are required');
      return;
    }
    try {
      const res = await api.post('/company/place-requests', placeReqForm);
      setSuccessMsg(res.data.message || 'Place request submitted for Owner approval!');
      setShowPlaceReqModal(false);
      setPlaceReqForm({ place_name: '', state: '', district: '', bus_station: '', reason: '' });
      fetchMyPlaceRequests();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit place request');
    }
  };

  // Submit Route Request
  const handleSubmitRouteReq = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    if (!routeReqForm.source_place_id || !routeReqForm.destination_place_id) {
      setError('Source and destination places are required');
      return;
    }
    try {
      const res = await api.post('/company/route-requests', {
        source_place_id: Number(routeReqForm.source_place_id),
        destination_place_id: Number(routeReqForm.destination_place_id),
        reason: routeReqForm.reason,
      });
      setSuccessMsg(res.data.message || 'Route request submitted for Owner approval!');
      setShowRouteReqModal(false);
      setRouteReqForm({ source_place_id: '', destination_place_id: '', reason: '' });
      fetchMyRouteRequests();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to submit route request');
    }
  };

  const fetchSeatLayout = async (scheduleId: number) => {
    setSelectedScheduleId(scheduleId);
    try {
      const res = await api.get('/company/seat-status', { params: { schedule_id: scheduleId } });
      setSeatLayout(Array.isArray(res.data) ? res.data : (res.data?.seats || []));
      setActiveTab('seat-status');
    } catch (err: any) {
      console.error('Failed to fetch seat layout:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <span className="text-3xl">🚌</span>
            <div>
              <h1 className="text-xl font-bold text-white">{company?.name || 'Bus Owner Portal'}</h1>
              <p className="text-xs text-emerald-400">Verified Bus Operator Account</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition"
          >
            Logout 🚪
          </button>
        </div>
      </header>

      {/* Messages */}
      {(error || successMsg) && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          {error && (
            <div className="bg-rose-900/80 border border-rose-500 text-rose-200 px-4 py-3 rounded-lg flex justify-between items-center mb-2">
              <span>⚠️ {error}</span>
              <button onClick={() => setError('')} className="text-rose-300 font-bold">✕</button>
            </div>
          )}
          {successMsg && (
            <div className="bg-emerald-900/80 border border-emerald-500 text-emerald-200 px-4 py-3 rounded-lg flex justify-between items-center mb-2">
              <span>✅ {successMsg}</span>
              <button onClick={() => setSuccessMsg('')} className="text-emerald-300 font-bold">✕</button>
            </div>
          )}
        </div>
      )}

      {/* Navigation Tabs */}
      <nav className="bg-slate-800/50 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-2 overflow-x-auto py-2">
          {[
            { id: 'overview', label: '📊 Overview' },
            { id: 'buses', label: `🚌 My Buses (${buses.length})` },
            { id: 'schedules', label: `📅 Schedules (${schedules.length})` },
            { id: 'place-requests', label: `📍 Place Requests (${myPlaceRequests.length})` },
            { id: 'route-requests', label: `🛣️ Route Requests (${myRouteRequests.length})` },
            { id: 'bookings', label: `🎫 Bookings (${bookings.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => { clearMessages(); setActiveTab(tab.id as any); }}
              className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition ${
                activeTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white">Company Dashboard Overview</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
                <div className="text-3xl font-bold text-blue-400">{stats?.totalBuses || buses.length}</div>
                <div className="text-sm text-slate-400 mt-1">Total Buses Registered</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
                <div className="text-3xl font-bold text-emerald-400">{stats?.totalBookings || bookings.length}</div>
                <div className="text-sm text-slate-400 mt-1">Total Passenger Bookings</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
                <div className="text-3xl font-bold text-purple-400">{myRouteRequests.filter(r => r.status === 'approved').length}</div>
                <div className="text-sm text-slate-400 mt-1">Approved Routes</div>
              </div>
              <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
                <div className="text-3xl font-bold text-amber-400">₹{stats?.totalRevenue || 0}</div>
                <div className="text-sm text-slate-400 mt-1">Total Revenue</div>
              </div>
            </div>

            <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-4">Quick Actions</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => setShowAddBusModal(true)}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition"
                >
                  + Add New Bus
                </button>
                <button
                  onClick={() => setShowAddScheduleModal(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition"
                >
                  + Create Bus Schedule
                </button>
                <button
                  onClick={() => setShowPlaceReqModal(true)}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition"
                >
                  + Request New Place
                </button>
                <button
                  onClick={() => setShowRouteReqModal(true)}
                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold transition"
                >
                  + Request New Route
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BUSES TAB */}
        {activeTab === 'buses' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">My Fleet Buses ({buses.length})</h2>
              <button
                onClick={() => setShowAddBusModal(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
              >
                + Add New Bus
              </button>
            </div>

            {buses.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 p-12 rounded-xl text-center text-slate-400">
                No buses registered yet. Click "+ Add New Bus" above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {buses.map((bus) => (
                  <div key={bus.id} className="bg-slate-800 border border-slate-700 p-6 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-white">{bus.bus_name}</h3>
                        <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                          {bus.bus_number}
                        </span>
                      </div>
                      <span className="text-xs bg-blue-900/60 text-blue-300 px-2 py-1 rounded">
                        {bus.bus_type}
                      </span>
                    </div>
                    <div className="text-sm text-slate-300 space-y-1">
                      <div>Seats: <span className="font-bold text-white">{bus.total_seats}</span></div>
                      <div>Features: {bus.has_ac ? '❄️ AC' : 'Non-AC'} | {bus.is_sleeper ? '🛌 Sleeper' : '💺 Seater'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCHEDULES TAB */}
        {activeTab === 'schedules' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Bus Schedules ({schedules.length})</h2>
              <button
                onClick={() => setShowAddScheduleModal(true)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold"
              >
                + Create Schedule
              </button>
            </div>

            {schedules.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 p-12 rounded-xl text-center text-slate-400">
                No schedules created yet. Click "+ Create Schedule" above.
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-700/60 text-slate-200 uppercase text-xs">
                    <tr>
                      <th className="p-4">Bus & Route</th>
                      <th className="p-4">Date & Time</th>
                      <th className="p-4">Price</th>
                      <th className="p-4">Seats</th>
                      <th className="p-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {schedules.map((sch) => (
                      <tr key={sch.id} className="hover:bg-slate-750">
                        <td className="p-4">
                          <div className="font-bold text-white">{sch.bus_name} ({sch.bus_number})</div>
                          <div className="text-xs text-blue-400">{sch.from_city} → {sch.to_city}</div>
                        </td>
                        <td className="p-4">
                          <div>📅 {sch.travel_date}</div>
                          <div className="text-xs text-slate-400">⏰ {sch.departure_time} - {sch.arrival_time}</div>
                        </td>
                        <td className="p-4 font-bold text-emerald-400">₹{sch.base_price}</td>
                        <td className="p-4">{sch.available_seats} / {sch.total_seats} available</td>
                        <td className="p-4">
                          <button
                            onClick={() => fetchSeatLayout(sch.id)}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs rounded"
                          >
                            View Seats 💺
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* PLACE REQUESTS TAB */}
        {activeTab === 'place-requests' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Place Requests ({myPlaceRequests.length})</h2>
                <p className="text-xs text-slate-400 mt-1">New places requested for platform owner approval</p>
              </div>
              <button
                onClick={() => setShowPlaceReqModal(true)}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold"
              >
                + Request New Place
              </button>
            </div>

            {myPlaceRequests.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 p-12 rounded-xl text-center text-slate-400">
                No place requests submitted yet. Click "+ Request New Place" above.
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-700/60 text-slate-200 uppercase text-xs">
                    <tr>
                      <th className="p-4">Place Name</th>
                      <th className="p-4">State & District</th>
                      <th className="p-4">Station / Reason</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {myPlaceRequests.map((pr) => (
                      <tr key={pr.id}>
                        <td className="p-4 font-bold text-white">📍 {pr.place_name}</td>
                        <td className="p-4">{pr.state} {pr.district ? `(${pr.district})` : ''}</td>
                        <td className="p-4">{pr.bus_station || pr.reason || 'N/A'}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase ${
                            pr.status === 'approved' ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-500' :
                            pr.status === 'rejected' ? 'bg-rose-900/80 text-rose-300 border border-rose-500' :
                            'bg-amber-900/80 text-amber-300 border border-amber-500'
                          }`}>
                            {pr.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ROUTE REQUESTS TAB */}
        {activeTab === 'route-requests' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Route Requests ({myRouteRequests.length})</h2>
                <p className="text-xs text-slate-400 mt-1">Routes requested between platform places</p>
              </div>
              <button
                onClick={() => { fetchPlaces(); setShowRouteReqModal(true); }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-semibold"
              >
                + Request New Route
              </button>
            </div>

            {myRouteRequests.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 p-12 rounded-xl text-center text-slate-400">
                No route requests submitted yet. Click "+ Request New Route" above.
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-700/60 text-slate-200 uppercase text-xs">
                    <tr>
                      <th className="p-4">Requested Route</th>
                      <th className="p-4">Reason</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {myRouteRequests.map((rr) => (
                      <tr key={rr.id}>
                        <td className="p-4 font-bold text-white">
                          🛣️ {rr.source_name} → {rr.destination_name}
                        </td>
                        <td className="p-4 text-slate-400">{rr.reason || 'N/A'}</td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase ${
                            rr.status === 'approved' ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-500' :
                            rr.status === 'rejected' ? 'bg-rose-900/80 text-rose-300 border border-rose-500' :
                            'bg-amber-900/80 text-amber-300 border border-amber-500'
                          }`}>
                            {rr.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* BOOKINGS TAB */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Passenger Bookings ({bookings.length})</h2>
            {bookings.length === 0 ? (
              <div className="bg-slate-800 border border-slate-700 p-12 rounded-xl text-center text-slate-400">
                No passenger bookings found yet.
              </div>
            ) : (
              <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                <table className="w-full text-left text-sm text-slate-300">
                  <thead className="bg-slate-700/60 text-slate-200 uppercase text-xs">
                    <tr>
                      <th className="p-4">PNR & Passenger</th>
                      <th className="p-4">Route & Bus</th>
                      <th className="p-4">Seats</th>
                      <th className="p-4">Price</th>
                      <th className="p-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {bookings.map((b) => (
                      <tr key={b.id}>
                        <td className="p-4">
                          <div className="font-bold text-blue-400">PNR: {b.pnr}</div>
                          <div className="text-white font-medium">{b.passenger_name}</div>
                        </td>
                        <td className="p-4">
                          <div>{b.from_city} → {b.to_city}</div>
                          <div className="text-xs text-slate-400">{b.bus_name} ({b.bus_number})</div>
                        </td>
                        <td className="p-4 font-mono text-emerald-400">{b.seat_numbers}</td>
                        <td className="p-4 font-bold text-white">₹{b.total_price}</td>
                        <td className="p-4">
                          <span className="px-2.5 py-1 bg-emerald-900/80 text-emerald-300 rounded text-xs uppercase font-semibold">
                            {b.booking_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SEAT STATUS TAB */}
        {activeTab === 'seat-status' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Schedule Seat Layout</h2>
              <button
                onClick={() => setActiveTab('schedules')}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded text-sm"
              >
                ← Back to Schedules
              </button>
            </div>
            <div className="bg-slate-800 border border-slate-700 p-6 rounded-xl">
              <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-10 gap-3">
                {seatLayout.map((seat: any, i: number) => (
                  <div
                    key={i}
                    className={`p-3 rounded-lg border text-center font-bold text-xs ${
                      seat.status === 'booked'
                        ? 'bg-rose-900/80 border-rose-500 text-rose-200'
                        : seat.status === 'held'
                        ? 'bg-amber-900/80 border-amber-500 text-amber-200'
                        : 'bg-emerald-900/80 border-emerald-500 text-emerald-200'
                    }`}
                  >
                    <div>{seat.seat_number || `S${i+1}`}</div>
                    <div className="text-[10px] capitalize opacity-80">{seat.status}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* MODAL: Add Bus */}
      {showAddBusModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Add New Bus</h3>
            <form onSubmit={handleAddBus} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bus Number (Registration) *</label>
                <input
                  type="text"
                  placeholder="e.g. AP 09 TS 1234"
                  value={busForm.bus_number}
                  onChange={(e) => setBusForm({ ...busForm, bus_number: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bus Name / Service Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Morning Express Sleeper"
                  value={busForm.bus_name}
                  onChange={(e) => setBusForm({ ...busForm, bus_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bus Type</label>
                <select
                  value={busForm.bus_type}
                  onChange={(e) => setBusForm({ ...busForm, bus_type: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                >
                  <option value="AC Sleeper">AC Sleeper</option>
                  <option value="Non-AC Sleeper">Non-AC Sleeper</option>
                  <option value="AC Seater">AC Seater</option>
                  <option value="Non-AC Seater">Non-AC Seater</option>
                  <option value="Volvo Multi-Axle">Volvo Multi-Axle</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Total Seats</label>
                <input
                  type="number"
                  value={busForm.total_seats}
                  onChange={(e) => setBusForm({ ...busForm, total_seats: Number(e.target.value) })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  min={10}
                  max={60}
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddBusModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded text-sm"
                >
                  Save Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Create Schedule */}
      {showAddScheduleModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Create Bus Schedule</h3>
            <form onSubmit={handleAddSchedule} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Bus *</label>
                <select
                  value={scheduleForm.bus_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, bus_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  required
                >
                  <option value="">-- Choose Bus --</option>
                  {buses.map((b) => (
                    <option key={b.id} value={b.id}>{b.bus_name} ({b.bus_number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Select Route *</label>
                <select
                  value={scheduleForm.route_id}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, route_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  required
                >
                  <option value="">-- Choose Route --</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>{r.from_city} → {r.to_city}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Departure Time</label>
                  <input
                    type="time"
                    value={scheduleForm.departure_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, departure_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Arrival Time</label>
                  <input
                    type="time"
                    value={scheduleForm.arrival_time}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, arrival_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Base Ticket Price (₹)</label>
                  <input
                    type="number"
                    value={scheduleForm.base_price}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, base_price: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={scheduleForm.travel_date}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, travel_date: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="daily_svc"
                  checked={scheduleForm.is_daily_service}
                  onChange={(e) => setScheduleForm({ ...scheduleForm, is_daily_service: e.target.checked })}
                  className="rounded bg-slate-900 border-slate-700 text-blue-600"
                />
                <label htmlFor="daily_svc" className="text-xs text-slate-300">Repeat daily for 30 days window</label>
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddScheduleModal(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-sm"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Place */}
      {showPlaceReqModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">Request New Place / City</h3>
            <p className="text-xs text-slate-400 mb-4">Submit a missing city for Platform Owner approval.</p>
            <form onSubmit={handleSubmitPlaceReq} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Place Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Vijayawada"
                  value={placeReqForm.place_name}
                  onChange={(e) => setPlaceReqForm({ ...placeReqForm, place_name: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">State *</label>
                  <input
                    type="text"
                    placeholder="e.g. Andhra Pradesh"
                    value={placeReqForm.state}
                    onChange={(e) => setPlaceReqForm({ ...placeReqForm, state: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">District</label>
                  <input
                    type="text"
                    placeholder="e.g. NTR District"
                    value={placeReqForm.district}
                    onChange={(e) => setPlaceReqForm({ ...placeReqForm, district: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Bus Station / Landmark</label>
                <input
                  type="text"
                  placeholder="e.g. Pandit Nehru Bus Station"
                  value={placeReqForm.bus_station}
                  onChange={(e) => setPlaceReqForm({ ...placeReqForm, bus_station: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason for Request</label>
                <textarea
                  placeholder="Why is this place required for your routes?"
                  value={placeReqForm.reason}
                  onChange={(e) => setPlaceReqForm({ ...placeReqForm, reason: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded h-20 text-xs"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPlaceReqModal(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded text-sm"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Request Route */}
      {showRouteReqModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-2">Request New Route</h3>
            <p className="text-xs text-slate-400 mb-4">Request a route between approved platform places.</p>
            <form onSubmit={handleSubmitRouteReq} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Source Place (Origin) *</label>
                <select
                  value={routeReqForm.source_place_id}
                  onChange={(e) => setRouteReqForm({ ...routeReqForm, source_place_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  required
                >
                  <option value="">-- Choose Origin Place --</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>📍 {p.name} ({p.state})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Destination Place *</label>
                <select
                  value={routeReqForm.destination_place_id}
                  onChange={(e) => setRouteReqForm({ ...routeReqForm, destination_place_id: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded"
                  required
                >
                  <option value="">-- Choose Destination Place --</option>
                  {places.map((p) => (
                    <option key={p.id} value={p.id}>📍 {p.name} ({p.state})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Reason / Expected Demand</label>
                <textarea
                  placeholder="Detail demand for this route..."
                  value={routeReqForm.reason}
                  onChange={(e) => setRouteReqForm({ ...routeReqForm, reason: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-700 text-white px-3 py-2 rounded h-20 text-xs"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowRouteReqModal(false)}
                  className="px-4 py-2 bg-slate-700 text-slate-300 rounded text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded text-sm"
                >
                  Submit Route Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyDashboardPage;
