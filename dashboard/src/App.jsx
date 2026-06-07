import { useState, useEffect, useRef } from "react";

const NODES = [
  { id: "node1", port: 5001 },
  { id: "node2", port: 5002 },
  { id: "node3", port: 5003 },
];

const BASE = (port) => `http://127.0.0.1:${port}`;

export default function App() {
  const [nodes, setNodes] = useState({
    node1: { status: "offline", state: "unknown", term: 0, leader: null, store: {} },
    node2: { status: "offline", state: "unknown", term: 0, leader: null, store: {} },
    node3: { status: "offline", state: "unknown", term: 0, leader: null, store: {} },
  });
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [getKey, setGetKey] = useState("");
  const [log, setLog] = useState([]);
  const [activeNode, setActiveNode] = useState("node1");
  const [chaosMode, setChaosMode] = useState(false);
  const [raftLog, setRaftLog] = useState([]);
  const [partition, setPartition] = useState(null);
  const logRef = useRef(null);
  const chaosRef = useRef(null);
  const raftLogRef = useRef(null);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog((prev) => [...prev.slice(-49), { msg, type, time }]);
  };

  const addRaftLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setRaftLog((prev) => [...prev.slice(-99), { msg, type, time }]);
  };

  const fetchAll = async () => {
    for (const n of NODES) {
      try {
        const [health, store] = await Promise.all([
          fetch(`${BASE(n.port)}/health`).then((r) => r.json()),
          fetch(`${BASE(n.port)}/store`).then((r) => r.json()),
        ]);
        setNodes((prev) => {
          const prevNode = prev[n.id];
          const newState = health.raft?.state || "unknown";
          const newTerm = health.raft?.term || 0;
          if (prevNode.state !== newState) {
            if (newState === "leader") addRaftLog(`${n.id} elected as leader — term ${newTerm}`, "leader");
            else if (prevNode.state === "leader") addRaftLog(`${n.id} stepped down`, "warn");
          }
          if (prevNode.status === "offline" && newState !== "unknown")
            addRaftLog(`${n.id} rejoined the cluster`, "success");
          return {
            ...prev,
            [n.id]: {
              status: "online",
              state: newState,
              term: newTerm,
              leader: health.raft?.leader || null,
              store: store.store || {},
            },
          };
        });
      } catch {
        setNodes((prev) => {
          if (prev[n.id].status === "online") addRaftLog(`${n.id} unreachable`, "error");
          return { ...prev, [n.id]: { ...prev[n.id], status: "offline", state: "unknown" } };
        });
      }
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 1500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (raftLogRef.current) raftLogRef.current.scrollTop = raftLogRef.current.scrollHeight;
  }, [raftLog]);

  useEffect(() => {
    if (chaosMode) {
      addRaftLog("chaos mode engaged", "warn");
      const run = async () => {
        const onlineNodes = NODES.filter((n) => nodes[n.id]?.status === "online");
        if (onlineNodes.length > 1) {
          const target = onlineNodes[Math.floor(Math.random() * onlineNodes.length)];
          try {
            await fetch(`${BASE(target.port)}/chaos/crash`, { method: "POST" });
          } catch {}
          addRaftLog(`chaos: terminated ${target.id}`, "error");
        }
      };
      chaosRef.current = setInterval(run, 4000);
    } else {
      if (chaosRef.current) { clearInterval(chaosRef.current); addRaftLog("chaos mode disengaged", "warn"); }
    }
    return () => { if (chaosRef.current) clearInterval(chaosRef.current); };
  }, [chaosMode]);

  const togglePartition = () => {
    if (partition) {
      setPartition(null);
      addRaftLog("network partition healed", "success");
    } else {
      setPartition("node3");
      addRaftLog("partition active — node3 isolated", "warn");
    }
  };

  const handleSet = async () => {
    if (!key || !value) return;
    const port = NODES.find((n) => n.id === activeNode)?.port;
    try {
      await fetch(`${BASE(port)}/set`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      addLog(`SET  ${key}  =  "${value}"  via ${activeNode}`, "success");
      addRaftLog(`write accepted: ${key} = "${value}" — replicated`, "success");
      setKey(""); setValue("");
    } catch {
      addLog(`SET failed — ${activeNode} unreachable`, "error");
    }
  };

  const handleGet = async () => {
    if (!getKey) return;
    const port = NODES.find((n) => n.id === activeNode)?.port;
    try {
      const res = await fetch(`${BASE(port)}/get/${getKey}`);
      const data = await res.json();
      if (data.error) addLog(`GET  ${getKey}  →  not found`, "error");
      else addLog(`GET  ${getKey}  →  "${data.value}"  [${activeNode}]`, "success");
    } catch {
      addLog(`GET failed — ${activeNode} unreachable`, "error");
    }
  };

  const leaderKey = Object.keys(nodes).find((k) => nodes[k].state === "leader");
  const onlineCount = Object.values(nodes).filter((n) => n.status === "online").length;

  return (
    <div style={s.root}>
      <div style={s.grid} />

      <header style={s.header}>
        <div>
          <div style={s.logo}>M.D.V.S</div>
          <div style={s.subtitle}>Mini Distributed Value Store</div>
        </div>
        <div style={s.headerRight}>
          <div style={s.stat}>
            <span style={{ ...s.statDot, background: onlineCount === 3 ? "#00e676" : onlineCount > 0 ? "#ffb300" : "#ff1744" }} />
            <span style={s.statText}>{onlineCount} / 3 nodes</span>
          </div>
          {leaderKey && (
            <div style={s.leaderPill}>
              <span style={s.leaderDot} />
              <span>leader — {leaderKey}</span>
            </div>
          )}
          <button onClick={togglePartition} style={{ ...s.btn, ...(partition ? s.btnWarn : {}) }}>
            {partition ? "PARTITION ACTIVE" : "SIMULATE PARTITION"}
          </button>
          <button onClick={() => setChaosMode(!chaosMode)} style={{ ...s.btn, ...(chaosMode ? s.btnDanger : {}) }}>
            {chaosMode ? "CHAOS ACTIVE" : "CHAOS MODE"}
          </button>
        </div>
      </header>

      <main style={s.main}>

        {/* Node Cards */}
        <section style={s.nodesRow}>
          {NODES.map((n) => {
            const nd = nodes[n.id];
            const isLeader = nd.state === "leader";
            const isOnline = nd.status === "online";
            const isPartitioned = partition === n.id;
            return (
              <div key={n.id} style={{
                ...s.card,
                ...(isLeader ? s.cardLeader : {}),
                ...(!isOnline ? s.cardOffline : {}),
                ...(isPartitioned ? s.cardPartition : {}),
              }}>
                <div style={s.cardTop}>
                  <span style={s.cardId}>{n.id}</span>
                  <span style={{
                    ...s.badge,
                    ...(isLeader ? s.badgeLeader : {}),
                    ...(isPartitioned ? s.badgeWarn : {}),
                  }}>
                    {isPartitioned ? "isolated" : isLeader ? "leader" : nd.state}
                  </span>
                </div>

                <div style={s.cardPort}>:{n.port}</div>

                <div style={s.cardMeta}>
                  <div style={s.metaBlock}>
                    <span style={s.metaLabel}>status</span>
                    <span style={{ ...s.metaVal, color: isOnline ? "#00e676" : "#ff1744" }}>
                      {isOnline ? "online" : "offline"}
                    </span>
                  </div>
                  <div style={s.metaBlock}>
                    <span style={s.metaLabel}>term</span>
                    <span style={s.metaVal}>{nd.term}</span>
                  </div>
                  <div style={s.metaBlock}>
                    <span style={s.metaLabel}>keys</span>
                    <span style={s.metaVal}>{Object.keys(nd.store).length}</span>
                  </div>
                </div>

                <div style={s.storeBox}>
                  {Object.keys(nd.store).length === 0
                    ? <span style={s.empty}>no data</span>
                    : Object.entries(nd.store).slice(0, 5).map(([k, v]) => (
                      <div key={k} style={s.storeRow}>
                        <span style={s.storeK}>{k}</span>
                        <span style={s.storeV}>{v}</span>
                      </div>
                    ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* Bottom */}
        <section style={s.bottom}>

          {/* Operations */}
          <div style={s.panel}>
            <div style={s.panelHead}>operations</div>

            <div style={s.nodeSelector}>
              {NODES.map((n) => (
                <button key={n.id} onClick={() => setActiveNode(n.id)}
                  style={{ ...s.nodeBtn, ...(activeNode === n.id ? s.nodeBtnActive : {}) }}>
                  {n.id}
                </button>
              ))}
            </div>

            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>set</label>
              <div style={s.fieldRow}>
                <input style={s.input} placeholder="key" value={key} onChange={(e) => setKey(e.target.value)} />
                <input style={s.input} placeholder="value" value={value} onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSet()} />
                <button style={s.actionBtn} onClick={handleSet}>SET</button>
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>get</label>
              <div style={s.fieldRow}>
                <input style={s.input} placeholder="key" value={getKey} onChange={(e) => setGetKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleGet()} />
                <button style={{ ...s.actionBtn, ...s.actionBtnBlue }} onClick={handleGet}>GET</button>
              </div>
            </div>

            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>operation log</label>
              <div style={s.logBox} ref={logRef}>
                {log.length === 0
                  ? <span style={s.empty}>no operations yet</span>
                  : log.map((l, i) => (
                    <div key={i} style={s.logRow}>
                      <span style={s.logTime}>{l.time}</span>
                      <span style={{ color: l.type === "error" ? "#ff5252" : l.type === "success" ? "#69f0ae" : "#546e7a" }}>
                        {l.msg}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>

          {/* Raft Event Log */}
          <div style={s.panel}>
            <div style={s.panelHead}>
              raft consensus log
              <span style={s.panelSub}>live event stream</span>
            </div>
            <div style={s.raftBox} ref={raftLogRef}>
              {raftLog.length === 0
                ? <span style={s.empty}>awaiting cluster events</span>
                : raftLog.map((l, i) => (
                  <div key={i} style={s.raftRow}>
                    <span style={s.logTime}>{l.time}</span>
                    <span style={{
                      color: l.type === "error" ? "#ff5252"
                        : l.type === "leader" ? "#00e676"
                        : l.type === "success" ? "#69f0ae"
                        : l.type === "warn" ? "#ffb300"
                        : "#546e7a"
                    }}>
                      {l.msg}
                    </span>
                  </div>
                ))}
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#060910", color: "#c9d4e0", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", position: "relative" },
  grid: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(#ffffff07 1px, transparent 1px), linear-gradient(90deg, #ffffff07 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 40px", borderBottom: "1px solid #ffffff15" },
  logo: { fontSize: 18, fontWeight: 700, letterSpacing: 8, color: "#ffffff", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#4a5568", letterSpacing: 4, textTransform: "uppercase" },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  stat: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: "1px solid #ffffff18", borderRadius: 4, background: "#0d1117" },
  statDot: { width: 7, height: 7, borderRadius: "50%" },
  statText: { fontSize: 11, color: "#718096", letterSpacing: 1 },
  leaderPill: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: "1px solid #00e67640", borderRadius: 4, background: "#00e67612", fontSize: 11, color: "#00e676", letterSpacing: 1 },
  leaderDot: { width: 6, height: 6, borderRadius: "50%", background: "#00e676" },
  btn: { padding: "7px 16px", border: "1px solid #4a5568", borderRadius: 4, background: "#1a2030", color: "#a0aec0", fontSize: 10, cursor: "pointer", letterSpacing: 2, fontFamily: "inherit", textTransform: "uppercase", transition: "all 0.2s" },
  btnWarn: { borderColor: "#d69e2e", color: "#f6c90e", background: "#2d2008" },
  btnDanger: { borderColor: "#e53e3e", color: "#fc8181", background: "#2d0808" },

  main: { padding: "32px 40px", display: "flex", flexDirection: "column", gap: 24 },

  nodesRow: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 },
  card: { background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, padding: "24px", display: "flex", flexDirection: "column", gap: 18, transition: "all 0.3s" },
  cardLeader: { border: "1px solid #00e67650", boxShadow: "0 0 40px #00e67615", background: "#0a1a0f" },
  cardOffline: { opacity: 0.25, filter: "grayscale(1)" },
  cardPartition: { border: "1px solid #d69e2e50", boxShadow: "0 0 30px #d69e2e10", background: "#1a1500" },

  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardId: { fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#a0aec0", textTransform: "uppercase" },
  badge: { fontSize: 9, padding: "4px 12px", borderRadius: 3, border: "1px solid #4a5568", color: "#718096", letterSpacing: 2, textTransform: "uppercase" },
  badgeLeader: { borderColor: "#00e67660", color: "#00e676", background: "#00e67615" },
  badgeWarn: { borderColor: "#d69e2e60", color: "#f6c90e", background: "#d69e2e15" },

  cardPort: { fontSize: 38, fontWeight: 700, color: "#ffffff14", letterSpacing: -2, marginTop: -10, marginBottom: -8 },

  cardMeta: { display: "flex", gap: 24 },
  metaBlock: { display: "flex", flexDirection: "column", gap: 4 },
  metaLabel: { fontSize: 9, color: "#718096", letterSpacing: 2, textTransform: "uppercase" },
  metaVal: { fontSize: 13, fontWeight: 600, color: "#718096" },

  storeBox: { background: "#080c12", borderRadius: 4, padding: "12px 14px", minHeight: 64, border: "1px solid #1a2030" },
  empty: { fontSize: 10, color: "#2d3748", letterSpacing: 2 },
  storeRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1a2030" },
  storeK: { fontSize: 11, color: "#63b3ed", letterSpacing: 1 },
  storeV: { fontSize: 11, color: "#68d391" },

  bottom: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  panel: { background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, padding: "24px", display: "flex", flexDirection: "column", gap: 20 },
  panelHead: { fontSize: 10, letterSpacing: 4, color: "#4a5568", textTransform: "uppercase", paddingBottom: 14, borderBottom: "1px solid #1a2030", display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelSub: { fontSize: 9, color: "#2d3748", letterSpacing: 2 },

  nodeSelector: { display: "flex", gap: 8 },
  nodeBtn: { flex: 1, padding: "9px 0", background: "#0d1117", border: "1px solid #2d3748", borderRadius: 4, color: "#4a5568", fontSize: 10, cursor: "pointer", letterSpacing: 3, fontFamily: "inherit", textTransform: "uppercase", transition: "all 0.2s" },
  nodeBtnActive: { borderColor: "#00e67650", color: "#00e676", background: "#00e67610" },

  fieldGroup: { display: "flex", flexDirection: "column", gap: 8 },
  fieldLabel: { fontSize: 9, color: "#2d3748", letterSpacing: 3, textTransform: "uppercase" },
  fieldRow: { display: "flex", gap: 8 },
  input: { flex: 1, background: "#080c12", border: "1px solid #2d3748", borderRadius: 4, padding: "9px 12px", color: "#a0aec0", fontSize: 11, fontFamily: "inherit", outline: "none" },
  actionBtn: { padding: "9px 18px", background: "#00e67618", border: "1px solid #00e67650", borderRadius: 4, color: "#00e676", fontSize: 10, cursor: "pointer", letterSpacing: 3, fontFamily: "inherit", textTransform: "uppercase" },
  actionBtnBlue: { background: "#63b3ed18", borderColor: "#63b3ed50", color: "#63b3ed" },

  logBox: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, maxHeight: 130, background: "#080c12", borderRadius: 4, padding: "10px 12px", border: "1px solid #1a2030" },
  raftBox: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, background: "#080c12", borderRadius: 4, padding: "12px 14px", border: "1px solid #1a2030" },
  logRow: { display: "flex", gap: 14, fontSize: 10 },
  raftRow: { display: "flex", gap: 14, fontSize: 10, paddingBottom: 6, borderBottom: "1px solid #1a2030" },
  logTime: { color: "#2d3748", flexShrink: 0, fontSize: 10 },
};