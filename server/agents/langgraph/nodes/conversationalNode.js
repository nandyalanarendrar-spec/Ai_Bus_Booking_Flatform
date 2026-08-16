/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                  CONVERSATIONAL AGENT (CORE AGENT #5)                        ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  PURPOSE: Format all responses for user presentation                        ║
 * ║  USES LLM: Yes - for natural language enhancement                           ║
 * ║  DATABASE: None - pure formatting                                            ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  FLOW: [Any Agent] → conversationalNode → END                               ║
 * ║  This agent runs LAST in every graph flow                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

const llm = require('../llmService');

// ═══════════════════════════════════════════════════════════════════════════════
//                            RESPONSE TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

const TEMPLATES = {
  
  // Search results
  searchSuccess: (data) => {
    const { route, buses, availableCount, recommendations } = data;
    if (!buses || buses.length === 0) {
      return `No buses found from ${route?.from || 'source'} to ${route?.to || 'destination'} on ${route?.date || 'selected date'}.\n\nTry:\n• Different date\n• Nearby cities\n• Flexible timing`;
    }
    
    let response = `🚌 Found **${buses.length} buses** from **${route.from}** to **${route.to}** on **${route.date}**\n\n`;
    
    // Price range
    const prices = buses.map(b => b.base_price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    response += `💰 Price range: ₹${minPrice} - ₹${maxPrice}\n`;
    response += `🎫 ${availableCount} buses with available seats\n\n`;
    
    // Top recommendations
    if (recommendations && recommendations.length > 0) {
      response += `**🌟 Recommendations:**\n`;
      recommendations.forEach(rec => {
        response += `• **${rec.type}**: ${rec.bus.bus_name} - ₹${rec.bus.base_price} (${rec.reason})\n`;
      });
      response += '\n';
    }
    
    // First few buses
    response += `**Top Options:**\n`;
    buses.slice(0, 5).forEach((bus, i) => {
      const acLabel = bus.has_ac ? '❄️ AC' : '';
      const sleeperLabel = bus.is_sleeper ? '🛏️ Sleeper' : '💺 Seater';
      response += `${i + 1}. **${bus.bus_name}** ${acLabel} ${sleeperLabel}\n`;
      response += `   🕐 ${bus.departure_time} → ${bus.arrival_time} | 💺 ${bus.available_seats} seats | ₹${bus.base_price}\n`;
    });
    
    if (buses.length > 5) {
      response += `\n...and ${buses.length - 5} more options`;
    }
    
    return response;
  },
  
  // Booking confirmation
  bookingSuccess: (data) => {
    const { pnr, seats, seatTypes, totalPrice, pricePerSeat, journey, bus, passenger, passengers, multiplePassengers, preferences, fallback, fallbackReason, seatFallback } = data;
    
    // Format time for display (convert 24h to 12h format)
    const formatTime = (time24) => {
      if (!time24) return time24;
      const [h, m] = time24.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${m} ${ampm}`;
    };

    // Build fallback notice if seat preference couldn't be exactly met
    let fallbackNotice = '';
    if (fallback && fallbackReason) {
      fallbackNotice = `\n⚠️ **Note:** ${fallbackReason}\n`;
    } else if (seatFallback && seatFallback.reason) {
      fallbackNotice = `\n⚠️ **Note:** ${seatFallback.reason}\n`;
    }
    
    // Build seat display with types
    let seatDisplay = '';
    if (seatTypes && seatTypes.length > 0) {
      seatDisplay = seats.map((s, i) => `${s} (${seatTypes[i]})`).join(', ');
    } else {
      // Calculate seat types if not provided
      const getSeatType = (seatNum) => {
        const num = parseInt(seatNum.replace(/\\D/g, ''));
        const posInGroup = ((num - 1) % 4) + 1;
        return (posInGroup === 1 || posInGroup === 4) ? 'Window' : 'Aisle';
      };
      seatDisplay = seats.map(s => `${s} (${getSeatType(s)})`).join(', ');
    }
    
    // Build preferences applied and rationale section
    let rationaleSection = '';
    const prefs = [];
    if (preferences) {
      if (preferences.windowSeat) prefs.push('🪟 Window seat');
      if (preferences.timeOfDay) {
        const timeLabels = { morning: '🌅 Morning departure', afternoon: '☀️ Afternoon', evening: '🌆 Evening', night: '🌙 Night' };
        prefs.push(timeLabels[preferences.timeOfDay] || preferences.timeOfDay);
      }
    }
    
    let ageNoteText = data.ageBasedNote ? `\n• ${data.ageBasedNote}` : '';
    let busReasons = [];
    if (bus.rating) busReasons.push(`Top rated (⭐ ${bus.rating})`);
    if (bus.hasAC) busReasons.push('AC comfort');
    const busFeatureStr = busReasons.length > 0 ? busReasons.join(' • ') : 'Best value';
    
    rationaleSection = `\n**✨ Smart Selection Applied:**\n• **Bus:** Selected based on ${busFeatureStr}${ageNoteText}`;
    if (prefs.length > 0) rationaleSection += `\n• **Preferences:** ${prefs.join(', ')}`;
    rationaleSection += `\n`;
    
    // Bus features
    const busFeatures = [];
    if (bus.hasAC) busFeatures.push('❄️ AC');
    if (bus.isSleeper) busFeatures.push('🛏️ Sleeper');
    const featuresStr = busFeatures.length > 0 ? busFeatures.join(' ') : '';
    
    // Duration formatting
    const durationStr = journey.duration ? `${Math.floor(journey.duration)} hours` : '';
    
    // Build passenger section - handle single or multiple passengers
    let passengerSection = '';
    if (multiplePassengers || (passengers && passengers.length > 1)) {
      const passengerList = passengers || [];
      passengerSection = `**👥 Passengers (${passengerList.length}):**\n` +
        passengerList.map((p, idx) => 
          `${idx + 1}. **${p.name}**${p.age ? ` • ${p.age} yrs` : ''}${p.gender ? ` • ${p.gender === 'M' ? 'Male' : 'Female'}` : ''}`
        ).join('\n');
    } else {
      // Single passenger
      passengerSection = `**👤 Primary Passenger:**\n• **Name:** ${passenger?.name || 'Guest'}${passenger?.age ? `\n• **Age:** ${passenger.age} years` : ''}${passenger?.gender ? ` • ${passenger.gender === 'M' ? 'Male' : 'Female'}` : ''}`;
    }
    
    return `🎉 **Your Booking is Confirmed!**

🎫 **PNR: ${pnr}**
${rationaleSection}${fallbackNotice}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🚌 Journey Details:**
• **Route:** ${journey.from} → ${journey.to}
• **Bus:** ${bus.name} ${featuresStr} (${bus.type})
• **Operator:** ${bus.operator}
• **Rating:** ⭐ ${bus.rating}/5
• **Date:** ${journey.date}
• **Time:** ${formatTime(journey.departure)} → ${formatTime(journey.arrival)}
• **Distance:** ${journey.distance || 'N/A'} km
• **Duration:** ${durationStr}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**💺 Seat Details:**
• **Seats:** ${seatDisplay}
• **Available Seats:** ${seats.length}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${passengerSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**💰 Payment Summary:**
• **Per Seat:** ₹${pricePerSeat || Math.round(totalPrice / seats.length)}
• **Total:** ₹${totalPrice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📱 Save your PNR for check-in. Show PNR + ID at boarding point.`;
  },

  // Pending payment — booking validated but awaiting UPI PIN
  pendingPayment: (data) => {
    const { pendingBooking, journey, bus, passenger, passengers, multiplePassengers, ageBasedNote } = data;
    if (!pendingBooking) return 'Booking prepared. Please complete payment to confirm.';

    const formatTime = (time24) => {
      if (!time24) return time24;
      const [h, m] = time24.split(':');
      const hour = parseInt(h);
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour % 12 || 12;
      return `${hour12}:${m} ${ampm}`;
    };

    const seats = pendingBooking.seats || [];
    const getSeatType = (seatNum) => {
      const num = parseInt(seatNum.replace(/\D/g, ''));
      const posInGroup = ((num - 1) % 4) + 1;
      return (posInGroup === 1 || posInGroup === 4) ? 'Window' : 'Aisle';
    };
    const seatDisplay = seats.map(s => `${s} (${getSeatType(s)})`).join(', ');

    // Build age-based note and smart selection rationale
    let smartRationale = '';
    if (ageBasedNote) {
      smartRationale = `\n**🧠 Smart Selection:**\n• ${ageBasedNote}`;
    } else {
      smartRationale = `\n**🧠 Smart Selection:**\n• **Seat:** Selected best available seat for your comfort.`;
    }
    
    // Add bus selection rationale
    if (bus) {
      const busReasons = [];
      if (bus.rating) busReasons.push(`Top rated (⭐ ${bus.rating})`);
      if (bus.type === 'Volvo' || bus.hasAC) busReasons.push('AC comfort');
      if (bus.isSleeper) busReasons.push('Sleeper comfort');
      
      const busFeatureStr = busReasons.length > 0 ? busReasons.join(' • ') : 'Best value';
      smartRationale += `\n• **Bus:** Selected based on ${busFeatureStr}.`;
    }

    if (pendingBooking.dateFallbackNote || (journey?.requestedDate && journey?.date && journey.requestedDate !== journey.date)) {
      const reqDate = pendingBooking.requestedDate || journey?.requestedDate;
      const actualDate = journey?.date || pendingBooking.travelDate;
      smartRationale += `\n• **📅 Travel Date Note:** No buses available on ${reqDate}. Selected the next available best bus on **${actualDate}**.\n`;
    } else {
      smartRationale += `\n`;
    }

    // Clean passenger name string
    const cleanStr = (s) => (s || '').replace(/\b(on|for)?\s*(today|tomorrow|yesterday|morning|afternoon|evening|night)\b/gi, '').replace(/\s+/g, ' ').trim();

    // Build passenger section - handle single or multiple passengers
    let passengerSection = '';
    if (multiplePassengers || (passengers && passengers.length > 1)) {
      const passengerList = passengers || [];
      passengerSection = `**👥 Passengers (${passengerList.length}):**\n` +
        passengerList.map((p, idx) => 
          `${idx + 1}. **${cleanStr(p.name)}**${p.age ? ` • ${p.age} yrs` : ''}${p.gender ? ` • ${p.gender === 'M' ? 'Male' : 'Female'}` : ''}`
        ).join('\n');
    } else {
      // Single passenger
      const rawName = passenger?.name || pendingBooking.passengerName || 'Guest';
      passengerSection = `**👤 Passenger:**\n• **Name:** ${cleanStr(rawName)}${passenger?.age ? ` • ${passenger.age} yrs` : ''}${passenger?.gender ? ` • ${passenger.gender === 'M' ? 'Male' : 'Female'}` : ''}`;
    }

    return `✅ **Booking Ready — Complete Payment to Confirm!**
${smartRationale}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**🚌 Journey Details:**
• **Route:** ${journey?.from || pendingBooking.fromCity} → ${journey?.to || pendingBooking.toCity}
• **Bus:** ${bus?.name || pendingBooking.busName} (${bus?.type || ''})
• **Date:** ${journey?.date || pendingBooking.travelDate}
• **Time:** ${formatTime(journey?.departure || pendingBooking.departureTime)} → ${formatTime(journey?.arrival || pendingBooking.arrivalTime)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**💺 Seat Details:**
• **Seats:** ${seatDisplay}

${passengerSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**💰 Amount:** ₹${pendingBooking.totalPrice}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔐 **Click the "Pay Now" button below to enter your UPI PIN and confirm the booking.**`;
  },
  
  // Pending cancellation confirmation (user must confirm via UI)
  pendingCancellation: (data) => {
    const pc = data.pendingCancellation;
    return `⚠️ **Cancellation Preview**

**PNR**: ${pc.pnr}

**Journey:**
• ${pc.fromCity} → ${pc.toCity}
• Date: ${pc.travelDate}
• Bus: ${pc.busName}
• Seats: ${Array.isArray(pc.seats) ? pc.seats.join(', ') : pc.seats}
• Passenger: ${pc.passengerName}

**Refund Details:**
• Original amount: ₹${pc.totalPrice}
• Refund (${pc.refundPercent}%): ₹${pc.refundAmount}
• Cancellation fee: ₹${pc.cancellationFee}

👇 Click **Confirm Cancel** button below to proceed.`;
  },

  // Cancellation success (kept for legacy/direct cancellation)
  cancellationSuccess: (data) => {
    const { pnr, refund, booking } = data;
    return `❌ **Booking Cancelled**

**PNR**: ${pnr}

**Refund Details:**
• Original amount: ₹${refund.originalAmount}
• Refund (${refund.refundPercent}%): ₹${refund.refundAmount}
• Cancellation fee: ₹${refund.cancellationFee}

**Cancelled Journey:**
• ${booking.from} → ${booking.to}
• Date: ${booking.date}
• Seats: ${Array.isArray(booking.seats) ? booking.seats.join(', ') : booking.seats}

Refund will be processed in 3-7 business days.`;
  },
  
  // Knowledge/FAQ response
  knowledgeSuccess: (data) => {
    return data.answer || 'Information retrieved successfully.';
  },
  
  // Error response
  error: (errorMessage) => {
    return `😕 Sorry, something went wrong: ${errorMessage}\n\nPlease try again or contact support if the issue persists.`;
  },
  
  // No results
  noResults: (taskType) => {
    const suggestions = {
      search_buses: 'Try different cities or dates',
      book_ticket: 'Make sure the schedule ID and seats are correct',
      cancel_booking: 'Check your PNR is correct',
      general_query: 'Try rephrasing your question'
    };
    return `No results found. ${suggestions[taskType] || 'Please try again.'}`;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
//                              HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get next action suggestions based on context
 */
function getNextActions(taskType, success) {
  if (!success) {
    return ['Try again', 'Contact support', 'Ask a question'];
  }
  
  switch (taskType) {
    case 'search_buses':
      return ['Select a bus to book', 'Apply filters', 'Search different date'];
    case 'book_ticket':
      return ['View my bookings', 'Book another ticket', 'Check cancellation policy'];
    case 'cancel_booking':
      return ['Search for new buses', 'View my bookings', 'Contact support'];
    case 'general_query':
      return ['Search buses', 'Book a ticket', 'Ask another question'];
    default:
      return ['Search buses', 'View bookings', 'Get help'];
  }
}

function summarizeStructuredData(structuredData) {
  if (!structuredData || Object.keys(structuredData).length === 0) {
    return 'No structured data available.';
  }

  const short = (value, limit = 100) => {
    if (value === undefined || value === null) return '';
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  };

  const parts = [];
  const route = structuredData.route || {};
  const from = route.from_city || structuredData.fromCity || structuredData.from || structuredData.journey?.from;
  const to = route.to_city || structuredData.toCity || structuredData.to || structuredData.journey?.to;
  const date = structuredData.travelDate || structuredData.date || structuredData.journey?.date;
  if (from && to) {
    parts.push(`Route: ${from} → ${to}${date ? ` on ${date}` : ''}`);
  }
  const buses = Array.isArray(structuredData.buses) ? structuredData.buses.length : 0;
  if (buses > 0) {
    parts.push(`Buses found: ${buses}`);
  }
  if (structuredData.availableCount) {
    parts.push(`Available buses: ${structuredData.availableCount}`);
  }
  if (structuredData.pnr) {
    parts.push(`PNR: ${structuredData.pnr}`);
  }
  if (structuredData.status) {
    parts.push(`Status: ${structuredData.status}`);
  }
  if (structuredData.pendingBooking) {
    const pb = structuredData.pendingBooking;
    parts.push(`Pending payment ₹${pb.totalPrice || short(pb.amountPaid)}`);
    if (Array.isArray(pb.seats) && pb.seats.length) {
      parts.push(`Seats: ${pb.seats.slice(0, 3).join(', ')}${pb.seats.length > 3 ? '...' : ''}`);
    }
  }
  if (structuredData.pendingCancellation) {
    const pc = structuredData.pendingCancellation;
    parts.push(`Pending cancellation for PNR ${pc.pnr || short(pc.bookingId)}`);
  }
  if (structuredData.answer) {
    parts.push(`Knowledge snippet: ${short(structuredData.answer, 120)}`);
  }
  if (structuredData._nextActions) {
    parts.push(`Suggested actions: ${structuredData._nextActions.slice(0, 3).join(', ')}`);
  }

  if (parts.length === 0) {
    const keys = Object.keys(structuredData).slice(0, 5);
    parts.push(`Fields available: ${keys.map(k => `${k}=${short(structuredData[k])}`).join(', ')}`);
  }

  return parts.join('; ');
}

async function composeLLMResponse({ taskType, userMessage, baseResponse, structuredData, nextActions }) {
  if (!userMessage || !userMessage.trim()) {
    return baseResponse;
  }

  const summary = summarizeStructuredData(structuredData);
  const systemPrompt = `You are a sophisticated AI agent for BusGo (like ChatGPT or GitHub Copilot). You have full access to the app's database and capabilities. Think step-by-step to understand the user's intent. Provide clear, intelligent, and helpful responses.
Your capabilities include:
- Searching for buses and analyzing prices.
- Booking seats, selecting the best options based on user preferences.
- Canceling bookings and calculating refunds.
- Providing knowledge about policies or general queries.

When answering, break down your reasoning step-by-step if helpful. Give proactive suggestions based on the context. If the user needs to take action (payment, cancellation, booking details), mention the next steps clearly. Be conversational and professional. Do not apologize for being an AI.`;

  const promptParts = [
    `User message: ${userMessage}`,
    `Task: ${taskType}`,
    summary ? `Structured summary:\n${summary}` : 'Structured summary: (not available)',
    `Reference response: ${baseResponse}`,
    nextActions && nextActions.length ? `Next actions: ${nextActions.join(', ')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const generated = await llm.generateWithRetry(promptParts, {
      systemPrompt,
      maxTokens: 220,
      temperature: 0.75
    });
    if (generated && generated.trim().length > 10) {
      return generated.trim();
    }
  } catch (err) {
    console.warn(`[ConversationalAgent] Ollama generate failed: ${err.message}`);
  }

  return baseResponse;
}

// ═══════════════════════════════════════════════════════════════════════════════
//                         MAIN LANGGRAPH NODE FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Conversational Node - Main LangGraph node function
 * This runs LAST in every graph flow
 */
async function conversationalNode(state) {
  const startTime = Date.now();
  const { taskId, taskType, agentResults, structuredData, halted, haltReason, error } = state;
  
  console.log(`\n[ConversationalAgent] Formatting response for task ${taskId}`);
  
  const traces = [];
  const addTrace = (type, content) => {
    traces.push({ agent: 'ConversationalAgent', type, content, timestamp: Date.now() });
  };
  
  try {
    addTrace('thought', `Formatting ${taskType} response`);
    
    let response = '';
    let success = true;
    
    // Handle errors first
    if (error || halted) {
      addTrace('observation', `Error/halt detected: ${error || haltReason}`);
      // If a previous node already set finalResponse (e.g., detailed error message), use it
      if (state.finalResponse && state.finalResponse.length > 0) {
        response = state.finalResponse;
        addTrace('observation', 'Using existing finalResponse from previous node');
      } else {
        response = TEMPLATES.error(error || haltReason || 'An unexpected error occurred');
      }
      success = false;
    } else {
      // Format based on task type
      switch (taskType) {
        case 'search_buses': {
          addTrace('action', 'Formatting search results');
          const searchResult = agentResults?.bus_search;
          if (searchResult?.success && structuredData?.buses) {
            response = TEMPLATES.searchSuccess(structuredData);
          } else if (searchResult?.error) {
            response = searchResult.error;
            success = false;
          } else {
            response = TEMPLATES.noResults('search_buses');
          }
          break;
        }
        
        case 'book_ticket': {
          addTrace('action', 'Formatting booking confirmation');
          const bookingResult = agentResults?.booking_validation;
          console.log('[ConversationalAgent] Booking result success:', bookingResult?.success);
          console.log('[ConversationalAgent] structuredData includes:', {
            status: structuredData?.status,
            hasPassengers: !!structuredData?.passengers,
            passengersCount: structuredData?.passengers?.length,
            multiplePassengers: structuredData?.multiplePassengers,
            pendingBookingPassengers: structuredData?.pendingBooking?.passengers?.length
          });
          if (bookingResult?.success && structuredData?.status === 'pending_payment') {
            // Booking validated — awaiting payment authorization
            response = TEMPLATES.pendingPayment(structuredData);
          } else if (bookingResult?.success && structuredData?.pnr) {
            response = TEMPLATES.bookingSuccess(structuredData);
          } else if (bookingResult?.error) {
            response = `❌ Booking failed: ${bookingResult.error}`;
            success = false;
          } else {
            response = TEMPLATES.noResults('book_ticket');
            success = false;
          }
          break;
        }
        
        case 'cancel_booking': {
          addTrace('action', 'Formatting cancellation response');
          const cancelResult = agentResults?.policy_cancellation;
          if (cancelResult?.success && structuredData?.status === 'pending_cancellation') {
            // Pending confirmation — user must click button to confirm
            response = TEMPLATES.pendingCancellation(structuredData);
          } else if (cancelResult?.success && structuredData?.cancelled) {
            // Direct cancellation (legacy)
            response = TEMPLATES.cancellationSuccess(structuredData);
          } else if (cancelResult?.error) {
            response = `❌ Cancellation failed: ${cancelResult.error}`;
            success = false;
          } else {
            response = TEMPLATES.noResults('cancel_booking');
            success = false;
          }
          break;
        }
        
        case 'general_query':
        case 'get_seat_layout': {
          addTrace('action', 'Formatting knowledge response');
          const knowledgeResult = agentResults?.knowledge;
          if (knowledgeResult?.success && (structuredData?.answer || knowledgeResult?.answer)) {
            response = TEMPLATES.knowledgeSuccess(structuredData || knowledgeResult);
          } else if (knowledgeResult?.error) {
            response = knowledgeResult.error;
            success = false;
          } else {
            response = TEMPLATES.noResults('general_query');
          }
          break;
        }
        
        default: {
          addTrace('observation', `Unknown task type: ${taskType}`);
          // Try to find any result to display
          const anyResult = Object.values(agentResults || {})[0];
          if (anyResult?.answer) {
            response = anyResult.answer;
          } else if (anyResult?.error) {
            response = anyResult.error;
            success = false;
          } else {
            response = 'Request processed. How else can I help?';
          }
        }
      }
    }
    
    // Get next actions
    const nextActions = getNextActions(taskType, success);
    addTrace('observation', `Response formatted (${response.length} chars)`);

    const userMessage = state.inputData?.userMessage || state.inputData?.message || state.inputData?.query || '';

    // Human-like Gemini response enhancement for all agent responses
    const shouldUseLLMCompose = true;

    const generatedResponse = shouldUseLLMCompose
      ? await composeLLMResponse({
          taskType,
          userMessage,
          baseResponse: response,
          structuredData,
          nextActions
        })
      : response;
    const finalMessage = generatedResponse?.trim() ? generatedResponse : response;

    return {
      finalResponse: finalMessage,
      structuredData: {
        ...structuredData,
        _formatted: true,
        _success: success,
        _nextActions: nextActions
      },
      traces: [...(state.traces || []), ...traces],
      decisionTrail: [
        ...(state.decisionTrail || []),
        { agent: 'ConversationalAgent', status: success ? 'formatted' : 'error_formatted', steps: traces.length, duration_ms: Date.now() - startTime }
      ]
    };
    
  } catch (err) {
    console.error(`[ConversationalAgent] Error: ${err.message}`);
    addTrace('error', err.message);
    
    return {
      finalResponse: TEMPLATES.error(err.message),
      traces: [...(state.traces || []), ...traces],
      error: err.message,
      decisionTrail: [
        ...(state.decisionTrail || []),
        { agent: 'ConversationalAgent', status: 'error', steps: traces.length, duration_ms: Date.now() - startTime }
      ]
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//                                   EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  conversationalNode,
  conversationalNode_internal: {
    TEMPLATES,
    getNextActions,
    summarizeStructuredData,
    composeLLMResponse
  }
};
