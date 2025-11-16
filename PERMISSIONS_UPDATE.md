# Google Calendar API Permissions Update

## Overview
The calendar agent now uses `list-events` to fetch full event details (what, where, when) instead of just free/busy information. This requires the appropriate Google Calendar API permissions.

## Required Permissions

The MCP Google server already requests the correct scope:
- `https://www.googleapis.com/auth/calendar` - Full read/write access to calendars

This scope provides:
- ✅ Read full event details (summary, location, description, attendees, etc.)
- ✅ Check availability (free/busy)
- ✅ Create, update, and delete events
- ✅ Access to all calendar properties

## If You Need to Re-authenticate

If you're getting permission errors or the code isn't receiving full event details:

1. **Re-run the authentication flow:**
   ```bash
   cd mcp-google
   npm run auth
   ```

2. **Verify the OAuth consent screen:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Navigate to "APIs & Services" > "OAuth consent screen"
   - Ensure the scope `https://www.googleapis.com/auth/calendar` is listed
   - If you're in "Testing" mode, make sure your email is added as a test user

3. **Check API enablement:**
   - Go to "APIs & Services" > "Enabled APIs"
   - Verify that "Google Calendar API" is enabled
   - If not, enable it from the [API Library](https://console.cloud.google.com/apis/library/calendar-json.googleapis.com)

## What Changed in the Code

The code now:
- **Primary data source**: Uses `list-events` to get full event details
- **Busy slot derivation**: Extracts busy times from the events list instead of a separate `freebusy` call
- **Event context**: Each busy slot includes event summary, location, and description for preference analysis

This ensures the preference system has all the information it needs:
- **What**: Event summary/title
- **Where**: Event location (to determine if online or in-person)
- **When**: Start and end times

## Benefits

1. **Single API call**: More efficient - one call instead of two
2. **Richer data**: Full event context for better preference matching
3. **Better analysis**: Can determine meeting type (online vs in-person) from location/description
4. **More accurate**: Direct event data instead of just time slots

## Testing

After updating permissions, test that events are being retrieved with full details:

```python
# In scheduling.py, the get_events_list function should return events with:
# - summary (event title)
# - location (event location)
# - description (event description)
# - start (event start time)
# - end (event end time)
```

If events are missing these fields, check:
1. OAuth token has the correct scope
2. Google Calendar API is enabled
3. Events in your calendar actually have these fields populated

