import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function InfoPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div 
          className="w-full h-full bg-gradient-to-br from-red-600 via-red-700 to-gray-900"
          style={{
            backgroundImage: 'linear-gradient(rgba(220, 38, 38, 0.8), rgba(17, 24, 39, 0.9)), url("data:image/svg+xml,%3Csvg width="60" height="60" viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg"%3E%3Cg fill="none" fill-rule="evenodd"%3E%3Cg fill="%23ffffff" fill-opacity="0.05"%3E%3Cpath d="M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v6h4v4h2V6h4V4H6z"/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")'
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <h1 
            onClick={() => navigate('/')}
            className="text-white text-3xl font-black tracking-tighter cursor-pointer hover:scale-105 transition"
          >
            🚌 BusAI
          </h1>
          <div className="flex gap-4 items-center">
            {isAuthenticated ? (
              <>
                <span className="text-white font-semibold">👤 {user?.username}</span>
                <button 
                  onClick={() => navigate('/my-bookings')}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-full transition font-semibold"
                >
                  My Bookings
                </button>
                <button 
                  onClick={handleLogout}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-full transition font-semibold"
                >
                  Logout
                </button>
              </>
            ) : (
              <button 
                onClick={() => navigate('/login')}
                className="bg-white text-primary hover:bg-red-50 px-6 py-2 rounded-full transition font-bold"
              >
                Login / Register
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="relative z-10 px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Page Title */}
          <div className="text-center mb-12">
            <h2 className="text-white text-5xl md:text-6xl font-black tracking-tighter mb-4">
              Important Information
            </h2>
            <p className="text-red-100 text-xl">Travel Guidelines & Emergency Protocols</p>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            {/* What To Do */}
            <section className="glass rounded-3xl p-8 shadow-2xl">
              <h3 className="text-3xl font-black text-emerald-400 mb-6 flex items-center gap-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ✅ WHAT TO DO
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">1.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Book in Advance</h4>
                      <p className="text-gray-400 text-sm">Reserve your seats at least 2-3 hours before departure for best availability</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">2.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Verify Travel Date</h4>
                      <p className="text-gray-400 text-sm">Always double-check your travel date before confirming booking</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">3.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Arrive Early</h4>
                      <p className="text-gray-400 text-sm">Reach the boarding point at least 15 minutes before departure time</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">4.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Save PNR Number</h4>
                      <p className="text-gray-400 text-sm">Keep your PNR safe for booking verification and cancellation</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">5.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Carry Valid ID</h4>
                      <p className="text-gray-400 text-sm">Always carry government-issued ID proof during travel</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">6.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Check Seat Availability</h4>
                      <p className="text-gray-400 text-sm">Use the calendar view to see real-time seat availability for all dates</p>
                    </div>
                  </div>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 md:col-span-2">
                  <div className="flex items-start gap-3">
                    <span className="text-emerald-400 font-black text-xl flex-shrink-0">7.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Contact Support</h4>
                      <p className="text-gray-400 text-sm">Reach out 24/7 for any queries at 1800-123-4567 or support@busai.com</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* What NOT To Do */}
            <section className="glass rounded-3xl p-8 shadow-2xl">
              <h3 className="text-3xl font-black text-red-400 mb-6 flex items-center gap-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ❌ WHAT NOT TO DO
              </h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">1.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Miss Boarding Time</h4>
                      <p className="text-gray-400 text-sm">Buses will not wait - late arrivals forfeit their seats</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">2.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Share PNR</h4>
                      <p className="text-gray-400 text-sm">Your PNR is confidential - sharing it may lead to unauthorized cancellations</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">3.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Book Wrong Dates</h4>
                      <p className="text-gray-400 text-sm">Verify your travel date carefully - wrong date bookings are non-refundable</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">4.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Carry Prohibited Items</h4>
                      <p className="text-gray-400 text-sm">Weapons, explosives, flammable materials are strictly prohibited</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">5.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Cancel Last Minute</h4>
                      <p className="text-gray-400 text-sm">Cancellations within 2 hours of departure incur 50% charges</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">6.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Board Without Booking</h4>
                      <p className="text-gray-400 text-sm">All passengers must have confirmed reservations</p>
                    </div>
                  </div>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-5 md:col-span-2">
                  <div className="flex items-start gap-3">
                    <span className="text-red-400 font-black text-xl flex-shrink-0">7.</span>
                    <div>
                      <h4 className="font-black text-white mb-1">Don't Ignore Safety Rules</h4>
                      <p className="text-gray-400 text-sm">Follow driver instructions and wear seatbelts at all times</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* Emergency Situations */}
            <section className="glass rounded-3xl p-8 shadow-2xl">
              <h3 className="text-3xl font-black text-orange-400 mb-6 flex items-center gap-3">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                🚨 EMERGENCY PROTOCOLS
              </h3>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">🚑 Medical Emergency</h4>
                  <p className="text-sm text-gray-400 mb-3">If you or a passenger feels unwell during travel:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Immediately inform the bus driver or conductor</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Call Emergency Hotline: <strong>1800-123-4567</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Bus will stop at nearest medical facility</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>First aid kit available in all buses</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">🔥 Fire or Accident</h4>
                  <p className="text-sm text-gray-400 mb-3">In case of fire, accident, or immediate danger:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Stay calm and follow driver's evacuation instructions</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Use emergency exits (clearly marked in bus)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Call Emergency: <strong>1800-123-4567</strong> or dial <strong>112</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>All buses have fire extinguishers and emergency tools</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">🚌 Bus Breakdown or Delay</h4>
                  <p className="text-sm text-gray-400 mb-3">If your bus breaks down or is significantly delayed:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Contact Support: <strong>1800-123-4567</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Replacement bus will be arranged within 30 minutes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Full refund available if delay exceeds 2 hours</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>SMS updates will be sent to your registered number</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">🎫 Lost PNR or Booking Issue</h4>
                  <p className="text-sm text-gray-400 mb-3">If you lose your PNR or face booking problems:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Call Customer Care: <strong>+91 98765-43210</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Provide registered email/phone for verification</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>PNR will be resent via SMS/Email within 5 minutes</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Check "My Bookings" page after login</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">💼 Lost Luggage or Belongings</h4>
                  <p className="text-sm text-gray-400 mb-3">If you lose items during travel:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Immediately contact: <strong>1800-123-4567</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Provide PNR, seat number, and item description</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>All buses have CCTV for security</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Lost & Found department will assist within 24 hours</span>
                    </li>
                  </ul>
                </div>

                <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                  <h4 className="font-black text-orange-300 mb-3 text-xl">🌐 Natural Disaster or Severe Weather</h4>
                  <p className="text-sm text-gray-400 mb-3">During floods, storms, or natural calamities:</p>
                  <ul className="text-sm space-y-2 text-gray-400">
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Buses may be cancelled for passenger safety</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>100% refund or free rescheduling available</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>SMS alerts sent 6 hours before departure</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-orange-400">•</span>
                      <span>Check website/app for real-time updates</span>
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            {/* Quick Contact */}
            <section className="glass rounded-3xl p-8 shadow-2xl">
              <h3 className="text-3xl font-black text-sky-400 mb-6">📞 Emergency Contacts</h3>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-gradient-to-br from-primary to-red-700 text-white rounded-2xl p-6 text-center shadow-lg">
                  <div className="text-sm font-bold mb-2 text-red-100">24/7 Emergency Hotline</div>
                  <div className="text-3xl font-black mb-1">1800-123-4567</div>
                  <div className="text-xs text-red-100">Toll Free</div>
                </div>
                <div className="bg-gradient-to-br from-green-500 to-green-700 text-white rounded-2xl p-6 text-center shadow-lg">
                  <div className="text-sm font-bold mb-2 text-green-100">Customer Care</div>
                  <div className="text-2xl font-black mb-1">+91 98765-43210</div>
                  <div className="text-xs text-green-100">WhatsApp & Calls</div>
                </div>
                <div className="bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-2xl p-6 text-center shadow-lg">
                  <div className="text-sm font-bold mb-2 text-blue-100">Email Support</div>
                  <div className="text-lg font-black mb-1">support@busai.com</div>
                  <div className="text-xs text-blue-100">Response within 1 hour</div>
                </div>
                <div className="bg-gradient-to-br from-red-600 to-red-800 text-white rounded-2xl p-6 text-center shadow-lg">
                  <div className="text-sm font-bold mb-2 text-red-100">National Emergency</div>
                  <div className="text-3xl font-black mb-1">112</div>
                  <div className="text-xs text-red-100">Police, Fire, Medical</div>
                </div>
              </div>
            </section>

            {/* Service Promise */}
            <section className="glass rounded-3xl p-8 shadow-2xl bg-gradient-to-r from-primary/10 to-red-700/10">
              <h3 className="text-3xl font-black text-white text-center mb-6">🌟 Our Service Promise</h3>
              <p className="text-lg text-gray-400 text-center mb-8">We are committed to your safety, comfort, and satisfaction</p>
              <div className="grid md:grid-cols-3 gap-6">
                <div className="bg-white/[0.03] rounded-2xl p-6 text-center border border-white/[0.06]">
                  <div className="text-5xl mb-4">🛡️</div>
                  <h4 className="font-black text-white mb-2">Insurance Coverage</h4>
                  <p className="text-gray-400 text-sm">All passengers covered under comprehensive travel insurance</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-6 text-center border border-white/[0.06]">
                  <div className="text-5xl mb-4">📹</div>
                  <h4 className="font-black text-white mb-2">CCTV Monitoring</h4>
                  <p className="text-gray-400 text-sm">24/7 surveillance for your safety and security</p>
                </div>
                <div className="bg-white/[0.03] rounded-2xl p-6 text-center border border-white/[0.06]">
                  <div className="text-5xl mb-4">✨</div>
                  <h4 className="font-black text-white mb-2">AI-Powered Excellence</h4>
                  <p className="text-gray-400 text-sm">Smart technology for seamless travel experience</p>
                </div>
              </div>
            </section>
          </div>

          {/* Back Button */}
          <div className="text-center mt-12">
            <button
              onClick={() => navigate('/')}
              className="btn-ghost px-8 py-3"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
