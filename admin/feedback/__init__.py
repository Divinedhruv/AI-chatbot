from flask import Blueprint

feedback_bp = Blueprint('admin_feedback', __name__)

from . import routes
