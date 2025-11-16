# Calendar Agent Frontend

A sleek, terminal-style web interface for the calendar booking agent.

## Features

- 🖥️ **Terminal Aesthetic**: Black background with green text (matrix-style)
- ⌨️ **Typewriter Effect**: Messages appear with a typewriter animation
- 💬 **Conversational Flow**: Guided booking process with clear steps
- 📱 **Responsive Design**: Works on desktop and mobile devices

## Setup

### 1. Install Python Dependencies

Make sure you have the Flask dependencies installed:

```bash
pip install flask flask-cors
```

### 2. Start the API Server

In the project root directory:

```bash
python api_server.py
```

The API server will start on `http://localhost:5000`

### 3. Serve the Frontend

You can serve the frontend in several ways:

**Option A: Simple HTTP Server (Python)**
```bash
cd frontend
python -m http.server 8080
```

**Option B: Live Server (VS Code Extension)**
- Install the "Live Server" extension
- Right-click on `index.html` and select "Open with Live Server"

**Option C: Any Static File Server**
- Serve the `frontend` directory with any web server
- Make sure CORS is enabled (already handled by Flask)

### 4. Open in Browser

Navigate to:
- `http://localhost:8080` (if using Python HTTP server)
- Or the URL provided by your server

## Usage Flow

1. **Greeting**: Agent greets the user and explains the process
2. **Duration Selection**: User chooses 30min, 1h, or custom duration
3. **Purpose Input**: User enters the meeting purpose
4. **Meeting Type**: User selects online or in-person
5. **Availability Check**: Agent checks calendar and responds
6. **Follow-up**: User can ask follow-up questions or start over

## Customization

### Colors

Edit `styles.css` to change the color scheme:
- Background: `#000000` (black)
- Text: `#00ff00` (green)
- Borders: `#00ff00` (green)

### Typing Speed

In `app.js`, adjust the `speed` variable in the `typewriterMessage` function:
```javascript
const speed = 30; // milliseconds per character (lower = faster)
```

### API Endpoint

If you change the API port, update the fetch URLs in `app.js`:
```javascript
const response = await fetch('http://localhost:YOUR_PORT/api/check-availability', {
    // ...
});
```

## Troubleshooting

### CORS Errors
- Make sure the Flask server is running
- Check that `flask-cors` is installed
- Verify the API URL in `app.js` matches your server

### API Connection Failed
- Ensure `api_server.py` is running
- Check that the port matches (default: 5000)
- Verify the MCP server is running (required for availability checks)

### Typewriter Effect Not Working
- Check browser console for JavaScript errors
- Ensure all CSS animations are supported by your browser

