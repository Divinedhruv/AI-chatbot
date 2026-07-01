import os
from flask import Blueprint, jsonify
from db import is_admin

logs_bp = Blueprint('logs', __name__, url_prefix='/api/logs')

@logs_bp.route('/read', methods=['GET'])
def read_logs():
    if not is_admin():
        return jsonify({'error': 'Unauthorized'}), 403

    log_file = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app.log')
    
    if not os.path.exists(log_file):
        return jsonify({'logs': ['No logs found yet.']}), 200

    try:
        # Read the last 200 lines
        with open(log_file, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            # Get the last 200 lines
            lines = lines[-200:]
            return jsonify({'logs': [line.strip() for line in lines]}), 200
    except Exception as e:
        return jsonify({'error': f'Failed to read logs: {str(e)}'}), 500
