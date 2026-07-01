from flask import Blueprint

config_bp = Blueprint('admin_config', __name__)

from . import routes
