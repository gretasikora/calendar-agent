# busy_check_agent.py
import os
import asyncio
import json
import re
import uuid
from typing import List, Dict, Optional, Tuple
import datetime
from dateutil import parser as dateparser
import aiohttp
from dotenv import load_dotenv
from preferences import (
    is_online_meeting, is_friendly_meeting,
    suggest_online_times, suggest_inperson_times,
    get_upcoming_events
)

# Load environment variables from .env file
load_dotenv()

# agent_squad imports (same as your project)
from agent_squad.orchestrator import AgentSquad
from agent_squad.agents.openai_agent import OpenAIAgent, OpenAIAgentOptions
from agent_squad.classifiers.openai_classifier import OpenAIClassifier, OpenAIClassifierOptions

# ---------------------------
# Config (read from .env or env vars)
# ---------------------------
MCP_URL = os.getenv("MCP_URL")  # MCP endpoint
MCP_USER_ID = os.getenv("MCP_USER_ID")
MCP_CALENDAR_EMAIL = os.getenv("MCP_CALENDAR_EMAIL")  # Calendar email address (optional, defaults to "primary")
OPENAI_KEY = os.getenv("OPENAI_API_KEY")  # used by OpenAIAgent
REQUEST_TIMEOUT = 15  # seconds for MCP calls

# ---------------------------
# MCP helpers
# ---------------------------
async def mcp_post(payload: dict) -> dict:
    """Send JSON payload to MCP_URL and return JSON response."""
    async with aiohttp.ClientSession() as session:
        async with session.post(MCP_URL, json=payload, timeout=REQUEST_TIMEOUT) as resp:
            text = await resp.text()
            if resp.status >= 400:
                raise RuntimeError(f"MCP returned {resp.status}: {text}")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw": text}

async def get_primary_calendar_email() -> str:
    """
    Get the primary calendar email address by listing calendars.
    Falls back to MCP_CALENDAR_EMAIL from env if available.
    """
    # First try environment variable
    if MCP_CALENDAR_EMAIL:
        return MCP_CALENDAR_EMAIL
    
    # Try to get from list-calendars
    try:
        payload = {
            "user_id": MCP_USER_ID,
            "action": "list-calendars",
            "params": {}
        }
        result = await mcp_post(payload)
        # Parse the result to find primary calendar
        if isinstance(result, dict) and "content" in result:
            content = result["content"]
            if isinstance(content, list) and len(content) > 0:
                text = content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
                lines = text.split("\n")
                
                for line in lines:
                    if not line.strip():
                        continue
                    match = re.search(r'\(([^)]+)\)', line)
                    if match:
                        calendar_id = match.group(1)
                        if "@" in calendar_id and "." in calendar_id:
                            return calendar_id
                
                if lines:
                    match = re.search(r'\(([^)]+)\)', lines[0])
                    if match:
                        calendar_id = match.group(1)
                        if calendar_id.lower() == "primary":
                            raise ValueError("Found 'primary' calendar ID but need actual email address")
                        return calendar_id
        
        raise ValueError("Could not determine primary calendar email from calendar list")
    except Exception as e:
        raise ValueError(f"Failed to get primary calendar email: {e}. Please set MCP_CALENDAR_EMAIL in .env file with your Google account email.")

async def get_events_for_window(start_iso: str, end_iso: str, calendar_email: str = None) -> List[Dict]:
    """
    Get events for a time window using list-events (instead of freebusy).
    Returns list of event dictionaries.
    """
    if calendar_email is None:
        calendar_email = await get_primary_calendar_email()
    
    # Normalize ISO format to match regex: ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$
    def normalize_iso(iso_str: str) -> str:
        """Ensure ISO string matches the MCP server regex pattern."""
        try:
            # Parse the datetime
            dt = dateparser.isoparse(iso_str)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=datetime.timezone.utc)
            else:
                dt = dt.astimezone(datetime.timezone.utc)
            
            # Format as: YYYY-MM-DDTHH:MM:SS (no microseconds)
            # Remove microseconds by replacing with empty string
            formatted = dt.strftime('%Y-%m-%dT%H:%M:%S')
            
            # Append 'Z' for UTC
            return formatted + 'Z'
        except Exception as e:
            # Fallback: try to fix the string directly
            # Remove microseconds (keep only seconds or milliseconds)
            if '.' in iso_str:
                # Split on '.' to handle microseconds
                parts = iso_str.split('.')
                if len(parts) == 2:
                    # Has microseconds/milliseconds
                    date_part = parts[0]
                    micro_part = parts[1]
                    # Remove timezone from micro part if present
                    if '+' in micro_part or '-' in micro_part[-6:]:
                        # Extract timezone
                        if '+' in micro_part:
                            tz_part = '+' + micro_part.split('+')[1]
                            micro_part = micro_part.split('+')[0]
                        else:
                            # Find timezone at the end
                            tz_part = micro_part[-6:]
                            micro_part = micro_part[:-6]
                    else:
                        tz_part = ''
                    
                    # Keep only first 3 digits (milliseconds) or remove if more
                    if len(micro_part) > 3:
                        micro_part = micro_part[:3]
                    elif len(micro_part) == 0:
                        # No microseconds, just use date part
                        iso_str = date_part + (tz_part if tz_part else '')
                    else:
                        # Has milliseconds, keep them
                        iso_str = date_part + '.' + micro_part + (tz_part if tz_part else '')
            
            # Replace +00:00 or -00:00 with Z
            iso_str = iso_str.replace('+00:00', 'Z').replace('-00:00', 'Z')
            
            # If it doesn't end with Z, add it
            if not iso_str.endswith('Z') and not re.match(r'[+-]\d{2}:\d{2}$', iso_str[-6:]):
                # Remove any existing timezone and add Z
                iso_str = re.sub(r'[+-]\d{2}:\d{2}$', '', iso_str)
                iso_str = iso_str.rstrip('Z') + 'Z'
            
            return iso_str
    
    normalized_start = normalize_iso(start_iso)
    normalized_end = normalize_iso(end_iso)
    
    payload = {
        "user_id": MCP_USER_ID,
        "action": "list-events",
        "params": {
            "calendarId": calendar_email,
            "timeMin": normalized_start,
            "timeMax": normalized_end
        }
    }
    
    result = await mcp_post(payload)
    
    # Extract events from response
    events = []
    if isinstance(result, dict):
        # Check for events field first (HTTP server sets this)
        if "events" in result and isinstance(result["events"], list):
            events = result["events"]
        # Check for raw events data
        elif "raw" in result and isinstance(result["raw"], list):
            events = result["raw"]
        elif "raw" in result and isinstance(result["raw"], dict) and "items" in result["raw"]:
            events = result["raw"]["items"]
        elif "content" in result:
            # Try to parse from content text
            content = result["content"]
            if isinstance(content, list):
                for item in content:
                    if isinstance(item, dict) and "text" in item:
                        # Content might be text description, not event data
                        pass
    
    # Debug: Log what we got from MCP
    print(f"[DEBUG get_events_for_window] MCP returned {len(events)} events")
    if len(events) == 0:
        print(f"[DEBUG] MCP result structure: {list(result.keys()) if isinstance(result, dict) else type(result)}")
        if isinstance(result, dict):
            if "raw" in result:
                print(f"[DEBUG] Raw data type: {type(result['raw'])}")
                print(f"[DEBUG] Raw data value: {result['raw']}")
            if "content" in result:
                print(f"[DEBUG] Content: {result['content']}")
            if "events" in result:
                print(f"[DEBUG] Events field: {type(result['events'])}, value: {result['events']}")
            # Print full result for debugging
            print(f"[DEBUG] Full result keys: {list(result.keys())}")
            print(f"[DEBUG] Full result (first 500 chars): {str(result)[:500]}")
    
    return events

def overlaps(start1: datetime.datetime, end1: datetime.datetime, start2: datetime.datetime, end2: datetime.datetime) -> bool:
    """
    Check if two time ranges overlap.
    Returns True if [start1, end1) overlaps with [start2, end2).
    """
    return start1 < end2 and start2 < end1

async def is_slot_free(
    start: datetime.datetime,
    end: datetime.datetime,
    existing_events: List[Dict],
    mcp_post_func,  # Kept for compatibility but not used
    buffer_minutes: int = 0,
    calendar_email: str = None,  # Kept for compatibility but not used
    is_inperson_meeting: bool = False  # True if the proposed meeting is in-person
) -> bool:
    """
    Check if a time slot is free, considering buffer time.
    Uses the existing_events list to determine availability (no additional MCP calls).
    
    For in-person meetings: requires 30 minutes buffer AFTER any existing in-person event.
    """
    from preferences import is_slot_free as pref_is_slot_free
    return await pref_is_slot_free(start, end, existing_events, mcp_post_func, buffer_minutes, calendar_email, is_inperson_meeting)

# ---------------------------
# Agent 1: Parse user query and extract time window
# ---------------------------
async def parse_time_window_from_query(user_query: str, conversation_history: List[Dict[str, str]] = None) -> Dict[str, str]:
    """
    Agent 1: Takes a natural language query and extracts the time window.
    Uses conversation history to understand context (e.g., "tomorrow" from previous queries).
    Returns a dict with 'start_iso' and 'end_iso' in ISO 8601 format (e.g., "2025-11-14T15:00:00Z").
    
    Args:
        user_query: Current user query
        conversation_history: List of previous conversation turns [{"user": "...", "assistant": "..."}, ...]
    """
    classifier = OpenAIClassifier(options=OpenAIClassifierOptions(api_key=OPENAI_KEY))
    orchestrator = AgentSquad(classifier=classifier)
    
    query_parser_agent = OpenAIAgent(
        options=OpenAIAgentOptions(
            name="Time Window Parser",
            description="Extracts time windows from natural language queries and returns ISO 8601 formatted dates.",
            api_key=OPENAI_KEY,
            model="gpt-4o-mini",
            streaming=False
        )
    )
    orchestrator.add_agent(query_parser_agent)
    
    # Get current time for context
    now = datetime.datetime.now(datetime.timezone.utc)
    current_time_iso = now.isoformat().replace('+00:00', 'Z')
    
    # Build conversation history context
    history_context = ""
    if conversation_history and len(conversation_history) > 0:
        history_context = "\n\nPrevious conversation context:\n"
        for i, turn in enumerate(conversation_history[-5:], 1):  # Last 5 turns for context
            user_msg = turn.get("user", "")
            assistant_msg = turn.get("assistant", "")
            history_context += f"Turn {i}:\n"
            history_context += f"  User: {user_msg}\n"
            if assistant_msg:
                history_context += f"  Assistant: {assistant_msg}\n"
        history_context += "\nUse the previous conversation to understand context. "
        history_context += "For example, if the user previously asked about 'tomorrow at 9am' and now asks 'what about 10am', "
        history_context += "they are asking about 'tomorrow at 10am'.\n"
    
    parser_prompt = f"""You are a time parser. Extract the requested time window from the user's query and return ONLY valid JSON.

Current UTC time: {current_time_iso}
{history_context}
Current user query: "{user_query}"

Return a JSON object with exactly these fields:
- "start_iso": ISO 8601 format string in UTC (e.g., "2025-11-14T15:00:00Z")
- "end_iso": ISO 8601 format string in UTC (e.g., "2025-11-14T15:30:00Z")

Rules:
- Use ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ (always end with Z for UTC)
- If no specific time is mentioned, use reasonable defaults
- If only a date is mentioned, assume a reasonable time window (e.g., 9am-5pm)
- If duration is mentioned (e.g., "30 minutes", "1 hour"), calculate the end time
- IMPORTANT: Use conversation history to fill in missing context (e.g., if previous query mentioned "tomorrow", use that date for follow-up questions)
- Always return valid JSON, no other text

Example response:
{{"start_iso": "2025-11-14T15:00:00Z", "end_iso": "2025-11-14T15:30:00Z"}}
"""
    
    # Use a unique session_id to prevent memory from previous requests
    unique_session_id = f"time_parser_{uuid.uuid4().hex[:8]}"
    response = await orchestrator.route_request(parser_prompt, user_id=MCP_USER_ID, session_id=unique_session_id)
    
    # Extract JSON from response
    response_text = ""
    if hasattr(response.output, "content"):
        content = response.output.content
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and "text" in part:
                    response_text += part["text"]
                elif isinstance(part, str):
                    response_text += part
                else:
                    response_text += str(part)
        else:
            response_text = str(content)
    else:
        response_text = str(response.output)
    
    # Try to extract JSON from the response (handle code blocks and markdown)
    response_text = re.sub(r'```json\s*', '', response_text)
    response_text = re.sub(r'```\s*', '', response_text)
    if '"start_iso"' in response_text and '"end_iso"' in response_text:
        start_idx = response_text.find('{')
        if start_idx != -1:
            brace_count = 0
            for i in range(start_idx, len(response_text)):
                if response_text[i] == '{':
                    brace_count += 1
                elif response_text[i] == '}':
                    brace_count -= 1
                    if brace_count == 0:
                        response_text = response_text[start_idx:i+1]
                        break
    
    try:
        time_window = json.loads(response_text)
        if "start_iso" not in time_window or "end_iso" not in time_window:
            raise ValueError("Missing start_iso or end_iso in response")
        return time_window
    except (json.JSONDecodeError, ValueError) as e:
        raise ValueError(f"Failed to parse time window from LLM response: {response_text}. Error: {e}")

# ---------------------------
# Agent 2: Format response conversationally
# ---------------------------
async def format_reply_with_llm(
    is_busy: bool, 
    overlaps: List[Dict], 
    user_question: str, 
    conversation_history: List[Dict[str, str]] = None,
    suggested_times: List[Dict] = None,
    suggested_location: Optional[str] = None,
    meeting_type: Optional[str] = None,
    duration_minutes: Optional[int] = None
) -> str:
    """
    Agent 2: Formats the availability check results into a conversational response.
    Takes the overlap results and creates a natural, friendly reply for the user.
    
    Args:
        is_busy: Whether the requested time is busy
        overlaps: List of overlapping time slots
        user_question: Current user question
        conversation_history: List of previous conversation turns for context
        suggested_times: List of suggested time slots
        suggested_location: Suggested location for in-person meetings
        meeting_type: "online" or "in-person"
        duration_minutes: Duration of the meeting
    """
    classifier = OpenAIClassifier(options=OpenAIClassifierOptions(api_key=OPENAI_KEY))
    orchestrator = AgentSquad(classifier=classifier)
    formatter_agent = OpenAIAgent(
        options=OpenAIAgentOptions(
            name="Scheduler Assistant",
            description="A calendar assistant that suggests meeting times. NEVER says 'I understand those times don't work' or asks users to suggest times. Always presents ONE time and asks if it works.",
            api_key=OPENAI_KEY,
            model="gpt-4o-mini",
            streaming=False
        )
    )
    orchestrator.add_agent(formatter_agent)

    # Don't include conversation history when we have suggestions to avoid LLM seeing rejections
    # This prevents the LLM from generating "I understand those times don't work" messages
    history_context = ""
    if suggested_times and len(suggested_times) > 0:
        # Skip conversation history when we have suggestions - just present the time
        history_context = ""
    elif conversation_history and len(conversation_history) > 0:
        history_context = "\n\nPrevious conversation (for context):\n"
        for turn in conversation_history[-3:]:  # Last 3 turns for context
            user_msg = turn.get("user", "")
            assistant_msg = turn.get("assistant", "")
            if user_msg:
                history_context += f"User: {user_msg}\n"
            if assistant_msg:
                history_context += f"Assistant: {assistant_msg}\n"
        history_context += "\n"
    
    # Build suggested times text - only show the FIRST (best) suggestion
    suggested_times_text = ""
    first_suggestion = None
    if suggested_times and len(suggested_times) > 0:
        # Only show the first/best suggestion in the response
        first_suggestion = suggested_times[0]
        start_iso = first_suggestion.get("start_iso", "")
        end_iso = first_suggestion.get("end_iso", "")
        reason = first_suggestion.get("reason", "")
        try:
            start_dt = dateparser.isoparse(start_iso)
            end_dt = dateparser.isoparse(end_iso)
            start_str = start_dt.strftime("%A, %B %d at %I:%M %p")
            end_str = end_dt.strftime("%I:%M %p")
            suggested_times_text = f"{start_str} - {end_str}"
            # DO NOT include reason - it contains private information about other meetings
        except:
            suggested_times_text = f"{start_iso} - {end_iso}"
    
    overlap_text = ""
    if overlaps:
        overlap_text = f"\nConflicting events: {len(overlaps)} conflict(s)\n"
        for overlap in overlaps[:3]:  # Show first 3 conflicts
            overlap_text += f"- {json.dumps(overlap)}\n"
    
    availability_status = "Busy" if is_busy else "Free"
    
    system_prompt = """You are a calendar assistant. Provide direct, concise responses without fluff. No phrases like "I'd be happy to help" or "I'd be happy to meet". Be straightforward and professional."""
    
    # Build the prompt with emphasis on suggestions
    if suggested_times and len(suggested_times) > 0:
        # When we have suggestions, present only the FIRST (best) suggestion and ask if it works
        location_text = f" at {suggested_location}" if suggested_location else ""
        user_prompt = f"""{system_prompt}

User asked: {user_question}

Availability: {availability_status}
{overlap_text}

Best available time based on preferences: {suggested_times_text}{location_text}

Provide a direct response that presents this ONE time suggestion and asks if it works. Be concise - no fluff. Example: "How about {suggested_times_text}{location_text}? Does that work for you?"

CRITICAL RULES - FOLLOW THESE EXACTLY:
- Only mention this ONE time. Do not list multiple times.
- Be direct and concise. No pleasantries or fluff.
- Ask if this specific time works for them.
- Simply present the time and ask if it works. Example: "How about {suggested_times_text}{location_text}? Does that work for you?"
- If you must vary the phrasing, use: "What about [time]?" or "Does [time] work for you?" - but NEVER mention rejections or ask the user to suggest a time
- Your response MUST be exactly in this format: "How about [time]? Does that work for you?" or "What about [time]? Does that work for you?" """
    else:
        # No suggestions available
        user_prompt = f"""{system_prompt}

User asked: {user_question}

Availability: {availability_status}
{overlap_text}

Format a natural response."""

    # Use a unique session_id to prevent memory from previous requests
    # This ensures the LLM doesn't remember rejections from previous interactions
    unique_session_id = f"response_formatter_{uuid.uuid4().hex[:8]}"
    response = await orchestrator.route_request(user_prompt, user_id=MCP_USER_ID, session_id=unique_session_id)
    
    # Extract response content
    response_text = ""
    if hasattr(response.output, 'content'):
        content = response.output.content
        if isinstance(content, list) and len(content) > 0:
            text_parts = []
            for item in content:
                if isinstance(item, dict) and 'text' in item:
                    text_parts.append(item['text'])
                elif isinstance(item, str):
                    text_parts.append(item)
                else:
                    text_parts.append(str(item))
            response_text = ' '.join(text_parts) if text_parts else str(content)
        else:
            response_text = str(content) if content else ""
    else:
        response_text = str(response.output)
    
    return response_text.strip()

# ---------------------------
# Main orchestration function
# ---------------------------
async def check_busy(
    user_query: str, 
    conversation_history: List[Dict[str, str]] = None,
    meeting_type: Optional[str] = None,
    meeting_description: Optional[str] = None,
    duration_minutes: Optional[int] = None,
    rejected_times: Optional[List[Dict[str, str]]] = None,
    skip_llm_formatting: bool = False  # If True, skip LLM and return simple message
) -> Dict:
    """
    Top-level function that orchestrates the two-agent workflow.
    
    Agent 1: Parses user query → extracts time window → queries MCP → returns busy times
    Agent 2: Takes overlap results → formats conversationally
    
    Args:
        user_query: Natural language query (e.g., "Am I free tomorrow at 3pm for 30 minutes?")
        conversation_history: List of previous conversation turns [{"user": "...", "assistant": "..."}, ...]
        meeting_type: "online" or "in-person"
        meeting_description: Description/purpose of the meeting
        duration_minutes: Duration of the meeting in minutes
    
    Returns:
        Dict with 'response' (str), 'suggested_time', 'suggested_times', 'suggested_location'
    """
    # Step 1: Agent 1 - Parse user query and extract time window (with conversation history)
    time_window = await parse_time_window_from_query(user_query, conversation_history)
    start_iso = time_window["start_iso"]
    end_iso = time_window["end_iso"]
    
    # Step 2: Get events for the next 2 weeks using list-events (instead of freebusy)
    now = datetime.datetime.now(datetime.timezone.utc)
    query_start = now
    query_end = now + datetime.timedelta(days=14)
    
    # Format as ISO with Z suffix (UTC) - matches MCP regex: ^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})$
    def format_iso_utc(dt: datetime.datetime) -> str:
        """Format datetime as ISO 8601 with Z suffix for UTC (no microseconds)."""
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        else:
            dt = dt.astimezone(datetime.timezone.utc)
        # Use strftime to avoid microseconds - format: YYYY-MM-DDTHH:MM:SS
        formatted = dt.strftime('%Y-%m-%dT%H:%M:%S')
        # Append 'Z' for UTC
        return formatted + 'Z'
    
    query_start_iso = format_iso_utc(query_start)
    query_end_iso = format_iso_utc(query_end)
    
    calendar_email = MCP_CALENDAR_EMAIL or await get_primary_calendar_email()
    events = await get_events_for_window(query_start_iso, query_end_iso, calendar_email)
    
    # Debug: Log events retrieved
    print(f"\n[DEBUG] Retrieved {len(events)} events from calendar")
    for i, event in enumerate(events[:5]):  # Show first 5 events
        event_start = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        event_end = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date", "")
        summary = event.get("summary", "No title")
        location = event.get("location", "")
        is_online = is_online_meeting(event)
        print(f"  Event {i+1}: {summary} | {event_start} - {event_end} | Location: {location} | Online: {is_online}")
    
    # Step 3: Check if requested time is busy (accounting for buffers for in-person meetings)
    requested_start = dateparser.isoparse(start_iso)
    requested_end = dateparser.isoparse(end_iso)
    
    is_busy = False
    overlaps_list = []
    
    for event in events:
        event_start_str = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        event_end_str = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date", "")
        
        if not event_start_str or not event_end_str:
            continue
        
        try:
            # Parse ISO format
            if event_start_str.endswith('Z'):
                event_start_str = event_start_str[:-1] + '+00:00'
            if event_end_str.endswith('Z'):
                event_end_str = event_end_str[:-1] + '+00:00'
            
            event_start = dateparser.isoparse(event_start_str)
            event_end = dateparser.isoparse(event_end_str)
            
            # For in-person meetings: apply 30 min buffer before and after existing in-person events
            existing_is_inperson = not is_online_meeting(event)
            
            if meeting_type == "in-person" and existing_is_inperson:
                # Add 30 minutes buffer before and after the existing event
                effective_event_start = event_start - datetime.timedelta(minutes=30)
                effective_event_end = event_end + datetime.timedelta(minutes=30)
            else:
                effective_event_start = event_start
                effective_event_end = event_end
            
            # Check for overlap with effective times (including buffers)
            if overlaps(requested_start, requested_end, effective_event_start, effective_event_end):
                is_busy = True
                overlaps_list.append({
                    "start": event_start.isoformat().replace('+00:00', 'Z'),
                    "end": event_end.isoformat().replace('+00:00', 'Z'),
                    "summary": event.get("summary", "Busy")
                })
        except:
            continue
    
    # Step 4: Always suggest times proactively when meeting details are provided
    suggested_times = []
    suggested_location = None
    
    # Always suggest times if meeting type and duration are provided (proactive suggestions)
    if meeting_type and duration_minutes:
        # Normalize rejected_times to a set for fast lookup
        rejected_time_set = set()
        if rejected_times:
            for rejected in rejected_times:
                start_iso = rejected.get('start_iso', '')
                end_iso = rejected.get('end_iso', '')
                if start_iso and end_iso:
                    rejected_time_set.add((start_iso, end_iso))
        
        # Use preferences to suggest times based on meeting type
        if meeting_type == "online":
            suggested_times = await suggest_online_times(
                duration_minutes=duration_minutes,
                events=events,
                start_date=now,
                end_date=query_end,
                mcp_post_func=mcp_post,
                calendar_email=calendar_email,
                rejected_times=rejected_time_set
            )
        elif meeting_type == "in-person":
            # For in-person, we need description to determine if it's friendly or business
            if meeting_description:
                suggested_times, suggested_location = await suggest_inperson_times(
                    duration_minutes=duration_minutes,
                    description=meeting_description,
                    events=events,
                    start_date=now,
                    end_date=query_end,
                    mcp_post_func=mcp_post,
                    calendar_email=calendar_email,
                    rejected_times=rejected_time_set
                )
            else:
                # If no description, use default business meeting logic
                suggested_times, suggested_location = await suggest_inperson_times(
                    duration_minutes=duration_minutes,
                    description="business meeting",  # Default to business
                    events=events,
                    start_date=now,
                    end_date=query_end,
                    mcp_post_func=mcp_post,
                    calendar_email=calendar_email,
                    rejected_times=rejected_time_set
                )
        
        # Filter out rejected times from final suggestions
        if rejected_time_set:
            suggested_times = [
                t for t in suggested_times 
                if (t.get('start_iso'), t.get('end_iso')) not in rejected_time_set
            ]
    
    # Step 5: Agent 2 - Format response conversationally
    # Skip LLM formatting if requested (e.g., when fetching more suggestions)
    # This prevents the LLM from generating "I understand those times don't work" messages
    if skip_llm_formatting:
        print(f"[DEBUG] Skipping LLM formatting - using template message")
        # Use simple template message when fetching more suggestions
        if suggested_times and len(suggested_times) > 0:
            first_suggestion = suggested_times[0]
            start_iso = first_suggestion.get("start_iso", "")
            end_iso = first_suggestion.get("end_iso", "")
            try:
                start_dt = dateparser.isoparse(start_iso)
                end_dt = dateparser.isoparse(end_iso)
                start_str = start_dt.strftime("%A, %B %d at %I:%M %p")
                end_str = end_dt.strftime("%I:%M %p")
                suggested_times_text = f"{start_str} - {end_str}"
            except:
                suggested_times_text = f"{start_iso} - {end_iso}"
            location_text = f" at {suggested_location}" if suggested_location else ""
            assistant_reply = f"What about {suggested_times_text}{location_text}? Does that work for you?"
            print(f"[DEBUG] Generated template message: {assistant_reply}")
        else:
            assistant_reply = "Let me check for more available times..."
            print(f"[DEBUG] No suggestions - using fallback message")
    else:
        print(f"[DEBUG] Using LLM formatting")
        assistant_reply = await format_reply_with_llm(
            is_busy,
            overlaps_list,
            user_query,
            conversation_history,
            suggested_times=suggested_times,
            suggested_location=suggested_location,
            meeting_type=meeting_type,
            duration_minutes=duration_minutes
        )
        print(f"[DEBUG] LLM generated response: {assistant_reply[:100]}...")
    
    # Return dict with response and suggestions
    result = {
        "response": assistant_reply,
        "suggested_times": suggested_times
    }
    
    if suggested_times and len(suggested_times) > 0:
        result["suggested_time"] = suggested_times[0]
    
    if suggested_location:
        result["suggested_location"] = suggested_location
    
    return result

# ---------------------------
# Create calendar event
# ---------------------------
async def create_calendar_event(
    start_iso: str,
    end_iso: str,
    meeting_type: str = "in-person",
    location: Optional[str] = None,
    attendee_email: Optional[str] = None
) -> Dict:
    """
    Create a calendar event via MCP.
    
    Args:
        start_iso: Start time in ISO format with timezone
        end_iso: End time in ISO format with timezone
        meeting_type: "online" or "in-person"
        location: Location for in-person meetings
        attendee_email: Email address for online meetings
    
    Returns:
        Dict with event_id, html_link, meet_link, and message
    """
    # Get calendar email
    calendar_email = MCP_CALENDAR_EMAIL or await get_primary_calendar_email()
    
    # Determine timezone from start_iso (default to UTC)
    timezone = "UTC"
    if "+" in start_iso or start_iso.endswith("Z"):
        if start_iso.endswith("Z"):
            timezone = "UTC"
        else:
            timezone = "UTC"
    
    # Build event parameters
    event_params = {
        "calendarId": calendar_email,
        "summary": "Meeting with Greta",
        "start": start_iso,
        "end": end_iso,
        "timeZone": timezone,
    }
    
    # Add location for in-person meetings
    if meeting_type == "in-person" and location:
        event_params["location"] = location
    
    # Add attendees for online meetings (triggers Google Meet)
    if meeting_type == "online" and attendee_email:
        event_params["attendees"] = [{"email": attendee_email}]
        event_params["sendUpdates"] = "all"  # Send invites to all attendees
        # Google Meet will be auto-added by the MCP handler
    
    # Create event via MCP
    payload = {
        "user_id": MCP_USER_ID or "user123",
        "action": "create-event",
        "params": event_params
    }
    
    result = await mcp_post(payload)
    
    # Extract event details from response
    event_id = None
    html_link = None
    meet_link = None
    
    if isinstance(result, dict):
        # Check for raw event data (preferred)
        event_data = result.get("raw") or result.get("event")
        
        if event_data and isinstance(event_data, dict):
            event_id = event_data.get("id")
            html_link = event_data.get("htmlLink")
            # Extract Google Meet link from conferenceData
            if "conferenceData" in event_data:
                entry_points = event_data["conferenceData"].get("entryPoints", [])
                for entry in entry_points:
                    if entry.get("entryPointType") == "video":
                        meet_link = entry.get("uri")
                        break
        
        # Fallback: try to extract event ID from content text
        if not event_id and "content" in result and isinstance(result["content"], list):
            for item in result["content"]:
                if isinstance(item, dict) and "text" in item:
                    text = item["text"]
                    if "(" in text and ")" in text:
                        event_id = text.split("(")[1].split(")")[0]
    
    return {
        "event_id": event_id,
        "html_link": html_link,
        "meet_link": meet_link,
        "message": "Event created successfully" if event_id else "Event may have been created, but details unavailable"
    }

# ---------------------------
# Interactive terminal interface
# ---------------------------
async def interactive_mode():
    """Run the agent in interactive mode, accepting queries from the terminal."""
    print("=" * 60)
    print("Calendar Availability Agent - Interactive Mode")
    print("=" * 60)
    print("Ask me about your calendar availability!")
    print("Examples:")
    print("  - 'Am I free tomorrow at 3pm for 30 minutes?'")
    print("  - 'Do I have time on Friday at 2pm?'")
    print("  - 'Check my availability next Monday morning'")
    print("\nThe agent remembers previous queries in this session.")
    print("You can ask follow-up questions like 'What about 10am?' after asking about a specific day.\n")
    print("Type 'quit' or 'exit' to stop.")
    print("Type 'clear' to clear conversation history.\n")
    
    # Initialize conversation history
    conversation_history: List[Dict[str, str]] = []
    
    while True:
        try:
            # Get user input
            user_query = input("Query: ").strip()
            
            # Check for exit commands
            if user_query.lower() in ['quit', 'exit', 'q']:
                print("\nGoodbye!")
                break
            
            # Check for clear history command
            if user_query.lower() in ['clear', 'reset']:
                conversation_history = []
                print("\nConversation history cleared.\n")
                continue
            
            # Skip empty queries
            if not user_query:
                continue
            
            # Process the query with conversation history
            print("\nProcessing...")
            result = await check_busy(user_query, conversation_history)
            
            # Handle both dict and string responses
            if isinstance(result, dict):
                response = result.get("response", "")
                print(f"\n{response}\n")
            else:
                print(f"\n{result}\n")
            
            # Add this turn to conversation history
            conversation_history.append({
                "user": user_query,
                "assistant": result.get("response", "") if isinstance(result, dict) else result
            })
            
            # Keep only last 10 turns to avoid context bloat
            if len(conversation_history) > 10:
                conversation_history = conversation_history[-10:]
            
            print("-" * 60)
            
        except KeyboardInterrupt:
            print("\n\nGoodbye!")
            break
        except Exception as e:
            print(f"\nError: {e}\n")
            print("-" * 60)

if __name__ == "__main__":
    asyncio.run(interactive_mode())
