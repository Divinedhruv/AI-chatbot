from flask import Blueprint, request, jsonify, session
from db import get_db_connection, is_admin

security_bp = Blueprint('security', __name__, url_prefix='/api/security')

@security_bp.route('/settings', methods=['GET'])
def get_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('rate_limit_rpm', 'mfa_policy')")
            settings = cursor.fetchall()
            settings_dict = {row['setting_key']: row['setting_value'] for row in settings}
        conn.close()
        return jsonify(settings_dict), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@security_bp.route('/settings', methods=['POST'])
def update_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}
    rate_limit = data.get('rate_limit_rpm')
    mfa_policy = data.get('mfa_policy')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            if rate_limit is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('rate_limit_rpm', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(rate_limit), str(rate_limit))
                )
            if mfa_policy is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('mfa_policy', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(mfa_policy), str(mfa_policy))
                )
        conn.close()
        
        # Log the audit event for policy change
        from db import log_audit_event
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        details = f"Updated settings: rate_limit_rpm={rate_limit}, mfa_policy={mfa_policy}"
        log_audit_event('security_policy_change', session.get('admin_user_id'), ip, details)
        
        return jsonify({'message': 'Security settings updated successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@security_bp.route('/audit_logs', methods=['GET'])
def get_audit_logs():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT a.id, a.event_type, a.user_id, u.username, a.ip_address, a.details, a.created_at 
                FROM audit_logs a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.created_at DESC
                LIMIT 100
            """)
            logs = cursor.fetchall()
            for log in logs:
                log['created_at'] = log['created_at'].isoformat()
        conn.close()
        return jsonify(logs), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
