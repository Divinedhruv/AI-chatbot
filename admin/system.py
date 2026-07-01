import os
import shutil
from flask import Blueprint, request, jsonify, session
from db import get_db_connection, is_admin, log_audit_event

system_bp = Blueprint('system', __name__, url_prefix='/api/system')

@system_bp.route('/settings', methods=['GET'])
def get_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('maintenance_mode', 'backup_frequency', 'backup_retention')")
            settings = cursor.fetchall()
            settings_dict = {row['setting_key']: row['setting_value'] for row in settings}
        conn.close()
        return jsonify(settings_dict), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@system_bp.route('/settings', methods=['POST'])
def update_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}
    maintenance_mode = data.get('maintenance_mode')
    backup_frequency = data.get('backup_frequency')
    backup_retention = data.get('backup_retention')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            if maintenance_mode is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('maintenance_mode', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(maintenance_mode), str(maintenance_mode))
                )
            if backup_frequency is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('backup_frequency', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(backup_frequency), str(backup_frequency))
                )
            if backup_retention is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('backup_retention', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(backup_retention), str(backup_retention))
                )
        conn.close()
        
        # Log the audit event
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        details = f"System settings updated: maintenance_mode={maintenance_mode}, backup_frequency={backup_frequency}, backup_retention={backup_retention}"
        log_audit_event('system_settings_change', session.get('admin_user_id'), ip, details)
        
        return jsonify({'message': 'System settings updated successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@system_bp.route('/clear_cache', methods=['POST'])
def clear_cache():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        # Simulate clearing cache by removing __pycache__ directories in the project
        root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        for root, dirs, files in os.walk(root_dir):
            if '__pycache__' in dirs:
                cache_dir = os.path.join(root, '__pycache__')
                try:
                    shutil.rmtree(cache_dir)
                except Exception as e:
                    print(f"Error removing {cache_dir}: {e}")
                    
        # Log the audit event
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        log_audit_event('system_cache_cleared', session.get('admin_user_id'), ip, "Cleared temporary cache files (__pycache__)")

        return jsonify({'message': 'Temporary cache files cleared successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to clear cache: {str(e)}'}), 500
