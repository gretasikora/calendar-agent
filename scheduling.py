# busy_check_agent.py
import os
import asyncio
import json
import re
from typing import List, Dict, Optional
import datetime
from dateutil import parser as dateparser
import aiohttp
from dotenv import load_dotenv

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
        # Format: "Calendar Name (calendar-id)" where id can be email or "primary"
        if isinstance(result, dict) and "content" in result:
            content = result["content"]
            if isinstance(content, list) and len(content) > 0:
                text = content[0].get("text", "") if isinstance(content[0], dict) else str(content[0])
                lines = text.split("\n")
                
                # Try to find primary calendar or use first calendar
                for line in lines:
                    if not line.strip():
                        continue
                    # Extract ID from parentheses: "Name (id)"
                    match = re.search(r'\(([^)]+)\)', line)
                    if match:
                        calendar_id = match.group(1)
                        # If it's an email address, use it
                        if "@" in calendar_id and "." in calendar_id:
                            return calendar_id
                        # If it's "primary", we'll need to handle it differently
                        # For now, continue to next calendar
                
                # If no email found, try first line anyway (might be "primary")
                if lines:
                    match = re.search(r'\(([^)]+)\)', lines[0])
                    if match:
                        calendar_id = match.group(1)
                        # If it's "primary", we can't use it - need actual email
                        if calendar_id.lower() == "primary":
                            raise ValueError("Found 'primary' calendar ID but need actual email address")
                        return calendar_id
        
        raise ValueError("Could not determine primary calendar email from calendar list")
    except Exception as e:
        raise ValueError(f"Failed to get primary calendar email: {e}. Please set MCP_CALENDAR_EMAIL in .env file with your Google account email.")

async def get_freebusy_for_window(start_iso: str, end_iso: str, user_id: str = MCP_USER_ID, calendar_email: str = None) -> dict:
    """
    Request freebusy from MCP for the given UTC ISO window.
    
    Args:
        start_iso: Start time in ISO format
        end_iso: End time in ISO format
        user_id: User ID (optional)
        calendar_email: Calendar email address. If None, attempts to get from list-calendars or uses MCP_CALENDAR_EMAIL.
    """
    # If no calendar email provided, try to get it
    if calendar_email is None:
        calendar_email = await get_primary_calendar_email()
    
    payload = {
        "user_id": user_id,
        "action": "freebusy", 
        "params": {
            "timeMin": start_iso,
            "timeMax": end_iso,
            "items": [{"id": calendar_email}]
        }
    }
    return await mcp_post(payload)

# ---------------------------
# Busy-check logic (deterministic)
# ---------------------------
def overlaps(start_a: datetime.datetime, end_a: datetime.datetime,
             start_b: datetime.datetime, end_b: datetime.datetime) -> bool:
    """Return True if intervals [start_a,end_a) and [start_b,end_b) overlap."""
    return start_a < end_b and start_b < end_a

def is_time_busy_at(request_start: str, request_end: str, busy_slots: List[Dict]) -> (bool, List[Dict]):
    """
    Given requested ISO window and busy_slots from MCP, determine if busy.
    Returns (is_busy, overlapping_slots).
    """
    req_start = dateparser.isoparse(request_start)
    req_end = dateparser.isoparse(request_end)
    overlaps_list = []
    for slot in busy_slots:
        # Normalize possible field names
        slot_start = dateparser.isoparse(slot.get("start") or slot.get("startDateTime") or slot.get("start_time"))
        slot_end = dateparser.isoparse(slot.get("end") or slot.get("endDateTime") or slot.get("end_time"))
        if overlaps(req_start, req_end, slot_start, slot_end):
            overlaps_list.append({"start": slot_start.isoformat() + "Z", "end": slot_end.isoformat() + "Z"})
    return (len(overlaps_list) > 0, overlaps_list)

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
    
    response = await orchestrator.route_request(parser_prompt, user_id=MCP_USER_ID, session_id="time-parser")
    
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
    # Remove markdown code blocks if present
    response_text = re.sub(r'```json\s*', '', response_text)
    response_text = re.sub(r'```\s*', '', response_text)
    # Try to find JSON object - look for content between first { and last } that contains both fields
    if '"start_iso"' in response_text and '"end_iso"' in response_text:
        # Find the first { and try to match to the corresponding }
        start_idx = response_text.find('{')
        if start_idx != -1:
            # Count braces to find matching closing brace
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
        # Validate required fields
        if "start_iso" not in time_window or "end_iso" not in time_window:
            raise ValueError("Missing start_iso or end_iso in response")
        return time_window
    except (json.JSONDecodeError, ValueError) as e:
        raise ValueError(f"Failed to parse time window from LLM response: {response_text}. Error: {e}")

# ---------------------------
# Agent 2: Format response conversationally
# ---------------------------
async def format_reply_with_llm(is_busy: bool, overlaps: List[Dict], user_question: str, conversation_history: List[Dict[str, str]] = None) -> str:
    """
    Agent 2: Formats the availability check results into a conversational response.
    Takes the overlap results and creates a natural, friendly reply for the user.
    
    Args:
        is_busy: Whether the requested time is busy
        overlaps: List of overlapping time slots
        user_question: Current user question
        conversation_history: List of previous conversation turns for context
    """
    # Build orchestrator & agent (lightweight each run; you could make these global singletons)
    classifier = OpenAIClassifier(options=OpenAIClassifierOptions(api_key=OPENAI_KEY))
    orchestrator = AgentSquad(classifier=classifier)
    formatter_agent = OpenAIAgent(
        options=OpenAIAgentOptions(
            name="Scheduler Assistant",
            description="A helper that formats calendar availability answers.",
            api_key=OPENAI_KEY,
            model="gpt-4o-mini",
            streaming=False
        )
    )
    orchestrator.add_agent(formatter_agent)

    # Build conversation history context for more natural responses
    history_context = ""
    if conversation_history and len(conversation_history) > 0:
        history_context = "\n\nPrevious conversation (for context):\n"
        for turn in conversation_history[-3:]:  # Last 3 turns for context
            user_msg = turn.get("user", "")
            assistant_msg = turn.get("assistant", "")
            if user_msg:
                history_context += f"User: {user_msg}\n"
            if assistant_msg:
                history_context += f"Assistant: {assistant_msg}\n"
        history_context += "\n"
    
    # Prompt: Agent 2 formats the result conversationally
    prompt = (
        "You are a friendly calendar assistant. Based on the availability check results, "
        "provide a natural, conversational response to the user's question.\n"
        f"{history_context}"
        f"User's current question: \"{user_question}\"\n\n"
        f"Availability check results:\n"
        f"- Is busy: {is_busy}\n"
        f"- Overlapping events: {len(overlaps)} conflict(s)\n"
        f"{'- Overlapping time slots: ' + json.dumps(overlaps, indent=2) if overlaps else ''}\n\n"
        "Provide a friendly, conversational response that:\n"
        "1. Directly answers whether they are free or busy\n"
        "2. Mentions any conflicting events if applicable\n"
        "3. Is helpful and natural (not robotic)\n"
        "4. Can reference previous conversation if relevant (e.g., 'Yes, you're free at 10am tomorrow too')\n\n"
        "Example responses:\n"
        "- If free: \"You're free at that time! Go ahead and schedule it.\"\n"
        "- If busy: \"You're busy at that time. You have a conflicting event from 3:00 PM to 4:00 PM.\"\n\n"
        "Your response:"
    )

    response = await orchestrator.route_request(prompt, user_id=MCP_USER_ID, session_id="busy-check")
    # extract assistant textual output (same extraction as earlier)
    assistant_text = ""
    if hasattr(response.output, "content"):
        content = response.output.content
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and "text" in part:
                    assistant_text += part["text"]
                elif isinstance(part, str):
                    assistant_text += part
                else:
                    assistant_text += str(part)
        else:
            assistant_text = str(content)
    else:
        assistant_text = str(response.output)

    return assistant_text

# ---------------------------
# Main orchestration function
# ---------------------------
async def check_busy(user_query: str, conversation_history: List[Dict[str, str]] = None) -> str:
    """
    Top-level function that orchestrates the two-agent workflow.
    
    Agent 1: Parses user query → extracts time window → queries MCP → returns busy times
    Agent 2: Takes overlap results → formats conversationally
    
    Args:
        user_query: Natural language query (e.g., "Am I free tomorrow at 3pm for 30 minutes?")
        conversation_history: List of previous conversation turns [{"user": "...", "assistant": "..."}, ...]
    
    Returns:
        str: Conversational response from Agent 2
    """
    # Step 1: Agent 1 - Parse user query and extract time window (with conversation history)
    time_window = await parse_time_window_from_query(user_query, conversation_history)
    start_iso = time_window["start_iso"]
    end_iso = time_window["end_iso"]
    
    # Step 2: Query MCP for busy slots
    # Expand the query window to catch overlapping events
    # Query 24 hours before and after to ensure we catch all relevant events
    query_start = dateparser.isoparse(start_iso) - datetime.timedelta(hours=24)
    query_end = dateparser.isoparse(end_iso) + datetime.timedelta(hours=24)
    query_start_iso = query_start.isoformat().replace('+00:00', 'Z')
    query_end_iso = query_end.isoformat().replace('+00:00', 'Z')
    
    fb = await get_freebusy_for_window(query_start_iso, query_end_iso, user_id=MCP_USER_ID)
    # Parse the MCP response - it returns content with text, need to extract busy slots
    busy_slots = []
    if isinstance(fb, dict):
        # First, try to get busy slots directly (HTTP server sets this)
        if "busy" in fb and isinstance(fb["busy"], list):
            busy_slots = fb["busy"]
        # Fallback: try to parse from raw response
        elif "raw" in fb:
            try:
                raw_data = json.loads(fb["raw"]) if isinstance(fb["raw"], str) else fb["raw"]
                if isinstance(raw_data, dict) and "calendars" in raw_data:
                    # Extract busy slots from all calendars
                    for calendar_id, calendar_info in raw_data["calendars"].items():
                        if isinstance(calendar_info, dict) and "busy" in calendar_info:
                            busy_slots.extend(calendar_info["busy"])
            except:
                pass
        # Last fallback: try other possible field names
        if not busy_slots:
            busy_slots = fb.get("items") or fb.get("events") or []
    
    # Step 3: Run deterministic overlap test
    is_busy, overlaps_list = is_time_busy_at(start_iso, end_iso, busy_slots)
    
    # Step 4: Agent 2 - Format response conversationally (with conversation history)
    assistant_reply = await format_reply_with_llm(is_busy, overlaps_list, user_query, conversation_history)
    
    # Return only the LLM's conversational answer
    return assistant_reply

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
            print(f"\n{result}\n")
            
            # Add this turn to conversation history
            conversation_history.append({
                "user": user_query,
                "assistant": result
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
