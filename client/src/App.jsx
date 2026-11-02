import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { api, getToken, setToken } from "./api.js";
import { SUBJECTS, SUBJECT_SHORT, EXAMS, YEARS } from "./config.js";

/* ---------------- helpers ---------------- */

function timeAgo(dateStr) {
  const then = new Date(dateStr).getTime();
  const mins = Math.max(1, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return mins + "m ago";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h ago";
  const days = Math.floor(hrs / 24);
  return days + "d ago";
}

function metaLine(d) {
  if (d.authorName === "Team Dodomo") return "Team Dodomo · starter doubt · " + timeAgo(d.createdAt);
  const parts = [d.authorName];
  if (d.authorYear) parts.push(d.authorYear);
  parts.push(timeAgo(d.createdAt));
  return parts.join(" · ");
}

const CommentIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></svg>
);
const ShareIcon = (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" /><path d="M12 3v13" /><path d="m7 8 5-5 5 5" /></svg>
);

/* ---------------- small pieces ---------------- */

function Countdown() {
  const now = new Date();
  return (
    <section className="countdown">
      <h2>The countdown</h2>
      <div className="sub">Tentative dates — the strip updates when the university releases the real timetable.</div>
      <div className="cd-row">
        {EXAMS.map((ex) => {
          const d = new Date(ex.date + "T09:00:00");
          const days = Math.max(0, Math.ceil((d - now) / 86400000));
          return (
            <div className="cd-card" data-subject={ex.subject} key={ex.subject}>
              <div className="days">{days}<span> days</span></div>
              <div className="subj">{ex.subject}</div>
              <div className="date">{d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {d.toLocaleDateString("en-IN", { weekday: "long" })}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AnswerBlock({ doubt, answer, onVoteAnswer, onPin, canPin }) {
  return (
    <div className={"answer" + (answer.best ? " best" : "")}>
      <span className="a-avatar">{(answer.authorName || "S").trim().charAt(0).toUpperCase()}</span>
      <div className="a-main">
        <div className="a-head">
          <strong>{answer.authorName}</strong>
          {answer.senior && <span className="senior-badge">Senior</span>}
          {answer.best && <span className="best-label">Best answer</span>}
        </div>
        <p>{answer.text}</p>
        <div className="a-foot">
          <button className={"mini-vote" + (answer.myVote === 1 ? " voted" : "")} onClick={() => onVoteAnswer(doubt, answer)}>
            ▲ {answer.score} helpful
          </button>
          {answer.best && <span className="best-label">Best answer · pinned</span>}
          {!answer.best && canPin && (
            <button className="pin-btn" onClick={() => onPin(doubt, answer)}>Pin as best</button>
          )}
        </div>
      </div>
    </div>
  );
}

function DoubtCard({ doubt, open, onToggle, onVoteDoubt, onVoteAnswer, onPin, onAnswer, requireAuth }) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const cleared = !!doubt.bestAnswerId;

  async function submitAnswer() {
    if (!requireAuth()) return;
    if (draft.trim().length < 4) return;
    setSending(true);
    try {
      await onAnswer(doubt, draft.trim());
      setDraft("");
    } finally { setSending(false); }
  }

  return (
    <article className="doubt">
      <div className="doubt-top">
        <span className="subj-avatar" data-subject={doubt.subject}>{SUBJECT_SHORT[doubt.subject] || "?"}</span>
        <div className="doubt-head">
          <div className="dh-line"><strong>{doubt.subject}</strong><span className="unit-chip">{doubt.unit}</span></div>
          <div className="dh-meta">{metaLine(doubt)}</div>
        </div>
        {cleared && <span className="cleared">Cleared ✓</span>}
      </div>
      <h3>{doubt.title}</h3>
      {doubt.body && <p className="body">{doubt.body}</p>}
      <div className="doubt-actions">
        <span className={"pill vote-pill" + (doubt.myVote === 1 ? " voted" : "") + (doubt.myVote === -1 ? " downed" : "")}>
          <button className="v-arrow" data-vote={doubt.id} aria-label="Upvote" onClick={() => onVoteDoubt(doubt, 1)}>▲</button>
          <span className="v-count">{doubt.score}</span>
          <span className="v-sep"></span>
          <button className="v-arrow" data-down={doubt.id} aria-label="Downvote" onClick={() => onVoteDoubt(doubt, -1)}>▼</button>
        </span>
        <button className={"pill answers-btn" + (open ? " on" : "")} onClick={() => onToggle(doubt.id)}>
          {CommentIcon}<span>{doubt.answers.length}</span>
        </button>
        <button className="pill share-btn" onClick={() => {
          const url = window.location.href;
          if (navigator.share) { navigator.share({ title: "dodomo", text: doubt.title, url }).catch(() => {}); }
          else if (navigator.clipboard) { navigator.clipboard.writeText(url).catch(() => {}); }
        }}>{ShareIcon}<span>Share</span></button>
      </div>
      {open && (
        <div className="answers open">
          {doubt.answers.length === 0 && (
            <div className="no-answers">No answers yet. The first clear explanation gets pinned here.</div>
          )}
          {doubt.answers.map((a) => (
            <AnswerBlock key={a.id} doubt={doubt} answer={a}
              onVoteAnswer={onVoteAnswer} onPin={onPin} canPin={doubt.mine && !cleared} />
          ))}
          <div className="answer-form">
            <input type="text" placeholder="Add your answer..." value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitAnswer(); }} />
            <button className="btn-answer" disabled={sending} onClick={submitAnswer}>Answer</button>
          </div>
        </div>
      )}
    </article>
  );
}

/* ---------------- focus timer ---------------- */

const FOCUS_SECONDS = 25 * 60;

function FocusTimer({ toast }) {
  const [left, setLeft] = useState(FOCUS_SECONDS);
  const [running, setRunning] = useState(false);
  const [banked, setBanked] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dodomo:focusMinutes") || "0"); } catch (e) { return 0; }
  });
  const intRef = useRef(null);

  useEffect(() => {
    if (!running) return;
    intRef.current = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          clearInterval(intRef.current);
          setRunning(false);
          setBanked((b) => {
            const next = b + 25;
            try { localStorage.setItem("dodomo:focusMinutes", JSON.stringify(next)); } catch (e) {}
            return next;
          });
          toast("Session complete. 25 quiet minutes, banked.");
          return FOCUS_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(intRef.current);
  }, [running, toast]);

  const mm = String(Math.floor(left / 60)).padStart(2, "0");
  const ss = String(left % 60).padStart(2, "0");
  const h = Math.floor(banked / 60), m = banked % 60;

  return (
    <div className="timer-card" id="timerSec">
      <div className="t-label">Shared focus timer</div>
      <div className="timer-face">{mm}:{ss}</div>
      <div className="timer-bar"><div className="timer-fill" style={{ width: ((FOCUS_SECONDS - left) / FOCUS_SECONDS * 100) + "%" }}></div></div>
      <div className="timer-btns">
        <button className="btn-timer" onClick={() => setRunning((r) => !r)}>
          {running ? "Pause" : left < FOCUS_SECONDS ? "Resume" : "Start focusing"}
        </button>
        <button className="btn-ghost" onClick={() => { setRunning(false); setLeft(FOCUS_SECONDS); }}>Reset</button>
      </div>
      <div className="timer-total">Tonight you have focused <strong>{h > 0 ? h + "h " + m + "m" : m + " min"}</strong></div>
    </div>
  );
}

/* ---------------- identity ---------------- */

function IdentityModal({ onDone, onSkip }) {
  const [name, setName] = useState("");
  const [college, setCollege] = useState("Bundelkhand University");
  const [year, setYear] = useState("3rd yr");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (name.trim().length < 2) { setError("Your name, so people know who is asking."); return; }
    if (college.trim().length < 2) { setError("Your college — Dodomo is campus-first."); return; }
    setBusy(true);
    try {
      const data = await api.signIn({ name: name.trim(), college: college.trim(), year });
      setToken(data.token);
      onDone(data.user);
    } catch (err) {
      setError(err.message || "Could not sign you in. Try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <span className="wordmark">dodomo<span className="dot">.</span></span>
        <h2>Ten seconds, no password.</h2>
        <p className="sub">Just who you are and where you study. That is the whole signup — doubts and answers carry your name, like a classroom.</p>
        <label>Your name</label>
        <input type="text" placeholder="e.g. Aarav Sharma" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <label>College</label>
        <input type="text" placeholder="e.g. Bundelkhand University" value={college} onChange={(e) => setCollege(e.target.value)} maxLength={80} />
        <label>Year</label>
        <div className="year-row">
          {YEARS.map((y) => (
            <button key={y} className={"year-chip" + (year === y ? " active" : "")} onClick={() => setYear(y)}>{y}</button>
          ))}
        </div>
        <div className="form-error">{error}</div>
        <button className="btn-join-in" disabled={busy} onClick={submit}>{busy ? "One moment…" : "Enter Dodomo"}</button>
        <button className="skip" onClick={onSkip}>Just look around first</button>
      </div>
    </div>
  );
}

/* ---------------- the app ---------------- */

export default function App() {
  const [user, setUser] = useState(null);
  const [showAuth, setShowAuth] = useState(false);
  const [doubts, setDoubts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("All");
  const [openIds, setOpenIds] = useState({});
  const [stats, setStats] = useState({ cleared: 0, open: 0 });
  const [presence, setPresence] = useState({ rooms: {}, online: 0 });
  const [myRoom, setMyRoom] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  const socketRef = useRef(null);
  const toastTimer = useRef(null);

  // composer state
  const [cTitle, setCTitle] = useState("");
  const [cBody, setCBody] = useState("");
  const [cSubject, setCSubject] = useState(SUBJECTS[0]);
  const [cUnit, setCUnit] = useState("");
  const [posting, setPosting] = useState(false);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const requireAuth = useCallback(() => {
    if (user) return true;
    setShowAuth(true);
    toast("Sign in first — it takes ten seconds, no password.");
    return false;
  }, [user, toast]);

  const loadDoubts = useCallback(async (subject) => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await api.doubts(subject && subject !== "All" ? subject : null);
      setDoubts(data.doubts || []);
    } catch (err) {
      setLoadError("The wall did not load. The server may be waking up — give it a few seconds.");
    } finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const s = await api.stats();
      setStats({ cleared: s.cleared, open: s.open });
    } catch (e) { /* stats are decorative */ }
  }, []);

  // socket: presence
  useEffect(() => {
    const socket = io(api.base, { transports: ["websocket", "polling"] });
    socketRef.current = socket;
    socket.on("presence", (p) => setPresence(p));
    socket.on("connect", () => {
      const token = getToken();
      if (token) socket.emit("identify", token);
    });
    return () => socket.disconnect();
  }, []);

  // resume session
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    api.me().then((data) => {
      setUser(data.user);
      if (socketRef.current) socketRef.current.emit("identify", token);
    }).catch(() => setToken(""));
  }, []);

  useEffect(() => { loadDoubts(filter); }, [filter, loadDoubts]);
  useEffect(() => { loadStats(); }, [loadStats]);

  /* ----- actions ----- */

  async function handlePostDoubt() {
    if (!requireAuth()) return;
    if (cTitle.trim().length < 8) { toast("Write the doubt out a little more, so people can actually help."); return; }
    setPosting(true);
    try {
      const unit = cUnit.trim() ? (/^unit/i.test(cUnit.trim()) ? cUnit.trim() : "Unit " + cUnit.trim()) : "General";
      const data = await api.postDoubt({ subject: cSubject, unit, title: cTitle.trim(), body: cBody.trim() });
      setDoubts((prev) => [data.doubt, ...prev]);
      setOpenIds((prev) => ({ ...prev, [data.doubt.id]: true }));
      setCTitle(""); setCBody(""); setCUnit("");
      loadStats();
      toast("Doubt posted. The wall is watching it now.");
    } catch (err) { toast(err.message); } finally { setPosting(false); }
  }

  async function handleVoteDoubt(doubt, dir) {
    if (!requireAuth()) return;
    const next = doubt.myVote === dir ? 0 : dir;
    const delta = next - doubt.myVote;
    setDoubts((prev) => prev.map((d) => d.id === doubt.id ? { ...d, myVote: next, score: d.score + delta } : d));
    try {
      const r = await api.voteDoubt(doubt.id, next);
      setDoubts((prev) => prev.map((d) => d.id === doubt.id ? { ...d, score: r.score, myVote: r.myVote } : d));
    } catch (err) {
      setDoubts((prev) => prev.map((d) => d.id === doubt.id ? { ...d, myVote: doubt.myVote, score: doubt.score } : d));
      toast(err.message);
    }
  }

  async function handleVoteAnswer(doubt, answer) {
    if (!requireAuth()) return;
    const next = answer.myVote === 1 ? 0 : 1;
    const delta = next - answer.myVote;
    const patch = (prev) => prev.map((d) => d.id !== doubt.id ? d : {
      ...d, answers: d.answers.map((a) => a.id === answer.id ? { ...a, myVote: next, score: a.score + delta } : a)
    });
    setDoubts(patch);
    try {
      const r = await api.voteAnswer(answer.id, next);
      setDoubts((prev) => prev.map((d) => d.id !== doubt.id ? d : {
        ...d, answers: d.answers.map((a) => a.id === answer.id ? { ...a, score: r.score, myVote: r.myVote } : a)
      }));
    } catch (err) { setDoubts((prev) => prev.map((d) => d.id !== doubt.id ? d : {
      ...d, answers: d.answers.map((a) => a.id === answer.id ? { ...a, myVote: answer.myVote, score: answer.score } : a)
    })); toast(err.message); }
  }

  async function handleAnswer(doubt, text) {
    try {
      const data = await api.postAnswer(doubt.id, text);
      setDoubts((prev) => prev.map((d) => d.id === doubt.id ? { ...d, answers: [...d.answers, data.answer] } : d));
      loadStats();
      toast("Answer posted. If it is the clearest one, it gets pinned.");
    } catch (err) { toast(err.message); }
  }

  async function handlePin(doubt, answer) {
    try {
      await api.pinAnswer(doubt.id, answer.id);
      setDoubts((prev) => prev.map((d) => d.id !== doubt.id ? d : {
        ...d, bestAnswerId: answer.id,
        answers: d.answers.map((a) => ({ ...a, best: a.id === answer.id }))
      }));
      loadStats();
      toast("Best answer pinned. This doubt is cleared.");
    } catch (err) { toast(err.message); }
  }

  function toggleRoom(subject) {
    const socket = socketRef.current;
    if (myRoom === subject) {
      setMyRoom("");
      if (socket) socket.emit("leave-room");
      toast("You left the " + subject + " room. Quietly, of course.");
    } else {
      setMyRoom(subject);
      if (socket) socket.emit("join-room", subject);
      toast("You are sitting in the " + subject + " room.");
    }
  }

  function handleChip() {
    if (!user) { setShowAuth(true); return; }
    if (window.confirm("Sign out of Dodomo on this device?")) {
      setToken("");
      setUser(null);
      toast("Signed out. The wall will be here when you are back.");
    }
  }

  const firstExamDays = Math.max(0, Math.ceil((new Date(EXAMS[0].date + "T09:00:00") - new Date()) / 86400000));

  return (
    <>
      <header>
        <div className="header-in">
          <a className="wordmark" href="#">dodomo<span className="dot">.</span><small>exam season, together</small></a>
          <div className="header-right">
            <span className="season-chip">First paper in {firstExamDays} days</span>
            <button className="me-chip" onClick={handleChip} title={user ? "Tap to sign out" : "Tap to sign in"}>
              <span className="avatar">{user ? user.name.trim().charAt(0).toUpperCase() : "?"}</span>
              <span>{user ? user.name : "Sign in"}<small>{user ? user.college : "10 seconds, no password"}</small></span>
            </button>
          </div>
        </div>
      </header>

      <div className="wrap">
        <section className="hero">
          <h1>Ask the doubt. Clear it together.</h1>
          <p>Post the question that is stuck in your head, get it answered by students who just survived the same paper, and study in silent rooms with your whole subject batch. No noise, no spam, just the season handled together.</p>
          <div className="hero-stats">
            <div className="stat"><span className="live-dot"></span><strong>{presence.online}</strong>studying right now</div>
            <div className="stat"><strong>{stats.cleared}</strong>doubts cleared</div>
            <div className="stat"><strong>{stats.open}</strong>waiting for an answer</div>
          </div>
        </section>

        <Countdown />

        <div className="grid">
          <main>
            <div className="section-head">
              <h2>Doubt Wall</h2>
              <span className="note">Subject wise, unit wise. Best answer gets pinned by the one who asked.</span>
              <span className="moon-note">Night-before mode unlocks 48 hrs before a paper</span>
            </div>

            <div className="filters">
              {["All", ...SUBJECTS].map((s) => (
                <button key={s} className={"chip" + (filter === s ? " active" : "")} onClick={() => setFilter(s)}>{s}</button>
              ))}
            </div>

            <div className="composer" id="composerSec">
              <input className="title-input" type="text" placeholder="Your doubt, in one line — like you would ask a friend"
                value={cTitle} onChange={(e) => setCTitle(e.target.value)} maxLength={140} />
              <textarea placeholder="Add the details: what you tried, where it breaks, what the PYQ asked…" value={cBody}
                onChange={(e) => setCBody(e.target.value)} maxLength={1200}></textarea>
              <div className="composer-row">
                <select value={cSubject} onChange={(e) => setCSubject(e.target.value)}>
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input className="unit-input" type="text" placeholder="Unit (e.g. 3)" value={cUnit} onChange={(e) => setCUnit(e.target.value)} maxLength={24} />
                <button className="btn-post" disabled={posting} onClick={handlePostDoubt}>{posting ? "Posting…" : "Post doubt"}</button>
              </div>
            </div>

            {loading && <div className="loading-note">Loading the wall… the server may take a few seconds to wake up.</div>}
            {loadError && <div className="load-error">{loadError} <button onClick={() => loadDoubts(filter)}>Try again</button></div>}
            {!loading && !loadError && doubts.length === 0 && (
              <div className="empty-note">Nothing on the wall for this subject yet. Post the first doubt — someone is definitely stuck on the same thing.</div>
            )}
            {!loading && doubts.map((d) => (
              <DoubtCard key={d.id} doubt={d} open={!!openIds[d.id]}
                onToggle={(id) => setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }))}
                onVoteDoubt={handleVoteDoubt} onVoteAnswer={handleVoteAnswer}
                onPin={handlePin} onAnswer={handleAnswer} requireAuth={requireAuth} />
            ))}
          </main>

          <aside className="rail">
            <FocusTimer toast={toast} />
            <div className="section-head" id="roomsSec" style={{ marginBottom: 13 }}>
              <h2>Study Rooms</h2>
              <span className="note">One per subject</span>
            </div>
            {SUBJECTS.map((s) => (
              <div className="room" key={s}>
                <div className="r-info">
                  <div className="r-name">{s} Room</div>
                  <div className="r-count"><span className="live-dot"></span>{(presence.rooms[s] || 0)} studying · silent room</div>
                </div>
                <button className={"btn-join" + (myRoom === s ? " inside" : "")} onClick={() => toggleRoom(s)}>
                  {myRoom === s ? "Joined" : "Join"}
                </button>
              </div>
            ))}
            <p className="silence-note">Rooms are silent on purpose. No chat, no calls. Just the comfort of knowing your whole batch is awake and at it, same as you.</p>
          </aside>
        </div>

        <footer>
          <div className="f-in">
            <a className="wordmark" href="#">dodomo<span className="dot">.</span></a>
            <span>Built by a student, for the season every student dreads.</span>
            <span style={{ marginLeft: "auto" }}>dodomo.in</span>
          </div>
        </footer>
      </div>

      <nav className="bottom-nav">
        <a className="bn-item active" href="#"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg><span>Home</span></a>
        <a className="bn-item" href="#roomsSec"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.2 6.5-5.2s5.9 1.8 6.5 5.2" /><path d="M16 5.2a3.5 3.5 0 0 1 0 5.9M18.5 15.1c1.7.7 2.7 2.2 3 4.4" /></svg><span>Rooms</span></a>
        <a className="bn-item" href="#composerSec"><span className="bn-plus"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span><span>Post</span></a>
        <a className="bn-item" href="#timerSec"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg><span>Timer</span></a>
        <button className="bn-item" onClick={handleChip}><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-3.8 4-6 8-6s7.2 2.2 8 6" /></svg><span>You</span></button>
      </nav>

      {showAuth && (
        <IdentityModal
          onDone={(u) => {
            setUser(u);
            setShowAuth(false);
            const token = getToken();
            if (socketRef.current && token) socketRef.current.emit("identify", token);
            loadDoubts(filter);
            toast("You are in, " + u.name.split(" ")[0] + ". The wall is yours.");
          }}
          onSkip={() => setShowAuth(false)}
        />
      )}

      <div className={"toast" + (toastMsg ? " show" : "")}>{toastMsg}</div>
    </>
  );
}
