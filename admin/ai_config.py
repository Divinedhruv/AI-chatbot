import json
from flask import Blueprint, request, jsonify, session
from db import get_db_connection, is_admin, log_audit_event

ai_config_bp = Blueprint('ai_config', __name__, url_prefix='/api/ai')

@ai_config_bp.route('/settings', methods=['GET'])
def get_ai_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('available_models', 'system_prompt', 'max_tokens')")
            settings = cursor.fetchall()
            settings_dict = {row['setting_key']: row['setting_value'] for row in settings}
            
            # Parse available_models if it exists
            if 'available_models' in settings_dict:
                try:
                    settings_dict['available_models'] = json.loads(settings_dict['available_models'])
                except Exception:
                    settings_dict['available_models'] = []
                    
        conn.close()
        return jsonify(settings_dict), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@ai_config_bp.route('/settings', methods=['POST'])
def update_ai_settings():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json() or {}
    available_models = data.get('available_models')
    system_prompt = data.get('system_prompt')
    max_tokens = data.get('max_tokens')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            if available_models is not None:
                models_json = json.dumps(available_models)
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('available_models', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (models_json, models_json)
                )
            if system_prompt is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('system_prompt', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(system_prompt), str(system_prompt))
                )
            if max_tokens is not None:
                cursor.execute(
                    "INSERT INTO system_settings (setting_key, setting_value) VALUES ('max_tokens', %s) ON DUPLICATE KEY UPDATE setting_value = %s",
                    (str(max_tokens), str(max_tokens))
                )
        conn.close()
        
        # Log the audit event
        ip = request.headers.get('X-Forwarded-For', request.remote_addr)
        details = f"AI settings updated: models={available_models}, prompt='{str(system_prompt)[:30]}...', tokens={max_tokens}"
        log_audit_event('ai_config_change', session.get('admin_user_id'), ip, details)
        
        return jsonify({'message': 'AI settings updated successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
