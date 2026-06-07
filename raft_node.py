import threading
import time
import random
import urllib.request
import json

# Node ke 3 possible states
FOLLOWER = "follower"
CANDIDATE = "candidate"
LEADER = "leader"

class RaftNode:
    def __init__(self, node_id, port):
        self.node_id = node_id
        self.port = port
        
        # Har node follower se shuru hota hai
        self.state = FOLLOWER
        self.current_term = 0      # Election round number
        self.voted_for = None      # Is term mein kisne vote diya
        self.leader_id = None      # Abhi kaun leader hai
        
        # Peers — baaki nodes ki URLs
        self.peers = []
        
        # Timer — agar leader ka heartbeat na aaye toh election shuru
        self.election_timeout = random.uniform(1.5, 3.0)
        self.last_heartbeat = time.time()
        
        # Background threads
        self.running = True
        self.lock = threading.Lock()
    
    def start(self):
        """Raft shuru karo — 2 background threads chalao"""
        # Thread 1: heartbeat check karta raha
        t1 = threading.Thread(target=self._election_timer, daemon=True)
        t1.start()
        # Thread 2: agar leader ho toh heartbeat bhejta raha
        t2 = threading.Thread(target=self._heartbeat_sender, daemon=True)
        t2.start()
        print(f"[{self.node_id}] Raft started as {self.state}")
    
    def _election_timer(self):
        """Follower ka kaam: leader ka wait karo, nahi aaya toh election shuru"""
        while self.running:
            time.sleep(0.1)
            with self.lock:
                if self.state == LEADER:
                    continue
                elapsed = time.time() - self.last_heartbeat
                if elapsed > self.election_timeout:
                    print(f"[{self.node_id}] Leader timeout! Starting election...")
                    self._start_election()
    
    def _start_election(self):
        """Election shuru karo — apne aap ko candidate banao aur votes mango"""
        self.state = CANDIDATE
        self.current_term += 1
        self.voted_for = self.node_id  # Pehle apne aap ko vote do
        self.last_heartbeat = time.time()
        self.election_timeout = random.uniform(1.5, 3.0)
        
        term = self.current_term
        votes = 1  # Apna vote
        
        print(f"[{self.node_id}] Requesting votes for term {term}...")
        
        for peer in self.peers:
            try:
                data = json.dumps({
                    "term": term,
                    "candidate_id": self.node_id
                }).encode()
                req = urllib.request.Request(
                    f"{peer}/raft/vote",
                    data=data,
                    headers={"Content-Type": "application/json"},
                    method="POST"
                )
                resp = json.loads(urllib.request.urlopen(req, timeout=1).read().decode())
                if resp.get("vote_granted"):
                    votes += 1
                    print(f"[{self.node_id}] Got vote from {peer}")
            except:
                pass
        
        # Majority votes mile? (2 out of 3)
        total = len(self.peers) + 1
        if votes > total / 2:
            self._become_leader()
        else:
            self.state = FOLLOWER
            print(f"[{self.node_id}] Election lost, back to follower")
    
    def _become_leader(self):
        """Leader ban gaye!"""
        self.state = LEADER
        self.leader_id = self.node_id
        print(f"[{self.node_id}] 👑 BECAME LEADER for term {self.current_term}")
    
    def _heartbeat_sender(self):
        """Leader ka kaam: har 500ms mein baaki nodes ko heartbeat bhejo"""
        while self.running:
            time.sleep(0.5)
            with self.lock:
                if self.state != LEADER:
                    continue
                term = self.current_term
            
            for peer in self.peers:
                try:
                    data = json.dumps({
                        "term": term,
                        "leader_id": self.node_id
                    }).encode()
                    req = urllib.request.Request(
                        f"{peer}/raft/heartbeat",
                        data=data,
                        headers={"Content-Type": "application/json"},
                        method="POST"
                    )
                    urllib.request.urlopen(req, timeout=1)
                except:
                    pass
    
    def receive_vote_request(self, term, candidate_id):
        """Kisi ne vote manga — dein ya na dein?"""
        with self.lock:
            # Purane term ko vote nahi dete
            if term < self.current_term:
                return {"vote_granted": False, "term": self.current_term}
            
            # Naya term aaya — follower ban jao
            if term > self.current_term:
                self.current_term = term
                self.state = FOLLOWER
                self.voted_for = None
            
            # Is term mein pehle vote nahi diya toh do
            if self.voted_for is None or self.voted_for == candidate_id:
                self.voted_for = candidate_id
                self.last_heartbeat = time.time()
                print(f"[{self.node_id}] Voted for {candidate_id}")
                return {"vote_granted": True, "term": self.current_term}
            
            return {"vote_granted": False, "term": self.current_term}
    
    def receive_heartbeat(self, term, leader_id):
        """Leader ka heartbeat aaya"""
        with self.lock:
            if term >= self.current_term:
                self.current_term = term
                self.state = FOLLOWER
                self.leader_id = leader_id
                self.last_heartbeat = time.time()
                self.voted_for = None
        return {"success": True}
    
    def get_status(self):
        """Node ka current status"""
        with self.lock:
            return {
                "node_id": self.node_id,
                "state": self.state,
                "term": self.current_term,
                "leader": self.leader_id
            }