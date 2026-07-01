from flask import jsonify, request, session
from admin.users import users_bp
from db import get_db_connection, is_admin

@users_bp.route('/api/users', methods=['GET'])
def admin_get_users():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id, username, email, role, status, credits, created_at, last_active FROM users ORDER BY id DESC")
            users = cursor.fetchall()
            for u in users:
                if u['created_at']:
                    u['created_at'] = u['created_at'].isoformat()
                if u['last_active']:
                    u['last_active'] = u['last_active'].isoformat()
        conn.close()
        return jsonify(users), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@users_bp.route('/api/users', methods=['POST'])
def admin_create_user():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    password = data.get('password', '')
    role = data.get('role', 'user')
    status = data.get('status', 'active')
    credits = data.get('credits', 100)
    
    if not username or not email or not password:
        return jsonify({'error': 'Username, email, and password are required.'}), 400
    
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE username = %s OR email = %s", (username, email))
            if cursor.fetchone():
                return jsonify({'error': 'Username or Email already registered.'}), 400
            
            cursor.execute(
                "INSERT INTO users (username, email, password, role, status, credits) VALUES (%s, %s, %s, %s, %s, %s)",
                (username, email, password, role, status, credits)
            )
        conn.close()
        return jsonify({'message': 'User account created successfully.'}), 201
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@users_bp.route('/api/users/<int:user_id>', methods=['PUT'])
def admin_update_user(user_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    data = request.get_json() or {}
    username = data.get('username', '').strip()
    email = data.get('email', '').strip()
    role = data.get('role', 'user')
    status = data.get('status', 'active')
    credits = data.get('credits', 100)
    
    if not username or not email:
        return jsonify({'error': 'Username and email are required.'}), 400
    
    # Restrict modifying own active status or admin role
    if int(user_id) == int(session.get('admin_user_id', 0)):
        if status != 'active' or role != 'admin':
            return jsonify({'error': 'Cannot deactivate or change admin role on your own active session.'}), 400
            
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("SELECT id FROM users WHERE (username = %s OR email = %s) AND id != %s", (username, email, user_id))
            if cursor.fetchone():
                return jsonify({'error': 'Username or Email is already used by another account.'}), 400
            
            cursor.execute(
                "UPDATE users SET username = %s, email = %s, role = %s, status = %s, credits = %s WHERE id = %s",
                (username, email, role, status, credits, user_id)
            )
        conn.close()
        return jsonify({'message': 'User updated successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@users_bp.route('/api/users/<int:user_id>/reset-password', methods=['POST'])
def admin_reset_password(user_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    data = request.get_json() or {}
    password = data.get('password', '')
    
    if not password:
        return jsonify({'error': 'New password is required.'}), 400
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("UPDATE users SET password = %s WHERE id = %s", (password, user_id))
        conn.close()
        return jsonify({'message': 'User password reset successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500

@users_bp.route('/api/users/<int:user_id>', methods=['DELETE'])
def admin_delete_user(user_id):
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
        
    if int(user_id) == int(session.get('admin_user_id', 0)):
        return jsonify({'error': 'Cannot delete your own admin account.'}), 400
        
    try:
        conn = get_db_connection()
        with conn.cursor() as cursor:
            cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
        conn.close()
        return jsonify({'message': 'User deleted successfully.'}), 200
    except Exception as e:
        return jsonify({'error': f'Database error: {str(e)}'}), 500
