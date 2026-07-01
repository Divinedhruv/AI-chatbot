from flask import jsonify, request
import os
import re
import time
from admin.config import config_bp
from db import get_db_connection, is_admin

try:
    import requests as http_requests
except ImportError:
    http_requests = None

CONFIG_FILE_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'config.js')

def parse_config_js():
    """Parse config.js and extract API_KEY and optional API_URL."""
    api_key = ''
    api_url = ''
    try:
        if os.path.exists(CONFIG_FILE_PATH):
            with open(CONFIG_FILE_PATH, 'r', encoding='utf-8') as f:
                content = f.read()
            key_match = re.search(r'(?:^|\n)\s*const\s+API_KEY\s*=\s*["\']([^"\']*)["\']', content)
            url_match = re.search(r'(?:^|\n)\s*const\s+API_URL\s*=\s*["\']([^"\']*)["\']', content)
            if key_match:
                api_key = key_match.group(1)
            if url_match:
                api_url = url_match.group(1)
    except Exception:
        pass
    return api_key, api_url

def detect_provider(api_key):
    """Detect the AI provider from the API key prefix."""
    if not api_key or api_key == 'your-api-key-here':
        return 'none'
    if api_key.startswith('gsk_'):
        return 'groq'
    elif api_key.startswith('sk-'):
        return 'openai'
    elif api_key.startswith('AIzaSy'):
        return 'gemini'
    return 'unknown'

def mask_key(api_key):
    """Mask the API key for display, showing only first 8 and last 4 chars."""
    if not api_key or len(api_key) < 16:
        return api_key or ''
    return api_key[:8] + '...' + api_key[-4:]

@config_bp.route('/api/config', methods=['GET'])
def admin_get_api_config():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    api_key, api_url = parse_config_js()
    provider = detect_provider(api_key)
    
    return jsonify({
        'provider': provider,
        'key_masked': mask_key(api_key),
        'key_prefix': api_key[:8] if len(api_key) >= 8 else api_key,
        'has_custom_url': bool(api_url),
        'api_url': api_url
    }), 200

@config_bp.route('/api/config', methods=['POST'])
def admin_update_api_config():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    data = request.get_json() or {}
    api_key = data.get('api_key', '').strip()
    api_url = data.get('api_url', '').strip()
    
    if not api_key:
        return jsonify({'error': 'API key is required.'}), 400
    
    try:
        lines = [
            '// AI API Configuration',
            '// Replace with your actual API key (OpenAI, Groq, or Gemini)',
            f'const API_KEY = "{api_key}";',
            '',
            '// NOTE: The API URL is managed automatically based on the API key provided above.',
            '// (e.g. OpenAI keys use OpenAI endpoint, Groq keys use Groq endpoint, etc.)',
            '//',
            '// If you want to use a custom local model or custom endpoint (like Ollama),',
            '// uncomment the line below and specify your URL:',
        ]
        if api_url:
            lines.append(f'const API_URL = "{api_url}";')
        else:
            lines.append('// const API_URL = "http://localhost:11434/api/generate";')
        
        with open(CONFIG_FILE_PATH, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines) + '\n')
        
        provider = detect_provider(api_key)
        return jsonify({
            'message': 'API configuration updated successfully.',
            'provider': provider,
            'key_masked': mask_key(api_key)
        }), 200
    except Exception as e:
        return jsonify({'error': f'Failed to write config: {str(e)}'}), 500

@config_bp.route('/api/test', methods=['POST'])
def admin_test_api():
    if not is_admin():
        return jsonify({'error': 'Unauthorized. Admin access required.'}), 403
    
    if not http_requests:
        return jsonify({'error': 'Python requests library is not installed. Run: pip install requests'}), 500
    
    api_key, api_url = parse_config_js()
    provider = detect_provider(api_key)
    
    data = request.get_json() or {}
    test_provider = data.get('provider', provider)
    
    if not api_key or api_key == 'your-api-key-here':
        return jsonify({'error': 'No API key configured. Please set an API key first.'}), 400
    
    test_payload = {'role': 'user', 'content': 'Reply with only the word: OK'}
    
    try:
        start_time = time.time()
        
        if test_provider == 'groq':
            url = 'https://api.groq.com/openai/v1/chat/completions'
            model = 'llama-3.3-70b-versatile'
            resp = http_requests.post(url, json={
                'model': model,
                'messages': [test_payload],
                'max_tokens': 5
            }, headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }, timeout=15)
            
        elif test_provider == 'openai':
            url = 'https://api.openai.com/v1/chat/completions'
            model = 'gpt-3.5-turbo'
            resp = http_requests.post(url, json={
                'model': model,
                'messages': [test_payload],
                'max_tokens': 5
            }, headers={
                'Authorization': f'Bearer {api_key}',
                'Content-Type': 'application/json'
            }, timeout=15)
            
        elif test_provider == 'gemini':
            url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}'
            model = 'gemini-2.0-flash'
            resp = http_requests.post(url, json={
                'contents': [{'parts': [{'text': 'Reply with only the word: OK'}]}]
            }, headers={
                'Content-Type': 'application/json'
            }, timeout=15)
        else:
            return jsonify({'error': f'Unknown provider: {test_provider}. Cannot test.'}), 400
        
        latency_ms = round((time.time() - start_time) * 1000, 1)
        
        if resp.status_code == 200:
            return jsonify({
                'success': True,
                'latency_ms': latency_ms,
                'model': model,
                'provider': test_provider
            }), 200
        else:
            error_msg = 'Unknown error'
            try:
                err_body = resp.json()
                if 'error' in err_body:
                    if isinstance(err_body['error'], dict):
                        error_msg = err_body['error'].get('message', str(err_body['error']))
                    else:
                        error_msg = str(err_body['error'])
            except Exception:
                error_msg = resp.text[:200]
            return jsonify({
                'success': False,
                'latency_ms': latency_ms,
                'model': model,
                'provider': test_provider,
                'error': f'HTTP {resp.status_code}: {error_msg}'
            }), 200
            
    except http_requests.exceptions.Timeout:
        return jsonify({'success': False, 'error': 'Connection timed out after 15 seconds.', 'provider': test_provider}), 200
    except http_requests.exceptions.ConnectionError:
        return jsonify({'success': False, 'error': 'Connection failed. Check your network.', 'provider': test_provider}), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e), 'provider': test_provider}), 200
