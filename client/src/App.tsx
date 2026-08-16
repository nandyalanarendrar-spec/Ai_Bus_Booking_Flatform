import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import HomePage from './pages/HomePage';
import ResultsPage from './pages/ResultsPage';
import SeatSelectionPage from './pages/SeatSelectionPage';
import BookingPage from './pages/BookingPage';
import PaymentPage from './pages/PaymentPage';
import CancelConfirmPage from './pages/CancelConfirmPage';
import MyBookingsPage from './pages/MyBookingsPage';
import LoginPage from './pages/LoginPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import AvailabilityCalendarPage from './pages/AvailabilityCalendarPage';
import ContactPage from './pages/ContactPage';
import InfoPage from './pages/InfoPage';
import AdminLoginPage from './pages/AdminLoginPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AIAgentPage from './pages/AIAgentPage';
import ChatbotWidget from './components/ChatbotWidget';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<ResultsPage />} />
          <Route path="/seats/:scheduleId" element={<SeatSelectionPage />} />
          <Route path="/booking/:pnr" element={<BookingPage />} />
          <Route path="/payment" element={<PaymentPage />} />
          <Route path="/cancel-confirm/:pnr" element={<CancelConfirmPage />} />
          <Route path="/my-bookings" element={<MyBookingsPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/availability" element={<AvailabilityCalendarPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/info" element={<InfoPage />} />
          
          {/* AI Agent */}
          <Route path="/ai-agent" element={<AIAgentPage />} />

          {/* Admin Routes */}
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        </Routes>
        
        {/* Floating AI Chatbot Widget - Bottom Right Corner */}
        <ChatbotWidget />
      </Router>
    </AuthProvider>
  );
}

export default App;
