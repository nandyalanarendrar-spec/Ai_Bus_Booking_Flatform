import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

// Web Speech API types
interface SpeechRecognitionEvent {
  results: { [index: number]: { [index: number]: { transcript: string } } };
  resultIndex: number;
}
interface SpeechRecognitionErrorEvent {
  error: string;
}
interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}
declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition: new () => SpeechRecognitionInstance;
  }
}

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentsInvolved?: string[];
  reactSteps?: number;
  duration?: number;
  structuredData?: any;
  intent?: { taskType: string; confidence: number };
}

interface BusResult {
  bus_name: string;
  operator: string;
  bus_type: string;
  departure_time: string;
  arrival_time: string;
  base_price: number;
  available_seats: number;
  has_ac: number;
  is_sleeper: number;
  rating: number;
  schedule_id: number;
  distance_km: number;
  duration_hours: number;
  from_city: string;
  to_city: string;
}

const agentsList = [
  { name: 'Orchestrator', desc: 'Plans & routes tasks', icon: '🎯', gradient: 'from-violet-500 to-purple-600' },
  { name: 'SearchMatch', desc: 'Finds routes & buses', icon: '🔍', gradient: 'from-blue-500 to-cyan-500' },
  { name: 'PriceIntel', desc: 'Fare analysis', icon: '💰', gradient: 'from-emerald-500 to-green-500' },
  { name: 'UserContext', desc: 'Preferences & history', icon: '👤', gradient: 'from-amber-500 to-yellow-500' },
  { name: 'Safety', desc: 'Fraud & anomaly check', icon: '🛡️', gradient: 'from-red-500 to-rose-500' },
  { name: 'Policy', desc: 'Refund & cancellation', icon: '📋', gradient: 'from-orange-500 to-amber-500' },
  { name: 'Conversational', desc: 'Formats responses', icon: '💬', gradient: 'from-sky-500 to-blue-500' },
];

export default function AIAgentPage() {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const defaultMessages: Message[] = [
    {
      id: 0,
      role: 'system',
      content: '👋 Welcome! I\'m your **AI Travel Assistant** — powered by **5 specialized agents** using the ReAct reasoning pattern.\n\nHere\'s what I can do:\n• 🔍 **Search buses** — "Find buses from Mumbai to Pune tomorrow"\n• 🎫 **Book tickets** — "Book a window seat on the next bus to Bangalore"\n• ❌ **Cancel bookings** — "Cancel booking #5"\n• 💬 **Answer questions** — "What routes have AC sleeper buses?"\n\nJust type naturally — I understand conversational language!',
      timestamp: new Date()
    }
  ];

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem('aiagent_messages');
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
      }
    } catch {}
    return defaultMessages;
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{available:boolean; ready?:boolean; lastError?:string}|null>(null);
  const [conversationContext, setConversationContext] = useState<any>(() => {
    try { return JSON.parse(sessionStorage.getItem('conversation_context') || 'null'); } catch { return null; }
  });
  const [showSidebar, setShowSidebar] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setVoiceSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';
      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    const recognition = recognitionRef.current;
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => prev ? prev + ' ' + transcript : transcript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  useEffect(() => {
    sessionStorage.setItem('aiagent_messages', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    let mounted = true;
    async function fetchStatus() {
      try {
        const res = await api.get('/agents/llm/status');
        if (!mounted) return;
        setLlmStatus({ available: res.data.available, ready: res.data.ready, lastError: res.data.lastError });
      } catch {
        if (!mounted) return;
        setLlmStatus({ available: false });
      }
    }
    fetchStatus();
    const iv = setInterval(fetchStatus, 10000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) navigate('/login');
  }, [isAuthenticated, navigate]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 120) + 'px';
    }
  }, [input]);

  const quickActions = [
    { label: 'Hyderabad → Bangalore', icon: '🚌', msg: 'Find buses from Hyderabad to Bangalore' },
    { label: 'Mumbai → Pune', icon: '🌆', msg: 'Show me buses from Mumbai to Pune tomorrow' },
    { label: 'Delhi → Jaipur', icon: '🏰', msg: 'Search buses from Delhi to Jaipur' },
    { label: 'My Bookings', icon: '📋', msg: 'Show my recent bookings' },
    { label: 'Best AC Sleeper', icon: '❄️', msg: 'Find best AC sleeper bus from Hyderabad to Chennai' },
    { label: 'Cheapest Bus', icon: '💰', msg: 'Find cheapest bus from Bangalore to Mumbai' },
  ];

  const getLiveContext = () => {
    const live: any = {
      currentPath: window.location.pathname,
      ...conversationContext
    };
    try {
      const searchParams = sessionStorage.getItem('searchParams');
      if (searchParams) live.searchParams = JSON.parse(searchParams);
    } catch {}
    try {
      const selectedBus = sessionStorage.getItem('selectedBus');
      if (selectedBus) live.selectedBus = JSON.parse(selectedBus);
    } catch {}
    try {
      const selectedSeats = sessionStorage.getItem('selectedSeats');
      if (selectedSeats) live.selectedSeats = JSON.parse(selectedSeats);
    } catch {}
    return live;
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now(), role: 'user', content: input.trim(), timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const activeCtx = getLiveContext();
      const res = await api.post('/agents/chat', { message: userMsg.content, context: activeCtx });
      const data = res.data;
      const assistantMsg: Message = {
        id: Date.now() + 1,
        role: 'assistant',
        content: data.response || 'No response from agents.',
        timestamp: new Date(),
        agentsInvolved: data.agentsInvolved || [],
        reactSteps: data.reactSummary?.totalSteps || 0,
        duration: data.reactSummary?.totalDuration_ms || 0,
        structuredData: data.structuredData || null,
        intent: data.intent || null
      };

      if (data.session) {
        const nextCtx = { ...conversationContext, ...data.session };
        setConversationContext(nextCtx);
        try { sessionStorage.setItem('conversation_context', JSON.stringify(nextCtx)); } catch {}
      } else if (data.structuredData && data.structuredData.sessionContext) {
        const nextCtx = { ...conversationContext, ...data.structuredData.sessionContext };
        setConversationContext(nextCtx);
        try { sessionStorage.setItem('conversation_context', JSON.stringify(nextCtx)); } catch {}
      }

      const sd = data.structuredData;
      if (sd && (sd.status === 'seats_released' || sd.status === 'seats_released_partial')) {
        setMessages(prev => {
          const updated = prev.map(m => {
            if (m.structuredData?.status === 'pending_payment' && m.structuredData?.pendingBooking?.scheduleId === sd.scheduleId) {
              if (sd.status === 'seats_released') {
                return { ...m, structuredData: { ...m.structuredData, status: 'seats_cleared' } };
              } else if (sd.remainingSeats && sd.remainingSeats.length > 0) {
                const pb = m.structuredData.pendingBooking;
                const pricePerSeat = pb.totalPrice / (pb.seats?.length || 1);
                return {
                  ...m,
                  structuredData: {
                    ...m.structuredData,
                    pendingBooking: { ...pb, seats: sd.remainingSeats, totalPrice: Math.round(pricePerSeat * sd.remainingSeats.length) }
                  }
                };
              }
            }
            return m;
          });
          return [...updated, assistantMsg];
        });
      } else {
        setMessages(prev => [...prev, assistantMsg]);
      }
    } catch (err: any) {
      const status = err.response?.status;
      const errorText = err.response?.data?.error || 'Something went wrong. Please try again.';
      if (status === 401 || status === 403) {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: '🔒 Your session has expired. Redirecting to login...', timestamp: new Date() }]);
        setTimeout(() => { logout(); navigate('/login'); }, 2000);
      } else {
        setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: errorText, timestamp: new Date() }]);
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const clearChat = () => {
    setMessages(defaultMessages);
    sessionStorage.removeItem('aiagent_messages');
  };

  // --- Renderers ---

  const renderBusCards = (data: any) => {
    if (!data?.buses || data.buses.length === 0) return null;
    return (
      <div className="mt-4 space-y-3">
        {data.buses.slice(0, 5).map((bus: BusResult, i: number) => (
          <div key={i} className="group bg-white/[0.03] hover:bg-white/[0.06] backdrop-blur-sm rounded-2xl p-4 border border-white/[0.06] hover:border-accent-500/30 transition-all duration-300 hover:shadow-glow">
            <div className="flex justify-between items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-bold text-white text-sm truncate">{bus.bus_name}</h4>
                  {bus.has_ac ? <span className="shrink-0 text-[10px] bg-sky-500/10 text-sky-400 border border-sky-500/20 px-1.5 py-0.5 rounded-full font-medium">AC</span> : null}
                  {bus.is_sleeper ? <span className="shrink-0 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 px-1.5 py-0.5 rounded-full font-medium">Sleeper</span> : null}
                </div>
                <p className="text-gray-500 text-xs">{bus.operator} · {bus.bus_type}</p>
                {bus.from_city && bus.to_city && (
                  <p className="text-gray-400 text-xs mt-1 flex items-center gap-1">
                    <span className="text-accent-400">{bus.from_city}</span>
                    <svg className="w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    <span className="text-accent-400">{bus.to_city}</span>
                  </p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="text-2xl font-extrabold text-white">₹{bus.base_price}</p>
                <p className="text-xs text-gray-500">{bus.available_seats} seats left</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.04]">
              <div className="flex items-center gap-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> {bus.departure_time} → {bus.arrival_time}</span>
                {bus.duration_hours && <span>{bus.duration_hours}h</span>}
                {bus.distance_km && <span>{bus.distance_km} km</span>}
              </div>
              <span className="text-yellow-400 text-xs font-semibold flex items-center gap-0.5">
                <svg className="w-3 h-3 fill-yellow-400" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                {bus.rating}
              </span>
            </div>
            <button
              onClick={() => navigate(`/seats/${bus.schedule_id}`)}
              className="mt-3 w-full btn-accent py-2.5 text-xs flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
              Select Seats
            </button>
          </div>
        ))}
      </div>
    );
  };

  const isWithin2Hours = (travelDate: string, departureTime: string): boolean => {
    try {
      const journeyDateTime = new Date(`${travelDate}T${departureTime}`);
      const now = new Date();
      return (journeyDateTime.getTime() - now.getTime()) >= 0 && (journeyDateTime.getTime() - now.getTime()) < 2 * 60 * 60 * 1000;
    } catch { return false; }
  };

  const handleDeselectSeat = async (seat: string, pb: any, msgId: number) => {
    if (isWithin2Hours(pb.travelDate, pb.departureTime)) {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant', content: `⚠️ **Cannot deselect seat ${seat} from ${pb.busName || 'this bus'}**\n\nDeparture is less than 2 hours away — seats cannot be deselected.`, timestamp: new Date() }]);
      return;
    }
    try {
      await api.post('/buses/release-seat', { scheduleId: pb.scheduleId, seatNumber: seat });
      const remainingSeats = (pb.seats || []).filter((s: string) => s !== seat);
      const pricePerSeat = pb.totalPrice / (pb.seats?.length || 1);
      if (remainingSeats.length === 0) {
        setMessages(prev => {
          const updated = prev.map(m => m.id === msgId && m.structuredData?.status === 'pending_payment' ? { ...m, structuredData: { ...m.structuredData, status: 'seats_cleared' } } : m);
          return [...updated, { id: Date.now() + 1, role: 'assistant' as const, content: `✅ **Seat ${seat} deselected from ${pb.busName}**\n\nAll seats deselected. Search for a new bus to book again.`, timestamp: new Date() }];
        });
      } else {
        setMessages(prev => {
          const updated = prev.map(m => {
            if (m.id === msgId && m.structuredData?.status === 'pending_payment') {
              return { ...m, structuredData: { ...m.structuredData, pendingBooking: { ...pb, seats: remainingSeats, totalPrice: Math.round(pricePerSeat * remainingSeats.length) } } };
            }
            return m;
          });
          return [...updated, { id: Date.now() + 1, role: 'assistant' as const, content: `✅ **Seat ${seat} deselected from ${pb.busName}**\n\n💺 Remaining: **${remainingSeats.join(', ')}**`, timestamp: new Date() }];
        });
      }
    } catch {
      setMessages(prev => [...prev, { id: Date.now() + 1, role: 'assistant' as const, content: `⚠️ Failed to deselect seat ${seat}. It may have already been released.`, timestamp: new Date() }]);
    }
  };

  const renderPayButton = (data: any, msgId: number) => {
    if (data?.status !== 'pending_payment' || !data?.pendingBooking) return null;
    const pb = data.pendingBooking;
    const tooClose = isWithin2Hours(pb.travelDate, pb.departureTime);
    return (
      <div className="mt-4 space-y-3">
        <div className="bg-white/[0.03] rounded-xl p-4 border border-white/[0.06]">
          <div className="text-xs text-gray-500 mb-3 font-semibold uppercase tracking-wider">Selected Seats · {pb.busName || 'Bus'}</div>
          <div className="flex flex-wrap gap-2">
            {(pb.seats || []).map((seat: string, i: number) => (
              <div key={i} className="flex flex-col items-center gap-1.5 animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="inline-flex items-center gap-1.5 bg-accent-500/10 text-accent-300 text-xs font-semibold px-3 py-2 rounded-xl border border-accent-500/20">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" /></svg>
                  {seat}
                </span>
                {!tooClose && (
                  <button
                    onClick={() => handleDeselectSeat(seat, pb, msgId)}
                    className="text-[10px] text-red-400/80 hover:text-red-300 bg-red-500/5 hover:bg-red-500/15 border border-red-500/10 hover:border-red-500/30 px-2.5 py-1 rounded-lg transition-all duration-200 font-medium"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {tooClose && (
            <p className="text-amber-400/80 text-[11px] mt-3 flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              Departure within 2 hours — cannot modify seats
            </p>
          )}
        </div>
        <button
          onClick={() => {
            // Prepare passengers array from pendingBooking data
            const passengers = pb.passengers && Array.isArray(pb.passengers) 
              ? pb.passengers.map((p: any) => ({
                  seatNumber: p.seat || p.seatNumber || '',
                  name: p.name || '',
                  age: p.age ? Number(p.age) : undefined,
                  gender: p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : p.gender || undefined
                }))
              : pb.seats && pb.seats.length > 0
                ? pb.seats.map((seat: string) => ({
                    seatNumber: seat,
                    name: pb.passengerName || '',
                    age: pb.passengerAge ? Number(pb.passengerAge) : undefined,
                    gender: pb.passengerGender === 'M' ? 'Male' : pb.passengerGender === 'F' ? 'Female' : pb.passengerGender || undefined
                  }))
                : [];

            navigate('/payment', {
              state: {
                bookingData: {
                  scheduleId: pb.scheduleId,
                  passengers: passengers,
                  totalPrice: pb.totalPrice,
                  busName: pb.busName,
                  busNumber: pb.busNumber,
                  fromCity: pb.fromCity,
                  toCity: pb.toCity,
                  travelDate: pb.travelDate,
                  departureTime: pb.departureTime,
                }
              }
            });
          }}
          className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-bold py-3.5 rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-600/20 text-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          Pay ₹{pb.totalPrice} · Complete Booking
        </button>
      </div>
    );
  };

  const renderCancelButton = (data: any) => {
    if (data?.status !== 'pending_cancellation' || !data?.pendingCancellation) return null;
    const pc = data.pendingCancellation;
    return (
      <div className="mt-4">
        <button
          onClick={() => navigate(`/cancel-confirm/${pc.pnr}`)}
          className="w-full bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white font-bold py-3.5 rounded-2xl transition-all duration-200 active:scale-[0.98] shadow-lg shadow-red-600/20 text-sm flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          Confirm Cancellation · Refund ₹{pc.refundAmount}
        </button>
      </div>
    );
  };

  const renderAgentBadges = (msg: Message) => {
    if (!msg.agentsInvolved || msg.agentsInvolved.length === 0) return null;
    return (
      <div className="mt-3 pt-3 border-t border-white/[0.04] flex flex-wrap gap-1.5 items-center">
        {msg.agentsInvolved.map((agent, i) => (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-accent-500/10 text-accent-300 border border-accent-500/10">
            {agent.replace('Agent', '')}
          </span>
        ))}
        {msg.reactSteps !== undefined && (
          <span className="text-[10px] text-gray-600 ml-1">
            {msg.reactSteps} steps · {msg.duration}ms
          </span>
        )}
      </div>
    );
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // ====== FULL SCREEN LAYOUT ======
  return (
    <div className="fixed inset-0 flex flex-col bg-surface-900 mesh-gradient">
      {/* ── Top Bar ── */}
      <header className="shrink-0 px-5 py-3 border-b border-white/[0.06] bg-surface-900/80 backdrop-blur-xl z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 group"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/20 group-hover:shadow-primary-500/30 transition-all">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
              </div>
              <span className="text-white font-extrabold text-lg tracking-tight">BusGo</span>
            </button>
            <div className="h-6 w-px bg-white/10" />
            <div className="flex items-center gap-2.5 bg-white/[0.04] rounded-full px-3.5 py-1.5 border border-white/[0.06]">
              <div className="relative">
                <div className="w-2 h-2 bg-emerald-400 rounded-full" />
                <div className="absolute inset-0 w-2 h-2 bg-emerald-400 rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-gray-300 text-sm font-semibold">AI Agent</span>
              <span className="text-[10px] text-gray-500 bg-white/5 px-1.5 py-0.5 rounded font-mono">ReAct</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={clearChat}
              className="btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5"
              title="Clear conversation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              <span className="hidden sm:inline">Clear</span>
            </button>
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`btn-ghost px-3 py-1.5 text-xs flex items-center gap-1.5 ${showSidebar ? 'bg-accent-500/10 border-accent-500/20 text-accent-300' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="hidden sm:inline">Agents</span>
            </button>
            {isAuthenticated && (
              <div className="flex items-center gap-2 ml-2 bg-white/[0.03] rounded-full pl-3 pr-1 py-1 border border-white/[0.06]">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center text-white text-[10px] font-bold">
                  {user?.username?.charAt(0)?.toUpperCase()}
                </div>
                <span className="text-gray-400 text-xs font-medium hidden sm:inline">{user?.username}</span>
                <button onClick={() => { logout(); navigate('/'); }} className="text-gray-500 hover:text-red-400 p-1.5 rounded-full hover:bg-white/5 transition-all">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Content Area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Chat Area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-6">
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((msg, idx) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}
                  style={{ animationDelay: `${idx * 20}ms` }}
                >
                  {msg.role !== 'user' && (
                    <div className="shrink-0 mr-3 mt-1">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm ${msg.role === 'system' ? 'bg-gradient-to-br from-accent-600 to-accent-700' : 'bg-gradient-to-br from-accent-500 to-purple-600'} shadow-lg`}>
                        {msg.role === 'system' ? '🤖' : '✨'}
                      </div>
                    </div>
                  )}
                  <div
                    className={`max-w-[75%] rounded-2xl px-5 py-4 ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white rounded-br-lg shadow-lg shadow-primary-600/10'
                        : msg.role === 'system'
                        ? 'bg-white/[0.03] text-gray-300 border border-white/[0.06] rounded-bl-lg'
                        : 'bg-white/[0.04] text-gray-200 border border-white/[0.06] rounded-bl-lg hover:border-white/[0.1] transition-colors'
                    }`}
                    onClick={() => msg.role === 'assistant' && setSelectedMessage(msg)}
                  >
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.content.split('\n').map((line, i) => (
                        <p key={i} className={i > 0 ? 'mt-1.5' : ''}>
                          {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                            part.startsWith('**') && part.endsWith('**')
                              ? <strong key={j} className="font-bold text-white">{part.slice(2, -2)}</strong>
                              : <span key={j}>{part}</span>
                          )}
                        </p>
                      ))}
                    </div>
                    {msg.role === 'assistant' && msg.structuredData && renderBusCards(msg.structuredData)}
                    {msg.role === 'assistant' && msg.structuredData && renderPayButton(msg.structuredData, msg.id)}
                    {msg.role === 'assistant' && msg.structuredData && renderCancelButton(msg.structuredData)}
                    {msg.role === 'assistant' && renderAgentBadges(msg)}
                    {msg.role === 'user' && (
                      <div className="mt-1.5 text-[10px] text-white/40 text-right">{formatTime(msg.timestamp)}</div>
                    )}
                  </div>
                  {msg.role === 'user' && (
                    <div className="shrink-0 ml-3 mt-1">
                      <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center text-white text-xs font-bold shadow-lg">
                        {user?.username?.charAt(0)?.toUpperCase() || 'U'}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex justify-start animate-fade-in">
                  <div className="shrink-0 mr-3 mt-1">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-500 to-purple-600 flex items-center justify-center shadow-lg">✨</div>
                  </div>
                  <div className="bg-white/[0.04] border border-white/[0.06] rounded-2xl rounded-bl-lg px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-gray-500 text-sm">Agents processing...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Quick Actions (shown when chat is near-empty) */}
          {messages.length <= 1 && (
            <div className="shrink-0 px-4 pb-4">
              <div className="max-w-3xl mx-auto">
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-3 pl-1">Quick Actions</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {quickActions.map((qa, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(qa.msg)}
                      className="group text-left bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.06] hover:border-accent-500/20 rounded-xl px-4 py-3 transition-all duration-200 hover:shadow-glow"
                    >
                      <span className="text-lg">{qa.icon}</span>
                      <p className="text-sm text-gray-300 font-medium mt-1 group-hover:text-white transition-colors">{qa.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Input Area ── */}
          <div className="shrink-0 border-t border-white/[0.06] bg-surface-900/80 backdrop-blur-xl px-4 py-4">
            <div className="max-w-3xl mx-auto">
              <div className={`flex items-end gap-3 bg-white/[0.03] border ${isListening ? 'border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.15)]' : 'border-white/[0.08] hover:border-white/[0.12] focus-within:border-accent-500/30 focus-within:shadow-glow'} rounded-2xl px-4 py-3 transition-all duration-200`}>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={isListening ? 'Listening... speak now' : 'Ask me anything about bus travel...'}
                  className="flex-1 bg-transparent text-white placeholder-gray-600 focus:outline-none text-sm resize-none min-h-[24px] max-h-[120px] leading-6"
                  rows={1}
                  disabled={loading}
                />
                {voiceSupported && (
                  <button
                    onClick={toggleVoice}
                    disabled={loading}
                    className={`shrink-0 w-10 h-10 flex items-center justify-center rounded-xl transition-all duration-200 active:scale-95 ${
                      isListening
                        ? 'bg-red-500 text-white shadow-lg shadow-red-500/30 animate-pulse'
                        : 'bg-white/[0.05] hover:bg-white/[0.1] text-gray-400 hover:text-white border border-white/[0.08]'
                    }`}
                    title={isListening ? 'Stop listening' : 'Voice input'}
                  >
                    {isListening ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2" /></svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4M12 15a3 3 0 003-3V5a3 3 0 00-6 0v7a3 3 0 003 3z" /></svg>
                    )}
                  </button>
                )}
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 disabled:from-gray-800 disabled:to-gray-800 disabled:text-gray-600 text-white transition-all duration-200 active:scale-95 shadow-lg shadow-accent-600/20 disabled:shadow-none"
                >
                  {loading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                  )}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-2 text-center">Press Enter to send · Shift+Enter for new line{voiceSupported ? ' · 🎤 Voice input available' : ''}</p>
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        {showSidebar && (
          <div className="w-80 shrink-0 border-l border-white/[0.06] bg-surface-800/50 backdrop-blur-xl overflow-y-auto scrollbar-thin hidden lg:block">
            <div className="p-5">
              <h3 className="text-white font-bold text-sm mb-1">Multi-Agent Architecture</h3>
              <p className="text-gray-500 text-xs mb-5">7 specialized agents collaborate on every request</p>

              <div className="space-y-2.5">
                {agentsList.map((agent, i) => (
                  <div key={i} className="group bg-white/[0.02] hover:bg-white/[0.05] rounded-xl p-3 border border-white/[0.04] hover:border-white/[0.08] transition-all duration-200">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${agent.gradient} flex items-center justify-center text-sm shadow-lg`}>
                        {agent.icon}
                      </div>
                      <div>
                        <p className="text-white text-xs font-semibold">{agent.name}</p>
                        <p className="text-gray-500 text-[10px]">{agent.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* ReAct Pattern Explainer */}
              <div className="mt-6 bg-white/[0.02] rounded-xl p-4 border border-white/[0.04]">
                <h4 className="text-white text-xs font-bold mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                  ReAct Pattern
                </h4>
                <div className="space-y-2.5">
                  {[
                    { step: 'Think', desc: 'Analyze the request', color: 'text-amber-400', bg: 'bg-amber-500/10' },
                    { step: 'Act', desc: 'Query database / compute', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                    { step: 'Observe', desc: 'Evaluate results', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                  ].map((s, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <div className={`w-6 h-6 rounded-lg ${s.bg} flex items-center justify-center text-[10px] font-bold ${s.color}`}>{i + 1}</div>
                      <div>
                        <span className={`text-xs font-semibold ${s.color}`}>{s.step}</span>
                        <span className="text-gray-500 text-[10px] ml-1.5">{s.desc}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-gray-600 text-[10px] mt-3 italic">Cycle repeats until task is fully resolved.</p>
              </div>

              {/* Selected Message Details */}
              {selectedMessage && selectedMessage.agentsInvolved && (
                <div className="mt-4 bg-white/[0.02] rounded-xl p-4 border border-accent-500/10 animate-fade-in">
                  <h4 className="text-white text-xs font-bold mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-accent-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Response Details
                  </h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Agents</span>
                      <span className="text-gray-300 font-medium">{selectedMessage.agentsInvolved.map(a => a.replace('Agent','')).join(' → ')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Steps</span>
                      <span className="text-gray-300 font-medium">{selectedMessage.reactSteps}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Duration</span>
                      <span className="text-gray-300 font-medium">{selectedMessage.duration}ms</span>
                    </div>
                    {selectedMessage.intent && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Intent</span>
                        <span className="text-gray-300 font-medium">{selectedMessage.intent.taskType} ({Math.round(selectedMessage.intent.confidence * 100)}%)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
