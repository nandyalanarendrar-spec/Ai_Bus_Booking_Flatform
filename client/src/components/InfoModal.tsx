import { useState } from 'react';

export default function InfoModal() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Info Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-full transition font-semibold flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
        Info
      </button>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface-900/95 backdrop-blur-xl rounded-3xl shadow-2xl max-w-4xl border border-white/[0.08] w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-accent-600 to-accent-500 text-white p-6 rounded-t-3xl">
              <div className="flex justify-between items-center">
                <h2 className="text-3xl font-black">📋 Important Information</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="bg-white/20 hover:bg-white/30 rounded-full p-2 transition"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* What To Do */}
              <section className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6">
                <h3 className="text-2xl font-black text-emerald-400 mb-4 flex items-center gap-2">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ✅ WHAT TO DO
                </h3>
                <ul className="space-y-3 text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">1.</span>
                    <span><strong>Book in Advance:</strong> Reserve your seats at least 2-3 hours before departure for best availability</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">2.</span>
                    <span><strong>Verify Travel Date:</strong> Always double-check your travel date before confirming booking</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">3.</span>
                    <span><strong>Arrive Early:</strong> Reach the boarding point at least 15 minutes before departure time</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">4.</span>
                    <span><strong>Save PNR Number:</strong> Keep your PNR safe for booking verification and cancellation</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">5.</span>
                    <span><strong>Carry Valid ID:</strong> Always carry government-issued ID proof during travel</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">6.</span>
                    <span><strong>Check Seat Availability:</strong> Use the calendar view to see real-time seat availability for all dates</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-emerald-400 font-bold flex-shrink-0">7.</span>
                    <span><strong>Contact Support:</strong> Reach out 24/7 for any queries at 1800-123-4567</span>
                  </li>
                </ul>
              </section>

              {/* What NOT To Do */}
              <section className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6">
                <h3 className="text-2xl font-black text-red-400 mb-4 flex items-center gap-2">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  ❌ WHAT NOT TO DO
                </h3>
                <ul className="space-y-3 text-gray-300">
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">1.</span>
                    <span><strong>Don't Miss Boarding Time:</strong> Buses will not wait - late arrivals forfeit their seats</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">2.</span>
                    <span><strong>Don't Share PNR:</strong> Your PNR is confidential - sharing it may lead to unauthorized cancellations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">3.</span>
                    <span><strong>Don't Book Wrong Dates:</strong> Verify your travel date carefully - wrong date bookings are non-refundable</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">4.</span>
                    <span><strong>Don't Carry Prohibited Items:</strong> Weapons, explosives, flammable materials are strictly prohibited</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">5.</span>
                    <span><strong>Don't Cancel Last Minute:</strong> Cancellations within 2 hours of departure incur 50% charges</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">6.</span>
                    <span><strong>Don't Board Without Booking:</strong> All passengers must have confirmed reservations</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-red-400 font-bold flex-shrink-0">7.</span>
                    <span><strong>Don't Ignore Safety Rules:</strong> Follow driver instructions and wear seatbelts at all times</span>
                  </li>
                </ul>
              </section>

              {/* Emergency Situations */}
              <section className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-6">
                <h3 className="text-2xl font-black text-orange-400 mb-4 flex items-center gap-2">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  🚨 EMERGENCY PROTOCOLS
                </h3>
                <div className="space-y-4 text-gray-300">
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">🚑 Medical Emergency</h4>
                    <p className="text-sm mb-2">If you or a passenger feels unwell during travel:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Immediately inform the bus driver or conductor</li>
                      <li>• Call Emergency Hotline: <strong>1800-123-4567</strong></li>
                      <li>• Bus will stop at nearest medical facility</li>
                      <li>• First aid kit available in all buses</li>
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">🔥 Fire or Accident</h4>
                    <p className="text-sm mb-2">In case of fire, accident, or immediate danger:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Stay calm and follow driver's evacuation instructions</li>
                      <li>• Use emergency exits (clearly marked in bus)</li>
                      <li>• Call Emergency: <strong>1800-123-4567</strong> or dial <strong>112</strong></li>
                      <li>• Do not panic or create chaos</li>
                      <li>• All buses have fire extinguishers and emergency tools</li>
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">🚌 Bus Breakdown or Delay</h4>
                    <p className="text-sm mb-2">If your bus breaks down or is significantly delayed:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Contact Support: <strong>1800-123-4567</strong></li>
                      <li>• Replacement bus will be arranged within 30 minutes</li>
                      <li>• Full refund available if delay exceeds 2 hours</li>
                      <li>• SMS updates will be sent to your registered number</li>
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">🎫 Lost PNR or Booking Issue</h4>
                    <p className="text-sm mb-2">If you lose your PNR or face booking problems:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Call Customer Care: <strong>+91 98765-43210</strong></li>
                      <li>• Provide registered email/phone for verification</li>
                      <li>• PNR will be resent via SMS/Email within 5 minutes</li>
                      <li>• Check "My Bookings" page after login</li>
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">💼 Lost Luggage or Belongings</h4>
                    <p className="text-sm mb-2">If you lose items during travel:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Immediately contact: <strong>1800-123-4567</strong></li>
                      <li>• Provide PNR, seat number, and item description</li>
                      <li>• All buses have CCTV for security</li>
                      <li>• Lost & Found department will assist within 24 hours</li>
                    </ul>
                  </div>

                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <h4 className="font-black text-orange-400 mb-2">🌐 Natural Disaster or Severe Weather</h4>
                    <p className="text-sm mb-2">During floods, storms, or natural calamities:</p>
                    <ul className="text-sm space-y-1 ml-4">
                      <li>• Buses may be cancelled for passenger safety</li>
                      <li>• 100% refund or free rescheduling available</li>
                      <li>• SMS alerts sent 6 hours before departure</li>
                      <li>• Check website/app for real-time updates</li>
                    </ul>
                  </div>
                </div>
              </section>

              {/* Quick Contact */}
              <section className="bg-sky-500/10 border border-sky-500/20 rounded-2xl p-6">
                <h3 className="text-2xl font-black text-sky-400 mb-4">📞 Emergency Contacts</h3>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <div className="font-black text-sky-300 mb-1">24/7 Emergency Hotline</div>
                    <div className="text-2xl font-black text-accent-400">1800-123-4567</div>
                    <div className="text-sm text-gray-400">Toll Free</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <div className="font-black text-sky-300 mb-1">Customer Care</div>
                    <div className="text-2xl font-black text-accent-400">+91 98765-43210</div>
                    <div className="text-sm text-gray-400">WhatsApp & Calls</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <div className="font-black text-sky-300 mb-1">Email Support</div>
                    <div className="text-lg font-bold text-accent-400">support@busai.com</div>
                    <div className="text-sm text-gray-400">Response within 1 hour</div>
                  </div>
                  <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
                    <div className="font-black text-sky-300 mb-1">National Emergency</div>
                    <div className="text-2xl font-black text-red-400">112</div>
                    <div className="text-sm text-gray-400">Police, Fire, Medical</div>
                  </div>
                </div>
              </section>

              {/* Service Promise */}
              <section className="bg-gradient-to-r from-accent-600 to-accent-500 text-white rounded-2xl p-6 text-center">
                <h3 className="text-2xl font-black mb-3">🌟 Our Service Promise</h3>
                <p className="text-lg mb-4">We are committed to your safety, comfort, and satisfaction</p>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-3xl mb-2">🛡️</div>
                    <div className="font-bold">Insurance Coverage</div>
                    <div className="text-accent-200">All passengers covered</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-3xl mb-2">📹</div>
                    <div className="font-bold">CCTV Monitoring</div>
                    <div className="text-accent-200">24/7 surveillance</div>
                  </div>
                  <div className="bg-white/10 rounded-xl p-3">
                    <div className="text-3xl mb-2">✨</div>
                    <div className="font-bold">Quality Service</div>
                    <div className="text-accent-200">AI-powered excellence</div>
                  </div>
                </div>
              </section>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-surface-800 p-4 rounded-b-3xl border-t border-white/[0.06] flex justify-center gap-4">
              <button
                onClick={() => setIsOpen(false)}
                className="btn-accent text-white font-bold px-8 py-3 rounded-full transition hover:scale-105"
              >
                Got It!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
