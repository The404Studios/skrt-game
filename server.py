"""
SKRT DERBY - Backend Server
Flask + SQLite + WebSocket game server
"""
import os, json, time, sqlite3, hashlib, secrets, threading
from datetime import datetime
from flask import Flask, request, jsonify, render_template, session, redirect
from flask_sock import Sock
import simple_websocket

# Stripe (optional - only if key is set)
stripe = None
if os.environ.get('STRIPE_SECRET_KEY'):
    import stripe as _stripe
    stripe = _stripe
    _stripe.api_key = os.environ['STRIPE_SECRET_KEY']

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['TEMPLATES_AUTO_RELOAD'] = True
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
        CREATE TABLE IF NOT EXISTS bounties (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT UNIQUE,
            reward_coins INTEGER DEFAULT 500,
            winner_user_id INTEGER,
            winning_score INTEGER,
            awarded INTEGER DEFAULT 0
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
    rooms_active = len([r for r in game_rooms.values() if r['started']])
    return jsonify({
        'status': 'online',
        'users': users,
        'games_played': games,
        'players_online': len(connected_players),
        'active_rooms': rooms_active
    })

@app.route('/api/scores', methods=['GET', 'POST'])
def api_scores():
    conn = get_db()
    if request.method == 'POST':
        data = request.get_json()
        user_id = data.get('user_id', 1)
        score = data['score']
        kills = data.get('kills', 0)
        survival = data.get('survival_time', 0)
        car_type = data.get('car_type', 'default')
        arena = data.get('arena', 'default')
        
        conn.execute(
            'INSERT INTO scores (user_id, score, kills, survival_time, car_type, arena) VALUES (?,?,?,?,?,?)',
            [user_id, score, kills, survival, car_type, arena])
        conn.execute(
            'UPDATE users SET games_played = games_played + 1, total_score = total_score + ?, '
            'coins = coins + ?, wins = wins + ? WHERE id = ?',
            [score, score // 10, 1 if score > 5000 else 0, user_id])
        conn.commit()
        conn.close()
        return jsonify({'status': 'ok'})
    
    limit = request.args.get('limit', 50)
    rows = conn.execute(
        'SELECT s.*, u.username FROM scores s JOIN users u ON s.user_id = u.id '
        'ORDER BY s.score DESC LIMIT ?', [limit]).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route('/api/users/<int:user_id>')
def api_user(user_id):
    conn = get_db()
    user = conn.execute('SELECT * FROM users WHERE id = ?', [user_id]).fetchone()
    scores = conn.execute('SELECT * FROM scores WHERE user_id = ? ORDER BY score DESC LIMIT 10', [user_id]).fetchall()
    items = conn.execute(
        'SELECT si.* FROM shop_items si JOIN purchases p ON si.id = p.item_id WHERE p.user_id = ?',
        [user_id]).fetchall()
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
    existing = conn.execute('SELECT id FROM purchases WHERE user_id = ? AND item_id = ?',
                            [user_id, item_id]).fetchone()
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

# ── Daily Bounty ─────────────────────────────────────

@app.route('/api/bounty')
def api_bounty():
    """Get today's bounty status"""
    today = datetime.now().strftime('%Y-%m-%d')
    conn = get_db()
    
    # Ensure today's bounty exists
    bounty = conn.execute('SELECT * FROM bounties WHERE date = ?', [today]).fetchone()
    if not bounty:
        conn.execute('INSERT OR IGNORE INTO bounties (date, reward_coins) VALUES (?, 500)', [today])
        conn.commit()
        bounty = conn.execute('SELECT * FROM bounties WHERE date = ?', [today]).fetchone()
    
    # Get today's top score
    top = conn.execute('''
        SELECT s.*, u.username FROM scores s 
        JOIN users u ON s.user_id = u.id 
        WHERE date(s.played_at) = ? 
        ORDER BY s.score DESC LIMIT 1
    ''', [today]).fetchone()
    
    conn.close()
    
    return jsonify({
        'bounty': dict(bounty) if bounty else None,
        'reward': 500,
        'top_today': dict(top) if top else None,
    })

# ── Daily Challenges ────────────────────────────────

CHALLENGES = [
    {'id': 'kill_5', 'name': 'Get 5 Kills', 'target': 5, 'reward': 200, 'metric': 'kills'},
    {'id': 'score_5000', 'name': 'Score 5,000 Points', 'target': 5000, 'reward': 250, 'metric': 'score'},
    {'id': 'survive_90', 'name': 'Survive 90 Seconds', 'target': 90, 'reward': 150, 'metric': 'survival'},
    {'id': 'win_match', 'name': 'Win a Match', 'target': 1, 'reward': 300, 'metric': 'wins'},
    {'id': 'powerup_5', 'name': 'Collect 5 Power-ups', 'target': 5, 'reward': 100, 'metric': 'powerups'},
]

@app.route('/api/challenges')
def api_challenges():
    """Get today's challenges"""
    today = datetime.now().strftime('%Y-%m-%d')
    return jsonify({
        'date': today,
        'challenges': CHALLENGES,
    })

# ── Discord Command API ────────────────────────────

@app.route('/api/discord/stats')
def discord_stats():
    """Formatted stats for Discord bot"""
    conn = get_db()
    users = conn.execute('SELECT COUNT(*) FROM users').fetchone()[0]
    total_games = conn.execute('SELECT COUNT(*) FROM scores').fetchone()[0]
    
    # Today's stats
    today = datetime.now().strftime('%Y-%m-%d')
    today_games = conn.execute("SELECT COUNT(*) FROM scores WHERE date(played_at) = ?", [today]).fetchone()[0]
    today_top = conn.execute('''
        SELECT s.score, u.username FROM scores s 
        JOIN users u ON s.user_id = u.id 
        WHERE date(s.played_at) = ? 
        ORDER BY s.score DESC LIMIT 1
    ''', [today]).fetchone()
    
    # Top players
    top3 = conn.execute('''
        SELECT u.username, MAX(s.score) as best, COUNT(s.id) as games
        FROM users u JOIN scores s ON u.id = s.user_id
        GROUP BY u.id ORDER BY best DESC LIMIT 3
    ''').fetchall()
    
    # Active rooms
    rooms_active = len([r for r in game_rooms.values() if r['started']])
    players_now = len(connected_players)
    
    conn.close()
    
    msg = "🏎️ **SKRT DERBY STATS**\n"
    msg += f"👥 Players: {users} | 🎮 Games: {total_games} | ⚡ Online: {players_now}\n"
    msg += f"📅 Today: {today_games} games"
    if today_top:
        msg += f" | Top: **{today_top['username']}** ({today_top['score']:,})"
    msg += "\n\n**🏆 Top 3 All-Time:**\n"
    for i, p in enumerate(top3):
        medal = ['🥇', '🥈', '🥉'][i]
        msg += f"{medal} **{p['username']}**: {p['best']:,} pts ({p['games']} games)\n"
    
    if rooms_active > 0:
        msg += f"\n🔥 {rooms_active} active room(s) — join now!"
    
    return jsonify({'text': msg})

@app.route('/api/discord/leaderboard')
def discord_leaderboard():
    """Quick top 10 for Discord"""
    conn = get_db()
    rows = conn.execute('''
        SELECT u.username, MAX(s.score) as best, COUNT(s.id) as games, SUM(s.kills) as kills
        FROM users u JOIN scores s ON u.id = s.user_id
        GROUP BY u.id ORDER BY best DESC LIMIT 10
    ''').fetchall()
    conn.close()
    
    msg = "🏆 **TOP 10 LEADERBOARD**\n"
    for i, r in enumerate(rows):
        msg += f"{i+1}. **{r['username']}**: {r['best']:,} pts | {r['kills']} kills | {r['games']} games\n"
    
    return jsonify({'text': msg})

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
        connected_players[player_id] = {
            'ws': ws, 'name': player_name, 'car': player_car,
            'room': None, 'state': {}
        }
    
    try:
        while True:
            data = json.loads(ws.receive())
            msg_type = data.get('type')
            
            if msg_type == 'join':
                _handle_join(player_id, data)
                player_name = data.get('name', player_name)
                player_car = data.get('car', 'brawler')
                player_room = data.get('room', 'global')
                
            elif msg_type == 'game_state':
                _handle_game_state(player_id, data)
                
            elif msg_type == 'score':
                _handle_score(player_id, data)
                
            elif msg_type == 'kill':
                _handle_kill(player_id, data)
                
            elif msg_type == 'chat':
                room = connected_players.get(player_id, {}).get('room')
                if room:
                    broadcast(room, {
                        'type': 'chat',
                        'from': connected_players[player_id]['name'],
                        'msg': data['msg'][:200]
                    })
    
    except Exception:
        pass
    finally:
        _handle_disconnect(player_id)

def _handle_join(player_id, data):
    room = data.get('room', 'global')
    player_name = data.get('name', 'Racer')[:16]
    player_car = data.get('car', 'brawler')
    
    with lock:
        connected_players[player_id]['name'] = player_name
        connected_players[player_id]['car'] = player_car
        connected_players[player_id]['room'] = room
        
        if room not in game_rooms:
            game_rooms[room] = {
                'players': {},
                'started': False,
                'timer': 120,
                'game_started_at': None
            }
        
        game_rooms[room]['players'][player_id] = {
            'id': player_id,
            'name': player_name,
            'car': player_car,
            'x': 0, 'y': 0, 'angle': 0, 'speed': 0,
            'health': 150, 'maxHealth': 150,
            'alive': True, 'score': 0, 'kills': 0
        }
        
        count = len(game_rooms[room]['players'])
    
    # Tell everyone who joined
    broadcast(room, {
        'type': 'player_joined',
        'id': player_id,
        'name': player_name,
        'car': player_car,
        'count': count
    })
    
    # Start game when 2+ players join (if not already started)
    if count >= 2 and not game_rooms[room]['started']:
        game_rooms[room]['started'] = True
        threading.Timer(3.0, lambda r=room: start_game_countdown(r)).start()

def _handle_game_state(player_id, data):
    room = connected_players.get(player_id, {}).get('room')
    if not room or room not in game_rooms:
        return
    
    with lock:
        if player_id in game_rooms[room]['players']:
            p = game_rooms[room]['players'][player_id]
            p['x'] = data.get('x', p['x'])
            p['y'] = data.get('y', p['y'])
            p['angle'] = data.get('angle', p['angle'])
            p['speed'] = data.get('speed', 0)
            p['health'] = data.get('health', p.get('health', 150))
            p['alive'] = data.get('health', 150) > 0
            
            # Gather all player states
            all_players = []
            for pid, pl in game_rooms[room]['players'].items():
                all_players.append({
                    'id': pid,
                    'name': pl['name'],
                    'car': pl['car'],
                    'x': pl['x'],
                    'y': pl['y'],
                    'angle': pl['angle'],
                    'speed': pl.get('speed', 0),
                    'health': pl['health'],
                    'maxHealth': pl.get('maxHealth', 150),
                    'alive': pl['alive']
                })
    
    # If host sends powerups/timer, include them
    if data.get('host'):
        broadcast(room, {
            'type': 'game_update',
            'players': all_players,
            'powerUps': data.get('powerUps', []),
            'timer': data.get('timer', 120)
        })
    else:
        # Just send all players' positions to everyone
        broadcast(room, {
            'type': 'game_update',
            'players': all_players
        })

def _handle_score(player_id, data):
    room = connected_players.get(player_id, {}).get('room')
    if not room or room not in game_rooms:
        return
    
    score = data.get('score', 0)
    kills = data.get('kills', 0)
    name = connected_players.get(player_id, {}).get('name', 'Unknown')
    
    with lock:
        if player_id in game_rooms[room]['players']:
            game_rooms[room]['players'][player_id]['score'] = score
            game_rooms[room]['players'][player_id]['kills'] = kills
    
    broadcast(room, {
        'type': 'score_update',
        'player': player_id,
        'name': name,
        'score': score,
        'kills': kills
    })

def _handle_kill(player_id, data):
    """A player killed another player"""
    room = connected_players.get(player_id, {}).get('room')
    if not room:
        return
    
    killer_name = connected_players.get(player_id, {}).get('name', 'Unknown')
    victim_id = data.get('victim_id', '')
    victim_name = data.get('victim_name', 'Unknown')
    
    with lock:
        if player_id in game_rooms[room]['players']:
            game_rooms[room]['players'][player_id]['kills'] += 1
    
    broadcast(room, {
        'type': 'kill_feed',
        'killer': killer_name,
        'victim': victim_name,
        'killer_id': player_id,
        'victim_id': victim_id
    })

def _handle_disconnect(player_id):
    with lock:
        if player_id not in connected_players:
            return
        
        pdata = connected_players[player_id]
        room = pdata.get('room')
        player_name = pdata.get('name', 'Unknown')
        
        if room and room in game_rooms:
            game_rooms[room]['players'].pop(player_id, None)
            remaining = len(game_rooms[room]['players'])
            
            broadcast(room, {
                'type': 'player_left',
                'id': player_id,
                'name': player_name,
                'count': remaining
            })
            
            if remaining == 0:
                del game_rooms[room]
            elif remaining == 1 and game_rooms[room]['started']:
                # One player left - they win!
                winner_id = list(game_rooms[room]['players'].keys())[0]
                winner_name = game_rooms[room]['players'][winner_id]['name']
                broadcast(room, {
                    'type': 'game_over',
                    'winner': winner_name,
                    'reason': 'opponents_left'
                })
        
        del connected_players[player_id]

def start_game_countdown(room):
    """Start game after countdown, then manage timer"""
    if room not in game_rooms:
        return
    
    with lock:
        players = game_rooms[room]['players']
        player_list = []
        for pid, p in players.items():
            player_list.append({
                'id': pid,
                'name': p['name'],
                'car': p['car']
            })
    
    import random
    seed = random.randint(0, 99999)
    
    broadcast(room, {
        'type': 'game_start',
        'players': {p['id']: p for p in player_list},
        'seed': seed,
        'countdown': 3
    })
    
    # Game timer thread - sends periodic time updates
    def run_game_timer(r, total_time=120):
        remaining = total_time
        while remaining > 0 and r in game_rooms and game_rooms[r]['started']:
            time.sleep(10)
            remaining -= 10
            
            with lock:
                if r not in game_rooms:
                    return
                # Check if game should end (1 or fewer alive)
                players_alive = [p for p in game_rooms[r]['players'].values() if p['alive']]
                if len(players_alive) <= 1:
                    winner = players_alive[0]['name'] if players_alive else 'No one'
                    broadcast(r, {
                        'type': 'game_over',
                        'winner': winner,
                        'reason': 'last_standing'
                    })
                    # Calculate final scores
                    scores = {}
                    ranks = {}
                    sorted_players = sorted(
                        game_rooms[r]['players'].values(),
                        key=lambda p: (p['alive'], p['health'], p['score']),
                        reverse=True
                    )
                    for rank, p in enumerate(sorted_players, 1):
                        scores[p['id']] = p['score'] + (p['health'] * 2 if p['alive'] else 0)
                        ranks[p['id']] = rank
                    broadcast(r, {
                        'type': 'game_over',
                        'winner': winner,
                        'reason': 'last_standing',
                        'scores': scores,
                        'ranks': ranks
                    })
                    game_rooms[r]['started'] = False
                    return
            
            # Send time update
            broadcast(r, {
                'type': 'game_update',
                'players': [],
                'timer': remaining
            })
        
        # Game over by timeout
        if r in game_rooms and game_rooms[r]['started']:
            with lock:
                if r not in game_rooms:
                    return
                scores = {}
                ranks = {}
                sorted_players = sorted(
                    game_rooms[r]['players'].values(),
                    key=lambda p: (p['alive'], p['health'], p['score']),
                    reverse=True
                )
                for rank, p in enumerate(sorted_players, 1):
                    scores[p['id']] = p['score']
                    ranks[p['id']] = rank
                
                winner = sorted_players[0]['name'] if sorted_players else 'No one'
            
            broadcast(r, {
                'type': 'game_over',
                'winner': winner,
                'reason': 'time_up',
                'scores': scores,
                'ranks': ranks
            })
            game_rooms[r]['started'] = False
    
    threading.Thread(target=run_game_timer, args=(room, 120), daemon=True).start()

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
            rooms[name] = {
                'players': len(room['players']),
                'started': room['started'],
                'player_names': [p['name'] for p in room['players'].values()]
            }
        return jsonify({
            'rooms': rooms,
            'total_players': len(connected_players)
        })

# ── Stripe Payment ───────────────────────────────────

@app.route('/api/create-checkout', methods=['POST'])
def create_checkout():
    """Create a Stripe checkout session for premium coins"""
    if not stripe:
        return jsonify({'error': 'Stripe not configured'}), 500

    data = request.get_json()
    user_id = data.get('user_id', 1)
    package = data.get('package', 'coins_500')

    # Price lookup
    prices = {
        'coins_500': {'amount': 499, 'name': '500 Coins', 'coins': 500},
        'coins_2000': {'amount': 1499, 'name': '2000 Coins + 200 Bonus', 'coins': 2200},
        'coins_5000': {'amount': 2999, 'name': '5000 Coins + 1000 Bonus', 'coins': 6000},
        'vip_pass': {'amount': 999, 'name': 'VIP Pass (30 days)', 'coins': 0},
    }

    pkg = prices.get(package, prices['coins_500'])

    try:
        checkout_session = stripe.checkout.Session.create(
            payment_method_types=['card'],
            line_items=[{
                'price_data': {
                    'currency': 'usd',
                    'product_data': {'name': pkg['name']},
                    'unit_amount': pkg['amount'],
                },
                'quantity': 1,
            }],
            mode='payment',
            success_url=request.host_url + 'shop?session_id={CHECKOUT_SESSION_ID}',
            cancel_url=request.host_url + 'shop',
            metadata={
                'user_id': str(user_id),
                'package': package,
                'coins': str(pkg['coins']),
            },
        )
        return jsonify({'url': checkout_session.url})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/stripe-webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhook for completed payments"""
    if not stripe:
        return jsonify({'error': 'Stripe not configured'}), 500

    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    endpoint_secret = os.environ.get('STRIPE_WEBHOOK_SECRET', '')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, endpoint_secret
        )
    except Exception:
        return jsonify({'error': 'Invalid signature'}), 400

    if event['type'] == 'checkout.session.completed':
        session_data = event['data']['object']
        user_id = int(session_data['metadata'].get('user_id', 1))
        coins = int(session_data['metadata'].get('coins', 0))
        package = session_data['metadata'].get('package', '')

        if coins > 0:
            conn = get_db()
            conn.execute('UPDATE users SET coins = coins + ? WHERE id = ?', [coins, user_id])
            conn.commit()
            conn.close()
            print(f'[STRIPE] Added {coins} coins to user {user_id} for {package}')

    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    init_db()
    conn = get_db()
    existing = conn.execute('SELECT COUNT(*) FROM shop_items').fetchone()[0]
    if existing == 0:
        conn.executemany(
            'INSERT INTO shop_items (name, category, price, data, rarity) VALUES (?,?,?,?,?)',
            SHOP_ITEMS)
        conn.execute(
            "INSERT OR IGNORE INTO users (id, discord_id, username) VALUES (1, '307248951365468171', 'wilde')")
        conn.commit()
    conn.close()
    print('[SKRT] Game server starting on :5000')
    app.run(host='0.0.0.0', port=5000, debug=False)
