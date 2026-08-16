import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../api/axios';

interface AdminInfo {
  email: string;
  name: string;
  role: string;
}

interface Stats {
  totalUsers: number;
  totalBookings: number;
  totalRevenue: number;
  todayBookings: number;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<AdminInfo | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAdminData();
  }, []);

  const loadAdminData = async () => {
    try {
      const token = localStorage.getItem('adminToken');
      if (!token) {
        navigate('/admin/login');
        return;
      }

      // Get admin profile
      const response = await axios.get('/admin/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setAdmin(response.data.admin);
      
      // Load dashboard stats (you can create a stats endpoint)
      // For now, using mock data
      setStats({
        totalUsers: 0,
        totalBookings: 0,
        totalRevenue: 0,
        todayBookings: 0
      });
      
    } catch (err: any) {
      console.error('Error loading admin data:', err);
      if (err.response?.status === 401 || err.response?.status === 403) {
        setError('Session expired. Please login again.');
        setTimeout(() => {
          handleLogout();
        }, 2000);
      } else {
        setError('Failed to load dashboard data');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
    navigate('/admin/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error && !admin) {
    return (
      <div className="min-h-screen bg-surface-900 mesh-gradient flex items-center justify-center">
        <div className="glass p-8 rounded-2xl max-w-md w-full">
          <div className="text-center">
            <div className="text-6xl mb-4">⚠️</div>
            <h2 className="text-2xl font-bold text-white mb-2">Error</h2>
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => navigate('/admin/login')}
              className="btn-accent px-6 py-2 rounded-lg font-semibold"
            >
              Back to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-900 mesh-gradient">
      {/* Header */}
      <header className="bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.06] sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">🔐</div>
              <div>
                <h1 className="text-2xl font-bold text-white">Admin Portal</h1>
                <p className="text-sm text-gray-400">Bus Booking System</p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{admin?.name || 'Admin'}</p>
                <p className="text-xs text-gray-400">{admin?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="bg-red-500/10 text-red-400 border border-red-500/20 px-4 py-2 rounded-lg font-semibold hover:bg-red-500/20 transition"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Banner */}
        <div className="bg-gradient-to-r from-accent-600 to-accent-500 rounded-2xl p-8 mb-8 text-white">
          <h2 className="text-3xl font-bold mb-2">Welcome back, {admin?.name || 'Admin'}! 👋</h2>
          <p className="text-accent-100">Here's what's happening with your bus booking system today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl">👥</div>
              <div className="bg-sky-500/10 text-sky-400 border border-sky-500/20 px-3 py-1 rounded-full text-sm font-bold">
                Users
              </div>
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              {stats?.totalUsers.toLocaleString() || '0'}
            </h3>
            <p className="text-gray-400 text-sm">Total Registered Users</p>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl">🎫</div>
              <div className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1 rounded-full text-sm font-bold">
                Bookings
              </div>
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              {stats?.totalBookings.toLocaleString() || '0'}
            </h3>
            <p className="text-gray-400 text-sm">Total Bookings</p>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl">💰</div>
              <div className="bg-amber-500/10 text-amber-400 border border-amber-500/20 px-3 py-1 rounded-full text-sm font-bold">
                Revenue
              </div>
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              ₹{stats?.totalRevenue.toLocaleString() || '0'}
            </h3>
            <p className="text-gray-400 text-sm">Total Revenue</p>
          </div>

          <div className="glass rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="text-3xl">📅</div>
              <div className="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-3 py-1 rounded-full text-sm font-bold">
                Today
              </div>
            </div>
            <h3 className="text-3xl font-bold text-white mb-1">
              {stats?.todayBookings.toLocaleString() || '0'}
            </h3>
            <p className="text-gray-400 text-sm">Today's Bookings</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="glass rounded-2xl p-8 mb-8">
          <h3 className="text-2xl font-bold text-white mb-6">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="bg-gradient-to-r from-blue-500 to-blue-600 text-white p-6 rounded-xl font-semibold hover:shadow-lg transition text-left">
              <div className="text-3xl mb-2">👥</div>
              <h4 className="text-lg font-bold mb-1">Manage Users</h4>
              <p className="text-sm text-blue-100">View and manage registered users</p>
            </button>

            <button className="bg-gradient-to-r from-green-500 to-green-600 text-white p-6 rounded-xl font-semibold hover:shadow-lg transition text-left">
              <div className="text-3xl mb-2">🚌</div>
              <h4 className="text-lg font-bold mb-1">Manage Buses</h4>
              <p className="text-sm text-green-100">Add, edit or remove bus services</p>
            </button>

            <button className="bg-gradient-to-r from-purple-500 to-purple-600 text-white p-6 rounded-xl font-semibold hover:shadow-lg transition text-left">
              <div className="text-3xl mb-2">📊</div>
              <h4 className="text-lg font-bold mb-1">View Reports</h4>
              <p className="text-sm text-purple-100">Generate analytics and reports</p>
            </button>
          </div>
        </div>

        {/* System Status */}
        <div className="glass rounded-2xl p-8">
          <h3 className="text-2xl font-bold text-white mb-6">System Status</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="font-semibold text-white">API Server</span>
              </div>
              <span className="text-emerald-400 font-bold">Online</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="font-semibold text-white">Database</span>
              </div>
              <span className="text-emerald-400 font-bold">Connected</span>
            </div>

            <div className="flex items-center justify-between p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
                <span className="font-semibold text-white">Email Service</span>
              </div>
              <span className="text-emerald-400 font-bold">Configured</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
