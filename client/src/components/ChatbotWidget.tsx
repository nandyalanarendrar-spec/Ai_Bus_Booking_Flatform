import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';

interface Message {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  agentsInvolved?: string[];
  reactSteps?: number;
  duration?: number;
  structuredData?: any;
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

export default function ChatbotWidget() {
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const defaultMessages: Message[] = [
    {
      id: 0,
      role: 'system',
      content: '👋 Hi!\'m your AI Travel Assistant.\n\nI can help you:\n• 🔍 Search buses\n• 🎫 Book tickets\n• ❌ Cancel bookings\n\nJust type naturally!',
      timestamp: new Date()
    }
  ];

  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const saved = sessionStorage.getItem('chatbot_messages');
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Save messages to sessionStorage whenever they change
  useEffect(() => {
    sessionStorage.setItem('chatbot_messages', JSON.stringify(messages));
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Poll LLM status periodically to show availability
  useEffect(() => {
    let mounted = true;
    async function fetchStatus() {
      try {
        const res = await api.get('/agents/llm/status');
        if (!mounted) return;
        setLlmStatus({ available: res.data.available, ready: res.data.ready, lastError: res.data.lastError });
      } catch (e) {
        if (!mounted) return;
        setLlmStatus({ available: false });
      }
    }
    fetchStatus();
    const iv = setInterval(fetchStatus, 10000);
    return () => { mounted = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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

    if (!isAuthenticated) {
      const errorMsg: Message = {
        id: Date.now(),
        role: 'assistant',
        content: '🔒 Please log in to use the AI assistant.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMsg]);
      return;
    }

    const userMsg: Message = {
      id: Date.now(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };
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
        structuredData: data.structuredData || null
      };

      // If server returned a session snapshot, persist it locally
      if (data.session) {
        const nextCtx = { ...conversationContext, ...data.session };
        setConversationContext(nextCtx);
        try { sessionStorage.setItem('conversation_context', JSON.stringify(nextCtx)); } catch {}
      } else if (data.structuredData && data.structuredData.sessionContext) {
        const nextCtx = { ...conversationContext, ...data.structuredData.sessionContext };
        setConversationContext(nextCtx);
        try { sessionStorage.setItem('conversation_context', JSON.stringify(nextCtx)); } catch {}
      }

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const status = err.response?.status;
      const errorText = err.response?.data?.error || 'Something went wrong.';
      
      if (status === 401 || status === 403) {
        const errorMsg: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: '🔒 Session expired. Please log in again.',
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
        setTimeout(() => {
          logout();
          navigate('/login');
        }, 2000);
      } else {
        const errorMsg: Message = {
          id: Date.now() + 1,
          role: 'assistant',
          content: errorText,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const renderBusCards = (data: any) => {
    if (!data?.buses || data.buses.length === 0) return null;
    return (
      <div className="mt-2 space-y-2">
        {data.buses.slice(0, 3).map((bus: BusResult, i: number) => (
          <div key={i} className="bg-white/[0.04] rounded-lg p-2 border border-white/[0.08] text-xs">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-semibold text-white">{bus.bus_name}</p>
                <p className="text-gray-400">{bus.operator}</p>
              </div>
              <div className="text-right">
                <p className="text-green-400 font-bold">₹{bus.base_price}</p>
                <p className="text-gray-400">{bus.available_seats} seats</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-1 text-gray-400">
              <span>🕐 {bus.departure_time}</span>
              <span>{bus.has_ac ? '❄️' : ''} {bus.is_sleeper ? '🛏️' : ''}</span>
            </div>
            <button
              onClick={() => {
                navigate(`/seats/${bus.schedule_id}`);
                setIsOpen(false);
              }}
              className="mt-2 w-full bg-accent-600 hover:bg-accent-500 text-white text-xs py-1.5 rounded-lg transition font-medium"
            >
              Select Seats →
            </button>
          </div>
        ))}
      </div>
    );
  };

  const renderPayButton = (data: any) => {
    if (data?.status !== 'pending_payment' || !data?.pendingBooking) return null;
    const pb = data.pendingBooking;
    
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
    
    return (
      <div className="mt-3">
        <button
          onClick={() => {
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
            setIsOpen(false);
          }}
          className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-sm font-bold py-2.5 rounded-lg transition-all active:scale-95 shadow-lg"
        >
          💳 Pay ₹{pb.totalPrice} Now →
        </button>
      </div>
    );
  };

  const renderCancelButton = (data: any) => {
    if (data?.status !== 'pending_cancellation' || !data?.pendingCancellation) return null;
    const pc = data.pendingCancellation;
    return (
      <div className="mt-2">
        <button
          onClick={() => {
            navigate(`/cancel-confirm/${pc.pnr}`);
            setIsOpen(false);
          }}
          className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-sm font-bold py-2.5 rounded-lg transition-all active:scale-95 shadow-lg"
        >
          ❌ Confirm Cancel — Refund ₹{pc.refundAmount} →
        </button>
      </div>
    );
  };

  return (
    <>
      {/* Floating Chat Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-glow flex items-center justify-center transition-all duration-300 z-50 ${
          isOpen 
            ? 'bg-surface-700 hover:bg-surface-600 rotate-0' 
            : 'bg-gradient-to-r from-accent-600 to-accent-500 hover:from-accent-500 hover:to-accent-400 animate-pulse hover:animate-none'
        }`}
        title="AI Travel Assistant"
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <div className="relative">
            {/* Agent Icon */}
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
            </svg>
            {/* AI Badge */}
            <span className="absolute -top-1 -right-1 bg-green-500 text-white text-[8px] font-bold px-1 rounded-full">
              AI
            </span>
          </div>
        )}
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 w-96 h-[500px] bg-surface-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/[0.08] flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-accent-600 to-accent-500 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                </svg>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">AI Travel Assistant</h3>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-white/70 text-xs">Online</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/70 hover:text-white transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-surface-800 scrollbar-thin">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                    msg.role === 'user'
                      ? 'bg-accent-600 text-white rounded-br-sm'
                      : 'bg-white/[0.06] text-gray-100 rounded-bl-sm border border-white/[0.06]'
                  }`}
                >
                  <div className="text-sm whitespace-pre-wrap leading-relaxed">
                    {msg.content.split('\n').map((line, i) => (
                      <p key={i} className={i > 0 ? 'mt-1' : ''}>
                        {line.split(/(\*\*.*?\*\*)/).map((part, j) =>
                          part.startsWith('**') && part.endsWith('**')
                            ? <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>
                            : <span key={j}>{part}</span>
                        )}
                      </p>
                    ))}
                  </div>
                  {msg.role === 'assistant' && msg.structuredData && renderBusCards(msg.structuredData)}
                  {msg.role === 'assistant' && msg.structuredData && renderPayButton(msg.structuredData)}
                  {msg.role === 'assistant' && msg.structuredData && renderCancelButton(msg.structuredData)}
                  {msg.role === 'assistant' && msg.agentsInvolved && msg.agentsInvolved.length > 0 && (
                    <div className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                      <span>🤖 {msg.agentsInvolved.length} agents</span>
                      <span>• {msg.duration}ms</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.06] rounded-2xl rounded-bl-sm px-3 py-2 border border-white/[0.06]">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-accent-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    Thinking...
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Actions (show when few messages) */}
          {messages.length <= 1 && (
            <div className="px-3 py-2 bg-surface-800 border-t border-white/[0.06] flex flex-wrap gap-1">
              {[
                { label: '🔍 Search buses', msg: 'Find buses from Mumbai to Pune tomorrow' },
                { label: '📋 My bookings', msg: 'Show my bookings' },
              ].map((qa, i) => (
                <button
                  key={i}
                  onClick={() => setInput(qa.msg)}
                  className="text-xs bg-white/[0.06] hover:bg-white/[0.1] text-gray-300 px-2 py-1 rounded-lg transition border border-white/[0.06]"
                >
                  {qa.label}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-surface-900 border-t border-white/[0.08]">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isAuthenticated ? "Type a message..." : "Login to chat..."}
                className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30 text-sm transition"
                disabled={loading || !isAuthenticated}
              />
              <button
                onClick={sendMessage}
                disabled={loading || !input.trim() || !isAuthenticated}
                className="bg-accent-600 hover:bg-accent-500 disabled:bg-surface-700 disabled:text-gray-500 text-white px-4 py-2 rounded-xl transition text-sm"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            {!isAuthenticated && (
              <button
                onClick={() => {
                  navigate('/login');
                  setIsOpen(false);
                }}
                className="mt-2 w-full text-xs text-accent-400 hover:text-accent-300 transition"
              >
                Click here to login →
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
