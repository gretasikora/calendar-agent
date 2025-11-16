// Conversation state
let conversationState = {
    step: 'greeting', // greeting -> duration -> purpose -> online -> processing -> done
    duration: null,
    customDuration: null,
    purpose: '',
    isOnline: null,
    conversationHistory: [],
    meetingScheduled: false, // Track if meeting has been scheduled
    suggestedTimes: [], // All suggested times from the backend
    currentSuggestionIndex: 0, // Current suggestion being shown
    rejectionCount: 0 // Number of times user has rejected suggestions
};

// Initialize the chat
document.addEventListener('DOMContentLoaded', () => {
    showGreeting();
});

// Show greeting message
async function showGreeting() {
    const greeting = "Hello! I'm here to help you book time with me.\nTo get started, I'll need a few details:\n";
    await typewriterMessage('agent', greeting);
    showDurationSelection();
}

// Show duration selection
function showDurationSelection() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = `
        <div class="input-group">
            <label>Meeting Duration</label>
            <div class="duration-buttons">
                <button class="btn" onclick="selectDuration(30)">30 Minutes</button>
                <button class="btn" onclick="selectDuration(60)">1 Hour</button>
                <button class="btn" onclick="selectDuration('custom')">Custom</button>
            </div>
            <div id="custom-duration" class="custom-duration-input hidden">
                <input type="number" id="custom-duration-input" placeholder="Minutes" min="15" step="15">
                <span style="color: #ffffff;">minutes</span>
            </div>
        </div>
    `;
}

// Select duration
function selectDuration(duration) {
    // Remove selected class from all buttons
    document.querySelectorAll('.btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selected class to clicked button
    event.target.classList.add('selected');
    
    if (duration === 'custom') {
        document.getElementById('custom-duration').classList.remove('hidden');
        document.getElementById('custom-duration-input').focus();
    } else {
        document.getElementById('custom-duration').classList.add('hidden');
        conversationState.duration = duration;
        conversationState.step = 'purpose';
        setTimeout(() => {
            addUserMessage(`${duration} minutes`);
            showPurposeInput();
        }, 500);
    }
}

// Handle custom duration input
document.addEventListener('input', (e) => {
    if (e.target.id === 'custom-duration-input') {
        const minutes = parseInt(e.target.value);
        if (minutes >= 15) {
            conversationState.duration = minutes;
            conversationState.customDuration = minutes;
        }
    }
});

// Handle custom duration enter key
document.addEventListener('keypress', (e) => {
    if (e.target.id === 'custom-duration-input' && e.key === 'Enter') {
        const minutes = parseInt(e.target.value);
        if (minutes >= 15) {
            conversationState.duration = minutes;
            conversationState.customDuration = minutes;
            addUserMessage(`${minutes} minutes`);
            conversationState.step = 'purpose';
            setTimeout(() => {
                showPurposeInput();
            }, 500);
        }
    }
});

// Show purpose input
function showPurposeInput() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = `
        <div class="input-group">
            <label>Meeting Purpose</label>
            <textarea 
                id="purpose-input" 
                class="text-input" 
                placeholder="Please describe the purpose of the meeting..."
                rows="3"
            ></textarea>
        </div>
        <button class="submit-btn" onclick="submitPurpose()">Continue</button>
    `;
    
    document.getElementById('purpose-input').focus();
}

// Submit purpose
function submitPurpose() {
    const purposeInput = document.getElementById('purpose-input');
    const purpose = purposeInput.value.trim();
    
    if (!purpose) {
        alert('Please enter a purpose for the meeting.');
        return;
    }
    
    conversationState.purpose = purpose;
    addUserMessage(purpose);
    conversationState.step = 'online';
    setTimeout(() => {
        showOnlineSelection();
    }, 500);
}

// Show online/offline selection
function showOnlineSelection() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = `
        <div class="input-group">
            <label>Meeting Type</label>
            <div class="online-options">
                <button class="btn" onclick="selectOnline(true)">Online</button>
                <button class="btn" onclick="selectOnline(false)">In-Person</button>
            </div>
        </div>
    `;
}

// Select online/offline
function selectOnline(isOnline) {
    // Remove selected class from all buttons
    document.querySelectorAll('.btn').forEach(btn => {
        btn.classList.remove('selected');
    });
    
    // Add selected class to clicked button
    event.target.classList.add('selected');
    
    conversationState.isOnline = isOnline;
    addUserMessage(isOnline ? 'Online' : 'In-Person');
    conversationState.step = 'processing';
    
    setTimeout(() => {
        processBooking();
    }, 500);
}

// Process booking
async function processBooking() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = '';
    
    // Show processing message
    await typewriterMessage('agent', 'Perfect! Let me check my availability...');
    
    // Build the query for the agent
    const durationText = conversationState.customDuration 
        ? `${conversationState.customDuration} minutes`
        : conversationState.duration === 30 
            ? '30 minutes' 
            : '1 hour';
    
    const query = `I need to book a ${durationText} meeting${conversationState.isOnline ? ' online' : ' in person'} for: ${conversationState.purpose}. When am I available?`;
    
    // Add to conversation history
    conversationState.conversationHistory.push({
        user: query,
        assistant: ''
    });
    
    try {
        // Call the backend API
        const response = await fetch('http://localhost:5000/api/check-availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                conversation_history: conversationState.conversationHistory.slice(0, -1), // Exclude current query
                meeting_type: conversationState.isOnline ? 'online' : 'in-person',
                meeting_description: conversationState.purpose,
                duration_minutes: conversationState.duration
            })
        });
        
        if (!response.ok) {
            // Try to get error details from response
            let errorMessage = 'Failed to check availability';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                console.error('API Error:', errorData);
            } catch (e) {
                console.error('API Error (no JSON):', response.status, response.statusText);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const agentResponse = data.response || 'I was unable to check my availability. Please try again.';
        const suggestedTime = data.suggested_time;
        const suggestedTimes = data.suggested_times || [];
        const suggestedLocation = data.suggested_location;
        
        // Store all suggested times and reset rejection count
        conversationState.suggestedTimes = suggestedTimes;
        conversationState.currentSuggestionIndex = 0;
        conversationState.rejectionCount = 0;
        
        // Update conversation history
        conversationState.conversationHistory[conversationState.conversationHistory.length - 1].assistant = agentResponse;
        
        // Show response
        await typewriterMessage('agent', agentResponse);
        
        // Show Accept/Reject buttons if a time was suggested
        if (suggestedTime) {
            showSuggestionButtons(suggestedTime, suggestedLocation);
        } else {
            // Show follow-up options if no suggestion
            showFollowUp();
        }
        
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = error.message || 'Sorry, I encountered an error checking my availability. Please try again later.';
        await typewriterMessage('agent', `Error: ${errorMessage}\n\nPlease check:\n1. Backend API server is running (http://localhost:5000)\n2. MCP server is running (http://localhost:3000)\n3. Check browser console for details.`);
        showFollowUp();
    }
}

// Show Accept/Reject buttons for suggested time
function showSuggestionButtons(suggestedTime, suggestedLocation) {
    const inputSection = document.getElementById('input-section');
    
    inputSection.innerHTML = `
        <div class="suggestion-buttons">
            <button class="btn" onclick="acceptSuggestion('${suggestedTime.start_iso}', '${suggestedTime.end_iso}')">Accept</button>
            <button class="btn" onclick="rejectSuggestion()">Reject</button>
        </div>
    `;
    
    // Store suggested time in conversation state
    conversationState.suggestedTime = suggestedTime;
    conversationState.suggestedLocation = suggestedLocation;
    
    // Scroll to fit input section
    setTimeout(() => scrollToFitInput(), 100);
}

// Format time range for display
function formatTimeRange(startDate, endDate) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const startStr = startDate.toLocaleDateString('en-US', options);
    const endStr = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${startStr} - ${endStr}`;
}

// Accept suggestion
async function acceptSuggestion(startIso, endIso) {
    const inputSection = document.getElementById('input-section');
    
    // Check if this is an online meeting - if so, collect email first
    if (conversationState.isOnline) {
        // Show email input form
        inputSection.innerHTML = `
            <div style="margin-bottom: 15px;">
                <label style="display: block; margin-bottom: 8px; color: #ffffff;">Please enter your email address to receive the Google Meet invite:</label>
                <input type="email" id="attendee-email" class="text-input" placeholder="your.email@example.com" style="min-height: 40px; margin-bottom: 15px;" />
            </div>
            <button class="btn" onclick="submitEventCreation('${startIso}', '${endIso}')">Create Meeting</button>
        `;
        inputSection.style.display = 'block';
        
        // Focus on email input
        setTimeout(() => {
            const emailInput = document.getElementById('attendee-email');
            if (emailInput) {
                emailInput.focus();
                // Allow Enter key to submit
                emailInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        submitEventCreation(startIso, endIso);
                    }
                });
            }
        }, 100);
        
        return;
    }
    
    // For in-person meetings, create event directly
    await createEvent(startIso, endIso, null);
}

// Submit event creation (called from email form or directly for in-person)
async function submitEventCreation(startIso, endIso) {
    const inputSection = document.getElementById('input-section');
    let attendeeEmail = null;
    
    if (conversationState.isOnline) {
        const emailInput = document.getElementById('attendee-email');
        attendeeEmail = emailInput ? emailInput.value.trim() : null;
        
        if (!attendeeEmail || !attendeeEmail.includes('@')) {
            await typewriterMessage('agent', 'Please enter a valid email address.', false);
            return;
        }
    }
    
    // Clear the input section
    inputSection.innerHTML = '';
    
    // Create the event
    await createEvent(startIso, endIso, attendeeEmail);
}

// Create calendar event via API
async function createEvent(startIso, endIso, attendeeEmail) {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = '';
    
    // Show processing message
    await typewriterMessage('agent', 'Creating the calendar event...', false);
    
    try {
        const response = await fetch('http://localhost:5000/api/create-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                start_iso: startIso,
                end_iso: endIso,
                meeting_type: conversationState.isOnline ? 'online' : 'in-person',
                location: conversationState.suggestedLocation || null,
                attendee_email: attendeeEmail
            })
        });
        
        if (!response.ok) {
            let errorMessage = 'Failed to create event';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        
        // Mark meeting as scheduled
        conversationState.meetingScheduled = true;
        
        // Hide the input section completely
        inputSection.style.display = 'none';
        
        // Prevent scrolling on chat messages
        const chatMessages = document.getElementById('chat-messages');
        chatMessages.classList.add('no-scroll');
        
        // Show success message
        let successMessage = 'Great! I\'ve created the calendar event.';
        
        if (conversationState.isOnline && data.meet_link) {
            successMessage += `\n\nGoogle Meet link: ${data.meet_link}`;
        }
        
        if (data.html_link) {
            successMessage += `\n\nView in calendar: ${data.html_link}`;
        }
        
        await typewriterMessage('agent', successMessage, false);
        
    } catch (error) {
        console.error('Error creating event:', error);
        const errorMessage = error.message || 'Sorry, I encountered an error creating the event. Please try again later.';
        await typewriterMessage('agent', `Error: ${errorMessage}`, false);
        showFollowUp();
    }
}

// Reject suggestion
async function rejectSuggestion() {
    conversationState.rejectionCount++;
    
    // If we've rejected 3 times, let user suggest a time
    if (conversationState.rejectionCount >= 3) {
        const inputSection = document.getElementById('input-section');
        inputSection.innerHTML = '';
        
        await typewriterMessage('agent', 'I understand those times don\'t work for you. Please suggest a time that works better for you.');
        
        // Show text input for user to suggest a time
        showCustomTimeInput();
        return;
    }
    
    // Get the next suggestion from the list
    conversationState.currentSuggestionIndex++;
    
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = '';
    
    // Check if we have more suggestions
    if (conversationState.currentSuggestionIndex < conversationState.suggestedTimes.length) {
        const nextSuggestion = conversationState.suggestedTimes[conversationState.currentSuggestionIndex];
        const suggestedLocation = conversationState.suggestedLocation;
        
        // Format the next suggestion time for display
        const startDate = new Date(nextSuggestion.start_iso);
        const endDate = new Date(nextSuggestion.end_iso);
        const timeStr = formatSuggestionTime(startDate, endDate);
        
        // Create a message with the new suggestion
        let suggestionMessage = `No problem! What about meeting at ${timeStr}?`;
        if (suggestedLocation) {
            suggestionMessage += ` at ${suggestedLocation}`;
        }
        
        await typewriterMessage('agent', suggestionMessage);
        
        // Show the next suggestion buttons
        showSuggestionButtons(nextSuggestion, suggestedLocation);
    } else {
        // No more suggestions, let user suggest a time
        await typewriterMessage('agent', 'I\'ve run out of suggestions. Please suggest a time that works better for you.');
        showCustomTimeInput();
    }
}

// Format suggestion time for display
function formatSuggestionTime(startDate, endDate) {
    const options = { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const startStr = startDate.toLocaleDateString('en-US', options);
    const endStr = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `${startStr} - ${endStr}`;
}

// Show custom time input
function showCustomTimeInput() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = `
        <div class="input-group">
            <label>Suggest a time that works for you</label>
            <textarea 
                id="custom-time-input" 
                class="text-input" 
                placeholder="e.g., Tomorrow at 2pm, or Friday at 10am"
                rows="2"
            ></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="submitCustomTime()" style="flex: 1;">Send</button>
            <button class="btn" onclick="startOver()" style="flex: 1;">Start Over</button>
        </div>
    `;
    
    document.getElementById('custom-time-input').focus();
    
    // Scroll to fit input section
    setTimeout(() => scrollToFitInput(), 100);
}

// Submit custom time suggestion
async function submitCustomTime() {
    const customTimeInput = document.getElementById('custom-time-input');
    const query = customTimeInput.value.trim();
    
    if (!query) {
        return;
    }
    
    addUserMessage(query);
    customTimeInput.value = '';
    
    // Add to conversation history
    conversationState.conversationHistory.push({
        user: query,
        assistant: ''
    });
    
    try {
        const response = await fetch('http://localhost:5000/api/check-availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                conversation_history: conversationState.conversationHistory.slice(0, -1),
                meeting_type: conversationState.isOnline ? 'online' : 'in-person',
                meeting_description: conversationState.purpose,
                duration_minutes: conversationState.duration
            })
        });
        
        if (!response.ok) {
            let errorMessage = 'Failed to check availability';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                console.error('API Error (no JSON):', response.status, response.statusText);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const agentResponse = data.response || 'I was unable to process your request.';
        const suggestedTime = data.suggested_time;
        const suggestedTimes = data.suggested_times || [];
        const suggestedLocation = data.suggested_location;
        
        // Store all suggested times and reset rejection count
        conversationState.suggestedTimes = suggestedTimes;
        conversationState.currentSuggestionIndex = 0;
        conversationState.rejectionCount = 0;
        
        conversationState.conversationHistory[conversationState.conversationHistory.length - 1].assistant = agentResponse;
        
        await typewriterMessage('agent', agentResponse);
        
        // Show Accept/Reject buttons if a time was suggested
        if (suggestedTime) {
            showSuggestionButtons(suggestedTime, suggestedLocation);
        } else {
            // Show follow-up options if no suggestion
            showFollowUp();
        }
        
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = error.message || 'Sorry, I encountered an error. Please try again.';
        await typewriterMessage('agent', `Error: ${errorMessage}\n\nPlease check the browser console for details.`);
    }
}

// Show follow-up options
function showFollowUp() {
    const inputSection = document.getElementById('input-section');
    inputSection.innerHTML = `
        <div class="input-group">
            <label>Ask a follow-up question or start over</label>
            <textarea 
                id="followup-input" 
                class="text-input" 
                placeholder="e.g., What about tomorrow at 2pm?"
                rows="2"
            ></textarea>
        </div>
        <div style="display: flex; gap: 10px;">
            <button class="btn" onclick="submitFollowUp()" style="flex: 1;">Send</button>
            <button class="btn" onclick="startOver()" style="flex: 1;">Start Over</button>
        </div>
    `;
    
    document.getElementById('followup-input').focus();
    
    // Scroll to fit input section
    setTimeout(() => scrollToFitInput(), 100);
}

// Submit follow-up
async function submitFollowUp() {
    const followupInput = document.getElementById('followup-input');
    const query = followupInput.value.trim();
    
    if (!query) {
        return;
    }
    
    addUserMessage(query);
    followupInput.value = '';
    
    // Add to conversation history
    conversationState.conversationHistory.push({
        user: query,
        assistant: ''
    });
    
    try {
        const response = await fetch('http://localhost:5000/api/check-availability', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                conversation_history: conversationState.conversationHistory.slice(0, -1)
            })
        });
        
        if (!response.ok) {
            // Try to get error details from response
            let errorMessage = 'Failed to check availability';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                console.error('API Error:', errorData);
            } catch (e) {
                console.error('API Error (no JSON):', response.status, response.statusText);
            }
            throw new Error(errorMessage);
        }
        
        const data = await response.json();
        const agentResponse = data.response || 'I was unable to process your request.';
        const suggestedTime = data.suggested_time;
        const suggestedTimes = data.suggested_times || [];
        const suggestedLocation = data.suggested_location;
        
        // Store all suggested times and reset rejection count
        conversationState.suggestedTimes = suggestedTimes;
        conversationState.currentSuggestionIndex = 0;
        conversationState.rejectionCount = 0;
        
        conversationState.conversationHistory[conversationState.conversationHistory.length - 1].assistant = agentResponse;
        
        await typewriterMessage('agent', agentResponse);
        
        // Show Accept/Reject buttons if a time was suggested
        if (suggestedTime) {
            showSuggestionButtons(suggestedTime, suggestedLocation);
        } else {
            // Show follow-up options if no suggestion
            showFollowUp();
        }
        
    } catch (error) {
        console.error('Error:', error);
        const errorMessage = error.message || 'Sorry, I encountered an error. Please try again.';
        await typewriterMessage('agent', `Error: ${errorMessage}\n\nPlease check the browser console for details.`);
    }
}

// Start over
function startOver() {
    conversationState = {
        step: 'greeting',
        duration: null,
        customDuration: null,
        purpose: '',
        isOnline: null,
        conversationHistory: [],
        meetingScheduled: false,
        suggestedTimes: [],
        currentSuggestionIndex: 0,
        rejectionCount: 0
    };
    
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.innerHTML = '';
    // Remove no-scroll class to re-enable scrolling
    chatMessages.classList.remove('no-scroll');
    
    // Show input section again
    const inputSection = document.getElementById('input-section');
    inputSection.style.display = 'block';
    
    showGreeting();
}

// Add user message
function addUserMessage(text) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `
        <div class="message-content">${escapeHtml(text)}</div>
    `;
    chatMessages.appendChild(messageDiv);
    // Only scroll if meeting is not scheduled
    if (!conversationState.meetingScheduled) {
        scrollToFitInput();
    }
}

// Typewriter effect for agent messages
async function typewriterMessage(sender, text, shouldScroll = true) {
    const chatMessages = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content typewriter';
    messageDiv.appendChild(contentDiv);
    
    chatMessages.appendChild(messageDiv);
    
    // Typewriter effect
    let i = 0;
    const speed = 15; // milliseconds per character (much faster)
    
    return new Promise((resolve) => {
        function type() {
            if (i < text.length) {
                contentDiv.textContent = text.substring(0, i + 1);
                i++;
                // Dynamically scroll to keep input section visible
                if (shouldScroll && !conversationState.meetingScheduled) {
                    scrollToFitInput();
                }
                setTimeout(type, speed);
            } else {
                // Remove typewriter class after typing is complete
                contentDiv.classList.remove('typewriter');
                // Final scroll adjustment to fit input section
                if (shouldScroll && !conversationState.meetingScheduled) {
                    scrollToFitInput();
                }
                resolve();
            }
        }
        type();
    });
}

// Scroll to bottom (legacy - for backwards compatibility)
function scrollToBottom() {
    const chatMessages = document.getElementById('chat-messages');
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Scroll to fit input section at bottom dynamically
function scrollToFitInput() {
    const chatMessages = document.getElementById('chat-messages');
    const inputSection = document.getElementById('input-section');
    
    // Get the height of the input section
    const inputHeight = inputSection.offsetHeight || 0;
    
    // Calculate the available height for chat messages (container height minus input section)
    const chatContainer = chatMessages.parentElement;
    const containerHeight = chatContainer.offsetHeight;
    const availableHeight = containerHeight - inputHeight;
    
    // Calculate scroll position: we want to show as much content as possible
    // while keeping the input section visible at the bottom
    const totalContentHeight = chatMessages.scrollHeight;
    const maxScroll = Math.max(0, totalContentHeight - availableHeight);
    
    // Scroll to show the latest content while keeping input section visible
    chatMessages.scrollTop = maxScroll;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

