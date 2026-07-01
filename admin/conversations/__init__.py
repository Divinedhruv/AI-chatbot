from flask import Blueprint

conversations_bp = Blueprint('admin_conversations', __name__)

from . import routes
