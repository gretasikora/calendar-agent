"""
Preference-based scheduling system for calendar agent.
Implements complex preference logic for suggesting available meeting times.
"""

import datetime
from typing import List, Dict, Optional, Tuple
import re

def format_iso_datetime(dt: datetime.datetime) -> str:
    """
    Format datetime to ISO 8601 string with 'Z' for UTC timezone.
    Ensures proper format: YYYY-MM-DDTHH:MM:SSZ
    """
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    
    # Convert to UTC if not already
    if dt.tzinfo != datetime.timezone.utc:
        dt = dt.astimezone(datetime.timezone.utc)
    
    # Format as ISO and replace +00:00 with Z
    iso_str = dt.isoformat()
    if iso_str.endswith('+00:00'):
        iso_str = iso_str[:-6] + 'Z'
    elif iso_str.endswith('-00:00'):
        iso_str = iso_str[:-6] + 'Z'
    
    return iso_str

def is_time_rejected(start_iso: str, end_iso: str, rejected_times: set = None) -> bool:
    """
    Check if a time slot has been rejected.
    
    Args:
        start_iso: Start time in ISO format
        end_iso: End time in ISO format
        rejected_times: Set of (start_iso, end_iso) tuples
    
    Returns:
        True if the time has been rejected, False otherwise
    """
    if not rejected_times:
        return False
    return (start_iso, end_iso) in rejected_times

# ---------------------------
# Meeting Analysis
# ---------------------------

def is_online_meeting(event: Dict) -> bool:
    """
    Determine if an event is online based on meeting links and location.
    
    Logic:
    - If event has conferenceData with video entry point (Google Meet, Zoom, etc.) → online
    - If no meeting link AND has location → in-person
    - If no meeting link AND no location → check description/keywords for online indicators
    """
    # First check for conferenceData (Google Meet, Zoom, etc.)
    conference_data = event.get("conferenceData", {})
    if conference_data:
        entry_points = conference_data.get("entryPoints", [])
        for entry in entry_points:
            entry_type = entry.get("entryPointType", "").lower()
            uri = entry.get("uri", "").lower()
            # Check for video meeting links
            if entry_type == "video" or "meet.google.com" in uri or "zoom.us" in uri or "teams.microsoft.com" in uri:
                return True
    
    # Check for meeting links in description/summary
    description = event.get("description", "").lower()
    summary = event.get("summary", "").lower()
    location = event.get("location", "").lower()
    
    # Check for explicit meeting links in text
    meeting_link_keywords = [
        "meet.google.com", "zoom.us", "teams.microsoft.com", "webex.com",
        "https://meet.google.com", "http://meet.google.com"
    ]
    text = f"{description} {summary} {location}"
    if any(keyword in text for keyword in meeting_link_keywords):
        return True
    
    # If there's a location specified and no meeting link, it's in-person
    if location and location.strip():
        return False
    
    # If no location and no meeting link, check for other online indicators in description
    online_keywords = [
        "zoom", "meet", "teams", "webex", "google meet", "video call",
        "online", "virtual", "link:", "call"
    ]
    
    # Only check description/summary (not location, since we already checked that)
    text = f"{description} {summary}"
    return any(keyword in text for keyword in online_keywords)

def is_friendly_meeting(description: str) -> bool:
    """
    Determine if a meeting is friendly (social) based on description.
    """
    if not description:
        return False
    
    description_lower = description.lower()
    
    friendly_keywords = [
        "lunch", "dinner", "hangout", "catchup", "catch up", "drinks",
        "pub", "coffee", "tea", "brunch", "breakfast", "social",
        "friend", "friends", "casual", "informal"
    ]
    
    return any(keyword in description_lower for keyword in friendly_keywords)

# ---------------------------
# Preference Logic: Online Meetings
# ---------------------------

async def suggest_online_times(
    duration_minutes: int,
    events: List[Dict],
    start_date: datetime.datetime,
    end_date: datetime.datetime,
    mcp_post_func,
    calendar_email: str = None,
    rejected_times: set = None
) -> List[Dict[str, str]]:
    """
    Suggest times for online meetings based on preferences.
    
    Returns list of suggested time slots with ISO start/end times.
    """
    suggestions = []
    
    # Get current time to ensure we don't suggest past times
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Preference 1: Time window 9:30 AM - 7:00 PM
    preferred_start_hour = 9
    preferred_start_minute = 30
    preferred_end_hour = 19  # 7 PM
    
    # Preference 2: Try to schedule around other online meetings
    online_events = [e for e in events if is_online_meeting(e)]
    
    # Collect suggestions from all online events, but limit to avoid too many
    for event in online_events:
        if len(suggestions) >= 5:  # Stop if we have enough suggestions
            break
        event_start_str = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        event_end_str = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date", "")
        if not event_start_str or not event_end_str:
            continue
        try:
            # Parse ISO format strings, handling 'Z' timezone and various formats
            def parse_iso_safe(iso_str):
                if not iso_str:
                    return None
                # Handle 'Z' timezone
                if iso_str.endswith('Z'):
                    iso_str = iso_str[:-1] + '+00:00'
                # Handle timezone offset formats
                elif '+' in iso_str[-6:] or '-' in iso_str[-6:]:
                    # Already has timezone, try as-is
                    pass
                else:
                    # No timezone, add UTC
                    if 'T' in iso_str:
                        if '.' in iso_str:
                            iso_str = iso_str.split('.')[0] + '+00:00'
                        else:
                            iso_str = iso_str + '+00:00'
                    else:
                        iso_str = iso_str + 'T00:00:00+00:00'
                
                dt = datetime.datetime.fromisoformat(iso_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                return dt
            
            event_start = parse_iso_safe(event_start_str)
            event_end = parse_iso_safe(event_end_str)
            if not event_start or not event_end:
                continue
        except:
            continue
        
        # Suggest right before (if within preferred window, in the future, and not today)
        before_time = event_start - datetime.timedelta(minutes=duration_minutes)
        # Debug: Log what we're checking
        print(f"[DEBUG suggest_online_times] Checking before suggestion:")
        print(f"  Event: {event.get('summary', 'Unknown')} at {event_start}")
        print(f"  before_time: {before_time}, now: {now}")
        print(f"  Checks: before_time > now: {before_time > now}, date > now.date(): {before_time.date() > now.date()}")
        print(f"  Hour check: {before_time.hour} > {preferred_start_hour} or ({before_time.hour} == {preferred_start_hour} and {before_time.minute} >= {preferred_start_minute})")
        print(f"  Hour < end: {before_time.hour < preferred_end_hour}")
        
        if (before_time > now and  # Must be in the future
            before_time.date() > now.date() and  # Must not be today
            (before_time.hour > preferred_start_hour or 
            (before_time.hour == preferred_start_hour and before_time.minute >= preferred_start_minute))):
            if before_time.hour < preferred_end_hour:
                # Check if this slot is free
                slot_end = event_start
                start_iso = format_iso_datetime(before_time)
                end_iso = format_iso_datetime(slot_end)
                if not is_time_rejected(start_iso, end_iso, rejected_times):
                    is_free = await is_slot_free(before_time, slot_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email)
                    print(f"[DEBUG] Before suggestion {before_time} - {slot_end}: is_free={is_free}")
                    if is_free:
                        # Use generic reason - don't reveal information about other meetings
                        suggestions.append({
                            "start_iso": start_iso,
                            "end_iso": end_iso,
                            "reason": "Available time slot"  # Generic reason, no private info
                        })
                        print(f"[DEBUG] [OK] Added before suggestion: {start_iso} - {end_iso}")
                        if len(suggestions) >= 5:  # Stop if we have enough
                            break
                    else:
                        print(f"[DEBUG] [FAIL] Before suggestion {before_time} - {slot_end} is NOT free")
                else:
                    print(f"[DEBUG] [SKIP] Before suggestion {before_time} - {slot_end} was already rejected")
            else:
                print(f"[DEBUG] [FAIL] Before suggestion hour {before_time.hour} >= preferred_end_hour {preferred_end_hour}")
        else:
            print(f"[DEBUG] [FAIL] Before suggestion {before_time} failed initial checks")
        
        # Suggest right after (if within preferred window, in the future, and not today)
        if len(suggestions) >= 5:  # Stop if we have enough before checking "after"
            break
        after_time = event_end
        slot_end = after_time + datetime.timedelta(minutes=duration_minutes)
        if (after_time > now and  # Must be in the future
            after_time.date() > now.date() and  # Must not be today
            after_time.hour < preferred_end_hour and 
            slot_end.hour <= preferred_end_hour):
            # Check if this slot is free (with 15 min buffer if previous was in-person)
            buffer = 15 if not is_online_meeting(event) else 0
            start_iso = format_iso_datetime(after_time)
            end_iso = format_iso_datetime(slot_end)
            if not is_time_rejected(start_iso, end_iso, rejected_times):
                if await is_slot_free(after_time, slot_end, events, mcp_post_func, buffer_minutes=buffer, calendar_email=calendar_email):
                    # Use generic reason - don't reveal information about other meetings
                    suggestions.append({
                        "start_iso": start_iso,
                        "end_iso": end_iso,
                        "reason": "Available time slot"  # Generic reason, no private info
                    })
                    if len(suggestions) >= 5:  # Stop if we have enough
                        break
    
    # Preference 3: Continue generating suggestions even if we have some
    # This ensures we have multiple options (before/after + fallbacks)
    # Preference 4: Fallback to 6:00 PM, 5:30 PM, and 5:00 PM on free weekdays
    if len(suggestions) < 5:  # Generate more if we don't have enough yet
        # Always start from tomorrow (never suggest for today)
        today = now.date()
        start_date_for_suggestions = today + datetime.timedelta(days=1)
        
        # Times to suggest: 6:00 PM, 5:30 PM, 5:00 PM (in that order)
        fallback_times = [
            (18, 0),   # 6:00 PM
            (17, 30),  # 5:30 PM
            (17, 0)    # 5:00 PM
        ]
        
        for day_offset in range(14):  # Check next 14 days to find available slots
            if len(suggestions) >= 5:  # Stop if we have enough
                break
            check_date = start_date_for_suggestions + datetime.timedelta(days=day_offset)
            if check_date.weekday() < 5:  # Weekday (Mon-Fri)
                # Try each time slot for this date
                for hour, minute in fallback_times:
                    if len(suggestions) >= 5:  # Stop if we have enough
                        break
                    suggested_time = datetime.datetime.combine(
                        check_date,
                        datetime.time(hour, minute)
                    ).replace(tzinfo=datetime.timezone.utc)
                    slot_end = suggested_time + datetime.timedelta(minutes=duration_minutes)
                    
                    # Ensure it's in the future and within preferred hours
                    if suggested_time > now and slot_end.hour <= preferred_end_hour:
                        start_iso = format_iso_datetime(suggested_time)
                        end_iso = format_iso_datetime(slot_end)
                        if not is_time_rejected(start_iso, end_iso, rejected_times):
                            # NOTE: This is in suggest_online_times, so is_inperson_meeting=False
                            # But we should still check for conflicts with in-person events
                            # For online meetings, we don't need the 30min buffer, but we should still avoid conflicts
                            if await is_slot_free(suggested_time, slot_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=False):
                                # Format time string for display
                                if hour == 18:
                                    time_str = "6:00 PM"
                                elif hour == 17 and minute == 30:
                                    time_str = "5:30 PM"
                                elif hour == 17:
                                    time_str = "5:00 PM"
                                else:
                                    time_str = f"{hour}:{minute:02d} PM" if hour >= 12 else f"{hour}:{minute:02d} AM"
                                suggestions.append({
                                    "start_iso": start_iso,
                                    "end_iso": end_iso,
                                    "reason": f"{time_str} on {check_date.strftime('%A, %B %d')}"
                                })
                                if len(suggestions) >= 5:
                                    break
    
    # Preference 5: Saturday 10:30 AM or next week
    if len(suggestions) < 5:  # Generate more if we don't have enough yet
        # Try Saturday 10:30 AM - always skip today
        today = now.date()
        days_until_saturday = (5 - today.weekday()) % 7
        if days_until_saturday == 0:
            # If today is Saturday, always use next Saturday
            days_until_saturday = 7
        
        saturday_date = today + datetime.timedelta(days=days_until_saturday)
        saturday_time = datetime.datetime.combine(
            saturday_date,
            datetime.time(10, 30)  # 10:30 AM
        ).replace(tzinfo=datetime.timezone.utc)
        slot_end = saturday_time + datetime.timedelta(minutes=duration_minutes)
        
        # Ensure it's in the future
        if saturday_time > now:
            start_iso = format_iso_datetime(saturday_time)
            end_iso = format_iso_datetime(slot_end)
            if not is_time_rejected(start_iso, end_iso, rejected_times):
                if await is_slot_free(saturday_time, slot_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email):
                    suggestions.append({
                        "start_iso": start_iso,
                        "end_iso": end_iso,
                        "reason": f"Saturday 10:30 AM ({saturday_date.strftime('%B %d')})"
                    })
    
    return suggestions[:5]  # Return top 5 suggestions

# ---------------------------
# Preference Logic: In-Person Meetings
# ---------------------------

async def suggest_inperson_times(
    duration_minutes: int,
    description: str,
    events: List[Dict],
    start_date: datetime.datetime,
    end_date: datetime.datetime,
    mcp_post_func,
    calendar_email: str = None,
    rejected_times: set = None
) -> Tuple[List[Dict[str, str]], Optional[str]]:
    """
    Suggest times for in-person meetings based on preferences.
    
    Returns (list of suggested time slots, suggested_location).
    """
    suggestions = []
    location = None
    is_friendly = is_friendly_meeting(description)
    
    # Get current time to ensure we don't suggest past times
    now = datetime.datetime.now(datetime.timezone.utc)
    
    # Debug: Log events being checked
    print(f"\n[DEBUG suggest_inperson_times] Checking {len(events)} events for conflicts")
    for event in events[:3]:  # Show first 3
        event_start = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        event_end = event.get("end", {}).get("dateTime") or event.get("end", {}).get("date", "")
        summary = event.get("summary", "No title")
        is_online = is_online_meeting(event)
        print(f"  Event: {summary} | {event_start} - {event_end} | Online: {is_online}")
    
    # Preference 1: Determine tone and suggest accordingly
    if is_friendly:
        # Friendly meetings: lunch, dinner (6:30 PM+), or evening for pub
        # Always start from tomorrow (never suggest for today)
        today = now.date()
        start_date_for_suggestions = today + datetime.timedelta(days=1)
        
        for day_offset in range(14):  # Check next 14 days
            check_date = start_date_for_suggestions + datetime.timedelta(days=day_offset)
            
            # Lunch time (12:00 PM)
            lunch_time = datetime.datetime.combine(
                check_date,
                datetime.time(12, 0)
            ).replace(tzinfo=datetime.timezone.utc)
            lunch_end = lunch_time + datetime.timedelta(minutes=duration_minutes)
            
            # Only suggest if in the future
            if lunch_time > now:
                start_iso = format_iso_datetime(lunch_time)
                end_iso = format_iso_datetime(lunch_end)
                if not is_time_rejected(start_iso, end_iso, rejected_times):
                    if await is_slot_free(lunch_time, lunch_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=True):
                        suggestions.append({
                            "start_iso": start_iso,
                            "end_iso": end_iso,
                            "reason": f"Lunch time on {check_date.strftime('%A, %B %d')}"
                        })
            
            # Dinner time (6:30 PM+)
            # IMPORTANT: Create time in UTC, but this represents 6:30 PM in the user's local timezone
            # We need to check what timezone the calendar events are in
            # For now, assume events are in UTC (Google Calendar API returns times in UTC)
            dinner_time = datetime.datetime.combine(
                check_date,
                datetime.time(18, 30)
            ).replace(tzinfo=datetime.timezone.utc)
            dinner_end = dinner_time + datetime.timedelta(minutes=duration_minutes)
            
            # Debug: Log what we're checking
            print(f"[DEBUG] Checking dinner time: {dinner_time} - {dinner_end}")
            
            # Only suggest if in the future
            if dinner_time > now:
                # Check if this time was already rejected
                start_iso = format_iso_datetime(dinner_time)
                end_iso = format_iso_datetime(dinner_end)
                if rejected_times and (start_iso, end_iso) in rejected_times:
                    continue  # Skip rejected times
                
                is_free = await is_slot_free(dinner_time, dinner_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=True)
                if is_free:
                    print(f"[DEBUG] Dinner time {dinner_time} is FREE")
                if is_free:
                    suggestions.append({
                        "start_iso": start_iso,
                        "end_iso": end_iso,
                        "reason": f"Dinner time on {check_date.strftime('%A, %B %d')}"
                    })
            
            if len(suggestions) >= 3:
                break
    else:
        # Business meetings: 4:00 PM coffee/walk
        location = "Crosstown café, Oxford city centre"
        # Always start from tomorrow (never suggest for today)
        today = now.date()
        start_date_for_suggestions = today + datetime.timedelta(days=1)
        
        for day_offset in range(14):  # Check next 14 days
            check_date = start_date_for_suggestions + datetime.timedelta(days=day_offset)
            coffee_time = datetime.datetime.combine(
                check_date,
                datetime.time(16, 0)  # 4:00 PM
            ).replace(tzinfo=datetime.timezone.utc)
            coffee_end = coffee_time + datetime.timedelta(minutes=duration_minutes)
            
            # Only suggest if in the future
            if coffee_time > now:
                start_iso = format_iso_datetime(coffee_time)
                end_iso = format_iso_datetime(coffee_end)
                if not is_time_rejected(start_iso, end_iso, rejected_times):
                    if await is_slot_free(coffee_time, coffee_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=True):
                        suggestions.append({
                            "start_iso": start_iso,
                            "end_iso": end_iso,
                            "reason": f"4:00 PM on {check_date.strftime('%A, %B %d')}"
                        })
                        if len(suggestions) >= 3:
                            break
    
    # Preference 2: If initial suggestions don't work, iterate
    if not suggestions:
        if is_friendly:
            # Friendly: flexible, past 7 PM or lunchtime
            # Always start from tomorrow (never suggest for today)
            today = now.date()
            start_date_for_suggestions = today + datetime.timedelta(days=1)
            
            for day_offset in range(14):  # Check next 14 days
                check_date = start_date_for_suggestions + datetime.timedelta(days=day_offset)
                
                # Try 7:30 PM
                evening_time = datetime.datetime.combine(
                    check_date,
                    datetime.time(19, 30)
                ).replace(tzinfo=datetime.timezone.utc)
                evening_end = evening_time + datetime.timedelta(minutes=duration_minutes)
                
                # Only suggest if in the future
                if evening_time > now:
                    start_iso = format_iso_datetime(evening_time)
                    end_iso = format_iso_datetime(evening_end)
                    if not is_time_rejected(start_iso, end_iso, rejected_times):
                        if await is_slot_free(evening_time, evening_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=True):
                            suggestions.append({
                                "start_iso": start_iso,
                                "end_iso": end_iso,
                                "reason": f"Evening on {check_date.strftime('%A, %B %d')}"
                            })
                            if len(suggestions) >= 3:
                                break
        else:
            # Business: 3-5 PM next week
            today = now.date()
            # Start from next week (7 days from now)
            start_date_for_suggestions = today + datetime.timedelta(days=7)
            
            for day_offset in range(7):  # Check next week
                check_date = start_date_for_suggestions + datetime.timedelta(days=day_offset)
                if check_date.weekday() < 5:  # Weekday
                    for hour in [15, 16, 17]:  # 3 PM, 4 PM, 5 PM
                        business_time = datetime.datetime.combine(
                            check_date,
                            datetime.time(hour, 0)
                        ).replace(tzinfo=datetime.timezone.utc)
                        business_end = business_time + datetime.timedelta(minutes=duration_minutes)
                        
                        # Only suggest if in the future
                        if business_time > now:
                            start_iso = format_iso_datetime(business_time)
                            end_iso = format_iso_datetime(business_end)
                            if not is_time_rejected(start_iso, end_iso, rejected_times):
                                if await is_slot_free(business_time, business_end, events, mcp_post_func, buffer_minutes=0, calendar_email=calendar_email, is_inperson_meeting=True):
                                    suggestions.append({
                                        "start_iso": start_iso,
                                        "end_iso": end_iso,
                                        "reason": f"{hour}:00 PM on {check_date.strftime('%A, %B %d')}"
                                    })
                                    if len(suggestions) >= 3:
                                        break
                    if len(suggestions) >= 3:
                        break
    
    return suggestions[:5], location

# ---------------------------
# Helper Functions
# ---------------------------

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
    
    For in-person meetings: requires 30 minutes buffer BEFORE and AFTER any existing in-person event.
    """
    # Add buffer before start (if specified)
    check_start = start
    if buffer_minutes > 0:
        check_start = start - datetime.timedelta(minutes=buffer_minutes)
    
    # Check against existing events (derived from the single list-events call)
    for event in existing_events:
        # Handle different event formats
        event_start_str = None
        event_end_str = None
        
        if isinstance(event, dict):
            # Try different possible structures
            if "start" in event:
                if isinstance(event["start"], dict):
                    event_start_str = event["start"].get("dateTime") or event["start"].get("date")
                else:
                    event_start_str = event["start"]
            
            if "end" in event:
                if isinstance(event["end"], dict):
                    event_end_str = event["end"].get("dateTime") or event["end"].get("date")
                else:
                    event_end_str = event["end"]
        
        if not event_start_str or not event_end_str:
            continue
        
        try:
            # Parse ISO format strings, handling 'Z' timezone and various formats
            def parse_iso_safe(iso_str):
                if not iso_str:
                    return None
                # Handle 'Z' timezone
                if iso_str.endswith('Z'):
                    iso_str = iso_str[:-1] + '+00:00'
                # Handle timezone offset formats
                elif '+' in iso_str[-6:] or '-' in iso_str[-6:]:
                    # Already has timezone, try as-is
                    pass
                else:
                    # No timezone, add UTC
                    if 'T' in iso_str:
                        if '.' in iso_str:
                            iso_str = iso_str.split('.')[0] + '+00:00'
                        else:
                            iso_str = iso_str + '+00:00'
                    else:
                        iso_str = iso_str + 'T00:00:00+00:00'
                
                dt = datetime.datetime.fromisoformat(iso_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                return dt
            
            event_start = parse_iso_safe(event_start_str)
            event_end = parse_iso_safe(event_end_str)
            if not event_start or not event_end:
                continue
            
            # Determine if existing event is in-person
            existing_is_inperson = not is_online_meeting(event)
            
            # For in-person meetings: need 30 min buffer BEFORE and AFTER existing in-person events
            # IMPORTANT: If the proposed meeting is in-person, we need buffer around existing in-person events
            # If the proposed meeting is online, we still need buffer around existing in-person events
            # (can't schedule online right after an in-person event ends)
            if existing_is_inperson:
                # Add 30 minutes buffer before the existing event (can't schedule right before)
                effective_event_start = event_start - datetime.timedelta(minutes=30)
                # Add 30 minutes buffer after the existing event (can't schedule right after)
                effective_event_end = event_end + datetime.timedelta(minutes=30)
            else:
                effective_event_start = event_start
                effective_event_end = event_end
            
            # Check for overlap: [check_start, end) overlaps [effective_event_start, effective_event_end)
            # Two intervals overlap if: start1 < end2 AND start2 < end1
            # For in-person meetings with buffers, we need to ensure no meeting starts within the buffer zone
            # If suggested meeting starts before buffer ends AND suggested meeting ends after buffer starts, it conflicts
            # This ensures that if an event ends at 6:00 PM, we can't schedule anything starting before 6:30 PM
            overlaps = check_start < effective_event_end and effective_event_start < end
            
            # Debug: Log the overlap check for in-person meetings
            if is_inperson_meeting and existing_is_inperson:
                event_summary = event.get("summary", "Unknown")
                print(f"[DEBUG is_slot_free] Checking: suggested {start} - {end} vs event '{event_summary}' ({event_start} - {event_end})")
                print(f"  -> Buffer applied: effective range {effective_event_start} - {effective_event_end}")
                print(f"  -> Overlap check: {check_start} < {effective_event_end} = {check_start < effective_event_end}, {effective_event_start} < {end} = {effective_event_start < end}")
                print(f"  -> Result: {'CONFLICT' if overlaps else 'FREE'}")
            
            if overlaps:
                # Debug: Log why slot is not free
                event_summary = event.get("summary", "Unknown")
                print(f"[DEBUG is_slot_free] Slot CONFLICT: Suggested {start} - {end} conflicts with event '{event_summary}' ({event_start} - {event_end})")
                if is_inperson_meeting and existing_is_inperson:
                    print(f"  -> In-person buffer applied: effective range {effective_event_start} - {effective_event_end}")
                return False
        except Exception as e:
            # Debug: Log parsing errors
            print(f"[DEBUG is_slot_free] Error parsing event: {e}")
            continue
    
    # Slot is free if no overlapping events found
    return True

def format_time(dt: datetime.datetime) -> str:
    """Format datetime for display."""
    return dt.strftime("%I:%M %p")

def get_upcoming_events(events: List[Dict], start_date: datetime.datetime, days: int = 14) -> List[Dict]:
    """
    Filter events to get upcoming ones within the specified days.
    """
    end_date = start_date + datetime.timedelta(days=days)
    upcoming = []
    
    for event in events:
        event_start_str = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        if not event_start_str:
            continue
        try:
            # Parse ISO format strings, handling 'Z' timezone and various formats
            def parse_iso_safe(iso_str):
                if not iso_str:
                    return None
                # Handle 'Z' timezone
                if iso_str.endswith('Z'):
                    iso_str = iso_str[:-1] + '+00:00'
                # Handle timezone offset formats
                elif '+' in iso_str[-6:] or '-' in iso_str[-6:]:
                    # Already has timezone, try as-is
                    pass
                else:
                    # No timezone, add UTC
                    if 'T' in iso_str:
                        if '.' in iso_str:
                            iso_str = iso_str.split('.')[0] + '+00:00'
                        else:
                            iso_str = iso_str + '+00:00'
                    else:
                        iso_str = iso_str + 'T00:00:00+00:00'
                
                dt = datetime.datetime.fromisoformat(iso_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=datetime.timezone.utc)
                return dt
            
            event_start = parse_iso_safe(event_start_str)
            if not event_start:
                continue
            if event_start and start_date <= event_start <= end_date:
                upcoming.append(event)
        except:
            continue
    
    def get_event_start(event):
        event_start_str = event.get("start", {}).get("dateTime") or event.get("start", {}).get("date", "")
        if not event_start_str:
            return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
        try:
            # Parse ISO format strings, handling 'Z' timezone and various formats
            if event_start_str.endswith('Z'):
                event_start_str = event_start_str[:-1] + '+00:00'
            elif '+' not in event_start_str[-6:] and '-' not in event_start_str[-6:]:
                # No timezone, add UTC
                if 'T' in event_start_str:
                    if '.' in event_start_str:
                        event_start_str = event_start_str.split('.')[0] + '+00:00'
                    else:
                        event_start_str = event_start_str + '+00:00'
                else:
                    event_start_str = event_start_str + 'T00:00:00+00:00'
            
            event_start = datetime.datetime.fromisoformat(event_start_str)
            if event_start.tzinfo is None:
                event_start = event_start.replace(tzinfo=datetime.timezone.utc)
            return event_start
        except:
            return datetime.datetime.min.replace(tzinfo=datetime.timezone.utc)
    
    return sorted(upcoming, key=get_event_start)

