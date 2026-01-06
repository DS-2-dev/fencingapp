from flask import Flask, render_template, redirect, url_for, request, send_file
import os
import xml.etree.ElementTree as ET
from glob import glob
import qrcode
from io import BytesIO
import socket
import time
import hmac
import hashlib
import base64
try:
    from flask_socketio import SocketIO, join_room
    SOCKETIO_AVAILABLE = True
except Exception:
    # flask_socketio not installed in this environment — provide safe fallbacks
    SocketIO = None
    def join_room(room):
        return None
    SOCKETIO_AVAILABLE = False

app = Flask(__name__)

# Simple in-memory store for remote-submitted scores.
# Keys are pool indices (0-based) -> dict of score entries.
remote_scores_store = {}
# Server secret for signing QR tokens. In production set via env var.
SECRET_KEY = os.environ.get('FENCINGAPP_SECRET') or hashlib.sha256(b'fencingapp_default_secret').hexdigest().encode()

# Socket.IO for real-time remote scoring (may be unavailable)
if SOCKETIO_AVAILABLE:
    socketio = SocketIO(app, cors_allowed_origins='*')
else:
    class _DummySocketIO:
        def emit(self, *args, **kwargs):
            return None
        def on(self, *args, **kwargs):
            def _decorator(f):
                return f
            return _decorator
        def run(self, the_app, host='0.0.0.0', port=8000, debug=False):
            the_app.run(host=host, port=port, debug=debug)
    socketio = _DummySocketIO()

def get_local_ip():
    try:
        # Create a socket to connect to an external server
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "127.0.0.1"

# Home page (index.html)
@app.route('/')
def index():
    return render_template('index.html', title="Home")

# Summary page (after clicking "New Tournament")
@app.route('/summary')
def summary():
    # Parse most recent .frd file to extract tournament metadata
    tournament = {}
    event = {}
    frd_files = sorted(glob('*.frd'), key=lambda f: os.path.getmtime(f), reverse=True)
    if frd_files:
        try:
            tree = ET.parse(frd_files[0])
            root = tree.getroot()
            # Handle XML namespace
            namespace = {'ns': 'http://www.askfred.net'}
            tourn_elem = root.find('.//ns:Tournament', namespace)
            if tourn_elem is not None:
                fee_amount = tourn_elem.get('Fee', '0.00')
                fee_currency = tourn_elem.get('FeeCurrency', 'USD')
                
                # Format fee with currency symbol
                currency_symbols = {
                    'USD': '$',
                    'EUR': '€',
                    'GBP': '£',
                    'JPY': '¥',
                    'CAD': 'C$',
                    'AUD': 'A$'
                }
                symbol = currency_symbols.get(fee_currency, fee_currency + ' ')
                formatted_fee = f"{symbol}{fee_amount}"
                
                tournament = {
                    'name': tourn_elem.get('Name', 'N/A'),
                    'location': tourn_elem.get('Location', 'N/A'),
                    'date': tourn_elem.get('StartDate', 'N/A'),
                    'fee': formatted_fee,
                    'id': tourn_elem.get('TournamentID', 'N/A')
                }
            
            # Parse first event data
            event_elem = root.find('.//ns:Event', namespace)
            if event_elem is not None:
                event_time_raw = event_elem.get('EventDateTime', 'N/A')
                # Extract only time portion (HH:MM:SS) from datetime string
                if event_time_raw != 'N/A' and ' ' in event_time_raw:
                    event_time = event_time_raw.split(' ', 1)[1]
                else:
                    event_time = event_time_raw
                weapon = event_elem.get('Weapon', 'N/A')
                gender = event_elem.get('Gender', 'N/A')
                gender_mixed = 'Yes' if gender == 'Mixed' else 'No'
                
                age_min = event_elem.get('AgeLimitMin', '')
                age_max = event_elem.get('AgeLimitMax', '')
                enforce_age = event_elem.get('EnforceAge', 'False')
                if enforce_age == 'False' or not age_min:
                    age_limit = 'None'
                elif age_min == age_max:
                    age_limit = age_min
                else:
                    age_limit = f"{age_min} - {age_max}"
                
                rating_limit = event_elem.get('RatingLimit', 'Open')
                enforce_rating = event_elem.get('EnforceRating', 'False')
                if enforce_rating == 'False' or rating_limit == 'Open':
                    rating_limit = 'None'
                
                event_id = event_elem.get('EventID', 'N/A')
                
                event = {
                    'time': event_time,
                    'weapon': weapon,
                    'gender_mixed': gender_mixed,
                    'age_limit': age_limit,
                    'rating_limit': rating_limit,
                    'id': event_id
                }
        except Exception as e:
            print(f'Error parsing .frd file: {e}')
    return render_template('summary.html', title="Summary", tournament=tournament, event=event)

# Check-in page
@app.route('/checkin')
def checkin():
    return render_template('checkin.html', title="Check-in")

# Add other pages as needed
@app.route('/seeding')
def seeding():
    return render_template('seeding.html', title="Seeding")

@app.route('/pools')
def pools():
    return render_template('pools.html', title="Pools")

@app.route('/remote-score')
def remote_score():
    pool_id = request.args.get('pool', '1')
    return render_template('remote_score.html', title=f"Remote Score Pool {pool_id}", pool_id=pool_id)

@app.route('/qr')
def qr():
    pool = request.args.get('pool', '1')
    ip = get_local_ip()
    # create signed token to pair remote device with a pool (HMAC)
    pidx = int(pool) - 1
    expiry = int(time.time() + 60 * 60)
    payload = f"{pidx}:{expiry}".encode()
    sig = hmac.new(SECRET_KEY, payload, hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(b"%b:%b" % (payload, sig.encode())).decode()
    url = f"http://{ip}:8000/remote-score?pool={pool}&token={token}"
    img = qrcode.make(url)
    buf = BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')


# Remote scores API: POST to submit scores, GET to retrieve
@app.route('/api/remote-scores', methods=['GET', 'POST'])
def api_remote_scores():
    if request.method == 'POST':
        try:
            data = request.get_json(force=True)
            pool = int(data.get('pool', 1)) - 1
            scores = data.get('scores', {})
            token = data.get('token')
            # validate HMAC token if provided
            if token:
                try:
                    decoded = base64.urlsafe_b64decode(token.encode())
                    # decoded format: b"<pool>:<expiry>:<sig>"
                    parts = decoded.split(b':')
                    if len(parts) < 3:
                        return {'status': 'error', 'message': 'invalid token format'}, 403
                    p_from_token = int(parts[0].decode())
                    expiry = int(parts[1].decode())
                    sig = parts[2].decode()
                    if p_from_token != pool:
                        return {'status': 'error', 'message': 'token pool mismatch'}, 403
                    if expiry < time.time():
                        return {'status': 'error', 'message': 'token expired'}, 403
                    payload = f"{p_from_token}:{expiry}".encode()
                    expected = hmac.new(SECRET_KEY, payload, hashlib.sha256).hexdigest()
                    if not hmac.compare_digest(expected, sig):
                        return {'status': 'error', 'message': 'invalid token signature'}, 403
                except Exception as e:
                    return {'status': 'error', 'message': 'token parse error'}, 403
            # store/merge
            existing = remote_scores_store.get(pool, {})
            existing.update(scores)
            remote_scores_store[pool] = existing
            # emit to websocket room for this pool
            try:
                socketio.emit('remote_scores', {'pool': pool, 'scores': existing}, namespace='/remote', room=f'pool-{pool}')
            except Exception:
                pass
            return {'status': 'ok', 'pool': pool, 'count': len(existing)}
        except Exception as e:
            return {'status': 'error', 'message': str(e)}, 400
    else:
        # GET: optionally filter by pool
        pool_q = request.args.get('pool')
        if pool_q is not None:
            try:
                p = int(pool_q) - 1
                return remote_scores_store.get(p, {})
            except:
                return {}, 400
        return remote_scores_store

@app.route('/de')
def de():
    return render_template('de.html', title="DE")


@app.route('/continue')
def cont():
    # Continue/resume tournament — redirect to last page they were at before clicking home ~ still saves all data
    # is read client-side so the user doesn't need to re-import.
    return redirect(url_for('seeding'))

@socketio.on('join', namespace='/remote')
def socket_join(data):
    try:
        pool = int(data.get('pool'))
        room = f'pool-{pool}'
        # join_room is a no-op when Socket.IO isn't available
        join_room(room)
    except Exception:
        pass


if __name__ == '__main__':
    # If Socket.IO is unavailable, DummySocketIO.run will call Flask's app.run
    socketio.run(app, host='0.0.0.0', port=8000, debug=False)
