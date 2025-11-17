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

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend

@app.route('/api/check-availability', methods=['POST'])
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

if __name__ == '__main__':
    port = int(os.getenv('API_PORT', 5000))
    print(f"Starting API server on http://localhost:{port}")
    print(f"Frontend should be served from the 'frontend' directory")
    app.run(host='0.0.0.0', port=port, debug=True)

