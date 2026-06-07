# M.D.V.S — Mini Distributed Value Store

A fault-tolerant distributed key-value store implementing the **Raft consensus algorithm** from scratch — featuring automatic leader election, data replication across nodes, chaos engineering simulation, and network partition visualization.

---

## What This Project Does

Most databases store data on a single server. If that server goes down, the data becomes inaccessible. M.D.V.S solves this by distributing data across multiple nodes — if one node fails, the system automatically recovers without any manual intervention.

---

## Core Features

**Raft Consensus Algorithm**
Implements leader election, heartbeat mechanism, and automatic failover. When the current leader node crashes, remaining nodes hold an election and a new leader is chosen within seconds.

**Data Replication**
Every write operation is automatically replicated across all nodes. Writing to any single node propagates the data to the entire cluster.

**Chaos Engineering**
Inspired by Netflix's Chaos Monkey — randomly terminates nodes to validate system resilience. The cluster self-heals in real time.

**Network Partition Simulation**
Simulates split-brain scenarios by isolating a node from the rest of the cluster, demonstrating CAP theorem trade-offs in a live environment.

**Real-time Dashboard**
A React-based control panel visualizes cluster state, leader identity, term numbers, replication status, and the full Raft event log — updating every 1.5 seconds.

---

## Architecture



┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   NODE 1    │◄───►│   NODE 2    │◄───►│   NODE 3    │
│  port 5001  │     │  port 5002  │     │  port 5003  │
│             │     │  [LEADER]   │     │             │
└─────────────┘     └─────────────┘     └─────────────┘
▲                   ▲                   ▲
└───────────────────┴───────────────────┘
HTTP Replication



Each node runs an independent Flask server. The Raft module handles consensus in background threads. The React dashboard polls all nodes every 1.5s.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend nodes | Python, Flask, Flask-CORS |
| Consensus algorithm | Raft (implemented from scratch) |
| Inter-node communication | HTTP REST |
| Frontend dashboard | React, Vite |
| Concurrency | Python threading |

---

## How to Run

**Prerequisites:** Python 3.10+, Node.js 18+

**Install dependencies:**
```bash
pip install flask flask-cors
cd dashboard && npm install
```

**Start the cluster (4 separate terminals):**
```bash
# Terminal 1
python node.py node1 5001

# Terminal 2
python node.py node2 5002

# Terminal 3
python node.py node3 5003

# Terminal 4
cd dashboard && npm run dev
```

**Open dashboard:** `http://localhost:5173`

---

## Key Concepts Demonstrated

**Leader Election** — Nodes use randomized election timeouts to avoid split votes. The first node to timeout requests votes; if it receives a majority, it becomes leader.

**Heartbeat Mechanism** — The leader sends periodic heartbeats (every 500ms) to all followers. If a follower does not receive a heartbeat within its timeout window, it initiates a new election.

**Log Replication** — All writes are forwarded through the replication layer. An `X-Replicated` header prevents infinite replication loops between nodes.

**Fault Tolerance** — The cluster remains operational as long as a majority of nodes (⌊n/2⌋ + 1) are alive. With 3 nodes, the system tolerates 1 failure.

---

## Real-world Relevance

The Raft algorithm is used in production systems including **etcd** (the backing store for Kubernetes), **CockroachDB**, and **TiKV**. This project implements the core principles of those systems at a smaller scale.

---

*Built as part of a distributed systems research portfolio.*