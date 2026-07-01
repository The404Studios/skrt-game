#!/usr/bin/env python
"""SKRT Derby - Tunnel Watchdog. Keeps the public tunnel alive."""
import subprocess, time, os, re

URL_FILE = os.path.join(os.path.dirname(__file__), 'PUBLIC_URL.txt')
GAME_PORT = 5000
TUNNEL_PORT = 80  # serveo only allows port 80 on free tier (serveo provides SSL)

def update_url(url):
    with open(URL_FILE, 'w') as f:
        f.write(f"SKRT DERBY - Public URL\n{'='*40}\nCurrent: {url}\nLocal: http://localhost:{GAME_PORT}\nDiscord: Channel 1521444736312016907\n\nTunnel restart command:\n  ssh -o ServerAliveInterval=15 -R 80:localhost:{GAME_PORT} serveo.net\n\nNote: Free tunnel URLs change on restart. This is normal.\n")
    print(f"[WATCHDOG] URL updated: {url}")

def start_tunnel():
    print("[WATCHDOG] Starting tunnel...")
    proc = subprocess.Popen(
        ['ssh', '-o', 'StrictHostKeyChecking=no', '-o', 'ServerAliveInterval=15',
         '-o', 'ServerAliveCountMax=3', '-R', f'{TUNNEL_PORT}:localhost:{GAME_PORT}', 'serveo.net'],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True
    )
    
    url_found = None
    for line in proc.stdout:
        print(f"[TUNNEL] {line.rstrip()}")
        match = re.search(r'https://[a-zA-Z0-9.-]+\.serveo[a-zA-Z0-9.-]*\.com', line)
        if match and not url_found:
            url_found = match.group(0)
            update_url(url_found)
    
    proc.wait()
    print(f"[WATCHDOG] Tunnel exited (code {proc.returncode}). Restarting in 10s...")
    return proc.returncode

if __name__ == '__main__':
    print("[WATCHDOG] SKRT Derby Tunnel Watchdog started")
    while True:
        try:
            start_tunnel()
        except Exception as e:
            print(f"[WATCHDOG] Error: {e}")
        time.sleep(10)
