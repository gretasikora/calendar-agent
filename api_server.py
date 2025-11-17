"""
Flask API server for the calendar agent frontend.
Provides HTTP endpoints for the web interface.
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import asyncio
from scheduling import check_busy, create_calendar_event
import os
from dotenv import load_dotenv
import secrets
from functools import wraps
import hashlib

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

# Simple token storage (in production, use Redis or database)
# For this simple implementation, we'll use a single token
AUTH_TOKEN = os.getenv('AUTH_TOKEN') or secrets.token_urlsafe(32)

# Get access password from environment variable
# Priority: .env file > environment variable > default 'changeme'
ACCESS_PASSWORD = os.getenv('ACCESS_PASSWORD')
if not ACCESS_PASSWORD:
    ACCESS_PASSWORD = 'changeme'
    print("WARNING: ACCESS_PASSWORD not set in .env file, using default 'changeme'")
else:
    print(f"ACCESS_PASSWORD loaded from .env file (length: {len(ACCESS_PASSWORD)})")

# Store active sessions (in production, use Redis or database)
active_tokens = set()

def require_auth(f):
    """Decorator to require authentication for API endpoints."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({'error': 'Authentication required'}), 401
        
        try:
            token = auth_header.split(' ')[1]  # Extract token from "Bearer <token>"
            if token not in active_tokens:
                return jsonify({'error': 'Invalid or expired token'}), 401
        except (IndexError, AttributeError):
            return jsonify({'error': 'Invalid authorization header'}), 401
        
        return f(*args, **kwargs)
    return decorated_function

@app.route('/api/login', methods=['POST'])
def login():
    """
    Login endpoint. Validates password and returns auth token.
    """
    try:
        data = request.json
        password = data.get('password', '')
        
        # Simple password check (in production, use proper password hashing)
        if password == ACCESS_PASSWORD:
            # Generate a session token
            token = secrets.token_urlsafe(32)
            active_tokens.add(token)
            
            return jsonify({
                'token': token,
                'message': 'Login successful'
            }), 200
        else:
            return jsonify({'error': 'Incorrect password'}), 401
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/check-availability', methods=['POST'])
@require_auth
def check_availability():
    """
    Endpoint to check calendar availability.
    Accepts a query and optional conversation history.
    """
    try:
        data = request.json
        query = data.get('query', '')
        conversation_history = data.get('conversation_history', [])
        meeting_type = data.get('meeting_type')  # "online" or "in-person"
        meeting_description = data.get('meeting_description')  # Purpose/description
        duration_minutes = data.get('duration_minutes')  # Duration in minutes
        rejected_times = data.get('rejected_times', [])  # Times that have been rejected
        skip_llm_formatting = data.get('skip_llm_formatting', False)  # Skip LLM when fetching more suggestions
        
        if not query:
            return jsonify({'error': 'Query is required'}), 400
        
        # Run the async check_busy function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            response = loop.run_until_complete(
                check_busy(
                    query, 
                    conversation_history,
                    meeting_type=meeting_type,
                    meeting_description=meeting_description,
                    duration_minutes=duration_minutes,
                    rejected_times=rejected_times,
                    skip_llm_formatting=skip_llm_formatting
                )
            )
        finally:
            loop.close()
        
        # Handle both string (old format) and dict (new format) responses
        if isinstance(response, dict):
            return jsonify({
                'response': response.get('response', ''),
                'suggested_time': response.get('suggested_time'),
                'suggested_times': response.get('suggested_times', []),  # Return all suggestions
                'suggested_location': response.get('suggested_location'),
                'status': 'success'
            })
        else:
            # Legacy string format
            return jsonify({
                'response': response,
                'status': 'success'
            })
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in check_availability: {e}")
        print(f"Traceback:\n{error_trace}")
        return jsonify({
            'error': str(e),
            'status': 'error',
            'details': error_trace if os.getenv('FLASK_DEBUG') == 'True' else None
        }), 500

@app.route('/api/create-event', methods=['POST'])
@require_auth
def create_event():
    """
    Endpoint to create a calendar event.
    Accepts meeting details and creates the event via MCP.
    """
    try:
        data = request.json
        start_iso = data.get('start_iso')
        end_iso = data.get('end_iso')
        meeting_type = data.get('meeting_type')  # "online" or "in-person"
        location = data.get('location')  # For in-person meetings
        attendee_email = data.get('attendee_email')  # For online meetings
        meeting_description = data.get('meeting_description')  # Purpose/reason for the meeting
        
        if not start_iso or not end_iso:
            return jsonify({'error': 'start_iso and end_iso are required'}), 400
        
        # Run the async create_event function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            response = loop.run_until_complete(
                create_calendar_event(
                    start_iso=start_iso,
                    end_iso=end_iso,
                    meeting_type=meeting_type,
                    location=location,
                    attendee_email=attendee_email,
                    meeting_description=meeting_description
                )
            )
        finally:
            loop.close()
        
        return jsonify({
            'status': 'success',
            'event_id': response.get('event_id'),
            'html_link': response.get('html_link'),
            'meet_link': response.get('meet_link'),
            'message': response.get('message', 'Event created successfully')
        })
    
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in create_event: {e}")
        print(f"Traceback:\n{error_trace}")
        return jsonify({
            'error': str(e),
            'status': 'error',
            'details': error_trace if os.getenv('FLASK_DEBUG') == 'True' else None
        }), 500

@app.route('/api/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok'})

# Serve frontend static files (for deployment)
@app.route('/')
def index():
    """Serve the main frontend page."""
    from flask import send_from_directory
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    """Serve static files from frontend directory."""
    from flask import send_from_directory
    import os
    # Only serve files that exist in frontend directory
    if os.path.exists(os.path.join('frontend', path)):
        return send_from_directory('frontend', path)
    else:
        # Fallback to index.html for client-side routing
        return send_from_directory('frontend', 'index.html')

if __name__ == '__main__':
    port = int(os.getenv('API_PORT', 5000))
    print(f"Starting API server on http://localhost:{port}")
    print(f"Frontend should be served from the 'frontend' directory")
    print(f"Access password loaded from .env file")
    print(f"Password length: {len(ACCESS_PASSWORD)} characters")
    print(f"To change the password, update ACCESS_PASSWORD in your .env file")
    app.run(host='0.0.0.0', port=port, debug=True)

