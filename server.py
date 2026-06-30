"""
SKRT DERBY - Backend Server
Flask + SQLite + WebSocket game server
"""
import os, json, time, sqlite3, hashlib, secrets, threading
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, redirect
from flask_sock import Sock
import simple_websocket

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
sock = Sock(app)

DB_PATH = os.path.join(os.path.dirname(__file__), 'skrt.db')

# ── Database ──────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.executescript('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE,
            username TEXT,
            avatar TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            games_played INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            total_score INTEGER DEFAULT 0,
            coins INTEGER DEFAULT 500
        );
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            score INTEGER,
            kills INTEGER,
            survival_time REAL,
            car_type TEXT,
            arena TEXT,
            played_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id)
        );
        CREATE TABLE IF NOT EXISTS shop_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            category TEXT,
            price INTEGER,
            data TEXT,
            rarity TEXT DEFAULT 'common'
        );
        CREATE TABLE IF NOT EXISTS purchases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            item_id INTEGER,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id),
            FOREIGN KEY(item_id) REFERENCES shop_items(id)
        );
    ''')
    conn.commit()
    conn.close()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

# ── Shop Items Seed ────────────────────────────────────
SHOP_ITEMS = [
    ('Speed Demon', 'skin', 500, '{"color": "#ff3d00", "trail": "fire"}', 'rare'),
    ('Neon Phantom', 'skin', 800, '{"color": "#00ff88", "trail": "neon"}', 'epic'),
    ('Ice King', 'skin', 500, '{"color": "#00d4ff", "trail": "ice"}', 'rare'),
    ('Gold Rush', 'skin', 1500, '{"color": "#ffd700", "trail": "sparkle"}', 'legendary'),
    ('Armor Plating', 'upgrade', 300, '{"defense": 20}', 'common'),
    ('Turbo Boost', 'upgrade', 400, '{"speed": 15}', 'common'),
    ('Repair Kit', 'upgrade', 200, '{"repair_rate": 10}', 'common'),
    ('Ram Shield', 'upgrade', 600, '{"ram_damage": 25}', 'rare'),
    ('EMP Blast', 'upgrade', 1000, '{"emp_radius": 50}', 'epic'),
    ('Battle Horn', 'cosmetic', 100, '{"horn_sound": "airhorn"}', 'common'),
    ('Smoke Trail', 'cosmetic', 150, '{"smoke_color": "#ff3d00"}', 'common'),
    ('Victory Dance', 'cosmetic', 250, '{"dance": "spin"}', 'common'),
]

# ── Routes ─────────────────────────────────────────────
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/play')
def play():
    return render_template('play.html')

@app.route('/leaderboard')
def leaderboard():
    return render_template('leaderboard.html')

@app.route('/shop')
def shop_page():
    return render_template('shop.html')

@app.route('/profile')
def profile():
    return render_template('profile.html')

# ── API ────────────────────────────────────────────────
@app.route('/api/status')
def api_status():
    conn = get_db()
    users = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    games = conn.execute('SELECT COUNT(*) FROM scores').fetchone()[0]
    conn.close()
    return jsonify({'status': 'online', 'users': users, 'games_played': games, 'players_online': len(connected_players)})

@app.route('/api/scores', methods=['GET', 'POST'])
def api_scores():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json()
        conn.execute('INSERT INTO scores (user_id, score, kills, survival_time, car_type, arena) VALUES (?,?,?,?,?,?)',
                     [data.get('user_id', 1), data['score'], data.get('kills', 0),
                      data.get('survival_time', 0), data.get('car_type', 'default'), data.get('arena', 'default')])
        conn.execute('UPDATE users SET games_played = games_played + 1, total_score = total_score + ?, coins = coins + ? WHERE id = ?',
                     [data['score'], data['score'] // 10, data.get('user_id', 1)])
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    
    limit = request.args.get('limit', 50)
    rows = conn.execute('SELECT s.*, u.username FROM scores s JOIN users u ON s.user_id = u.id ORDER BY s.score DESC LIMIT ?', [limit]).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/users/<int:user_id>')
def api_user(user_id):
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', [user_id]).fetchone()
    scores = conn.execute('SELECT * FROM scores WHERE user_id = ? ORDER BY score DESC LIMIT 10', [user_id]).fetchall()
    items = conn.execute('SELECT si.* FROM shop_items si JOIN purchases p ON si.id = p.item_id WHERE p.user_id = ?', [user_id]).fetchall()
    conn.close()
    return jsonify({
        'user': dict(user) if user else None,
        'recent_scores': [dict(s) for s in scores],
        'inventory': [dict(i) for i in items]
    })

@app.route('/api/shop/items')
def api_shop_items():
    conn = get_db()
    items = conn.execute('SELECT * FROM shop_items').fetchall()
    conn.close()
    return jsonify([dict(i) for i in items])

@app.route('/api/shop/buy', methods=['POST'])
def api_buy():
    data = request.get_json()
    user_id = data.get('user_id', 1)
    item_id = data['item_id']
    conn = get_db()
    item = conn.execute('SELECT * FROM shop_items WHERE id = ?', [item_id]).fetchone()
    user = conn.execute('SELECT * FROM users WHERE id = ?', [user_id]).fetchone()
    if not item or not user:
        conn.close()
        return jsonify({'error': 'Not found'}), 404
    if user['coins'] < item['price']:
        conn.close()
        return jsonify({'error': 'Not enough coins'}), 400
    existing = conn.execute('SELECT id FROM purchases WHERE user_id = ? AND item_id = ?', [user_id, item_id]).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Already owned'}), 400
    conn.execute('UPDATE users SET coins = coins - ? WHERE id = ?', [item['price'], user_id])
    conn.execute('INSERT INTO purchases (user_id, item_id) VALUES (?,?)', [user_id, item_id])
    conn.commit()
    conn.close()
    return jsonify({'status': 'ok', 'coins_left': user['coins'] - item['price']})

@app.route('/api/leaderboard')
def api_leaderboard():
    conn = get_db()
    rows = conn.execute('''
        SELECT u.username, COUNT(s.id) as games, MAX(s.score) as best, SUM(s.score) as total, u.wins
        FROM users u LEFT JOIN scores s ON u.id = s.user_id
        GROUP BY u.id ORDER BY total DESC LIMIT 20
    ''').fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

# ── WebSocket Game Server ──────────────────────────────
connected_players = {}
game_rooms = {}
lock = threading.Lock()

@sock.route('/ws/game')
def game_ws(ws):
    player_id = secrets.token_hex(8)
    player_name = 'Racer'
    player_car = 'brawler'
    player_room = None
    
    with lock:
        connected_players[player_id] = {'ws': ws, 'name': player_name, 'car': player_car, 'room': None, 'state': {}}
    
    try:
        while True:
            data = json.loads(ws.receive())
            msg_type = data.get('type')
            
            if msg_type == 'join':
                player_name = data.get('name', player_name)
                player_car = data.get('car', 'brawler')
                room = data.get('room', 'global')
                player_room = room
                
                with lock:
                    connected_players[player_id]['name'] = player_name
                    connected_players[player_id]['car'] = player_car
                    connected_players[player_id]['room'] = room
                    if room not in game_rooms:
                        game_rooms[room] = {'players': {}, 'started': False, 'timer': None}
                    game_rooms[room]['players'][player_id] = {
                        'id': player_id, 'name': player_name, 'car': player_car,
                        'x': 0, 'y': 0, 'angle': 0, 'health': 150, 'maxHealth': 150, 'alive': True
                    }
                    count = len(game_rooms[room]['players'])
                
                # Tell everyone who joined
                broadcast(room, {'type': 'player_joined', 'id': player_id, 'name': player_name, 'count': count})
                
                # Start game when 2+ players join
                if count >= 2 and not game_rooms[room]['started']:
                    game_rooms[room]['started'] = True
                    threading.Timer(3.0, lambda r=room: start_game_countdown(r)).start()
            
            elif msg_type == 'game_state':
                room = connected_players.get(player_id, {}).get('room')
                if not room or room not in game_rooms:
                    continue
                
                # Update player state
                with lock:
                    if player_id in game_rooms[room]['players']:
                        p = game_rooms[room]['players'][player_id]
                        p['x'] = data.get('x', p['x'])
                        p['y'] = data.get('y', p['y'])
                        p['angle'] = data.get('angle', p['angle'])
                        p['health'] = data.get('health', p.get('health', 150))
                        p['alive'] = data.get('health', 150) > 0
                
                # Host broadcasts all players + powerups
                if data.get('host'):
                    broadcast(room, {'type': 'game_update', 'players': list(game_rooms[room]['players'].values()), 'powerUps': data.get('powerUps', []), 'timer': data.get('timer', 120)})
                else:
                    broadcast(room, {'type': 'game_update', 'players': [game_rooms[room]['players'][player_id]], 'from': player_id})
            
            elif msg_type == 'score':
                room = connected_players.get(player_id, {}).get('room')
                if room:
                    scores = {}
                    with lock:
                        for pid, p in game_rooms[room]['players'].items():
                            scores[pid] = data.get('score', 0) if pid == player_id else 0
                    broadcast(room, {'type': 'score_update', 'player': player_id, 'score': data['score'], 'kills': data.get('kills', 0), 'name': player_name})
            
            elif msg_type == 'chat':
                room = connected_players.get(player_id, {}).get('room')
                if room:
                    broadcast(room, {'type': 'chat', 'from': player_name, 'msg': data['msg']})
    
    except Exception as e:
        pass
    finally:
        with lock:
            if player_id in connected_players:
                room = connected_players[player_id].get('room')
                if room and room in game_rooms:
                    game_rooms[room]['players'].pop(player_id, None)
                    remaining = len(game_rooms[room]['players'])
                    broadcast(room, {'type': 'player_left', 'id': player_id, 'name': player_name, 'count': remaining})
                    if remaining == 0:
                        del game_rooms[room]
                del connected_players[player_id]

def start_game_countdown(room):
    """Start game after countdown, then manage timer"""
    if room not in game_rooms:
        return
    with lock:
        players = game_rooms[room]['players']
        player_list = [{'id': pid, 'name': p['name'], 'car': p['car']} for pid, p in players.items()]
    
    import random
    seed = random.randint(0, 99999)
    broadcast(room, {'type': 'game_start', 'players': {p['id']: p for p in player_list}, 'seed': seed, 'countdown': 3})
    
    # Game timer - 120 seconds
    def game_timer():
        for remaining in [90, 60, 30, 10, 5, 0]:
            import time
            time.sleep(30)
    
    threading.Thread(target=game_timer, daemon=True).start()

def broadcast(room, msg, exclude=None):
    if room not in game_rooms:
        return
    data = json.dumps(msg)
    with lock:
        pids = list(game_rooms[room]['players'].keys())
    for pid in pids:
        if pid == exclude:
            continue
        try:
            if pid in connected_players:
                connected_players[pid]['ws'].send(data)
        except Exception:
            pass

# ── API: Active Rooms ──────────────────────────────────
@app.route('/api/rooms')
def api_rooms():
    with lock:
        rooms = {}
        for name, room in game_rooms.items():
            rooms[name] = {'players': len(room['players']), 'started': room['started']}
        return jsonify({'rooms': rooms, 'total_players': len(connected_players)})
if __name__ == '__main__':
    init_db()
    conn = get_db()
    existing = conn.execute('SELECT COUNT(*) FROM shop_items').fetchone()[0]
    if existing == 0:
        conn.executemany('INSERT INTO shop_items (name, category, price, data, rarity) VALUES (?,?,?,?,?)', SHOP_ITEMS)
        conn.execute("INSERT OR IGNORE INTO users (id, discord_id, username) VALUES (1, '307248951365468171', 'wilde')")
        conn.commit()
    conn.close()
    print('[SKRT] Game server starting on :5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
