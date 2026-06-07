import threading
import urllib.request
import json

# Doosre nodes ki list
PEERS = []

def replicate(key, value, action="set"):
    """Sab peer nodes ko data bhejo"""
    for peer in PEERS:
        try:
            if action == "set":
                data = json.dumps({"key": key, "value": value}).encode()
                req = urllib.request.Request(
                    f"{peer}/set",
                    data=data,
                    headers={"Content-Type": "application/json", "X-Replicated": "true"},
                    method="POST"
                )
            elif action == "delete":
                req = urllib.request.Request(
                    f"{peer}/delete/{key}",
                    headers={"X-Replicated": "true"},
                    method="DELETE"
                )
            urllib.request.urlopen(req, timeout=2)
            print(f"[Replicator] Replicated {action} {key} to {peer}")
        except Exception as e:
            print(f"[Replicator] Failed to replicate to {peer}: {e}")

def replicate_async(key, value, action="set"):
    """Background mein replicate karo — server block na ho"""
    t = threading.Thread(target=replicate, args=(key, value, action))
    t.daemon = True
    t.start()