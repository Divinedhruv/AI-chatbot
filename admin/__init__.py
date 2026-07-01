from flask import Blueprint, render_template, request, jsonify, session
from admin.analytics import analytics_bp
from admin.users import users_bp
from admin.conversations import conversations_bp
from admin.config import config_bp
from admin.feedback import feedback_bp
from admin.security import security_bp
from admin.system import system_bp
from admin.logs import logs_bp
from admin.ai_config import ai_config_bp
from db import get_db_connection, log_audit_event

# Define main parent Blueprint for admin
admin_bp = Blueprint(
    'admin', 
    __name__, 
    template_folder='templates', 
    static_folder='static', 
    static_url_path='/static'
)

# Register child blueprints
admin_bp.register_blueprint(analytics_bp)
admin_bp.register_blueprint(users_bp)
admin_bp.register_blueprint(conversations_bp)
admin_bp.register_blueprint(config_bp)
admin_bp.register_blueprint(feedback_bp)
admin_bp.register_blueprint(security_bp)
admin_bp.register_blueprint(system_bp)
admin_bp.register_blueprint(logs_bp)
admin_bp.register_blueprint(ai_config_bp)

# Expose main administrative HTML route (served at /admin via url_prefix)
@admin_bp.route('/')
def admin_page():
    return render_template('admin.html')

# ==========================================================================
# Admin-Specific Authentication Endpoints
# ==========================================================================

# POST /admin/api/login — Admin login (verifies role=admin)
@admin_bp.route('/api/login', methods=['POST'])
def admin_login():
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
        conn.close()

        ip = request.headers.get('X-Forwarded-For', request.remote_addr)

        if not user or user['password'] != password:
            user_id_to_log = user['id'] if user else None
            log_audit_event('admin_login_failed', user_id_to_log, ip, f"Failed login attempt for {user_or_email}")
            return jsonify({'error': 'Invalid username/email or password.'}), 401

        # Must be admin role
        if user.get('role', 'user') != 'admin':
            return jsonify({'error': 'Access denied. Admin privileges required.'}), 403

        # Must be active
        if user.get('status', 'active') != 'active':
            return jsonify({'error': 'Your account has been deactivated.'}), 403

        # Set session
        session['admin_user_id'] = user['id']
        session['admin_username'] = user['username']
        session['admin_email'] = user['email']
        session['admin_role'] = user['role']

        log_audit_event('admin_login_success', user['id'], ip, "Admin logged in successfully")

        return jsonify({
            'message': 'Admin login successful!',
            'user': {
                'username': user['username'],
                'email': user['email'],
                'role': user['role']
            }
        }), 200

    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

# GET /admin/api/me — Admin session check
@admin_bp.route('/api/me', methods=['GET'])
def admin_me():
    if 'admin_user_id' not in session:
        return jsonify({'error': 'Not authenticated.'}), 401

    # Verify still admin and active
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = %s", (session['admin_user_id'],))
            cursor.execute("SELECT email, credits, role, status FROM users WHERE id = %s", (session['admin_user_id'],))
            user_info = cursor.fetchone()
        conn.close()

        if not user_info:
            session.pop('admin_user_id', None)
            session.pop('admin_username', None)
            session.pop('admin_email', None)
            session.pop('admin_role', None)
            return jsonify({'error': 'User not found.'}), 401

        if user_info.get('role', 'user') != 'admin':
            return jsonify({'error': 'Access denied. Admin privileges required.'}), 403

        if user_info.get('status', 'active') != 'active':
            session.pop('admin_user_id', None)
            session.pop('admin_username', None)
            session.pop('admin_email', None)
            session.pop('admin_role', None)
            return jsonify({'error': 'Your account has been deactivated.'}), 403

        return jsonify({
            'username': session['admin_username'],
            'email': user_info['email'],
            'credits': user_info['credits'],
            'role': user_info['role']
        }), 200

    except Exception:
        return jsonify({
            'username': session.get('admin_username', 'Admin'),
            'email': session.get('admin_email', ''),
            'credits': 0,
            'role': session.get('admin_role', 'admin')
        }), 200

# POST /admin/api/logout — Admin logout
@admin_bp.route('/api/logout', methods=['POST'])
def admin_logout():
    session.pop('admin_user_id', None)
    session.pop('admin_username', None)
    session.pop('admin_email', None)
    session.pop('admin_role', None)
    return jsonify({'message': 'Logged out successfully.'}), 200
