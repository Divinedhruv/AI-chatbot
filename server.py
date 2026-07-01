from flask import Flask, request, jsonify, session, send_from_directory
import os
import re
import logging

# Configure basic logging for the Flask app
logging.basicConfig(
    filename='app.log',
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Import shared database utilities from db.py
from db import get_db_connection, init_db, is_admin, log_audit_event

# Import the admin blueprint (which registers all child blueprints)
from admin import admin_bp

app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = 'ai-search-super-secret-key-12345'

# Register the admin blueprint on the main app (all admin routes under /admin)
app.register_blueprint(admin_bp, url_prefix='/admin')

@app.before_request
def check_maintenance_mode():
    # Allow admin, auth endpoints, and static files
    if request.path.startswith('/admin') or request.path in ['/api/login', '/api/me', '/api/register'] or '.' in request.path:
        return None
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT setting_value FROM system_settings WHERE setting_key = 'maintenance_mode'")
            row = cursor.fetchone()
            if row and row['setting_value'] == 'true':
                return jsonify({'error': 'System is under maintenance. Please try again later.'}), 503
        conn.close()
    except Exception:
        pass
    return None

# Serve Frontend Root
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# Authentication Endpoint: Register
@app.route('/api/register', methods=['POST'])
def register():
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')

    if not username or not email or not password:
        return jsonify({'error': 'All fields are required.'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Check if user already exists
            cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", (username, email))
            if cursor.fetchone():
                return jsonify({'error': 'Username or Email is already registered.'}), 400

            # Insert new user (credentials stored in database)
            cursor.execute(
                "INSERT INTO users (username, email, password) VALUES (%s, %s, %s)",
                (username, email, password)
            )
        conn.close()
        return jsonify({'message': 'Registration successful! Please log in.'}), 201
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Authentication Endpoint: Login
@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    user_or_email = data.get('usernameOrEmail', '').strip()
    password = data.get('password', '')

    if not user_or_email or not password:
        return jsonify({'error': 'All fields are required.'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, username, email, password, role, status FROM users WHERE username = %s OR email = %s",
                (user_or_email, user_or_email)
            )
            user = cursor.fetchone()
            
            ip = request.headers.get('X-Forwarded-For', request.remote_addr)

            if user and user['password'] == password:
                # Check status
                if user.get('status', 'active') != 'active':
                    return jsonify({'error': 'Your account has been deactivated. Please contact admin.'}), 403
                
                session['user_id'] = user['id']
                session['username'] = user['username']
                session['email'] = user['email']
                session['role'] = user.get('role', 'user')
                
                log_audit_event('login_success', user['id'], ip, "User logged in successfully")
                
                # Check for rememberMe and set session lifetime if needed
                remember_me = data.get('rememberMe', False)
                if remember_me:
                    session.permanent = True
                else:
                    session.permanent = False
                
                return jsonify({
                    'message': 'Login successful!',
                    'user': {
                        'username': user['username'],
                        'email': user['email'],
                        'role': user.get('role', 'user')
                    }
                }), 200
            else:
                user_id_to_log = user['id'] if user else None
                log_audit_event('login_failed', user_id_to_log, ip, f"Failed login attempt for {user_or_email}")
                return jsonify({'error': 'Invalid username/email or password.'}), 401
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Authentication Endpoint: Logout
@app.route('/api/logout', methods=['POST'])
def logout():
    session.pop('user_id', None)
    session.pop('username', None)
    session.pop('email', None)
    session.pop('role', None)
    return jsonify({'message': 'Logged out successfully.'}), 200

# Authentication Endpoint: Get Session User
@app.route('/api/me', methods=['GET'])
def get_me():
    if 'user_id' in session:
        try:
            conn = get_db_connection()
            with conn.cursor() as cursor:
                # Update last active timestamp
                cursor.execute("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = %s", (session['user_id'],))
                # Fetch up-to-date credits, email, role, status
                cursor.execute("SELECT email, credits, role, status FROM users WHERE id = %s", (session['user_id'],))
                user_info = cursor.fetchone()
                if user_info:
                    if user_info.get('status', 'active') != 'active':
                        session.pop('user_id', None)
                        session.pop('username', None)
                        session.pop('email', None)
                        session.pop('role', None)
                        return jsonify({'error': 'Your account has been deactivated.'}), 403
                    return jsonify({
                        'username': session['username'],
                        'email': user_info['email'],
                        'credits': user_info['credits'],
                        'role': user_info.get('role', 'user')
                    }), 200
            conn.close()
        except Exception:
            pass
        return jsonify({
            'username': session['username'],
            'email': session['email'],
            'credits': 100,
            'role': session.get('role', 'user')
        }), 200
    return jsonify({'error': 'Not authenticated.'}), 401

# Search History Endpoint: Get history
@app.route('/api/history', methods=['GET'])
def get_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT id, query, response, created_at FROM search_history WHERE user_id = %s ORDER BY created_at DESC",
                (session['user_id'],)
            )
            history = cursor.fetchall()
            
            # Format timestamps
            for item in history:
                item['created_at'] = item['created_at'].isoformat()
        conn.close()
        return jsonify(history), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

def check_moderation(text):
    """
    Check if text contains offensive/flagged keywords.
    Returns (is_flagged, reason)
    """
    flagged_patterns = {
        'violence_or_harm': r'\b(kill|murder|bomb|suicide|attack|weapon|shoot|stab|deadly)\b',
        'hate_speech_or_abuse': r'\b(hate|abuse|harass|insult|offensive|curse|slur)\b',
        'illicit_substances': r'\b(heroin|cocaine|meth|illegal drugs|fentanyl|smuggle)\b',
        'security_threats': r'\b(hack|exploit|bypass|malware|ransomware|trojan|cyberattack|ddos)\b',
    }
    
    for category, pattern in flagged_patterns.items():
        if re.search(pattern, text, re.IGNORECASE):
            reason = category.replace('_', ' ').title()
            return True, reason
            
    return False, None

# Search History Endpoint: Save history item
@app.route('/api/history', methods=['POST'])
def save_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    data = request.get_json() or {}
    query = data.get('query', '').strip()
    response = data.get('response', '').strip()

    if not query or not response:
        return jsonify({'error': 'Query and response content are required.'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Fetch user credits
            cursor.execute("SELECT credits FROM users WHERE id = %s", (session['user_id'],))
            user = cursor.fetchone()
            if not user:
                return jsonify({'error': 'User not found.'}), 404
            
            credits = user['credits']
            cost = 5
            
            if credits < cost:
                return jsonify({'error': 'Insufficient credits. Each search costs 5 credits.'}), 400
            
            # Deduct credits
            new_credits = credits - cost
            cursor.execute(
                "UPDATE users SET credits = %s, last_active = CURRENT_TIMESTAMP WHERE id = %s",
                (new_credits, session['user_id'])
            )
            
            # Save search history with moderation
            is_flagged, flag_reason = check_moderation(query)
            cursor.execute(
                "INSERT INTO search_history (user_id, query, response, credits_used, is_flagged, flag_reason) VALUES (%s, %s, %s, %s, %s, %s)",
                (session['user_id'], query, response, cost, 1 if is_flagged else 0, flag_reason)
            )
        conn.close()
        return jsonify({'message': 'History item saved successfully.', 'credits': new_credits}), 201
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Search History Endpoint: Clear history
@app.route('/api/history/clear', methods=['POST'])
def clear_history():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM search_history WHERE user_id = %s", (session['user_id'],))
        conn.close()
        return jsonify({'message': 'Search history cleared successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Feedback Endpoint: Submit thumbs up/down on an AI response
@app.route('/api/feedback/response', methods=['POST'])
def submit_response_feedback():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    data = request.get_json() or {}
    history_id = data.get('history_id')
    rating = data.get('rating', '').strip().lower()
    comment = data.get('comment', '').strip()

    if not history_id or rating not in ('up', 'down'):
        return jsonify({'error': 'Valid history_id and rating (up/down) are required.'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Verify the search_history item exists and belongs to this user
            cursor.execute("SELECT id FROM search_history WHERE id = %s AND user_id = %s", (history_id, session['user_id']))
            if not cursor.fetchone():
                return jsonify({'error': 'Search history item not found.'}), 404

            # Use REPLACE to allow changing a previous rating
            cursor.execute(
                "REPLACE INTO response_feedback (user_id, search_history_id, rating, comment) VALUES (%s, %s, %s, %s)",
                (session['user_id'], history_id, rating, comment if comment else None)
            )
        conn.close()
        return jsonify({'message': f'Feedback recorded: {rating}', 'rating': rating}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Feedback Endpoint: Submit general interface feedback
@app.route('/api/feedback/general', methods=['POST'])
def submit_general_feedback():
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    data = request.get_json() or {}
    category = data.get('category', 'general').strip().lower()
    message = data.get('message', '').strip()

    if not message:
        return jsonify({'error': 'Feedback message is required.'}), 400

    if category not in ('bug', 'feature', 'general', 'complaint'):
        category = 'general'

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Rate limit: max 5 submissions per user per day
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM general_feedback WHERE user_id = %s AND DATE(created_at) = CURDATE()",
                (session['user_id'],)
            )
            count = cursor.fetchone()['cnt']
            if count >= 5:
                return jsonify({'error': 'Daily feedback limit reached (5 per day). Please try again tomorrow.'}), 429

            cursor.execute(
                "INSERT INTO general_feedback (user_id, category, message) VALUES (%s, %s, %s)",
                (session['user_id'], category, message)
            )
        conn.close()
        return jsonify({'message': 'Thank you! Your feedback has been submitted.'}), 201
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# Feedback Endpoint: Get user's own rating for a specific history item
@app.route('/api/feedback/response/<int:history_id>', methods=['GET'])
def get_response_feedback(history_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Authentication required.'}), 401

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "SELECT rating FROM response_feedback WHERE user_id = %s AND search_history_id = %s",
                (session['user_id'], history_id)
            )
            row = cursor.fetchone()
        conn.close()
        return jsonify({'rating': row['rating'] if row else None}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

if __name__ == '__main__':
    init_db()
    # Run on port 8000
    app.run(host='0.0.0.0', port=8000, debug=False)
