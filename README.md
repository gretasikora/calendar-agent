# Calendar Agent

An AI-powered scheduling assistant with a web UI. It understands natural language requests ("find me a 1-hour slot Thursday afternoon"), checks your Google Calendar for conflicts, and books events on your behalf.

Deployed as two services on Railway:

- **Flask API** — Python backend + frontend. Handles the conversation, calls the MCP server for calendar data, and orchestrates two OpenAI agents (time parsing + response formatting).
- **MCP Google Server** — Node.js service that wraps the Google Calendar, Gmail, and Contacts APIs via OAuth2. Exposes a simple HTTP endpoint that the Flask API calls.

---

## Architecture

```
Browser → Flask API (Python) → MCP Google Server (Node.js) → Google APIs
                 ↑
           OpenAI agents
           (AgentSquad)
```

**Scheduling flow:**

1. User submits a natural language request via the web UI
2. **Agent 1 (Time Parser)** extracts time windows from the request using LLM
3. Flask queries the MCP server for busy slots in that window
4. Overlap detection finds conflicts and free slots
5. **Agent 2 (Response Formatter)** converts the results into a conversational response
6. User reviews suggested times and confirms booking

Both agents maintain conversation history within a session so follow-up questions ("what about 10am instead?") work correctly.

---

## Project Structure

```
calendar-agent/
├── api_server.py          # Flask API server — entry point for the Python service
├── scheduling.py          # AI scheduling logic, OpenAI agent pipeline, MCP client
├── preferences.py         # Meeting preference logic (online vs in-person, time slots)
├── requirements.txt       # Python dependencies
├── Dockerfile             # Docker image for Flask service (used by Railway)
├── railway.json           # Railway deployment config for Flask service
├── frontend/
│   ├── index.html         # Web UI
│   ├── app.js             # Frontend JavaScript
│   └── styles.css         # Styles
└── mcp-google/            # Modified mcp-google Node.js MCP server
    ├── src/               # TypeScript source
    ├── build/             # Compiled JS (committed — includes http-server.js)
    ├── Dockerfile         # Docker image for MCP service (used by Railway)
    ├── package.json
    └── format-tokens-for-railway.js  # Helper to format tokens for Railway env var
```

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js **v20 LTS** (v18+ works; v22+ may break some dependencies)
- A Google Cloud project with OAuth 2.0 credentials (Desktop app type)
- An OpenAI API key

### Python setup

```bash
# From project root
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Node setup (MCP server)

```bash
cd mcp-google
npm install
```

### Google OAuth setup

You need a `gcp-oauth.keys.json` file (or the equivalent env vars) to authenticate. See [Setting up Google OAuth](#setting-up-google-oauth) below.

Once you have credentials, authenticate once to generate tokens:

```bash
cd mcp-google
npm run auth
# Opens a browser — complete the Google consent flow
# Tokens saved to ~/.config/google-calendar-mcp/tokens.json
```

### Environment variables

Create a `.env` file in the project root:

```env
OPENAI_API_KEY=sk-...
MCP_URL=http://localhost:3000/mcp/calendar
MCP_USER_ID=user123
MCP_CALENDAR_EMAIL=you@gmail.com
```

### Run locally

**Terminal 1 — MCP server:**
```bash
cd mcp-google
npm run http-server
```

**Terminal 2 — Flask API:**
```bash
source .venv/bin/activate
python api_server.py
```

Open http://localhost:5000 in your browser. The Flask server also serves the frontend.

---

## Setting up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create or select a project
3. Enable these APIs under **APIs & Services → Library**:
   - Google Calendar API
   - Google People API
   - Gmail API
4. Go to **APIs & Services → OAuth consent screen**
   - Configure the app (name, support email)
   - Add your Google account as a test user
   - **Important:** Click **Publish App** to move from Testing to Production mode. In Testing mode, refresh tokens expire after 7 days and you'll need to re-authenticate repeatedly.
5. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   - Application type: **Desktop app**
   - Download the JSON and save it as `mcp-google/gcp-oauth.keys.json`
   - (Or set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` env vars instead)

---

## Deployment (Railway)

The app deploys as two separate Railway services from the same GitHub repo. See [SETUP.md](SETUP.md) for the complete end-to-end guide covering Google Cloud setup, local OAuth authentication, and Railway deployment.

**Quick summary:**

| Service | Root dir | Builder |
|---|---|---|
| Flask API | `.` (root) | Dockerfile |
| MCP Server | `mcp-google/` | Dockerfile |

**Flask service env vars:**
```
ACCESS_PASSWORD=...          # Password for the web UI login screen
OPENAI_API_KEY=sk-...
MCP_URL=http://<mcp-service-url>/mcp/calendar
MCP_CALENDAR_EMAIL=you@gmail.com
MCP_USER_ID=user123
```

**MCP service env vars:**
```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALENDAR_TOKENS=...   # Single-line JSON from: node format-tokens-for-railway.js
```

### Renewing OAuth tokens

The MCP server automatically refreshes the short-lived `access_token` (1 hour) using the long-lived `refresh_token` on every API call. You should only need to manually re-authenticate if the refresh token becomes invalid.

To re-authenticate:

```bash
cd mcp-google
npm run auth
node format-tokens-for-railway.js
# Paste the output into GOOGLE_CALENDAR_TOKENS in Railway → MCP service → Variables
# Redeploy the MCP service
```

---

## Environment Variables Reference

**Flask API service:**

| Variable | Required | Description |
|---|---|---|
| `ACCESS_PASSWORD` | Yes | Password for the web UI |
| `OPENAI_API_KEY` | Yes | OpenAI API key |
| `MCP_URL` | Yes | Full URL to the MCP server `/mcp/calendar` endpoint |
| `MCP_CALENDAR_EMAIL` | Yes | Your Google account email |
| `MCP_USER_ID` | No | Arbitrary user ID sent in MCP requests (default: `user123`) |

**MCP server service:**

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret |
| `GOOGLE_CALENDAR_TOKENS` | Yes | Full tokens JSON (from `format-tokens-for-railway.js`) |

---

## Troubleshooting

**MCP server won't start / `Cannot find package` error**
→ Run `npm install` inside `mcp-google/`. Make sure you're on Node v20 LTS (`nvm use 20`).

**`invalid_grant` / authentication errors**
→ Your refresh token has expired or been revoked. Re-authenticate:
```bash
cd mcp-google && npm run auth && node format-tokens-for-railway.js
```
Then update `GOOGLE_CALENDAR_TOKENS` in Railway and redeploy. Prevent this in future by publishing your OAuth app (see [Setting up Google OAuth](#setting-up-google-oauth)).

**Calendar not found / wrong calendar**
→ Verify `MCP_CALENDAR_EMAIL` matches the Google account you authenticated with.

**MCP server reachable but returns errors**
→ Check the MCP service logs in Railway. Verify `GOOGLE_CALENDAR_TOKENS` is set and valid.

---

## License

- [mcp-google](https://github.com/199-mcp/mcp-google) (MIT) — Google Workspace MCP server, modified with HTTP server wrapper
- [AgentSquad](https://github.com/aws-samples/agent-squad) — Agent orchestration framework
