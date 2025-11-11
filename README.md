# Calendar Agent

An intelligent calendar scheduling agent that uses AWS Agent Squad and Google Calendar integration to check availability and provide conversational responses.

## Features

- 🤖 **Two-Agent Architecture**: Separate agents for time parsing and response formatting
- 💬 **Conversational Memory**: Remembers context from previous queries in the session
- 📅 **Google Calendar Integration**: Real-time availability checking via MCP server
- 🎯 **Natural Language Queries**: Ask questions like "Am I free tomorrow at 3pm?"
- 🔄 **Interactive Terminal Interface**: Continuous conversation mode

## Architecture

The system uses a two-agent workflow:

1. **Agent 1 (Time Parser)**: Extracts time windows from natural language queries
2. **Agent 2 (Response Formatter)**: Formats availability results into conversational responses

Both agents maintain conversation history for context-aware interactions.

## Prerequisites

- Python 3.8+
- Node.js 18+ (for MCP server)
- Google Cloud Project with OAuth 2.0 credentials
- OpenAI API key

## Setup

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/calendar-agent.git
cd calendar-agent
```

### 2. Set Up Python Environment

```bash
# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows:
venv\Scripts\activate
# On macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Set Up MCP Google Server

The calendar agent requires a modified version of `mcp-google` with HTTP server support.

**Option A: Use the Setup Guide (Recommended)**

Follow the detailed setup instructions in [`MCP_GOOGLE_SETUP.md`](MCP_GOOGLE_SETUP.md) to:
1. Clone and configure the `mcp-google` repository
2. Set up Google OAuth credentials
3. Build and start the HTTP server

**Option B: Quick Setup**

```bash
# Clone mcp-google into this directory
git clone https://github.com/199-mcp/mcp-google.git

# Navigate to mcp-google
cd mcp-google

# Install dependencies
npm install

# Set up OAuth credentials (see MCP_GOOGLE_SETUP.md)
cp gcp-oauth.keys.example.json gcp-oauth.keys.json
# Edit gcp-oauth.keys.json with your credentials

# Authenticate
npm run auth

# Build
npm run build

# Start HTTP server (in a separate terminal)
npm run http-server
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# OpenAI API Key
OPENAI_API_KEY=sk-your-key-here

# MCP Server URL (default: http://localhost:3000/mcp/calendar)
MCP_URL=http://localhost:3000/mcp/calendar

# MCP User ID (optional)
MCP_USER_ID=user123

# Google Calendar Email (your primary calendar email)
MCP_CALENDAR_EMAIL=your-email@gmail.com
```

### 5. Verify Setup

```bash
# Make sure the MCP HTTP server is running
curl http://localhost:3000/health

# Should return: {"status":"ok"}
```

## Usage

### Interactive Mode

Run the agent in interactive mode:

```bash
python scheduling.py
```

Example session:
```
Query: Am I free tomorrow at 9am for 30 minutes?
→ Processing...
→ You're free at that time! Go ahead and schedule it.

Query: What about 10am?
→ Processing...
→ You're busy at that time. You have a conflicting event from 9:00 AM to 10:30 AM.
```

### Programmatic Usage

```python
import asyncio
from scheduling import check_busy

async def main():
    result = await check_busy("Am I free tomorrow at 3pm?")
    print(result)

asyncio.run(main())
```

## Project Structure

```
calendar-agent/
├── scheduling.py          # Main agent logic
├── demo.py               # Demo script
├── requirements.txt      # Python dependencies
├── .env                  # Environment variables (not in git)
├── MCP_GOOGLE_SETUP.md   # MCP server setup guide
├── README.md             # This file
└── mcp-google/           # MCP server (cloned, not version controlled)
    ├── src/
    │   └── http-server.ts  # HTTP wrapper server
    └── ...
```

## How It Works

1. **User Query**: Natural language question about availability
2. **Agent 1 (Time Parser)**: 
   - Uses LLM to extract time window from query
   - Considers conversation history for context
   - Returns ISO 8601 formatted start/end times
3. **MCP Query**: 
   - Queries Google Calendar API via HTTP server
   - Retrieves busy slots for the time window
4. **Overlap Detection**: 
   - Deterministic check for time conflicts
   - Returns list of overlapping events
5. **Agent 2 (Response Formatter)**: 
   - Uses LLM to format results conversationally
   - References previous conversation if relevant
   - Returns natural language response

## Conversation Memory

The agent maintains conversation history during the session:

- **Context Awareness**: Follow-up questions use previous context
  - "Am I free tomorrow at 9am?" → "What about 10am?" (understands "tomorrow at 10am")
- **Clear History**: Type `clear` or `reset` to clear conversation history
- **Automatic Pruning**: Keeps last 10 conversation turns to manage context size

## Troubleshooting

### MCP Server Connection Error
- Ensure the HTTP server is running: `npm run http-server` in `mcp-google/`
- Check `MCP_URL` in `.env` matches the server URL
- Verify server health: `curl http://localhost:3000/health`

### Authentication Errors
- Re-run authentication in `mcp-google`: `npm run auth`
- Check OAuth credentials in `gcp-oauth.keys.json`
- Ensure Google Calendar API is enabled

### Missing Calendar Email
- Set `MCP_CALENDAR_EMAIL` in `.env` with your Google account email
- Or the agent will try to auto-detect from `list-calendars`

### Import Errors
- Activate virtual environment: `venv\Scripts\activate` (Windows) or `source venv/bin/activate` (macOS/Linux)
- Install dependencies: `pip install -r requirements.txt`

## Development

### Adding New Features

The two-agent architecture makes it easy to extend:

- **Modify Agent 1**: Update `parse_time_window_from_query()` in `scheduling.py`
- **Modify Agent 2**: Update `format_reply_with_llm()` in `scheduling.py`
- **Add MCP Actions**: Extend the action mapping in `mcp-google/src/http-server.ts`

### Testing

```bash
# Test the agent
python scheduling.py

# Test specific queries
python -c "import asyncio; from scheduling import check_busy; print(asyncio.run(check_busy('Am I free tomorrow at 3pm?')))"
```

## License

This project uses:
- [AWS Agent Squad](https://github.com/aws-samples/agent-squad) - Agent orchestration framework
- [mcp-google](https://github.com/199-mcp/mcp-google) - Google Calendar MCP server (modified with HTTP wrapper)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues related to:
- **Calendar Agent**: Open an issue in this repository
- **MCP Server**: See [MCP_GOOGLE_SETUP.md](MCP_GOOGLE_SETUP.md) or the [original mcp-google repo](https://github.com/199-mcp/mcp-google)
