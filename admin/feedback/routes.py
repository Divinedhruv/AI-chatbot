from flask import jsonify, request
from admin.feedback import feedback_bp
from db import get_db_connection, is_admin


@feedback_bp.route('/api/feedback/stats', methods=['GET'])
def admin_feedback_stats():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            # Response feedback stats
            cursor.execute("SELECT COUNT(*) as total FROM response_feedback")
            total_ratings = cursor.fetchone()['total']

            cursor.execute("SELECT COUNT(*) as cnt FROM response_feedback WHERE rating = 'up'")
            thumbs_up = cursor.fetchone()['cnt']

            cursor.execute("SELECT COUNT(*) as cnt FROM response_feedback WHERE rating = 'down'")
            thumbs_down = cursor.fetchone()['cnt']

            satisfaction_pct = round((thumbs_up / total_ratings * 100), 1) if total_ratings > 0 else 0

            # General feedback stats
            cursor.execute("SELECT COUNT(*) as cnt FROM general_feedback WHERE status = 'new'")
            pending_feedback = cursor.fetchone()['cnt']

            cursor.execute("SELECT COUNT(*) as total FROM general_feedback")
            total_general = cursor.fetchone()['total']

            cursor.execute("""
                SELECT category, COUNT(*) as cnt 
                FROM general_feedback 
                GROUP BY category 
                ORDER BY cnt DESC
            """)
            by_category = cursor.fetchall()

        conn.close()

        return jsonify({
            'thumbs_up': thumbs_up,
            'thumbs_down': thumbs_down,
            'total_ratings': total_ratings,
            'satisfaction_pct': satisfaction_pct,
            'pending_feedback': pending_feedback,
            'total_general': total_general,
            'by_category': by_category
        }), 200

    except Exception as e:
        return jsonify({'error': f'Feedback stats fetch failed: {str(e)}'}), 500


@feedback_bp.route('/api/feedback/responses', methods=['GET'])
def admin_feedback_responses():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403

    filter_val = request.args.get('filter', 'all')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            query = """
                SELECT rf.id, rf.rating, rf.comment, rf.created_at,
                       u.username, sh.query as search_query
                FROM response_feedback rf
                JOIN users u ON rf.user_id = u.id
                JOIN search_history sh ON rf.search_history_id = sh.id
            """
            if filter_val == 'up':
                query += " WHERE rf.rating = 'up'"
            elif filter_val == 'down':
                query += " WHERE rf.rating = 'down'"

            query += " ORDER BY rf.created_at DESC LIMIT 100"

            cursor.execute(query)
            results = cursor.fetchall()

            for row in results:
                if row['created_at']:
                    row['created_at'] = row['created_at'].isoformat()
                if row['search_query'] and len(row['search_query']) > 60:
                    row['search_query'] = row['search_query'][:57] + '...'

        conn.close()
        return jsonify(results), 200

    except Exception as e:
        return jsonify({'error': f'Response feedback fetch failed: {str(e)}'}), 500


@feedback_bp.route('/api/feedback/general', methods=['GET'])
def admin_feedback_general():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403

    status_filter = request.args.get('status', 'all')

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            query = """
                SELECT gf.id, gf.category, gf.message, gf.status, gf.admin_notes, gf.created_at,
                       u.username, u.email
                FROM general_feedback gf
                JOIN users u ON gf.user_id = u.id
            """
            if status_filter in ('new', 'reviewed', 'resolved'):
                query += f" WHERE gf.status = '{status_filter}'"

            query += " ORDER BY gf.created_at DESC LIMIT 100"

            cursor.execute(query)
            results = cursor.fetchall()

            for row in results:
                if row['created_at']:
                    row['created_at'] = row['created_at'].isoformat()

        conn.close()
        return jsonify(results), 200

    except Exception as e:
        return jsonify({'error': f'General feedback fetch failed: {str(e)}'}), 500


@feedback_bp.route('/api/feedback/general/<int:feedback_id>', methods=['PUT'])
def admin_update_feedback(feedback_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403

    data = request.get_json() or {}
    new_status = data.get('status', '').strip()
    admin_notes = data.get('admin_notes', '').strip()

    if new_status and new_status not in ('new', 'reviewed', 'resolved'):
        return jsonify({'error': 'Invalid status value.'}), 400

    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            updates = []
            params = []
            if new_status:
                updates.append("status = %s")
                params.append(new_status)
            if admin_notes is not None:
                updates.append("admin_notes = %s")
                params.append(admin_notes if admin_notes else None)

            if not updates:
                return jsonify({'error': 'No fields to update.'}), 400

            params.append(feedback_id)
            cursor.execute(
                f"UPDATE general_feedback SET {', '.join(updates)} WHERE id = %s",
                params
            )
        conn.close()

        return jsonify({'message': 'Feedback updated successfully.'}), 200

    except Exception as e:
        return jsonify({'error': f'Feedback update failed: {str(e)}'}), 500
