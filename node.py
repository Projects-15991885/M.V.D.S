from flask import Flask, request, jsonify
import threading
import sys
import replicator
from raft_node import RaftNode
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

store = {}
store_lock = threading.Lock()

NODE_ID = sys.argv[1] if len(sys.argv) > 1 else "node1"
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 5001

# Raft instance banao
raft = RaftNode(NODE_ID, PORT)

def setup_peers():
    all_nodes = {
        "node1": "http://127.0.0.1:5001",
        "node2": "http://127.0.0.1:5002",
        "node3": "http://127.0.0.1:5003",
    }
    peers = [url for node, url in all_nodes.items() if node != NODE_ID]
    replicator.PEERS = peers
    raft.peers = peers
    print(f"[{NODE_ID}] Peers: {peers}")

@app.route('/set', methods=['POST'])
def set_value():
    data = request.json
    key = data.get('key')
    value = data.get('value')
    if not key or value is None:
        return jsonify({"error": "key and value required"}), 400
    with store_lock:
        store[key] = value
    print(f"[{NODE_ID}] SET {key} = {value}")
    is_replicated = request.headers.get("X-Replicated") == "true"
    if not is_replicated:
        replicator.replicate_async(key, value, action="set")
    return jsonify({"status": "ok", "node": NODE_ID, "key": key, "value": value, "replicated": not is_replicated})

@app.route('/get/<key>', methods=['GET'])
def get_value(key):
    with store_lock:
        value = store.get(key)
    if value is None:
        return jsonify({"error": "key not found"}), 404
    return jsonify({"status": "ok", "node": NODE_ID, "key": key, "value": value})

@app.route('/delete/<key>', methods=['DELETE'])
def delete_value(key):
    with store_lock:
        if key not in store:
            return jsonify({"error": "key not found"}), 404
        del store[key]
    is_replicated = request.headers.get("X-Replicated") == "true"
    if not is_replicated:
        replicator.replicate_async(key, None, action="delete")
    return jsonify({"status": "ok", "node": NODE_ID, "key": key})

@app.route('/store', methods=['GET'])
def get_store():
    with store_lock:
        return jsonify({"node": NODE_ID, "store": store})

@app.route('/health', methods=['GET'])
def health():
    status = raft.get_status()
    return jsonify({"status": "alive", "node": NODE_ID, "raft": status})

# Raft routes
@app.route('/raft/vote', methods=['POST'])
def request_vote():
    data = request.json
    result = raft.receive_vote_request(data['term'], data['candidate_id'])
    return jsonify(result)

@app.route('/raft/heartbeat', methods=['POST'])
def heartbeat():
    data = request.json
    result = raft.receive_heartbeat(data['term'], data['leader_id'])
    return jsonify(result)

@app.route('/raft/status', methods=['GET'])
def raft_status():
    return jsonify(raft.get_status())

if __name__ == '__main__':
    setup_peers()
    raft.start()
    print(f"[{NODE_ID}] Starting on port {PORT}...")
    app.run(host='0.0.0.0', port=PORT, debug=False)