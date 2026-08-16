import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTo12Hour } from '../utils/timeFormat';

interface Bus {
  id: number;
  bus_id?: number;
  route_id?: number;
  bus_name: string;
  bus_type: string;
  operator: string;
  has_ac: number;
  is_sleeper: number;
  rating: number;
  departure_time: string;
  arrival_time: string;
  base_price: number;
  available_seats: number;
  duration_hours: number;
  distance_km: number;
  travel_date: string;
  booking_allowed?: boolean;
}

interface BusesByDate {
  [date: string]: Bus[];
}

export default function ResultsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [buses, setBuses] = useState<Bus[]>([]);
  const [busesByDate, setBusesByDate] = useState<BusesByDate>({});
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [filteredBuses, setFilteredBuses] = useState<Bus[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAllDates, setShowAllDates] = useState(false);
  
  // Weather state
  const [weather, setWeather] = useState<any>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  // Filters
  const [filterAC, setFilterAC] = useState(false);
  const [filterSleeper, setFilterSleeper] = useState(false);
  const [maxPrice, setMaxPrice] = useState(10000);
  const [sortBy, setSortBy] = useState('value');

  const fromCity = searchParams.get('from') || '';
  const toCity = searchParams.get('to') || '';
  const travelDate = searchParams.get('date') || '';
  const showAll = searchParams.get('showAll') === 'true';

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    searchBuses(false);
    if (toCity) fetchWeather(toCity);

    // Auto-reflect bus schedule additions/updates silently without triggering loading screen flashes
    const handleFocus = () => searchBuses(true);
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'place_updated' || e.key === 'route_updated' || e.key === 'schedule_updated') {
        searchBuses(true);
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    const intervalId = setInterval(() => searchBuses(true), 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      clearInterval(intervalId);
    };
  }, [isAuthenticated, fromCity, toCity, travelDate, showAll]);

  useEffect(() => {
    applyFilters();
  }, [buses, filterAC, filterSleeper, maxPrice, sortBy, selectedDate]);

  const fetchWeather = async (city: string) => {
    try {
      setWeatherLoading(true);
      const dateParam = selectedDate || travelDate || '';
      const response = await api.get(`/buses/weather/${encodeURIComponent(city)}${dateParam ? `?date=${dateParam}` : ''}`);
      setWeather(response.data);
    } catch { /* silent */ }
    finally { setWeatherLoading(false); }
  };

  // Re-fetch weather when selected date changes
  useEffect(() => {
    if (toCity && selectedDate) fetchWeather(toCity);
  }, [selectedDate]);

  const searchBuses = async (isSilent = false) => {
    try {
      if (!isSilent) setLoading(true);
      const response = await api.post('/buses/search', {
        fromCity,
        toCity,
        travelDate,
        showAllDates: showAll || !travelDate
      });
      
      const allBuses = response.data.buses || [];
      setBuses(allBuses);
      
      if (response.data.byDate) {
        // Multi-date view
        setBusesByDate(response.data.byDate);
        setDates(response.data.dates || []);
        setShowAllDates(true);
        if (response.data.dates && response.data.dates.length > 0) {
          const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
          const target = travelDate || todayIST;
          const matched = response.data.dates.find((d: string) => d >= target) || response.data.dates[0];
          setSelectedDate(matched);
        }
      } else {
        // Single date view
        setShowAllDates(false);
        setSelectedDate(travelDate);
      }
    } catch (error) {
      console.error('Search failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    // Get buses for the selected date
    let filtered = selectedDate && busesByDate[selectedDate] 
      ? [...busesByDate[selectedDate]]
      : [...buses];

    if (filterAC) {
      filtered = filtered.filter(b => b.has_ac === 1);
    }
    if (filterSleeper) {
      filtered = filtered.filter(b => b.is_sleeper === 1);
    }
    filtered = filtered.filter(b => b.base_price <= maxPrice);

    // Sort
    if (sortBy === 'price') {
      filtered.sort((a, b) => a.base_price - b.base_price);
    } else if (sortBy === 'fastest') {
      filtered.sort((a, b) => a.duration_hours - b.duration_hours);
    } else if (sortBy === 'seats') {
      filtered.sort((a, b) => b.available_seats - a.available_seats);
    } else {
      // Best value: combination of price and rating
      filtered.sort((a, b) => (b.rating / b.base_price) - (a.rating / a.base_price));
    }

    setFilteredBuses(filtered);
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
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
              {fromCity}
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              {toCity}
            </h1>
            <p className="text-sm text-gray-500">
              {showAllDates ? `Next ${dates.length} days available` : travelDate}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={() => navigate('/my-bookings')} className="btn-ghost px-4 py-2 text-xs">My Bookings</button>
            <button onClick={() => { logout(); navigate('/'); }} className="btn-ghost px-4 py-2 text-xs text-red-400 hover:text-red-300">Logout</button>
            <button onClick={() => navigate('/')} className="btn-primary px-5 py-2.5 text-xs">New Search</button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid md:grid-cols-4 gap-6">
          {/* Sidebar Filters */}
          <div className="md:col-span-1">
            <div className="glass rounded-3xl p-6 sticky top-24 space-y-6 border border-white/[0.06]">
              {/* Date Selector (if showing all dates) */}
              {showAllDates && dates.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                    SELECT DATE
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {dates.map(date => {
                      const busCount = busesByDate[date]?.length || 0;
                      const dateObj = new Date(date + 'T00:00:00');
                      const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                      const dayNum = dateObj.getDate();
                      const month = dateObj.toLocaleDateString('en-US', { month: 'short' });
                      
                      return (
                        <button
                          key={date}
                          onClick={() => setSelectedDate(date)}
                          className={`w-full text-left px-4 py-3 rounded-xl font-semibold transition ${
                            selectedDate === date
                              ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/20'
                              : 'bg-white/[0.03] hover:bg-white/[0.06] text-gray-300 border border-white/[0.04]'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <div>
                              <div className="text-xs opacity-80">{dayName}</div>
                              <div className="font-black">{dayNum} {month}</div>
                            </div>
                            <div className="text-xs">
                              {busCount} buses
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              
              <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">
                FILTERS
              </h3>

              {/* AC Filter */}
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterAC}
                  onChange={(e) => setFilterAC(e.target.checked)}
                  className="w-5 h-5 text-primary rounded"
                />
                <span className="font-semibold text-gray-300">❄️ AC</span>
              </label>

              {/* Sleeper Filter */}
              <label className="flex items-center gap-3 mb-6 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterSleeper}
                  onChange={(e) => setFilterSleeper(e.target.checked)}
                  className="w-5 h-5 text-primary rounded"
                />
                <span className="font-semibold text-gray-300">🛌 Sleeper</span>
              </label>

              {/* Budget Slider */}
              <div className="mb-4">
                <label className="text-xs font-bold tracking-widest uppercase text-gray-400 block mb-2">
                  MAX BUDGET
                </label>
                <div className="flex items-center gap-3 mb-2">
                  <input
                    type="range"
                    min="500"
                    max="10000"
                    step="100"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <div className="text-xl font-black text-primary">₹{maxPrice}</div>
              </div>

              {/* Weather Widget */}
              {toCity && (
                <div>
                  <h3 className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-3">
                    🌤️ WEATHER AT {toCity.toUpperCase()}
                  </h3>
                  {weatherLoading ? (
                    <div className="flex items-center gap-2 text-gray-500 text-xs">
                      <div className="w-4 h-4 border-2 border-accent-500 border-t-transparent rounded-full animate-spin" />
                      Loading weather...
                    </div>
                  ) : weather?.forecast ? (
                    <div className="space-y-2">
                      {/* Travel date weather (if available) */}
                      {weather.travelForecast && (
                        <div className={`p-3 rounded-xl border ${
                          weather.travelForecast.alert
                            ? 'bg-red-500/10 border-red-500/20'
                            : 'bg-emerald-500/10 border-emerald-500/20'
                        }`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xl">{weather.travelForecast.icon}</span>
                            <div>
                              <div className="text-white text-sm font-bold">Travel Day</div>
                              <div className="text-[10px] text-gray-400">{weather.travelForecast.condition}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-300">
                            {weather.travelForecast.tempMin}°–{weather.travelForecast.tempMax}°C
                            {weather.travelForecast.rain > 0 && ` · ${weather.travelForecast.rain}mm rain`}
                          </div>
                          {weather.travelForecast.alert && (
                            <div className="mt-1.5 text-xs font-bold text-red-400 flex items-center gap-1">
                              ⚠️ {weather.travelForecast.alert}
                            </div>
                          )}
                        </div>
                      )}
                      {/* 7-day mini forecast */}
                      <div className="grid grid-cols-7 gap-1">
                        {weather.forecast.slice(0, 7).map((day: any, i: number) => (
                          <div key={i} className={`text-center p-1 rounded-lg ${
                            day.date === selectedDate ? 'bg-accent-500/20 border border-accent-500/30' : 'bg-white/[0.02]'
                          }`}>
                            <div className="text-[8px] text-gray-500">{new Date(day.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
                            <div className="text-sm">{day.icon}</div>
                            <div className="text-[8px] text-gray-400">{day.tempMax}°</div>
                            {day.alert && <div className="w-1.5 h-1.5 bg-red-400 rounded-full mx-auto mt-0.5" title={day.alert}></div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-600 text-xs">Weather unavailable</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="md:col-span-3">
            {/* Sort Bar */}
            <div className="glass rounded-2xl p-4 mb-6 flex items-center gap-3 overflow-x-auto border border-white/[0.06]">
              <span className="text-xs font-bold tracking-widest uppercase text-gray-500 whitespace-nowrap">
                SORT:
              </span>
              {['value', 'price', 'fastest', 'seats'].map((sort) => (
                <button
                  key={sort}
                  onClick={() => setSortBy(sort)}
                  className={`px-4 py-2 rounded-xl font-semibold text-xs whitespace-nowrap transition ${
                    sortBy === sort
                      ? 'bg-accent-600 text-white shadow-lg shadow-accent-600/20'
                      : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.06] border border-white/[0.04]'
                  }`}
                >
                  {sort === 'value' ? 'Best Value' : sort === 'price' ? 'Lowest Price' : sort === 'fastest' ? 'Fastest' : 'Most Seats'}
                </button>
              ))}
            </div>

            {/* Bus List */}
            <div className="space-y-4">
              {filteredBuses.length === 0 ? (
                <div className="glass rounded-3xl p-12 text-center border border-white/[0.06]">
                  <div className="text-6xl mb-4">🚌</div>
                  <h3 className="text-2xl font-bold text-white mb-2">No buses found</h3>
                  <p className="text-gray-500">Try adjusting your filters</p>
                </div>
              ) : (
                filteredBuses.map((bus) => (
                  <div key={bus.id} className={`glass rounded-3xl p-6 border border-white/[0.06] hover:border-white/[0.1] transition-all duration-200 ${
                    bus.booking_allowed === false ? 'opacity-50 border-red-500/30' : ''
                  }`}>
                    {/* Departed Bus Warning Banner */}
                    {bus.booking_allowed === false && (
                      <div className="mb-4 bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-3">
                        <span className="text-2xl">🚫</span>
                        <div className="flex-1">
                          <div className="font-bold text-red-400 text-sm">DEPARTED</div>
                          <div className="text-xs text-red-400/70">This bus has already departed. Please select another schedule.</div>
                        </div>
                      </div>
                    )}
                    
                    {/* Travel Date Header */}
                    {bus.travel_date && (
                      <div className="mb-4 pb-3 border-b border-white/[0.06]">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">📅</span>
                          <div>
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider">
                              Travel Date
                            </div>
                            <div className="text-lg font-black text-primary">
                              {new Date(bus.travel_date).toLocaleDateString('en-US', {
                                weekday: 'long',
                                year: 'numeric',
                                month: 'long',
                                day: 'numeric'
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Route Display */}
                    <div className="mb-4 flex items-center justify-between bg-white/[0.02] rounded-xl p-3 border border-white/[0.04]">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🚌</span>
                        <div>
                          <div className="text-xs text-gray-500 font-semibold uppercase">Route</div>
                          <div className="text-sm font-bold text-white">
                            {fromCity} <span className="text-accent-400">→</span> {toCity}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-500 font-semibold uppercase">Bus Type</div>
                        <div className="text-sm font-bold text-white">{bus.bus_type}</div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row md:items-center gap-6">
                      {/* Bus Info */}
                      <div className="flex-1">
                        <h3 className="text-2xl font-bold tracking-tight text-white mb-1">
                          {bus.bus_name}
                        </h3>
                        <p className="text-sm text-gray-500 mb-3">
                          <span className="font-semibold">Operator:</span> {bus.operator}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {bus.has_ac === 1 && (
                            <span className="px-3 py-1.5 bg-sky-500/10 text-sky-400 rounded-full text-xs font-semibold border border-sky-500/20">
                              ❄️ AC
                            </span>
                          )}
                          {bus.is_sleeper === 1 && (
                            <span className="px-3 py-1.5 bg-purple-500/10 text-purple-400 rounded-full text-xs font-semibold border border-purple-500/20">
                              🛌 Sleeper
                            </span>
                          )}
                          <span className="px-3 py-1.5 bg-yellow-500/10 text-yellow-400 rounded-full text-xs font-semibold border border-yellow-500/20">
                            ⭐ {bus.rating}
                            </span>
                          {bus.available_seats < 10 && bus.available_seats > 0 && (
                            <span className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-full text-xs font-semibold border border-red-500/20 animate-pulse">
                              🔥 Only {bus.available_seats} Left!
                            </span>
                          )}
                          {bus.available_seats === 0 && (
                            <span className="px-3 py-1.5 bg-gray-500/10 text-gray-400 rounded-full text-xs font-semibold border border-gray-500/20">
                              ❌ Sold Out
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Time */}
                      <div className="text-center">
                        <div className="text-2xl font-bold text-white">{formatTo12Hour(bus.departure_time)}</div>
                        <div className="text-sm text-gray-500 my-1">
                          {bus.duration_hours}h {bus.distance_km ? `• ${bus.distance_km} km` : ''}
                        </div>
                        <div className="text-2xl font-bold text-white">{formatTo12Hour(bus.arrival_time)}</div>
                      </div>

                      {/* Price & Book */}
                      <div className="text-center md:text-right">
                        <div className="text-4xl font-extrabold text-white mb-2">₹{bus.base_price}</div>
                        <div className="text-sm text-gray-500 mb-4">{bus.available_seats} seats left</div>
                        <div className="flex flex-col gap-3">
                          {/* Date Selection Button */}
                          <button
                            onClick={() => {
                              alert(
                                `📅 SELECT YOUR TRAVEL DATE\n\n` +
                                `Please use the CALENDAR button below to:\n\n` +
                                `1️⃣ View all available dates (next 30 days)\n` +
                                `2️⃣ Check seat availability for each date\n` +
                                `3️⃣ Select your preferred travel date\n` +
                                `4️⃣ Proceed to book seats\n\n` +
                                `⚠️ Important: You must choose a date from the calendar before booking!`
                              );
                            }}
                            className="w-full py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold rounded-2xl transition border border-amber-500/20 hover:border-amber-500/30 text-sm"
                          >
                            <div className="flex items-center justify-center gap-2">
                              <span>⚠️</span>
                              <span>CHOOSE THE DATE TO BOOK SEAT</span>
                            </div>
                          </button>

                          {/* Calendar Button - Plain Style */}
                          <button
                            onClick={() => {
                              const params = new URLSearchParams(window.location.search);
                              navigate(`/availability?routeId=${bus.route_id || params.get('routeId') || '1'}&busId=${bus.bus_id || bus.id}&busName=${encodeURIComponent(bus.bus_name)}&from=${fromCity}&to=${toCity}`);
                            }}
                            className="w-full py-4 btn-accent rounded-2xl transition"
                          >
                            <div className="flex flex-col items-center gap-2">
                              <span className="text-4xl">📅</span>
                              <span className="text-lg">VIEW CALENDAR</span>
                              <span className="text-xs opacity-70">30-Day Availability</span>
                            </div>
                          </button>

                          {/* Current Date Display (if exists) */}
                          {bus.travel_date && (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
                              <div className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">
                                Currently Viewing:
                              </div>
                              <div className="text-sm font-bold text-emerald-300">
                                📅 {new Date(bus.travel_date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
