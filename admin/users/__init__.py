from flask import Blueprint

users_bp = Blueprint('admin_users', __name__)

from . import routes
