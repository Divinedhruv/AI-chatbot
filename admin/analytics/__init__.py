from flask import Blueprint

analytics_bp = Blueprint('admin_analytics', __name__)

from . import routes
