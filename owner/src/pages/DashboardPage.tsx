import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { formatTo12Hour } from '../utils/timeFormat';

interface Stats {
  totalUsers: number;
  totalRoutes: number;
  totalBuses: number;
  totalBookings: number;
  todayBookings: number;
  totalRevenue: number;
}

interface User {
  id: number;
  username: string;
  email: string;
  phone: string;
  total_bookings: number;
  total_spent: number;
  created_at: string;
}

interface Route {
  id: number;
  from_city: string;
  to_city: string;
  distance_km: number;
  duration_hours: number;
}

interface Bus {
  id: number;
  bus_number: string;
  bus_name: string;
  bus_type: string;
  has_ac: number;
  is_sleeper: number;
  total_seats: number;
  operator: string;
  rating: number;
}

interface Booking {
  id: number;
  pnr: string;
  passenger_name: string;
  username: string;
  email: string;
  seat_numbers: string;
  total_price: number;
  booking_status: string;
  from_city: string;
  to_city: string;
  travel_date: string;
  departure_time: string;
  bus_number: string;
  bus_name: string;
  operator: string;
  created_at: string;
}

interface Schedule {
  id: number;
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
}

interface SeatStatus {
  seat_number: string;
  seat_type: string;
  deck: string;
  status: 'available' | 'booked';
  booking_info: {
    passenger_name: string;
    username: string;
    email: string;
    pnr: string;
    booking_status: string;
  } | null;
}

interface Company {
  id: number;
  name: string;
  email: string;
  status?: string;
  is_active?: number;
  created_at: string;
  total_buses: number;
  total_bookings: number;
  total_revenue: number;
}

interface CompanyRequest {
  id: number;
  company_name: string;
  company_email: string;
  phone: string;
  address: string;
  fleet_size: number;
  company_description: string;
  gst_license_number?: string;
  bus_types?: string;
  status: string;
  created_at: string;
}

interface Policy {
  id: number;
  hours_before_departure: number;
  refund_percentage: number;
  description: string;
}

interface Place {
  id: number;
  name: string;
  state: string;
  code: string;
  image_url: string;
  landmarks: string;
  is_active: number;
}

const DashboardPage: React.FC = () => {
  const { owner, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'routes' | 'places' | 'buses' | 'schedules' | 'bookings' | 'seats' | 'company-requests' | 'companies' | 'policies'>('overview');
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [seatStatus, setSeatStatus] = useState<SeatStatus[]>([]);
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  
  // Places state
  const [places, setPlaces] = useState<Place[]>([]);
  const [showAddPlaceModal, setShowAddPlaceModal] = useState(false);
  const [placeForm, setPlaceForm] = useState({ name: '', state: '', code: '', image_url: '', landmarks: '' });
  const [placeSearch, setPlaceSearch] = useState('');

  // Route form state
  const [showAddRouteModal, setShowAddRouteModal] = useState(false);
  const [routeForm, setRouteForm] = useState({ from_city: '', to_city: '', distance_km: 500, duration_hours: 8 });

  // Schedules state
  const [ownerSchedules, setOwnerSchedules] = useState<any[]>([]);
  const [showAddScheduleModal, setShowAddScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    bus_id: '',
    route_id: '',
    departure_time: '06:00',
    arrival_time: '12:00',
    base_price: 500,
    travel_date: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`,
    is_daily_service: true
  });
  const [scheduleFilterRoute, setScheduleFilterRoute] = useState('');

  // Company & Policy states
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyRequests, setCompanyRequests] = useState<CompanyRequest[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyEmail, setNewCompanyEmail] = useState('');
  const [newCompanyPassword, setNewCompanyPassword] = useState('');
  const [newPolicyHours, setNewPolicyHours] = useState<number | ''>('');
  const [newPolicyRefund, setNewPolicyRefund] = useState<number | ''>('');
  const [newPolicyDesc, setNewPolicyDesc] = useState('');

  // Delete company modal state
  const [deletingCompany, setDeletingCompany] = useState<Company | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const [selectedRoute, setSelectedRoute] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedSchedule, setSelectedSchedule] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Booking filters
  const [bookingFilterRoute, setBookingFilterRoute] = useState<number | null>(null);
  const [bookingFilterDate, setBookingFilterDate] = useState<string>('');
  const [bookingFilterBus, setBookingFilterBus] = useState<number | null>(null);
  
  // Overview date selection
  const [overviewDates, setOverviewDates] = useState<string[]>([]);
  const [overviewSelectedDate, setOverviewSelectedDate] = useState<string>('');
  const [dateSpecificBookings, setDateSpecificBookings] = useState<number>(0);

  // Place & Route Requests states
  const [placeRequests, setPlaceRequests] = useState<any[]>([]);
  const [routeRequests, setRouteRequests] = useState<any[]>([]);
  const [rejectionModalId, setRejectionModalId] = useState<number | null>(null);
  const [rejectionType, setRejectionType] = useState<'place' | 'route' | null>(null);
  const [rejectionReasonText, setRejectionReasonText] = useState('');

  useEffect(() => {
    fetchPlaceRequests();
    fetchRouteRequests();

    const interval = setInterval(() => {
      fetchPlaceRequests();
      fetchRouteRequests();
    }, 5000);

    const onFocus = () => {
      fetchPlaceRequests();
      fetchRouteRequests();
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'place_updated' || e.key === 'route_updated' || e.key === 'request_updated') {
        fetchPlaceRequests();
        fetchRouteRequests();
      }
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
      fetchStats();
      fetchAvailableDatesForOverview();
      fetchPlaceRequests();
      fetchRouteRequests();
    } else if (activeTab === 'place-requests') {
      fetchPlaceRequests();
    } else if (activeTab === 'route-requests') {
      fetchRouteRequests();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'routes') {
      fetchRoutes();
    } else if (activeTab === 'places') {
      fetchPlaces();
    } else if (activeTab === 'buses') {
      fetchBuses();
    } else if (activeTab === 'schedules') {
      fetchRoutes();
      fetchBuses();
      fetchOwnerSchedules();
    } else if (activeTab === 'bookings') {
      fetchRoutes();
      fetchBuses();
      fetchAvailableDates();
      fetchBookings();
    } else if (activeTab === 'seats') {
      fetchAvailableDates();
      fetchRoutes();
    } else if (activeTab === 'company-requests') {
      fetchCompanyRequests();
    } else if (activeTab === 'companies') {
      fetchCompanies();
    } else if (activeTab === 'policies') {
      fetchPolicies();
    }
  }, [activeTab]);
  
  // Re-fetch bookings when filters change
  useEffect(() => {
    if (activeTab === 'bookings') {
      fetchBookings();
    }
  }, [bookingFilterRoute, bookingFilterDate, bookingFilterBus]);
  
  // Fetch date-specific bookings when overview date selected
  useEffect(() => {
    if (overviewSelectedDate && activeTab === 'overview') {
      fetchDateSpecificBookings();
    }
  }, [overviewSelectedDate]);

  const fetchStats = async () => {
    try {
      const response = await api.get('/owner/dashboard/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };
  
  const fetchAvailableDatesForOverview = async () => {
    try {
      const response = await api.get('/owner/available-dates');
      setOverviewDates(response.data);
      if (response.data.length > 0) {
        setOverviewSelectedDate(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch dates for overview:', error);
    }
  };
  
  const fetchDateSpecificBookings = async () => {
    try {
      const response = await api.get('/owner/bookings', {
        params: { travel_date: overviewSelectedDate }
      });
      setDateSpecificBookings(response.data.length);
    } catch (error) {
      console.error('Failed to fetch date-specific bookings:', error);
      setDateSpecificBookings(0);
    }
  };


  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/users');
      setUsers(response.data);
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoutes = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/routes');
      setRoutes(response.data);
    } catch (error) {
      console.error('Failed to fetch routes:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBuses = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/buses');
      setBuses(response.data);
    } catch (error) {
      console.error('Failed to fetch buses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchBookings = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (bookingFilterRoute) params.route_id = bookingFilterRoute;
      if (bookingFilterDate) params.travel_date = bookingFilterDate;
      if (bookingFilterBus) params.bus_id = bookingFilterBus;
      
      const response = await api.get('/owner/bookings', { params });
      setBookings(response.data);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableDates = async () => {
    try {
      const response = await api.get('/owner/available-dates');
      setAvailableDates(response.data);
      if (response.data.length > 0) {
        setSelectedDate(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch dates:', error);
    }
  };

  const fetchSchedules = async () => {
    if (!selectedRoute || !selectedDate) return;
    
    setIsLoading(true);
    try {
      const response = await api.get('/owner/schedules', {
        params: { route_id: selectedRoute, travel_date: selectedDate }
      });
      setSchedules(response.data);
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchSeatStatus = async () => {
    if (!selectedSchedule) return;
    
    setIsLoading(true);
    try {
      const response = await api.get('/owner/seat-status', {
        params: { schedule_id: selectedSchedule }
      });
      setSeatStatus(response.data);
    } catch (error) {
      console.error('Failed to fetch seat status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!window.confirm('Are you sure you want to completely remove this user and all their info?')) return;
    
    try {
      await api.delete(`/owner/users/${userId}`);
      alert('User removed successfully.');
      fetchUsers(); // Refresh the list
    } catch (error) {
      console.error('Failed to remove user:', error);
      alert('Error removing user.');
    }
  };

  const handleDeleteBus = async (busId: number) => {
    if (!window.confirm('Are you sure you want to remove this bus? This will remove all its schedules and bookings too!')) return;
    
    try {
      await api.delete(`/owner/buses/${busId}`);
      alert('Bus removed successfully.');
      fetchBuses(); // Refresh the list
    } catch (error) {
      console.error('Failed to remove bus:', error);
      alert('Error removing bus.');
    }
  };

  const handleCancelBooking = async (bookingId: number) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) return;
    
    try {
      await api.put(`/owner/bookings/${bookingId}/cancel`);
      alert('Booking cancelled successfully.');
      fetchBookings(); // Refresh the list
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      alert('Error cancelling booking.');
    }
  };

  const fetchCompanies = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/companies');
      setCompanies(response.data);
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchCompanyRequests = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/company-requests');
      setCompanyRequests(response.data);
    } catch (error) {
      console.error('Failed to fetch company requests:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCompanyName || !newCompanyEmail || !newCompanyPassword) {
      alert('All company fields are required');
      return;
    }
    try {
      await api.post('/owner/companies', {
        name: newCompanyName,
        email: newCompanyEmail,
        password: newCompanyPassword
      });
      alert('Company added successfully');
      setNewCompanyName('');
      setNewCompanyEmail('');
      setNewCompanyPassword('');
      fetchCompanies();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add company');
    }
  };

  const handleToggleCompanyStatus = async (companyId: number, currentStatus: number) => {
    const nextStatus = currentStatus === 1 ? 0 : 1;
    const confirmMsg = nextStatus === 0 
      ? 'Are you sure you want to block this company? They will not be able to log in.' 
      : 'Are you sure you want to unblock this company?';
    if (!window.confirm(confirmMsg)) return;
    try {
      await api.patch(`/owner/companies/${companyId}/status`, { is_active: nextStatus });
      fetchCompanies();
    } catch (error) {
      alert('Failed to update company status');
    }
  };

  const handleDeleteCompany = async (companyId: number) => {
    const comp = companies.find(c => c.id === companyId);
    if (comp) {
      setDeletingCompany(comp);
      setDeleteConfirmText('');
    } else {
      if (!window.confirm('WARNING: Removing a company will remove all their buses, schedules, and bookings permanently! Proceed?')) return;
      try {
        await api.delete(`/owner/companies/${companyId}`);
        fetchCompanies();
      } catch (error) {
        alert('Failed to delete company');
      }
    }
  };

  const executeDeleteCompany = async () => {
    if (!deletingCompany) return;
    if (deleteConfirmText.trim().toLowerCase() !== deletingCompany.name.trim().toLowerCase()) {
      alert(`Name mismatch! Please type "${deletingCompany.name}" to confirm deletion.`);
      return;
    }
    try {
      await api.delete(`/owner/companies/${deletingCompany.id}`);
      alert(`Company "${deletingCompany.name}" and all associated data deleted successfully.`);
      setDeletingCompany(null);
      setDeleteConfirmText('');
      fetchCompanies();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete company');
    }
  };

  const fetchPlaceRequests = async () => {
    try {
      const response = await api.get('/owner/place-requests');
      setPlaceRequests(response.data || []);
    } catch (error) {
      console.error('Failed to fetch place requests:', error);
    }
  };

  const fetchRouteRequests = async () => {
    try {
      const response = await api.get('/owner/route-requests');
      setRouteRequests(response.data || []);
    } catch (error) {
      console.error('Failed to fetch route requests:', error);
    }
  };

  const handleApprovePlaceRequest = async (id: number) => {
    try {
      const res = await api.patch(`/owner/place-requests/${id}/approve`);
      alert(res.data.message || 'Place approved successfully!');
      localStorage.setItem('place_updated', Date.now().toString());
      fetchPlaceRequests();
      fetchPlaces();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve place request');
    }
  };

  const handleRejectPlaceRequest = async (id: number) => {
    if (!rejectionReasonText.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    try {
      await api.patch(`/owner/place-requests/${id}/reject`, { rejection_reason: rejectionReasonText.trim() });
      alert('Place request rejected.');
      setRejectionModalId(null);
      setRejectionReasonText('');
      fetchPlaceRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject place request');
    }
  };

  const handleApproveRouteRequest = async (id: number) => {
    try {
      const res = await api.patch(`/owner/route-requests/${id}/approve`);
      alert(res.data.message || 'Route approved successfully!');
      localStorage.setItem('route_updated', Date.now().toString());
      fetchRouteRequests();
      fetchRoutes();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to approve route request');
    }
  };

  const handleRejectRouteRequest = async (id: number) => {
    if (!rejectionReasonText.trim()) {
      alert('Please provide a rejection reason.');
      return;
    }
    try {
      await api.patch(`/owner/route-requests/${id}/reject`, { rejection_reason: rejectionReasonText.trim() });
      alert('Route request rejected.');
      setRejectionModalId(null);
      setRejectionReasonText('');
      fetchRouteRequests();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to reject route request');
    }
  };

  const fetchPlaces = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/places');
      setPlaces(response.data || []);
    } catch (error) {
      console.error('Failed to fetch places:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPlace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!placeForm.name || !placeForm.state) {
      alert('City name and state are required');
      return;
    }
    try {
      await api.post('/owner/places', placeForm);
      localStorage.setItem('place_updated', Date.now().toString());
      alert('Place added successfully!');
      setPlaceForm({ name: '', state: '', code: '', image_url: '', landmarks: '' });
      setShowAddPlaceModal(false);
      fetchPlaces();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to add place');
    }
  };

  const handleTogglePlaceStatus = async (id: number, currentStatus: number) => {
    try {
      await api.patch(`/owner/places/${id}/status`, { is_active: currentStatus === 1 ? 0 : 1 });
      localStorage.setItem('place_updated', Date.now().toString());
      fetchPlaces();
    } catch (error) {
      alert('Failed to update place status');
    }
  };

  const handleDeletePlace = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this place?')) return;
    try {
      await api.delete(`/owner/places/${id}`);
      localStorage.setItem('place_updated', Date.now().toString());
      fetchPlaces();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete place');
    }
  };

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeForm.from_city || !routeForm.to_city) {
      alert('Please select origin and destination cities');
      return;
    }
    if (routeForm.from_city === routeForm.to_city) {
      alert('Origin and destination cities cannot be the same');
      return;
    }
    try {
      await api.post('/owner/routes', routeForm);
      alert('Route created successfully!');
      setShowAddRouteModal(false);
      fetchRoutes();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create route');
    }
  };

  const handleDeleteRoute = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this route?')) return;
    try {
      await api.delete(`/owner/routes/${id}`);
      fetchRoutes();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to delete route');
    }
  };

  const fetchOwnerSchedules = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/schedules');
      setOwnerSchedules(response.data || []);
    } catch (error) {
      console.error('Failed to fetch owner schedules:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOwnerSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleForm.bus_id || !scheduleForm.route_id || !scheduleForm.departure_time || !scheduleForm.arrival_time) {
      alert('Please fill out all required schedule fields');
      return;
    }
    try {
      await api.post('/owner/schedules', {
        bus_id: Number(scheduleForm.bus_id),
        route_id: Number(scheduleForm.route_id),
        departure_time: scheduleForm.departure_time,
        arrival_time: scheduleForm.arrival_time,
        base_price: Number(scheduleForm.base_price),
        dates: [scheduleForm.travel_date],
        is_daily_service: scheduleForm.is_daily_service ? 1 : 0
      });
      alert('Bus schedule created successfully!');
      setShowAddScheduleModal(false);
      fetchOwnerSchedules();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to create bus schedule');
    }
  };

  const handleDeleteOwnerSchedule = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this bus schedule?')) return;
    try {
      await api.delete(`/owner/schedules/${id}`);
      fetchOwnerSchedules();
    } catch (error) {
      alert('Failed to delete schedule');
    }
  };

  const handleApproveCompanyRequest = async (requestId: number) => {
    if (!window.confirm('Approve this company registration request?')) return;

    try {
      const response = await api.post(`/owner/company-requests/${requestId}/approve`);
      alert(response.data?.message || 'Company approved successfully.');
      fetchCompanyRequests();
      fetchCompanies();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to approve company request');
    }
  };

  const handleRejectCompanyRequest = async (requestId: number) => {
    if (!window.confirm('Reject this company registration request?')) return;

    try {
      const response = await api.post(`/owner/company-requests/${requestId}/reject`);
      alert(response.data?.message || 'Company registration rejected.');
      fetchCompanyRequests();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to reject company request');
    }
  };

  const fetchPolicies = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/owner/policies');
      setPolicies(response.data);
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddPolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPolicyHours === '' || newPolicyRefund === '' || !newPolicyDesc) {
      alert('All policy fields are required');
      return;
    }
    try {
      await api.post('/owner/policies', {
        hours_before_departure: Number(newPolicyHours),
        refund_percentage: Number(newPolicyRefund),
        description: newPolicyDesc
      });
      alert('Cancellation policy updated');
      setNewPolicyHours('');
      setNewPolicyRefund('');
      setNewPolicyDesc('');
      fetchPolicies();
    } catch (error: any) {
      alert(error.response?.data?.error || 'Failed to update policy');
    }
  };

  const handleDeletePolicy = async (policyId: number) => {
    if (!window.confirm('Are you sure you want to delete this cancellation policy rule?')) return;
    try {
      await api.delete(`/owner/policies/${policyId}`);
      fetchPolicies();
    } catch (error) {
      alert('Failed to delete policy');
    }
  };

  useEffect(() => {
    if (selectedRoute && selectedDate && activeTab === 'seats') {
      fetchSchedules();
    }
  }, [selectedRoute, selectedDate]);

  useEffect(() => {
    if (selectedSchedule && activeTab === 'seats') {
      fetchSeatStatus();
    }
  }, [selectedSchedule]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Owner Dashboard</h1>
              <p className="text-sm text-gray-600">Welcome, {owner?.name}</p>
            </div>
            <button
              onClick={logout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-6 overflow-x-auto py-1 scrollbar-none">
            {[
              { id: 'overview', label: 'Overview' },
              { 
                id: 'place-requests', 
                label: `Place Requests 📍 ${placeRequests.filter(r => r.status === 'pending').length > 0 ? `(${placeRequests.filter(r => r.status === 'pending').length})` : ''}` 
              },
              { 
                id: 'route-requests', 
                label: `Route Requests 🛣️ ${routeRequests.filter(r => r.status === 'pending').length > 0 ? `(${routeRequests.filter(r => r.status === 'pending').length})` : ''}` 
              },
              { id: 'users', label: 'Users' },
              { id: 'routes', label: 'Routes' },
              { id: 'places', label: 'Places & Cities 📍' },
              { id: 'buses', label: 'Buses' },
              { id: 'schedules', label: 'Schedules 🗓️' },
              { id: 'bookings', label: 'Bookings' },
              { id: 'seats', label: 'Seat Map' },
              { id: 'company-requests', label: 'Company Requests' },
              { id: 'companies', label: 'Companies' },
              { id: 'policies', label: 'Policies' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">System Overview</h2>
            
            {/* Date-Specific Booking Selector */}
            <div className="mb-6 bg-white p-4 rounded-lg shadow">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Check Bookings for Specific Date
              </label>
              <div className="flex items-center gap-4">
                <select
                  value={overviewSelectedDate}
                  onChange={(e) => setOverviewSelectedDate(e.target.value)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select a date</option>
                  {overviewDates.map((date) => (
                    <option key={date} value={date}>
                      {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
                        weekday: 'short',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </option>
                  ))}
                </select>
                {overviewSelectedDate && (
                  <div className="bg-blue-100 px-4 py-2 rounded-lg">
                    <span className="text-sm font-medium text-blue-800">
                      {dateSpecificBookings} booking{dateSpecificBookings !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
              {overviewSelectedDate && (
                <p className="mt-2 text-xs text-gray-500">
                  💡 Tip: For detailed filter options (route, bus, etc.), visit the "Bookings" tab
                </p>
              )}
            </div>
            
            {stats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard title="Total Users" value={stats.totalUsers} icon="👥" color="blue" />
                <StatCard title="Total Routes" value={stats.totalRoutes} icon="🗺️" color="green" />
                <StatCard title="Total Buses" value={stats.totalBuses} icon="🚌" color="purple" />
                <StatCard title="Total Bookings" value={stats.totalBookings} icon="🎫" color="orange" />
                <StatCard title="Today's Bookings" value={stats.todayBookings} icon="📅" color="pink" />
                <StatCard title="Total Revenue" value={`₹${stats.totalRevenue.toLocaleString()}`} icon="💰" color="yellow" />
              </div>
            ) : (
              <div className="text-center py-12">Loading statistics...</div>
            )}
          </div>
        )}

        {activeTab === 'place-requests' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Place Requests ({placeRequests.length})</h2>
                <p className="text-sm text-gray-500">Review missing city/place requests submitted by Bus Owners</p>
              </div>
            </div>

            {placeRequests.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
                No place requests submitted yet.
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Place Name</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">State & District</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bus Station / Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {placeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-bold text-gray-900">{req.place_name}</div>
                          <div className="text-xs text-gray-400">ID #{req.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div>{req.state}</div>
                          <div className="text-xs text-gray-400">{req.district || 'N/A'}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div className="font-semibold text-blue-600">{req.company_name}</div>
                          <div className="text-xs text-gray-400">{req.company_email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                          {req.bus_station && <div className="text-xs font-semibold text-gray-800">🚏 {req.bus_station}</div>}
                          {req.reason && <div className="text-xs italic text-gray-500">"{req.reason}"</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase ${
                            req.status === 'approved' ? 'bg-green-100 text-green-700 border border-green-300' :
                            req.status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-300' :
                            'bg-amber-100 text-amber-700 border border-amber-300'
                          }`}>
                            {req.status}
                          </span>
                          {req.rejection_reason && (
                            <div className="text-xs text-red-500 mt-1">Reason: {req.rejection_reason}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {req.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleApprovePlaceRequest(req.id)}
                                className="px-3 py-1.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 text-xs shadow"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => {
                                  setRejectionModalId(req.id);
                                  setRejectionType('place');
                                  setRejectionReasonText('');
                                }}
                                className="px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-xs shadow"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'route-requests' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Route Requests ({routeRequests.length})</h2>
                <p className="text-sm text-gray-500">Review route connection requests submitted by Bus Owners</p>
              </div>
            </div>

            {routeRequests.length === 0 ? (
              <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500">
                No route requests submitted yet.
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Route Connection</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Reason</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {routeRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-bold text-gray-900 text-base">
                            📍 {req.source_name} <span className="text-blue-600 font-normal">→</span> 📍 {req.destination_name}
                          </div>
                          <div className="text-xs text-gray-400">ID #{req.id}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                          <div className="font-semibold text-blue-600">{req.company_name}</div>
                          <div className="text-xs text-gray-400">{req.company_email}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                          {req.reason ? <div className="text-xs italic text-gray-500">"{req.reason}"</div> : <span className="text-xs text-gray-400">No reason provided</span>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2.5 py-1 text-xs rounded-full font-bold uppercase ${
                            req.status === 'approved' ? 'bg-green-100 text-green-700 border border-green-300' :
                            req.status === 'rejected' ? 'bg-red-100 text-red-700 border border-red-300' :
                            'bg-amber-100 text-amber-700 border border-amber-300'
                          }`}>
                            {req.status}
                          </span>
                          {req.rejection_reason && (
                            <div className="text-xs text-red-500 mt-1">Reason: {req.rejection_reason}</div>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          {req.status === 'pending' ? (
                            <div className="flex justify-end gap-2">
                              <button
                                onClick={() => handleApproveRouteRequest(req.id)}
                                className="px-3 py-1.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 text-xs shadow"
                              >
                                ✓ Approve Route
                              </button>
                              <button
                                onClick={() => {
                                  setRejectionModalId(req.id);
                                  setRejectionType('route');
                                  setRejectionReasonText('');
                                }}
                                className="px-3 py-1.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 text-xs shadow"
                              >
                                ✕ Reject
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400 italic">Reviewed</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* MODAL: REJECTION REASON */}
        {rejectionModalId !== null && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Reject {rejectionType === 'place' ? 'Place' : 'Route'} Request
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Please provide a rejection reason so the Bus Owner understands why this request was declined.
              </p>
              <textarea
                value={rejectionReasonText}
                onChange={(e) => setRejectionReasonText(e.target.value)}
                placeholder="e.g., Duplicate request, invalid city name, or route already covered."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-red-500"
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setRejectionModalId(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (rejectionType === 'place') handleRejectPlaceRequest(rejectionModalId);
                    else if (rejectionType === 'route') handleRejectRouteRequest(rejectionModalId);
                  }}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 shadow"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">All Users</h2>
            {isLoading ? (
              <div className="text-center py-12">Loading users...</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bookings</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total Spent</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{user.username}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.phone || '-'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{user.total_bookings}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">₹{user.total_spent.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button 
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
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

        {activeTab === 'routes' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">All Bus Routes ({routes.length})</h2>
                <p className="text-sm text-gray-500">Connect registered places and cities to enable bus scheduling and passenger search</p>
              </div>
              <button
                onClick={() => {
                  fetchPlaces();
                  setShowAddRouteModal(true);
                }}
                className="px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <span>➕</span> Add New Route
              </button>
            </div>

            {isLoading ? (
              <div className="text-center py-12 text-gray-500">Loading routes...</div>
            ) : (
              <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Origin (From)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Destination (To)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Distance (km)</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Duration (hrs)</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {routes.map((route) => (
                      <tr key={route.id} className="hover:bg-gray-50/50 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">#{route.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">📍 {route.from_city}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900">📍 {route.to_city}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-blue-600">{route.distance_km} km</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{route.duration_hours} hrs</td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <button
                            onClick={() => handleDeleteRoute(route.id)}
                            className="text-red-600 hover:text-red-900 font-medium"
                          >
                            Delete
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

        {activeTab === 'buses' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">All Buses</h2>
            {isLoading ? (
              <div className="text-center py-12">Loading buses...</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bus Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bus Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Operator</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seats</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rating</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {buses.map((bus) => (
                      <tr key={bus.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{bus.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{bus.bus_number}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{bus.bus_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {bus.bus_type}
                          {bus.has_ac ? ' (AC)' : ''}
                          {bus.is_sleeper ? ' (Sleeper)' : ''}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{bus.operator}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{bus.total_seats}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">⭐ {bus.rating}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button 
                            onClick={() => handleDeleteBus(bus.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Remove
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

        {activeTab === 'bookings' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">All Bookings</h2>
            
            {/* Booking Filters */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-lg font-semibold mb-4">Filter Bookings</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Route</label>
                  <select
                    value={bookingFilterRoute || ''}
                    onChange={(e) => setBookingFilterRoute(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Routes</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.from_city} → {route.to_city}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Travel Date</label>
                  <select
                    value={bookingFilterDate}
                    onChange={(e) => setBookingFilterDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Dates</option>
                    {availableDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Bus</label>
                  <select
                    value={bookingFilterBus || ''}
                    onChange={(e) => setBookingFilterBus(e.target.value ? Number(e.target.value) : null)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">All Buses</option>
                    {buses.map((bus) => (
                      <option key={bus.id} value={bus.id}>
                        {bus.bus_number} - {bus.bus_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <button
                    onClick={() => {
                      setBookingFilterRoute(null);
                      setBookingFilterDate('');
                      setBookingFilterBus(null);
                    }}
                    className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
              
              {/* Filter Summary */}
              <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                <span className="font-semibold">Filters Applied:</span>
                {!bookingFilterRoute && !bookingFilterDate && !bookingFilterBus && (
                  <span className="text-gray-400">None (showing all bookings)</span>
                )}
                {bookingFilterRoute && (
                  <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">
                    Route: {routes.find(r => r.id === bookingFilterRoute)?.from_city} → {routes.find(r => r.id === bookingFilterRoute)?.to_city}
                  </span>
                )}
                {bookingFilterDate && (
                  <span className="px-2 py-1 bg-green-100 text-green-800 rounded">
                    Date: {bookingFilterDate}
                  </span>
                )}
                {bookingFilterBus && (
                  <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded">
                    Bus: {buses.find(b => b.id === bookingFilterBus)?.bus_number}
                  </span>
                )}
              </div>
            </div>
            
            {isLoading ? (
              <div className="text-center py-12">Loading bookings...</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="p-4 bg-gray-50 border-b">
                  <p className="text-sm text-gray-600">
                    Showing <span className="font-semibold text-gray-900">{bookings.length}</span> booking(s)
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PNR</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Passenger</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">User</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Route</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bus</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seats</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Price</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {bookings.map((booking) => (
                        <tr key={booking.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{booking.pnr}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.passenger_name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div>{booking.username}</div>
                            <div className="text-xs text-gray-500">{booking.email}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {booking.from_city} → {booking.to_city}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div>{booking.travel_date}</div>
                            <div className="text-xs text-gray-500">{formatTo12Hour(booking.departure_time)}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            <div>{booking.bus_number}</div>
                            <div className="text-xs text-gray-500">{booking.operator}</div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{booking.seat_numbers}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">₹{booking.total_price}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              booking.booking_status === 'confirmed' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800'
                            }`}>
                              {booking.booking_status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {booking.booking_status === 'confirmed' && (
                              <button 
                                onClick={() => handleCancelBooking(booking.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'seats' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Seat Booking Status</h2>
            
            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Route</label>
                  <select
                    value={selectedRoute || ''}
                    onChange={(e) => {
                      setSelectedRoute(Number(e.target.value));
                      setSelectedSchedule(null);
                      setSeatStatus([]);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Route --</option>
                    {routes.map((route) => (
                      <option key={route.id} value={route.id}>
                        {route.from_city} → {route.to_city}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Date</label>
                  <select
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedSchedule(null);
                      setSeatStatus([]);
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Select Date --</option>
                    {availableDates.map((date) => (
                      <option key={date} value={date}>
                        {date}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Select Bus/Schedule</label>
                  <select
                    value={selectedSchedule || ''}
                    onChange={(e) => setSelectedSchedule(Number(e.target.value))}
                    disabled={!selectedRoute || !selectedDate || schedules.length === 0}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  >
                    <option value="">-- Select Bus --</option>
                    {schedules.map((schedule) => (
                      <option key={schedule.id} value={schedule.id}>
                        {schedule.bus_number} - {schedule.bus_name} ({formatTo12Hour(schedule.departure_time)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Seat Map */}
            {isLoading ? (
              <div className="text-center py-12">Loading seat status...</div>
            ) : seatStatus.length > 0 ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="mb-6">
                  <h3 className="text-lg font-semibold mb-2">Seat Map</h3>
                  <div className="flex gap-6 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-200 border border-green-400 rounded"></div>
                      <span>Available</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-200 border border-red-400 rounded"></div>
                      <span>Booked</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-5 gap-3">
                  {seatStatus.map((seat) => (
                    <div
                      key={seat.seat_number}
                      className={`p-3 border-2 rounded-lg ${
                        seat.status === 'available'
                          ? 'bg-green-50 border-green-300'
                          : 'bg-red-50 border-red-300'
                      }`}
                      title={
                        seat.booking_info
                          ? `Booked by: ${seat.booking_info.passenger_name} (${seat.booking_info.email})\nPNR: ${seat.booking_info.pnr}`
                          : 'Available'
                      }
                    >
                      <div className="font-bold text-center">{seat.seat_number}</div>
                      <div className="text-xs text-center text-gray-600">{seat.seat_type}</div>
                      {seat.booking_info && (
                        <div className="text-xs text-center mt-1 font-medium text-red-700">
                          {seat.booking_info.passenger_name}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Booked Seats Details */}
                <div className="mt-8">
                  <h3 className="text-lg font-semibold mb-4">Booked Seats Details</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Seat</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Passenger</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Username</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">PNR</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {seatStatus
                          .filter((seat) => seat.status === 'booked' && seat.booking_info)
                          .map((seat) => (
                            <tr key={seat.seat_number} className="hover:bg-gray-50">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{seat.seat_number}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">{seat.booking_info?.passenger_name}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">{seat.booking_info?.username}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">{seat.booking_info?.email}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm">{seat.booking_info?.pnr}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                Select a route, date, and bus to view seat status
              </div>
            )}
          </div>
        )}

        {activeTab === 'company-requests' && (
          <div>
            <h2 className="text-xl font-semibold mb-6">Company Registration Requests</h2>
            {isLoading ? (
              <div className="text-center py-12">Loading company requests...</div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fleet Size</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registration Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {companyRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50 align-top">
                        <td className="px-6 py-4 text-sm">
                          <div className="font-medium text-gray-900">{request.company_name}</div>
                          <div className="text-gray-500">{request.company_description}</div>
                          {request.bus_types && <div className="text-xs text-gray-400 mt-1">Bus Types: {request.bus_types}</div>}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{request.company_email}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{request.fleet_size}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{new Date(request.created_at).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${request.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' : request.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {request.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApproveCompanyRequest(request.id)}
                              disabled={request.status !== 'PENDING'}
                              className="px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => handleRejectCompanyRequest(request.id)}
                              disabled={request.status !== 'PENDING'}
                              className="px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!companyRequests.length && <div className="p-6 text-sm text-gray-500">No company requests found.</div>}
              </div>
            )}
          </div>
        )}

        {activeTab === 'companies' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-semibold text-gray-900">Company Accounts</h2>
              <span className="text-sm bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                {companies.length} Registered
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Add Company Form */}
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 h-fit">
                <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span>🏢</span> Add New Company
                </h3>
                <form onSubmit={handleAddCompany} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                    <input
                      type="text"
                      placeholder="e.g., Star Travels"
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Owner Email</label>
                    <input
                      type="email"
                      placeholder="e.g., owner@star.com"
                      value={newCompanyEmail}
                      onChange={(e) => setNewCompanyEmail(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                    <input
                      type="password"
                      placeholder="Enter password"
                      value={newCompanyPassword}
                      onChange={(e) => setNewCompanyPassword(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                  >
                    Create Account
                  </button>
                </form>
              </div>

              {/* Companies List */}
              <div className="lg:col-span-2 bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
                {isLoading ? (
                  <div className="text-center py-12 text-gray-500">Loading companies...</div>
                ) : companies.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">No companies found</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Company</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Status</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Buses</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bookings</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Revenue</th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-100">
                        {companies.map((company) => (
                          <tr key={company.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{company.name}</div>
                              <div className="text-xs text-gray-500">{company.email}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2.5 py-1 text-xs rounded-full font-semibold ${
                                company.is_active === 1 
                                  ? 'bg-green-50 text-green-700 border border-green-200' 
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}>
                                {company.is_active === 1 ? 'Active' : 'Blocked'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{company.total_buses}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{company.total_bookings}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">₹{company.total_revenue.toLocaleString()}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                              <button 
                                onClick={() => handleToggleCompanyStatus(company.id, company.is_active)}
                                className={`font-medium ${
                                  company.is_active === 1 ? 'text-amber-600 hover:text-amber-900' : 'text-green-600 hover:text-green-900'
                                }`}
                              >
                                {company.is_active === 1 ? 'Block' : 'Unblock'}
                              </button>
                              <button 
                                onClick={() => handleDeleteCompany(company.id)}
                                className="text-red-600 hover:text-red-900 font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'places' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Places & Cities Management 📍</h2>
                <p className="text-sm text-gray-500">Add and manage active boarding cities, destinations, and bus stop locations</p>
              </div>
              <button
                onClick={() => setShowAddPlaceModal(true)}
                className="px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <span>➕</span> Add New Place
              </button>
            </div>

            {/* Search Filter */}
            <div className="mb-6">
              <input
                type="text"
                placeholder="🔍 Search city by name, state, or code..."
                value={placeSearch}
                onChange={(e) => setPlaceSearch(e.target.value)}
                className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Places Grid */}
            {isLoading ? (
              <div className="text-center py-12 text-gray-500">Loading registered places...</div>
            ) : places.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl shadow border border-gray-100 text-gray-500">
                No places found. Click "+ Add New Place" to register a city.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {places
                  .filter(p => 
                    p.name.toLowerCase().includes(placeSearch.toLowerCase()) || 
                    p.state.toLowerCase().includes(placeSearch.toLowerCase()) ||
                    (p.code && p.code.toLowerCase().includes(placeSearch.toLowerCase()))
                  )
                  .map((place) => (
                    <div key={place.id} className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow flex flex-col justify-between">
                      <div>
                        <div className="h-32 bg-gradient-to-r from-slate-900 via-indigo-950 to-blue-900 relative flex items-center justify-center p-4 text-center border-b border-slate-800">
                          <span className="text-2xl font-black tracking-wider text-white uppercase drop-shadow-md">
                            {place.name}
                          </span>
                          <div className="absolute top-3 right-3 bg-white/15 backdrop-blur-md px-2.5 py-1 rounded-md text-xs font-black text-amber-300 border border-white/20 shadow">
                            {place.code || place.name.substring(0, 3).toUpperCase()}
                          </div>
                          <span className={`absolute top-3 left-3 px-2.5 py-1 text-xs rounded-full font-extrabold tracking-wide ${
                            place.is_active === 1 ? 'bg-emerald-500 text-slate-950 shadow' : 'bg-slate-700 text-slate-200'
                          }`}>
                            {place.is_active == 1 ? 'Active City' : 'Inactive'}
                          </span>
                        </div>

                        <div className="p-5">
                          <h3 className="text-xl font-bold text-gray-900">{place.name}</h3>
                          <p className="text-xs text-blue-600 font-medium mb-3">State: {place.state}</p>
                          
                          {place.landmarks && (
                            <div className="mb-4">
                              <span className="text-xs font-semibold text-gray-500 block mb-1">Popular Bus Stops / Landmarks:</span>
                              <div className="flex flex-wrap gap-1">
                                {place.landmarks.split(',').map((lm, i) => (
                                  <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded-md border border-gray-200">
                                    📍 {lm.trim()}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                        <button
                          onClick={() => handleTogglePlaceStatus(place.id, place.is_active)}
                          className={`text-xs font-semibold ${
                            place.is_active === 1 ? 'text-amber-600 hover:text-amber-800' : 'text-green-600 hover:text-green-800'
                          }`}
                        >
                          {place.is_active === 1 ? 'Disable Place' : 'Enable Place'}
                        </button>
                        <button
                          onClick={() => handleDeletePlace(place.id)}
                          className="text-xs font-semibold text-red-600 hover:text-red-800"
                        >
                          Delete Place
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedules' && (
          <div>
            {/* Interactive Visual Schedule Guide */}
            <div className="mb-8 bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-800 rounded-2xl p-6 text-white shadow-xl">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="px-3 py-1 bg-amber-400 text-gray-900 text-xs font-extrabold rounded-full uppercase tracking-wider">
                    Interactive Guide
                  </span>
                  <h2 className="text-2xl font-bold mt-2">How to Add Schedules to Buses 🗓️</h2>
                  <p className="text-blue-200 text-sm mt-1">Follow these 4 easy steps to publish bus routes and rolling 30-day seat inventories</p>
                </div>
                <button
                  onClick={() => setShowAddScheduleModal(true)}
                  className="px-5 py-2.5 bg-amber-400 hover:bg-amber-300 text-gray-900 font-bold rounded-xl transition-all shadow-lg flex items-center gap-2"
                >
                  <span>✨</span> Launch Schedule Wizard
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-gray-900 font-extrabold flex items-center justify-center mb-2">1</div>
                  <h4 className="font-bold text-white text-sm">Select Bus & Route</h4>
                  <p className="text-xs text-blue-200 mt-1">Pick the target bus operator and the source & destination route cities.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-gray-900 font-extrabold flex items-center justify-center mb-2">2</div>
                  <h4 className="font-bold text-white text-sm">Set Departure & Arrival</h4>
                  <p className="text-xs text-blue-200 mt-1">Specify departure time (e.g. 06:00 AM) and estimated arrival time.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-gray-900 font-extrabold flex items-center justify-center mb-2">3</div>
                  <h4 className="font-bold text-white text-sm">Set Ticket Price (₹)</h4>
                  <p className="text-xs text-blue-200 mt-1">Define the base ticket price per seat for this bus run.</p>
                </div>

                <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20">
                  <div className="w-8 h-8 rounded-full bg-amber-400 text-gray-900 font-extrabold flex items-center justify-center mb-2">4</div>
                  <h4 className="font-bold text-white text-sm">Daily Auto-Roll / Dates</h4>
                  <p className="text-xs text-blue-200 mt-1">Enable "Daily Service" to automatically populate the 30-day booking window!</p>
                </div>
              </div>
            </div>

            {/* Filter and Schedule List */}
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-gray-900">Active Bus Schedules ({ownerSchedules.length})</h3>
              <div className="flex items-center gap-4">
                <select
                  value={scheduleFilterRoute}
                  onChange={(e) => setScheduleFilterRoute(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">All Routes</option>
                  {routes.map(r => (
                    <option key={r.id} value={r.id}>{r.from_city} → {r.to_city}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowAddScheduleModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white font-semibold text-sm rounded-lg hover:bg-blue-700 transition-colors"
                >
                  + Add Schedule
                </button>
              </div>
            </div>

            {/* Schedules Table */}
            <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden">
              {isLoading ? (
                <div className="text-center py-12 text-gray-500">Loading bus schedules...</div>
              ) : ownerSchedules.length === 0 ? (
                <div className="text-center py-12 text-gray-500">No bus schedules found</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Bus & Company</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Route</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Date & Timings</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Fare</th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Seats</th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {ownerSchedules
                        .filter(s => !scheduleFilterRoute || String(s.route_id) === scheduleFilterRoute)
                        .map((sched) => (
                          <tr key={sched.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-semibold text-gray-900">{sched.bus_name}</div>
                              <div className="text-xs text-gray-500">{sched.bus_number} • {sched.company_name}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-bold text-gray-800">{sched.from_city} → {sched.to_city}</div>
                              <div className="text-xs text-gray-500">{sched.distance_km} km ({sched.duration_hours} hrs)</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-semibold text-gray-900">{sched.travel_date}</div>
                              <div className="text-xs text-blue-600">
                                🕒 {formatTo12Hour(sched.departure_time)} - {formatTo12Hour(sched.arrival_time)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-700">
                              ₹{sched.base_price}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                              <span className="font-semibold text-blue-600">{sched.available_seats}</span> available
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                              <button
                                onClick={() => handleDeleteOwnerSchedule(sched.id)}
                                className="text-red-600 hover:text-red-900 font-medium"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODAL: ADD NEW PLACE */}
        {showAddPlaceModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Add New Place / City 📍</h3>
                <button 
                  onClick={() => setShowAddPlaceModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddPlace} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City / Place Name *</label>
                  <input
                    type="text"
                    placeholder="e.g., Goa"
                    value={placeForm.name}
                    onChange={(e) => setPlaceForm({ ...placeForm, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">State *</label>
                    <input
                      type="text"
                      placeholder="e.g., Goa"
                      value={placeForm.state}
                      onChange={(e) => setPlaceForm({ ...placeForm, state: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">City Code</label>
                    <input
                      type="text"
                      placeholder="e.g., GOI"
                      value={placeForm.code}
                      onChange={(e) => setPlaceForm({ ...placeForm, code: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">City Image URL</label>
                  <input
                    type="url"
                    placeholder="https://images.unsplash.com/..."
                    value={placeForm.image_url}
                    onChange={(e) => setPlaceForm({ ...placeForm, image_url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Popular Bus Stops / Landmarks (Comma Separated)</label>
                  <textarea
                    placeholder="e.g., Panaji Bus Stand, Calangute Beach Road, Margao RTC"
                    value={placeForm.landmarks}
                    onChange={(e) => setPlaceForm({ ...placeForm, landmarks: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                    rows={3}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddPlaceModal(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow"
                  >
                    Save Place
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD BUS SCHEDULE WIZARD */}
        {showAddScheduleModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Create Bus Schedule 🗓️</h3>
                <button 
                  onClick={() => setShowAddScheduleModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleCreateOwnerSchedule} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Bus *</label>
                  <select
                    value={scheduleForm.bus_id}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, bus_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Choose Bus --</option>
                    {buses.map(b => (
                      <option key={b.id} value={b.id}>
                        {b.bus_name} ({b.bus_number}) - {b.operator}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Route *</label>
                  <select
                    value={scheduleForm.route_id}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, route_id: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">-- Choose Route --</option>
                    {routes.map(r => (
                      <option key={r.id} value={r.id}>
                        {r.from_city} → {r.to_city} ({r.distance_km} km)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Departure Time *</label>
                    <input
                      type="time"
                      value={scheduleForm.departure_time}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, departure_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Arrival Time *</label>
                    <input
                      type="time"
                      value={scheduleForm.arrival_time}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, arrival_time: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Base Price (₹) *</label>
                    <input
                      type="number"
                      min="100"
                      value={scheduleForm.base_price}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, base_price: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Travel Date *</label>
                    <input
                      type="date"
                      value={scheduleForm.travel_date}
                      onChange={(e) => setScheduleForm({ ...scheduleForm, travel_date: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="is_daily_owner"
                    checked={scheduleForm.is_daily_service}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, is_daily_service: e.target.checked })}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <label htmlFor="is_daily_owner" className="text-xs font-semibold text-gray-800">
                    Enable Daily Service (Auto-roll 30 days window)
                  </label>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddScheduleModal(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow"
                  >
                    Create Schedule
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: DELETE COMPANY CONFIRMATION */}
        {deletingCompany && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-red-100 animate-fade-in">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-2xl font-bold mb-4 mx-auto">
                ⚠️
              </div>
              <h3 className="text-xl font-bold text-gray-900 text-center mb-1">Delete Company Account</h3>
              <p className="text-sm text-red-600 font-semibold text-center mb-4">
                This action CANNOT be undone!
              </p>

              <div className="bg-red-50 p-4 rounded-xl text-xs text-red-800 mb-4 border border-red-200 space-y-1.5">
                <p className="font-bold">Permanent Impact for "{deletingCompany.name}":</p>
                <p>❌ Deletes company account login</p>
                <p>❌ Removes all registered buses for this company</p>
                <p>❌ Deletes all future bus schedules</p>
                <p>❌ Cancels all confirmed passenger bookings</p>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Type <span className="font-extrabold text-gray-900">"{deletingCompany.name}"</span> to confirm:
                </label>
                <input
                  type="text"
                  placeholder={deletingCompany.name}
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="w-full px-3 py-2 border border-red-300 rounded-lg focus:ring-2 focus:ring-red-500 font-medium"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingCompany(null);
                    setDeleteConfirmText('');
                  }}
                  className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={executeDeleteCompany}
                  disabled={deleteConfirmText.trim().toLowerCase() !== deletingCompany.name.trim().toLowerCase()}
                  className={`flex-1 py-2.5 rounded-lg font-semibold text-white shadow ${
                    deleteConfirmText.trim().toLowerCase() === deletingCompany.name.trim().toLowerCase()
                      ? 'bg-red-600 hover:bg-red-700 cursor-pointer'
                      : 'bg-red-300 cursor-not-allowed'
                  }`}
                >
                  Confirm Delete
                </button>
              </div>
            </div>
          </div>
        )}
        {/* MODAL: ADD ROUTE */}
        {showAddRouteModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl animate-fade-in">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900">Create New Bus Route 🛣️</h3>
                <button 
                  onClick={() => setShowAddRouteModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-xl font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleAddRoute} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Origin City (From) *</label>
                  <select
                    value={routeForm.from_city}
                    onChange={(e) => setRouteForm({ ...routeForm, from_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                    required
                  >
                    <option value="">-- Select Origin City --</option>
                    {places.map(p => (
                      <option key={p.id} value={p.name}>📍 {p.name} ({p.state})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Destination City (To) *</label>
                  <select
                    value={routeForm.to_city}
                    onChange={(e) => setRouteForm({ ...routeForm, to_city: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold"
                    required
                  >
                    <option value="">-- Select Destination City --</option>
                    {places.map(p => (
                      <option key={p.id} value={p.name}>📍 {p.name} ({p.state})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Distance (km) *</label>
                    <input
                      type="number"
                      min="10"
                      value={routeForm.distance_km}
                      onChange={(e) => setRouteForm({ ...routeForm, distance_km: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Duration (Hours) *</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={routeForm.duration_hours}
                      onChange={(e) => setRouteForm({ ...routeForm, duration_hours: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddRouteModal(false)}
                    className="flex-1 py-2.5 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 shadow"
                  >
                    Create Route
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    green: 'bg-green-50 border-green-200',
    purple: 'bg-purple-50 border-purple-200',
    orange: 'bg-orange-50 border-orange-200',
    pink: 'bg-pink-50 border-pink-200',
    yellow: 'bg-yellow-50 border-yellow-200',
  };

  return (
    <div className={`${colorClasses[color as keyof typeof colorClasses]} border-2 rounded-xl p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 font-medium">{title}</p>
          <p className="text-3xl font-bold mt-2">{value}</p>
        </div>
        <div className="text-4xl">{icon}</div>
      </div>
    </div>
  );
};

export default DashboardPage;
