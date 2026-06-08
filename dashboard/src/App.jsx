import { useState, useEffect, useRef } from "react";

const NODES = [
  { id: "node1", port: 5001 },
  { id: "node2", port: 5002 },
  { id: "node3", port: 5003 },
];

const BASE = (port) => `http://127.0.0.1:${port}`;

const CMD_LIST = [
  { key: "1", cmd: "python node.py node1 5001", desc: "Start Node 1 — port 5001", nodeId: "node1" },
  { key: "2", cmd: "python node.py node2 5002", desc: "Start Node 2 — port 5002", nodeId: "node2" },
  { key: "3", cmd: "python node.py node3 5003", desc: "Start Node 3 — port 5003", nodeId: "node3" },
  { key: "4", cmd: "pip install flask flask-cors", desc: "Install Python dependencies", nodeId: null },
  { key: "5", cmd: "cd dashboard && npm run dev", desc: "Start React dashboard", nodeId: null },
];

const makeNodeOutputs = (nodeId, port, peers, becomeLeader) => {
  const base = [
    `Initializing M.D.V.S node...`,
    `[${nodeId}] Loading configuration...`,
    `[${nodeId}] Peers: [${peers.map(p => `'http://127.0.0.1:${p}'`).join(', ')}]`,
    `[${nodeId}] Raft consensus module loaded`,
    `[${nodeId}] Raft started as follower`,
    `[${nodeId}] Starting on port ${port}...`,
    ` * Serving Flask app 'node'`,
    ` * Debug mode: off`,
    `WARNING: This is a development server. Do not use it in a production deployment.`,
    ` * Running on all addresses (0.0.0.0)`,
    ` * Running on http://127.0.0.1:${port}`,
    ` * Running on http://192.168.1.3:${port}`,
    `Press CTRL+C to quit`,
  ];

  if (becomeLeader) {
    return [
      ...base,
      `[${nodeId}] Leader timeout! Starting election...`,
      `[${nodeId}] Requesting votes for term 1...`,
      `[${nodeId}] Got vote from http://127.0.0.1:${peers[0]}`,
      `[${nodeId}] Got vote from http://127.0.0.1:${peers[1]}`,
      `[${nodeId}] BECAME LEADER for term 1`,
      `127.0.0.1 - - "POST /raft/heartbeat HTTP/1.1" 200 -`,
      `127.0.0.1 - - "POST /raft/heartbeat HTTP/1.1" 200 -`,
      `[${nodeId}] Sending heartbeat to peers...`,
      `127.0.0.1 - - "GET /health HTTP/1.1" 200 -`,
    ];
  } else {
    return [
      ...base,
      `[${nodeId}] Waiting for leader...`,
      `[${nodeId}] Received heartbeat from leader`,
      `[${nodeId}] Joined cluster as follower`,
      `127.0.0.1 - - "POST /raft/heartbeat HTTP/1.1" 200 -`,
      `127.0.0.1 - - "GET /health HTTP/1.1" 200 -`,
      `127.0.0.1 - - "GET /store HTTP/1.1" 200 -`,
    ];
  }
};

const FAKE_OUTPUTS = {
  "python node.py node1 5001": makeNodeOutputs("node1", 5001, [5002, 5003], true),
  "python node.py node2 5002": makeNodeOutputs("node2", 5002, [5001, 5003], false),
  "python node.py node3 5003": makeNodeOutputs("node3", 5003, [5001, 5002], false),
  "pip install flask flask-cors": [
    "Collecting flask",
    "  Downloading flask-3.1.3-py3-none-any.whl (102 kB)",
    "     ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 102.7/102.7 kB 1.2 MB/s",
    "Collecting flask-cors",
    "  Downloading flask_cors-6.0.2-py2.py3-none-any.whl (13 kB)",
    "Collecting click>=8.1.3",
    "Collecting Werkzeug>=3.1",
    "Installing collected packages: markupsafe, itsdangerous, click, Werkzeug, jinja2, flask, flask-cors",
    "Successfully installed flask-3.1.3 flask-cors-6.0.2",
  ],
  "cd dashboard && npm run dev": [
    "",
    "> dashboard@0.0.0 dev",
    "> vite",
    "",
    "  VITE v8.0.16  ready in 661 ms",
    "",
    "  ➜  Local:   http://localhost:5173/",
    "  ➜  Network: use --host to expose",
    "  ➜  press h + enter to show help",
  ],
};

const initTermLog = () => [
  { type: "system", text: "Windows PowerShell" },
  { type: "system", text: "Copyright (C) Microsoft Corporation. All rights reserved." },
  { type: "system", text: "" },
  { type: "system", text: "PS C:\\Users\\atifb\\OneDrive\\Desktop\\Project M.D.V.S>" },
];

export default function App() {
  const [nodes, setNodes] = useState({
    node1: { status: "offline", state: "unknown", term: 0, store: {} },
    node2: { status: "offline", state: "unknown", term: 0, store: {} },
    node3: { status: "offline", state: "unknown", term: 0, store: {} },
  });
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [getKey, setGetKey] = useState("");
  const [log, setLog] = useState([]);
  const [activeNode, setActiveNode] = useState("node1");
  const [chaosMode, setChaosMode] = useState(false);
  const [raftLog, setRaftLog] = useState([]);
  const [partition, setPartition] = useState(null);
  const [termOpen, setTermOpen] = useState(false);
  const [termHeight, setTermHeight] = useState(340);
  const [activeTermIdx, setActiveTermIdx] = useState(0);
  const [showTooltip, setShowTooltip] = useState(false);
  const [runningNodes, setRunningNodes] = useState({});
  const [dummyStore, setDummyStore] = useState({});

  const [terms, setTerms] = useState([
    { id: 1, log: initTermLog(), input: "", suggestion: "" },
    { id: 2, log: initTermLog(), input: "", suggestion: "" },
    { id: 3, log: initTermLog(), input: "", suggestion: "" },
  ]);

  const logRef = useRef(null);
  const chaosRef = useRef(null);
  const raftLogRef = useRef(null);
  const termRefs = useRef([null, null, null]);
  const inputRefs = useRef([null, null, null]);
  const isDragging = useRef(false);
  const startY = useRef(0);
  const startH = useRef(0);
  const ctrlCRef = useRef([false, false, false]);

  const addLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setLog(p => [...p.slice(-49), { msg, type, time }]);
  };

  const addRaftLog = (msg, type = "info") => {
    const time = new Date().toLocaleTimeString();
    setRaftLog(p => [...p.slice(-99), { msg, type, time }]);
  };

  const fetchAll = async () => {
    for (const n of NODES) {
      try {
        const [health, store] = await Promise.all([
          fetch(`${BASE(n.port)}/health`).then(r => r.json()),
          fetch(`${BASE(n.port)}/store`).then(r => r.json()),
        ]);
        setNodes(prev => {
          const prevNode = prev[n.id];
          const newState = health.raft?.state || "unknown";
          const newTerm = health.raft?.term || 0;
          if (prevNode.state !== newState) {
            if (newState === "leader") addRaftLog(`${n.id} elected as leader — term ${newTerm}`, "leader");
            else if (prevNode.state === "leader") addRaftLog(`${n.id} stepped down`, "warn");
          }
          if (prevNode.status === "offline" && newState !== "unknown")
            addRaftLog(`${n.id} rejoined the cluster`, "success");
          return { ...prev, [n.id]: { status: "online", state: newState, term: newTerm, store: store.store || {} } };
        });
      } catch {
        setNodes(prev => {
          if (prev[n.id].status === "online") addRaftLog(`${n.id} unreachable`, "error");
          return { ...prev, [n.id]: { ...prev[n.id], status: "offline", state: "unknown" } };
        });
      }
    }
  };

  useEffect(() => { fetchAll(); const i = setInterval(fetchAll, 1500); return () => clearInterval(i); }, []);
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [log]);
  useEffect(() => { if (raftLogRef.current) raftLogRef.current.scrollTop = raftLogRef.current.scrollHeight; }, [raftLog]);

  useEffect(() => {
    terms.forEach((_, i) => {
      if (termRefs.current[i]) termRefs.current[i].scrollTop = termRefs.current[i].scrollHeight;
    });
  }, [terms]);

  useEffect(() => {
    if (termOpen) setTimeout(() => inputRefs.current[activeTermIdx]?.focus(), 200);
  }, [termOpen, activeTermIdx]);

  // Space bar toggle
  useEffect(() => {
    const handler = (e) => {
      if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); setTermOpen(v => !v); }
      if (e.key >= "1" && e.key <= "5" && termOpen) {
        const found = CMD_LIST.find(c => c.key === e.key);
        if (found) {
          setTerms(prev => prev.map((t, i) => i === activeTermIdx ? { ...t, input: found.cmd } : t));
          inputRefs.current[activeTermIdx]?.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [termOpen, activeTermIdx]);

  // Drag resize
  const onDragStart = (e) => { isDragging.current = true; startY.current = e.clientY; startH.current = termHeight; document.body.style.userSelect = "none"; };
  useEffect(() => {
    const onMove = (e) => { if (!isDragging.current) return; const d = startY.current - e.clientY; setTermHeight(Math.max(160, Math.min(window.innerHeight - 120, startH.current + d))); };
    const onUp = () => { isDragging.current = false; document.body.style.userSelect = ""; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  useEffect(() => {
    if (chaosMode) {
      addRaftLog("chaos mode engaged", "warn");
      const run = async () => {
        const on = NODES.filter(n => nodes[n.id]?.status === "online");
        if (on.length > 1) {
          const t = on[Math.floor(Math.random() * on.length)];
          try { await fetch(`${BASE(t.port)}/chaos/crash`, { method: "POST" }); } catch {}
          addRaftLog(`chaos: terminated ${t.id}`, "error");
        }
      };
      chaosRef.current = setInterval(run, 4000);
    } else {
      if (chaosRef.current) { clearInterval(chaosRef.current); addRaftLog("chaos mode disengaged", "warn"); }
    }
    return () => { if (chaosRef.current) clearInterval(chaosRef.current); };
  }, [chaosMode]);

  const togglePartition = () => {
    if (partition) { setPartition(null); addRaftLog("network partition healed", "success"); }
    else { setPartition("node3"); addRaftLog("partition active — node3 isolated", "warn"); }
  };

  const handleSet = async () => {
    if (!key || !value) return;
    const isReal = nodes[activeNode].status === "online";
    const isDummy = runningNodes[activeNode];
    if (isReal) {
      const port = NODES.find(n => n.id === activeNode)?.port;
      try {
        await fetch(`${BASE(port)}/set`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value }) });
        addLog(`SET  ${key}  =  "${value}"  via ${activeNode}`, "success");
        addRaftLog(`write: ${key} = "${value}" — replicated`, "success");
        setKey(""); setValue("");
      } catch { addLog(`SET failed — ${activeNode} unreachable`, "error"); }
    } else if (isDummy) {
      setDummyStore(p => ({ ...p, [key]: value }));
      addLog(`SET  ${key}  =  "${value}"  via ${activeNode} [simulated]`, "success");
      addRaftLog(`write: ${key} = "${value}" — replicated to cluster [simulated]`, "success");
      setKey(""); setValue("");
    } else {
      addLog(`SET failed — ${activeNode} is offline. Start it first.`, "error");
    }
  };

  const handleGet = async () => {
    if (!getKey) return;
    const isReal = nodes[activeNode].status === "online";
    const isDummy = runningNodes[activeNode];
    if (isReal) {
      const port = NODES.find(n => n.id === activeNode)?.port;
      try {
        const res = await fetch(`${BASE(port)}/get/${getKey}`);
        const data = await res.json();
        if (data.error) addLog(`GET  ${getKey}  →  not found`, "error");
        else addLog(`GET  ${getKey}  →  "${data.value}"  [${activeNode}]`, "success");
      } catch { addLog(`GET failed`, "error"); }
    } else if (isDummy) {
      const val = dummyStore[getKey];
      if (!val) addLog(`GET  ${getKey}  →  not found [simulated]`, "error");
      else addLog(`GET  ${getKey}  →  "${val}"  [${activeNode} simulated]`, "success");
    } else {
      addLog(`GET failed — ${activeNode} is offline`, "error");
    }
  };

  const addTermLine = (idx, text, type = "output") => {
    setTerms(prev => prev.map((t, i) => i === idx ? { ...t, log: [...t.log.slice(-299), { type, text }] } : t));
  };

  const execCmd = async (idx, cmd) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    const isListed = CMD_LIST.some(c => c.cmd === trimmed);
    addTermLine(idx, `PS C:\\Users\\atifb\\OneDrive\\Desktop\\Project M.D.V.S> ${trimmed}`, "input");

    if (!isListed) {
      addTermLine(idx, `'${trimmed.split(" ")[0]}' : command not in project list.`, "error");
      addTermLine(idx, `to add this command, contact: atifbhe1504@email.com — available 24/7`, "error");
      addTermLine(idx, "", "output");
      setTerms(prev => prev.map((t, i) => i === idx ? { ...t, input: "" } : t));
      return;
    }

    const found = CMD_LIST.find(c => c.cmd === trimmed);
    const outputs = FAKE_OUTPUTS[trimmed] || [];
    ctrlCRef.current[idx] = false;

    setTerms(prev => prev.map((t, i) => i === idx ? { ...t, input: "" } : t));

    for (let i = 0; i < outputs.length; i++) {
      if (ctrlCRef.current[idx]) {
        addTermLine(idx, "^C", "error");
        addTermLine(idx, "", "output");
        addTermLine(idx, `PS C:\\Users\\atifb\\OneDrive\\Desktop\\Project M.D.V.S>`, "system");
        if (found.nodeId) setRunningNodes(prev => { const n = { ...prev }; delete n[found.nodeId]; return n; });
        return;
      }
      await new Promise(r => setTimeout(r, 80 + Math.random() * 60));
      const isWarn = outputs[i].includes("WARNING");
      addTermLine(idx, outputs[i], isWarn ? "warn" : "output");
    }

    if (found.nodeId) {
      setRunningNodes(prev => ({ ...prev, [found.nodeId]: true }));
      if (found.nodeId === "node1") addRaftLog(`node1 elected as leader — term 1 [simulated]`, "leader");
      else addRaftLog(`${found.nodeId} joined cluster as follower [simulated]`, "success");
    }
  };

  const handleKeyDown = (e, idx) => {
    const t = terms[idx];
    if (e.key === "Enter") { execCmd(idx, t.input); }
    else if (e.key === "Tab") {
      e.preventDefault();
      if (t.suggestion) setTerms(prev => prev.map((tt, i) => i === idx ? { ...tt, input: tt.suggestion } : tt));
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      ctrlCRef.current[idx] = true;
      addTermLine(idx, "^C", "error");
      addTermLine(idx, "", "output");
      addTermLine(idx, `PS C:\\Users\\atifb\\OneDrive\\Desktop\\Project M.D.V.S>`, "system");
      setTerms(prev => prev.map((tt, i) => i === idx ? { ...tt, input: "" } : tt));
    }
  };

  const handleInputChange = (idx, val) => {
    const match = CMD_LIST.find(c => c.cmd.startsWith(val) && c.cmd !== val);
    setTerms(prev => prev.map((t, i) => i === idx ? { ...t, input: val, suggestion: match ? match.cmd : "" } : t));
  };

  const leaderKey = Object.keys(nodes).find(k => nodes[k].state === "leader");
  const onlineCount = Object.values(nodes).filter(n => n.status === "online").length;

  const getStatus = (nodeId) => nodes[nodeId].status === "online" ? "online" : runningNodes[nodeId] ? "online" : "offline";
  const getState = (nodeId) => nodes[nodeId].status === "online" ? nodes[nodeId].state : runningNodes[nodeId] ? "follower" : "unknown";
  const getStore = (nodeId) => nodes[nodeId].status === "online" ? nodes[nodeId].store : runningNodes[nodeId] ? dummyStore : {};

  return (
    <div style={s.root}>
      <div style={s.grid} />

      {/* Terminal toggle button */}
      <div style={termOpen ? s.fixedClose : s.fixedOpen} onClick={() => setTermOpen(v => !v)}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: termOpen ? "#ff4466" : "#00e676", display: "inline-block", boxShadow: termOpen ? "0 0 8px #ff4466" : "0 0 8px #00e676" }} />
        {termOpen ? "close terminal" : "open terminal"}
        <span style={s.shortcutHint}>space</span>
      </div>

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
          {leaderKey && <div style={s.leaderPill}><span style={s.leaderDot} /><span>leader — {leaderKey}</span></div>}
          <button onClick={togglePartition} style={{ ...s.btn, ...(partition ? s.btnWarn : {}) }}>{partition ? "PARTITION ACTIVE" : "SIMULATE PARTITION"}</button>
          <button onClick={() => setChaosMode(!chaosMode)} style={{ ...s.btn, ...(chaosMode ? s.btnDanger : {}) }}>{chaosMode ? "CHAOS ACTIVE" : "CHAOS MODE"}</button>
        </div>
      </header>

      <main style={{ ...s.main, paddingBottom: termOpen ? termHeight + 24 : 40 }}>
        <section style={s.nodesRow}>
          {NODES.map(n => {
            const status = getStatus(n.id);
            const state = getState(n.id);
            const store = getStore(n.id);
            const isLeader = state === "leader";
            const isOnline = status === "online";
            const isPartitioned = partition === n.id;
            const isDummy = runningNodes[n.id] && nodes[n.id].status === "offline";
            return (
              <div key={n.id} style={{ ...s.card, ...(isLeader ? s.cardLeader : {}), ...(!isOnline ? s.cardOffline : {}), ...(isPartitioned ? s.cardPartition : {}) }}>
                {isPartitioned && <div style={s.partitionTag}>isolated</div>}
                {isDummy && <div style={s.dummyTag}>simulated</div>}
                <div style={s.cardTop}>
                  <span style={s.cardId}>{n.id}</span>
                  <span style={{ ...s.stateBadge, ...(isLeader ? s.stateBadgeLeader : {}), ...(isPartitioned ? s.stateBadgeWarn : {}) }}>
                    {isPartitioned ? "isolated" : isLeader ? "leader" : state}
                  </span>
                </div>
                <div style={s.cardPort}>:{n.port}</div>
                <div style={s.cardMeta}>
                  <div style={s.metaBlock}><span style={s.metaLabel}>status</span><span style={{ ...s.metaVal, color: isOnline ? "#00e676" : "#ff1744" }}>{isOnline ? "online" : "offline"}</span></div>
                  <div style={s.metaBlock}><span style={s.metaLabel}>term</span><span style={s.metaVal}>{nodes[n.id].term}</span></div>
                  <div style={s.metaBlock}><span style={s.metaLabel}>keys</span><span style={s.metaVal}>{Object.keys(store).length}</span></div>
                </div>
                <div style={s.storeBox}>
                  {Object.keys(store).length === 0 ? <span style={s.empty}>no data</span>
                    : Object.entries(store).slice(0, 5).map(([k, v]) => (
                      <div key={k} style={s.storeRow}><span style={s.storeK}>{k}</span><span style={s.storeV}>{v}</span></div>
                    ))}
                </div>
              </div>
            );
          })}
        </section>

        <section style={s.midRow}>
          <div style={s.panel}>
            <div style={s.panelHead}>operations<span style={s.panelSub}>data interface</span></div>
            <div style={s.nodeSelector}>{NODES.map(n => <button key={n.id} onClick={() => setActiveNode(n.id)} style={{ ...s.nodeBtn, ...(activeNode === n.id ? s.nodeBtnActive : {}) }}>{n.id}</button>)}</div>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>set</label>
              <div style={s.fieldRow}>
                <input style={s.input} placeholder="key" value={key} onChange={e => setKey(e.target.value)} />
                <input style={s.input} placeholder="value" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSet()} />
                <button style={s.actionBtn} onClick={handleSet}>SET</button>
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>get</label>
              <div style={s.fieldRow}>
                <input style={s.input} placeholder="key" value={getKey} onChange={e => setGetKey(e.target.value)} onKeyDown={e => e.key === "Enter" && handleGet()} />
                <button style={{ ...s.actionBtn, ...s.actionBtnBlue }} onClick={handleGet}>GET</button>
              </div>
            </div>
            <div style={s.fieldGroup}>
              <label style={s.fieldLabel}>operation log</label>
              <div style={s.logBox} ref={logRef}>
                {log.length === 0 ? <span style={s.empty}>no operations yet</span>
                  : log.map((l, i) => <div key={i} style={s.logRow}><span style={s.logTime}>{l.time}</span><span style={{ color: l.type === "error" ? "#ff5252" : l.type === "success" ? "#69f0ae" : "#546e7a" }}>{l.msg}</span></div>)}
              </div>
            </div>
          </div>
          <div style={s.panel}>
            <div style={s.panelHead}>raft consensus log<span style={s.panelSub}>live event stream</span></div>
            <div style={s.raftBox} ref={raftLogRef}>
              {raftLog.length === 0 ? <span style={s.empty}>awaiting cluster events</span>
                : raftLog.map((l, i) => <div key={i} style={s.raftRow}><span style={s.logTime}>{l.time}</span><span style={{ color: l.type === "error" ? "#ff5252" : l.type === "leader" ? "#00e676" : l.type === "success" ? "#69f0ae" : l.type === "warn" ? "#ffb300" : "#546e7a" }}>{l.msg}</span></div>)}
            </div>
          </div>
        </section>
      </main>

      {/* VS Code Terminal */}
      <div style={{ ...s.termContainer, height: termHeight, transform: termOpen ? "translateY(0)" : "translateY(100%)" }}>

        {/* Drag handle */}
        <div style={s.dragHandle} onMouseDown={onDragStart}><div style={s.dragBar} /></div>

        <div style={s.termBody}>
          {/* Left: CMD List */}
          <div style={s.cmdPanel}>
            <div style={s.cmdPanelTitle}>
              cmd list
              <div style={s.iIcon} onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)}>
                i
                {showTooltip && <div style={s.iTooltip}>demo terminal — output reflects actual system behavior. run same commands in real terminal to start nodes.</div>}
              </div>
            </div>
            <div style={s.cmdScroll}>
              {CMD_LIST.map(c => (
                <div key={c.key} style={s.cmdRow} onClick={() => { setTerms(prev => prev.map((t, i) => i === activeTermIdx ? { ...t, input: c.cmd } : t)); inputRefs.current[activeTermIdx]?.focus(); }}>
                  <span style={s.cmdKey}>{c.key}</span>
                  <div style={s.cmdInfo}>
                    <span style={s.cmdCmd}>{c.cmd}</span>
                    <span style={s.cmdDesc}>{c.desc}</span>
                  </div>
                </div>
              ))}
              <div style={s.ctrlCRow}>
                <span style={s.cmdKey}>^C</span>
                <div style={s.cmdInfo}>
                  <span style={s.cmdCmd}>Ctrl + C</span>
                  <span style={s.cmdDesc}>Stop running process</span>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Terminals */}
          <div style={s.termRight}>
            {/* Tab bar */}
            <div style={s.tabBar}>
              {terms.map((t, i) => (
                <div key={t.id} style={{ ...s.tab, ...(activeTermIdx === i ? s.tabActive : {}) }} onClick={() => setActiveTermIdx(i)}>
                  <span style={{ ...s.tabDot, background: activeTermIdx === i ? "#00e676" : "#2d3748" }} />
                  terminal {t.id}
                </div>
              ))}
              <div style={s.tabRight}>powershell</div>
            </div>

            {/* Terminal output */}
            {terms.map((t, i) => (
              <div key={t.id} style={{ ...s.termPane, display: activeTermIdx === i ? "flex" : "none" }}>
                <div style={s.termOutput} ref={el => termRefs.current[i] = el}>
                  {t.log.map((l, j) => (
                    <div key={j} style={{ ...s.termLine, color: l.type === "input" ? "#00e676" : l.type === "error" ? "#ff5252" : l.type === "warn" ? "#ffb300" : l.type === "system" ? "#546e7a" : "#90a4ae" }}>{l.text}</div>
                  ))}
                </div>
                <div style={s.termInputRow}>
                  <span style={s.termPs}>PS</span>
                  <div style={s.termInputWrap}>
                    {t.suggestion && <div style={s.suggestionGhost}>{t.suggestion}</div>}
                    <input
                      ref={el => inputRefs.current[i] = el}
                      style={s.termInput}
                      value={t.input}
                      onChange={e => handleInputChange(i, e.target.value)}
                      onKeyDown={e => handleKeyDown(e, i)}
                      placeholder="type command or press 1-5..."
                      spellCheck={false}
                      autoComplete="off"
                    />
                  </div>
                  <button style={s.termRunBtn} onClick={() => execCmd(i, t.input)}>RUN</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  root: { minHeight: "100vh", background: "#070b0f", color: "#cdd6e0", fontFamily: "'JetBrains Mono','Fira Code',monospace", position: "relative" },
  grid: { position: "fixed", inset: 0, backgroundImage: "linear-gradient(#ffffff06 1px,transparent 1px),linear-gradient(90deg,#ffffff06 1px,transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" },

  fixedOpen: { position: "fixed", top: 20, left: 20, zIndex: 300, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "linear-gradient(135deg,#0a1628,#0d2137)", border: "1px solid #1e4d8c", borderRadius: 4, color: "#4fc3f7", fontSize: 10, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase", boxShadow: "0 0 20px #4fc3f720" },
  fixedClose: { position: "fixed", top: 20, left: 20, zIndex: 300, display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 14px", background: "linear-gradient(135deg,#1a0810,#2d0818)", border: "1px solid #8c1e3a", borderRadius: 4, color: "#ff6b8a", fontSize: 10, letterSpacing: 2, cursor: "pointer", textTransform: "uppercase", boxShadow: "0 0 20px #ff446620" },
  shortcutHint: { fontSize: 8, color: "#2d3748", background: "#1a2030", border: "1px solid #2d3748", borderRadius: 2, padding: "1px 5px", letterSpacing: 1, marginLeft: 4 },

  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 40px", borderBottom: "1px solid #ffffff0d" },
  logo: { fontSize: 18, fontWeight: 700, letterSpacing: 8, color: "#fff", marginBottom: 4 },
  subtitle: { fontSize: 10, color: "#37474f", letterSpacing: 4, textTransform: "uppercase" },
  headerRight: { display: "flex", gap: 10, alignItems: "center" },
  stat: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: "1px solid #ffffff0d", borderRadius: 3, background: "#0d1117" },
  statDot: { width: 7, height: 7, borderRadius: "50%" },
  statText: { fontSize: 11, color: "#546e7a", letterSpacing: 1 },
  leaderPill: { display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: "1px solid #00e67640", borderRadius: 3, background: "#00e67612", fontSize: 11, color: "#00e676", letterSpacing: 1 },
  leaderDot: { width: 6, height: 6, borderRadius: "50%", background: "#00e676" },
  btn: { padding: "7px 16px", border: "1px solid #4a5568", borderRadius: 3, background: "#1a2030", color: "#a0aec0", fontSize: 10, cursor: "pointer", letterSpacing: 2, fontFamily: "inherit", textTransform: "uppercase" },
  btnWarn: { borderColor: "#d69e2e", color: "#f6c90e", background: "#2d2008" },
  btnDanger: { borderColor: "#e53e3e", color: "#fc8181", background: "#2d0808" },

  main: { padding: "32px 40px", display: "flex", flexDirection: "column", gap: 24, transition: "padding-bottom 0.3s" },
  nodesRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 20 },
  card: { background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 18, transition: "all 0.3s", position: "relative" },
  cardLeader: { border: "1px solid #00e67650", boxShadow: "0 0 40px #00e67615", background: "#0a1a0f" },
  cardOffline: { opacity: 0.25, filter: "grayscale(1)" },
  cardPartition: { border: "1px solid #d69e2e50", background: "#1a1500" },
  partitionTag: { position: "absolute", top: 10, right: 10, fontSize: 9, color: "#ffb300", background: "#ffb30015", padding: "2px 8px", borderRadius: 2, border: "1px solid #ffb30030", letterSpacing: 2 },
  dummyTag: { position: "absolute", top: 10, left: 10, fontSize: 9, color: "#63b3ed", background: "#63b3ed10", padding: "2px 8px", borderRadius: 2, border: "1px solid #63b3ed30", letterSpacing: 2 },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  cardId: { fontSize: 11, fontWeight: 700, letterSpacing: 4, color: "#a0aec0", textTransform: "uppercase" },
  stateBadge: { fontSize: 9, padding: "4px 12px", borderRadius: 2, border: "1px solid #4a5568", color: "#718096", letterSpacing: 2, textTransform: "uppercase" },
  stateBadgeLeader: { borderColor: "#00e67660", color: "#00e676", background: "#00e67615" },
  stateBadgeWarn: { borderColor: "#d69e2e60", color: "#f6c90e", background: "#d69e2e15" },
  cardPort: { fontSize: 38, fontWeight: 700, color: "#ffffff14", letterSpacing: -2, marginTop: -10, marginBottom: -8 },
  cardMeta: { display: "flex", gap: 24 },
  metaBlock: { display: "flex", flexDirection: "column", gap: 4 },
  metaLabel: { fontSize: 9, color: "#718096", letterSpacing: 2, textTransform: "uppercase" },
  metaVal: { fontSize: 13, fontWeight: 600, color: "#607d8b" },
  storeBox: { background: "#060a0d", borderRadius: 4, padding: "12px 14px", minHeight: 64, border: "1px solid #1a2030" },
  empty: { fontSize: 10, color: "#263238", letterSpacing: 2 },
  storeRow: { display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #1a2030" },
  storeK: { fontSize: 11, color: "#4fc3f7", letterSpacing: 1 },
  storeV: { fontSize: 11, color: "#a5d6a7" },
  midRow: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 },
  panel: { background: "#0d1117", border: "1px solid #2d3748", borderRadius: 8, padding: 24, display: "flex", flexDirection: "column", gap: 20 },
  panelHead: { fontSize: 10, letterSpacing: 4, color: "#37474f", textTransform: "uppercase", paddingBottom: 14, borderBottom: "1px solid #1a2030", display: "flex", justifyContent: "space-between", alignItems: "center" },
  panelSub: { fontSize: 9, color: "#1e272e", letterSpacing: 2 },
  nodeSelector: { display: "flex", gap: 8 },
  nodeBtn: { flex: 1, padding: "9px 0", background: "transparent", border: "1px solid #2d3748", borderRadius: 3, color: "#37474f", fontSize: 10, cursor: "pointer", letterSpacing: 3, fontFamily: "inherit", textTransform: "uppercase" },
  nodeBtnActive: { borderColor: "#00e67625", color: "#00e676", background: "#00e67606" },
  fieldGroup: { display: "flex", flexDirection: "column", gap: 8 },
  fieldLabel: { fontSize: 9, color: "#263238", letterSpacing: 3, textTransform: "uppercase" },
  fieldRow: { display: "flex", gap: 8 },
  input: { flex: 1, background: "#060a0d", border: "1px solid #2d3748", borderRadius: 3, padding: "9px 12px", color: "#90a4ae", fontSize: 11, fontFamily: "inherit", outline: "none" },
  actionBtn: { padding: "9px 18px", background: "#00e67610", border: "1px solid #00e67625", borderRadius: 3, color: "#00e676", fontSize: 10, cursor: "pointer", letterSpacing: 3, fontFamily: "inherit", textTransform: "uppercase" },
  actionBtnBlue: { background: "#4fc3f710", borderColor: "#4fc3f725", color: "#4fc3f7" },
  logBox: { overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, maxHeight: 130, background: "#060a0d", borderRadius: 4, padding: "10px 12px", border: "1px solid #1a2030" },
  raftBox: { flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, maxHeight: 300, background: "#060a0d", borderRadius: 4, padding: "12px 14px", border: "1px solid #1a2030" },
  logRow: { display: "flex", gap: 14, fontSize: 10 },
  raftRow: { display: "flex", gap: 14, fontSize: 10, paddingBottom: 6, borderBottom: "1px solid #1a2030" },
  logTime: { color: "#1e272e", flexShrink: 0, fontSize: 10 },

  termContainer: { position: "fixed", bottom: 0, left: 0, right: 0, background: "#0d1117", borderTop: "1px solid #2d3748", zIndex: 200, display: "flex", flexDirection: "column", transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)" },
  dragHandle: { height: 5, cursor: "ns-resize", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0d12", flexShrink: 0 },
  dragBar: { width: 40, height: 2, background: "#2d3748", borderRadius: 2 },

  termBody: { flex: 1, display: "flex", overflow: "hidden" },

  // CMD Panel
  cmdPanel: { width: 220, background: "#0a0d12", borderRight: "1px solid #1a2030", display: "flex", flexDirection: "column", flexShrink: 0 },
  cmdPanelTitle: { padding: "8px 12px", fontSize: 9, color: "#37474f", letterSpacing: 3, textTransform: "uppercase", borderBottom: "1px solid #1a2030", display: "flex", justifyContent: "space-between", alignItems: "center" },
  iIcon: { width: 14, height: 14, borderRadius: "50%", background: "#c0392b", border: "1px solid #e74c3c", color: "#fff", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", cursor: "default", position: "relative", fontStyle: "italic", fontWeight: 700 },
  iTooltip: { position: "absolute", right: 18, top: 0, background: "#1a2030", border: "1px solid #2d3748", borderRadius: 4, padding: "8px 10px", fontSize: 9, color: "#718096", zIndex: 999, letterSpacing: 1, width: 220, lineHeight: 1.7, boxShadow: "0 4px 20px #00000080", whiteSpace: "normal" },
  cmdScroll: { flex: 1, overflowY: "auto", padding: "8px 0" },
  cmdRow: { display: "flex", gap: 10, padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #0d1117", alignItems: "flex-start" },
  ctrlCRow: { display: "flex", gap: 10, padding: "8px 12px", alignItems: "flex-start", borderTop: "1px solid #1a2030", marginTop: 4 },
  cmdKey: { width: 18, height: 18, borderRadius: 2, background: "#1a2030", border: "1px solid #2d3748", color: "#63b3ed", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 },
  cmdInfo: { display: "flex", flexDirection: "column", gap: 2 },
  cmdCmd: { fontSize: 10, color: "#546e7a", letterSpacing: 0.3 },
  cmdDesc: { fontSize: 9, color: "#2d3748", letterSpacing: 0.5 },

  // Terminal tabs + pane
  termRight: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  tabBar: { display: "flex", alignItems: "center", background: "#0a0d12", borderBottom: "1px solid #1a2030", flexShrink: 0 },
  tab: { display: "flex", alignItems: "center", gap: 6, padding: "0 16px", height: 34, fontSize: 11, color: "#37474f", letterSpacing: 1, cursor: "pointer", borderRight: "1px solid #1a2030" },
  tabActive: { background: "#0d1117", color: "#a0aec0", borderBottom: "1px solid #0d1117" },
  tabDot: { width: 5, height: 5, borderRadius: "50%" },
  tabRight: { marginLeft: "auto", padding: "0 16px", fontSize: 9, color: "#1e272e", letterSpacing: 2, textTransform: "uppercase" },
  termPane: { flex: 1, flexDirection: "column", overflow: "hidden" },
  termOutput: { flex: 1, overflowY: "auto", padding: "10px 16px", display: "flex", flexDirection: "column", gap: 1, background: "#070b0f" },
  termLine: { fontSize: 11, lineHeight: 1.7, letterSpacing: 0.3, whiteSpace: "pre-wrap" },
  termInputRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 16px", borderTop: "1px solid #1a2030", background: "#0d1117", flexShrink: 0 },
  termPs: { color: "#63b3ed", fontSize: 11, fontWeight: 700, flexShrink: 0 },
  termInputWrap: { flex: 1, position: "relative" },
  suggestionGhost: { position: "absolute", left: 0, top: 0, color: "#2d3748", fontSize: 11, pointerEvents: "none", fontFamily: "inherit", whiteSpace: "nowrap", overflow: "hidden" },
  termInput: { width: "100%", background: "transparent", border: "none", outline: "none", color: "#00e676", fontSize: 11, fontFamily: "inherit", letterSpacing: 0.3, position: "relative", zIndex: 1 },
  termRunBtn: { padding: "4px 12px", background: "#00e67610", border: "1px solid #00e67625", borderRadius: 3, color: "#00e676", fontSize: 9, cursor: "pointer", letterSpacing: 2, fontFamily: "inherit", textTransform: "uppercase", flexShrink: 0 },
};