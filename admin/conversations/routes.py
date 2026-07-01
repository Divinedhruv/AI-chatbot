from flask import jsonify, request
from admin.conversations import conversations_bp
from db import get_db_connection, is_admin

@conversations_bp.route('/api/conversations', methods=['GET'])
def admin_get_conversations():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
        
    search = request.args.get('search', '').strip()
    user_id = request.args.get('user_id', '')
    flagged_only = request.args.get('flagged_only', '0') == '1'
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            query_str = """
                SELECT sh.id, sh.user_id, u.username, u.email, sh.query, sh.response, 
                       sh.credits_used, sh.is_flagged, sh.flag_reason, sh.created_at
                FROM search_history sh
                JOIN users u ON sh.user_id = u.id
                WHERE 1=1
            """
            params = []
            
            if search:
                query_str += " AND (sh.query LIKE %s OR sh.response LIKE %s OR u.username LIKE %s)"
                like_search = f"%{search}%"
                params.extend([like_search, like_search, like_search])
                
            if user_id:
                query_str += " AND sh.user_id = %s"
                params.append(user_id)
                
            if flagged_only:
                query_str += " AND sh.is_flagged = 1"
                
            query_str += " ORDER BY sh.created_at DESC"
            
            cursor.execute(query_str, tuple(params))
            conversations = cursor.fetchall()
            
            for c in conversations:
                if c['created_at']:
                    c['created_at'] = c['created_at'].isoformat()
                    
        conn.close()
        return jsonify(conversations), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@conversations_bp.route('/api/conversations/<int:history_id>/dismiss-flag', methods=['POST'])
def admin_dismiss_flag(history_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute(
                "UPDATE search_history SET is_flagged = 0, flag_reason = NULL WHERE id = %s",
                (history_id,)
            )
        conn.close()
        return jsonify({'message': 'Flag dismissed successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@conversations_bp.route('/api/conversations/<int:history_id>', methods=['DELETE'])
def admin_delete_conversation(history_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM search_history WHERE id = %s", (history_id,))
        conn.close()
        return jsonify({'message': 'Conversation deleted successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
