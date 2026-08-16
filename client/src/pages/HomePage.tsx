import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

export default function HomePage() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [fromCity, setFromCity] = useState('');
  const [toCity, setToCity] = useState('');
  const [showChangePass, setShowChangePass] = useState(false);
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);
  const [changeMsg, setChangeMsg] = useState('');
  const [changeError, setChangeError] = useState('');

  const CITY_DISPLAY_MAP: Record<string, string> = {
    anantapur: 'Ananthapuram',
    ananthapur: 'Ananthapuram',
    anantapuram: 'Ananthapuram',
    ananthapuram: 'Ananthapuram',
    bengaluru: 'Bangalore',
    vijaywada: 'Vijayawada',
    vijayawadda: 'Vijayawada',
    tirupathi: 'Tirupati',
    vizag: 'Visakhapatnam',
    cuddapah: 'Kadapa',
    bombay: 'Mumbai',
    madras: 'Chennai'
  };

  const canonicalizeCity = (city: string): string => {
    if (!city) return '';
    const key = city.trim().toLowerCase();
    return CITY_DISPLAY_MAP[key] || (city.trim().charAt(0).toUpperCase() + city.trim().slice(1));
  };

  const defaultCities = [
    'Hyderabad', 'Vijayawada', 'Bangalore', 'Chennai', 'Mumbai', 'Pune', 'Delhi', 'Jaipur', 'Goa', 'Kerala', 'Tirupati', 'Visakhapatnam', 'Kochi', 'Kadapa', 'Ananthapuram'
  ];

  const [cities, setCities] = useState<string[]>(() => {
    const map = new Map<string, string>();
    defaultCities.forEach(c => {
      const canonical = canonicalizeCity(c);
      map.set(canonical.toLowerCase(), canonical);
    });
    return Array.from(map.values()).sort();
  });

  useEffect(() => {
    const fetchCities = async () => {
      try {
        let placeNames: string[] = [];
        try {
          const placesRes = await api.get('/places');
          if (placesRes.data?.places) {
            placeNames = placesRes.data.places.map((p: any) => p.name);
          }
        } catch {
          try {
            const placesRes = await api.get('/buses/places');
            if (placesRes.data?.places) {
              placeNames = placesRes.data.places.map((p: any) => p.name);
            }
          } catch {}
        }

        let routeCities: string[] = [];
        try {
          const routesRes = await api.get('/buses/routes');
          if (routesRes.data?.routes) {
            routesRes.data.routes.forEach((r: any) => {
              if (r.from_city) routeCities.push(r.from_city);
              if (r.to_city) routeCities.push(r.to_city);
            });
          }
        } catch {}

        const dbCities = [...placeNames, ...routeCities].filter(Boolean);
        const sourceCities = dbCities.length > 0 ? dbCities : defaultCities;
        const cityMap = new Map<string, string>();
        sourceCities.forEach(c => {
          const canonical = canonicalizeCity(c);
          if (canonical) {
            cityMap.set(canonical.toLowerCase(), canonical);
          }
        });

        const deduplicated = Array.from(cityMap.values()).sort();
        if (deduplicated.length > 0) {
          setCities(deduplicated);
        }
      } catch (err) {
        console.error('Failed to load dynamic cities:', err);
      }
    };
    fetchCities();

    // Auto-reflect changes when tab gains focus or on a 5s background sync interval
    const handleFocus = () => fetchCities();
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'place_updated' || e.key === 'route_updated') {
        fetchCities();
      }
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('storage', handleStorage);
    const intervalId = setInterval(fetchCities, 5000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('storage', handleStorage);
      clearInterval(intervalId);
    };
  }, []);

  const handleSwap = () => { const t = fromCity; setFromCity(toCity); setToCity(t); };

  const handleSearch = () => {
    if (!isAuthenticated) { navigate('/login'); return; }
    if (fromCity && toCity) navigate(`/search?from=${fromCity}&to=${toCity}&showAll=true`);
  };

  const handleLogout = () => { logout(); navigate('/'); };

  const handleChangePassword = async () => {
    setChangeError(''); setChangeMsg('');
    if (!currentPass || !newPass || !confirmPass) { setChangeError('All fields are required'); return; }
    if (newPass.length < 6) { setChangeError('New password must be at least 6 characters'); return; }
    if (newPass !== confirmPass) { setChangeError('New passwords do not match'); return; }
    setChangeLoading(true);
    try {
      const res = await api.post('/auth/change-password', { currentPassword: currentPass, newPassword: newPass });
      setChangeMsg(res.data.message);
      setCurrentPass(''); setNewPass(''); setConfirmPass('');
    } catch (err: any) {
      setChangeError(err.response?.data?.error || 'Failed to change password');
    } finally { setChangeLoading(false); }
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0e1a 0%, #0d1329 20%, #111b3c 40%, #0f1733 60%, #0b1023 80%, #080c18 100%)' }}>
      {/* Decorative orbs */}
      <div className="absolute top-[-15%] left-[-8%] w-[700px] h-[700px] bg-blue-600/[0.07] rounded-full blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] bg-indigo-500/[0.06] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[40%] left-[50%] translate-x-[-50%] w-[400px] h-[400px] bg-violet-500/[0.04] rounded-full blur-[120px] pointer-events-none" />

      {/* ── Header ── */}
      <header className="relative z-10 px-6 py-5">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            </div>
            <h1 className="text-white text-2xl font-extrabold tracking-tight">BusGo</h1>
          </div>
          <nav className="flex gap-2 items-center">
            <button onClick={() => navigate('/info')} className="btn-ghost px-4 py-2 text-sm rounded-xl">Info</button>
            <button onClick={() => navigate('/contact')} className="btn-ghost px-4 py-2 text-sm rounded-xl">Contact</button>
            {isAuthenticated ? (
              <>
                <div className="h-5 w-px bg-white/10 mx-1" />
                <button onClick={() => navigate('/my-bookings')} className="btn-ghost px-4 py-2 text-sm rounded-xl">My Bookings</button>
                <button
                  onClick={() => { setShowChangePass(true); setChangeMsg(''); setChangeError(''); setCurrentPass(''); setNewPass(''); setConfirmPass(''); }}
                  className="btn-ghost px-4 py-2 text-sm rounded-xl"
                >
                  Password
                </button>
                <div className="flex items-center gap-2 ml-2 bg-white/[0.04] rounded-full pl-3 pr-1.5 py-1.5 border border-white/[0.06]">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center text-white text-xs font-bold">
                    {user?.username?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="text-gray-300 text-sm font-medium">{user?.username}</span>
                  <button onClick={handleLogout} className="text-gray-500 hover:text-red-400 p-1.5 rounded-full hover:bg-white/5 transition">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  </button>
                </div>
              </>
            ) : (
              <button onClick={() => navigate('/login')} className="btn-primary px-6 py-2.5 text-sm ml-2">
                Login / Register
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero Section ── */}
      <div className="relative z-10 flex flex-col items-center justify-center px-4 pt-12 pb-6">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-full px-4 py-1.5 mb-6">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-gray-400 text-sm font-medium">Multi-Agent AI System Active</span>
          </div>
          <h2 className="text-white text-5xl md:text-7xl font-extrabold tracking-tight mb-4 leading-[1.1]">
            Travel <span className="text-gradient-brand">Smarter</span>
          </h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-lg mx-auto">
            AI-powered bus reservations with intelligent seat selection and real-time availability
          </p>
          <button
            onClick={() => navigate('/ai-agent')}
            className="mt-8 inline-flex items-center gap-3 bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 text-white px-8 py-4 rounded-2xl text-sm font-bold transition-all duration-200 active:scale-[0.98] shadow-xl shadow-accent-600/20 hover:shadow-accent-500/30 group"
          >
            <div className="relative">
              <div className="w-3 h-3 bg-emerald-400 rounded-full" />
              <div className="absolute inset-0 w-3 h-3 bg-emerald-400 rounded-full animate-ping opacity-50" />
            </div>
            Try AI Agent — Chat with our Multi-Agent System
            <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </button>
        </div>

        {/* ── Search Card ── */}
        <div className="glass rounded-3xl p-8 shadow-2xl max-w-4xl w-full border border-white/[0.06]">
          <div className="grid md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-gray-400 text-xs font-semibold tracking-widest uppercase mb-2">From</label>
              <select
                value={fromCity}
                onChange={(e) => setFromCity(e.target.value)}
                className="w-full px-4 py-4 rounded-2xl border border-white/[0.08] focus:border-accent-500/40 focus:outline-none focus:ring-1 focus:ring-accent-500/20 text-white text-lg font-semibold bg-white/[0.03] appearance-none transition-all"
              >
                <option value="" className="bg-surface-800 text-gray-400">Select City</option>
                {cities.map((city) => <option key={city} value={city} className="bg-surface-800 text-white">{city}</option>)}
              </select>
            </div>

            <div className="flex items-end justify-center">
              <button
                onClick={handleSwap}
                className="w-14 h-14 rounded-2xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-accent-500/30 text-gray-400 hover:text-accent-400 transition-all duration-200 hover:shadow-glow flex items-center justify-center hover:rotate-180"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </button>
            </div>

            <div>
              <label className="block text-gray-400 text-xs font-semibold tracking-widest uppercase mb-2">To</label>
              <select
                value={toCity}
                onChange={(e) => setToCity(e.target.value)}
                className="w-full px-4 py-4 rounded-2xl border border-white/[0.08] focus:border-accent-500/40 focus:outline-none focus:ring-1 focus:ring-accent-500/20 text-white text-lg font-semibold bg-white/[0.03] appearance-none transition-all"
              >
                <option value="" className="bg-surface-800 text-gray-400">Select City</option>
                {cities.map((city) => <option key={city} value={city} className="bg-surface-800 text-white">{city}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={handleSearch}
            disabled={!fromCity || !toCity}
            className="w-full btn-primary py-5 text-lg font-extrabold tracking-wide uppercase disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none"
          >
            {isAuthenticated ? 'Search Buses — All 30 Days' : 'Login to Search Buses'}
          </button>
        </div>
      </div>

      {/* ── Features Grid ── */}
      <div className="relative z-10 px-4 py-16">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-4 gap-4">
            {[
              { icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>, title: 'AI Powered', desc: '5 specialized agents + ReAct reasoning', gradient: 'from-accent-500 to-purple-500' },
              { icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>, title: 'Instant Booking', desc: 'Smart seat selection in seconds', gradient: 'from-amber-500 to-orange-500' },
              { icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>, title: '100% Secure', desc: 'JWT auth & encrypted data', gradient: 'from-emerald-500 to-green-500' },
              { icon: <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>, title: 'My Bookings', desc: 'View and manage all your trips', gradient: 'from-sky-500 to-blue-500', onClick: isAuthenticated ? () => navigate('/my-bookings') : undefined },
            ].map((f, i) => (
              <div
                key={i}
                onClick={f.onClick}
                className={`group bg-white/[0.02] hover:bg-white/[0.04] rounded-3xl p-6 border border-white/[0.04] hover:border-white/[0.1] transition-all duration-300 ${f.onClick ? 'cursor-pointer hover:shadow-glow' : ''}`}
              >
                <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${f.gradient} flex items-center justify-center text-white shadow-lg mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="font-bold text-white mb-1">{f.title}</h3>
                <p className="text-gray-500 text-sm">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.04] py-6 px-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center text-xs text-gray-600">
          <span>BusGo — AI-Powered Bus Booking Platform</span>
          <span>Built with React + Express + Multi-Agent AI</span>
        </div>
      </footer>

      {/* ── Change Password Modal ── */}
      {showChangePass && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 px-4" onClick={() => setShowChangePass(false)}>
          <div className="bg-surface-800 rounded-3xl p-7 max-w-sm w-full shadow-2xl border border-white/[0.06] animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-1">Change Password</h2>
            <p className="text-gray-500 text-sm mb-5">Enter your current password and choose a new one.</p>

            <input
              type="password" value={currentPass} onChange={(e) => setCurrentPass(e.target.value)} placeholder="Current password"
              className="w-full px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] text-white placeholder-gray-600 focus:border-accent-500/40 focus:outline-none font-medium mb-3 transition"
            />
            <input
              type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} placeholder="New password (min 6 chars)"
              className="w-full px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] text-white placeholder-gray-600 focus:border-accent-500/40 focus:outline-none font-medium mb-3 transition" minLength={6}
            />
            <input
              type="password" value={confirmPass} onChange={(e) => setConfirmPass(e.target.value)} placeholder="Confirm new password"
              className="w-full px-4 py-3 rounded-xl border border-white/[0.06] bg-white/[0.03] text-white placeholder-gray-600 focus:border-accent-500/40 focus:outline-none font-medium mb-4 transition" minLength={6}
            />

            {changeError && <div className="mb-3 p-3 bg-red-500/10 text-red-400 rounded-xl text-sm font-medium border border-red-500/10">{changeError}</div>}
            {changeMsg && <div className="mb-3 p-3 bg-emerald-500/10 text-emerald-400 rounded-xl text-sm font-medium border border-emerald-500/10">{changeMsg}</div>}

            <div className="flex gap-3">
              <button onClick={() => setShowChangePass(false)} className="flex-1 btn-ghost py-3 text-sm">Cancel</button>
              <button onClick={handleChangePassword} disabled={changeLoading} className="flex-1 btn-primary py-3 text-sm disabled:opacity-50">
                {changeLoading ? 'Saving...' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
