const express = require("express");
const crypto = require("crypto");
const { User, Doubt, Answer, Vote } = require("./models");

const SUBJECTS = ["Compiler Design", "PPL", "Web Technology", "Computer Graphics", "IE&M"];
const YEARS = ["1st yr", "2nd yr", "3rd yr", "4th yr"];

const router = express.Router();

function clean(str, max) {
  return String(str || "").trim().slice(0, max);
}

// small in-memory throttle for write endpoints, per IP
const hits = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  const key = req.ip || "unknown";
  const list = (hits.get(key) || []).filter((t) => now - t < 60000);
  if (list.length >= 40) {
    return res.status(429).json({ error: "Too many requests, give it a minute." });
  }
  list.push(now);
  hits.set(key, list);
  next();
}

async function auth(req, res, next) {
  const token = req.header("x-user-token");
  if (!token) return res.status(401).json({ error: "Not signed in." });
  const user = await User.findOne({ token });
  if (!user) return res.status(401).json({ error: "Session expired, sign in again." });
  req.user = user;
  next();
}

async function optionalAuth(req, res, next) {
  const token = req.header("x-user-token");
  if (token) {
    const user = await User.findOne({ token });
    if (user) req.user = user;
  }
  next();
}

function publicUser(u) {
  return { id: u._id, name: u.name, college: u.college, year: u.year };
}

// ---------- identity ----------
// No passwords, no email. A name, a college, a year — and a random token
// the browser keeps. Light on purpose: the wall matters, not the signup.
router.post("/users", throttle, async (req, res) => {
  try {
    const { token, name, college, year } = req.body || {};
    if (token) {
      const existing = await User.findOne({ token: String(token) });
      if (existing) return res.json({ user: publicUser(existing), token: existing.token });
    }
    const cleanName = clean(name, 40);
    const cleanCollege = clean(college, 80);
    if (cleanName.length < 2) return res.status(400).json({ error: "Tell us your name." });
    if (cleanCollege.length < 2) return res.status(400).json({ error: "Tell us your college." });
    const user = await User.create({
      name: cleanName,
      college: cleanCollege,
      year: YEARS.includes(year) ? year : "3rd yr",
      token: crypto.randomBytes(24).toString("hex")
    });
    res.json({ user: publicUser(user), token: user.token });
  } catch (err) {
    res.status(500).json({ error: "Could not sign you in." });
  }
});

router.get("/me", auth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

// ---------- doubts ----------

async function serializeDoubts(doubts, me) {
  const ids = doubts.map((d) => d._id);
  const answers = await Answer.find({ doubt: { $in: ids } }).sort({ createdAt: 1 }).lean();
  const myVotes = {};
  if (me) {
    const votes = await Vote.find({ user: me._id, target: { $in: ids.concat(answers.map((a) => a._id)) } }).lean();
    votes.forEach((v) => { myVotes[String(v.target)] = v.value; });
  }
  const byDoubt = {};
  answers.forEach((a) => {
    const key = String(a.doubt);
    if (!byDoubt[key]) byDoubt[key] = [];
    byDoubt[key].push({
      id: a._id,
      authorName: a.authorName,
      senior: a.senior,
      text: a.text,
      score: a.score,
      best: false,
      myVote: myVotes[String(a._id)] || 0,
      createdAt: a.createdAt
    });
  });
  return doubts.map((d) => {
    const list = (byDoubt[String(d._id)] || []).map((a) => ({
      ...a,
      best: d.bestAnswerId ? String(d.bestAnswerId) === String(a.id) : false
    }));
    list.sort((x, y) => (x.best ? -1 : y.best ? 1 : y.score - x.score));
    return {
      id: d._id,
      subject: d.subject,
      unit: d.unit,
      title: d.title,
      body: d.body,
      authorName: d.authorName,
      authorYear: d.authorYear,
      mine: me ? String(d.author) === String(me._id) : false,
      score: d.score,
      myVote: myVotes[String(d._id)] || 0,
      bestAnswerId: d.bestAnswerId,
      answers: list,
      createdAt: d.createdAt
    };
  });
}

router.get("/doubts", optionalAuth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.subject && SUBJECTS.includes(req.query.subject)) {
      filter.subject = req.query.subject;
    }
    const doubts = await Doubt.find(filter).lean();
    doubts.sort((a, b) => {
      if (req.query.sort === "new") return new Date(b.createdAt) - new Date(a.createdAt);
      // hot: score first, then recent
      return b.score - a.score || new Date(b.createdAt) - new Date(a.createdAt);
    });
    res.json({ doubts: await serializeDoubts(doubts, req.user || null) });
  } catch (err) {
    res.status(500).json({ error: "Could not load the wall." });
  }
});

router.post("/doubts", throttle, auth, async (req, res) => {
  try {
    const { subject, unit, title, body } = req.body || {};
    if (!SUBJECTS.includes(subject)) return res.status(400).json({ error: "Pick a subject." });
    const cleanTitle = clean(title, 140);
    if (cleanTitle.length < 8) return res.status(400).json({ error: "Write the doubt out a little more." });
    const doubt = await Doubt.create({
      author: req.user._id,
      authorName: req.user.name,
      authorYear: req.user.year,
      subject,
      unit: clean(unit, 24) || "General",
      title: cleanTitle,
      body: clean(body, 1200)
    });
    const [out] = await serializeDoubts([doubt.toObject()], req.user);
    res.json({ doubt: out });
  } catch (err) {
    res.status(500).json({ error: "Could not post your doubt." });
  }
});

router.post("/doubts/:id/answers", throttle, auth, async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) return res.status(404).json({ error: "Doubt not found." });
    const text = clean((req.body || {}).text, 1200);
    if (text.length < 4) return res.status(400).json({ error: "A little more than that — answers here are meant to teach." });
    const answer = await Answer.create({
      doubt: doubt._id,
      author: req.user._id,
      authorName: req.user.name,
      senior: req.user.year === "4th yr",
      text
    });
    doubt.answerCount += 1;
    await doubt.save();
    res.json({
      answer: {
        id: answer._id, authorName: answer.authorName, senior: answer.senior,
        text: answer.text, score: 0, best: false, myVote: 0, createdAt: answer.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Could not post your answer." });
  }
});

// pin the best answer — only the person who asked gets to decide
router.post("/doubts/:id/pin", throttle, auth, async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id);
    if (!doubt) return res.status(404).json({ error: "Doubt not found." });
    if (String(doubt.author) !== String(req.user._id)) {
      return res.status(403).json({ error: "Only the person who asked can pin the best answer." });
    }
    const answer = await Answer.findById((req.body || {}).answerId);
    if (!answer || String(answer.doubt) !== String(doubt._id)) {
      return res.status(400).json({ error: "That answer does not belong to this doubt." });
    }
    doubt.bestAnswerId = answer._id;
    await doubt.save();
    res.json({ ok: true, bestAnswerId: doubt.bestAnswerId });
  } catch (err) {
    res.status(500).json({ error: "Could not pin the answer." });
  }
});

// ---------- votes ----------

async function castVote(req, res, targetType) {
  try {
    const value = [1, -1, 0].includes((req.body || {}).value) ? req.body.value : null;
    if (value === null) return res.status(400).json({ error: "Bad vote." });
    const Model = targetType === "doubt" ? Doubt : Answer;
    const target = await Model.findById(req.params.id);
    if (!target) return res.status(404).json({ error: "Not found." });

    const existing = await Vote.findOne({ user: req.user._id, targetType, target: target._id });
    let delta = 0;
    if (existing && value === 0) {
      delta = -existing.value;
      await existing.deleteOne();
    } else if (existing && existing.value !== value) {
      delta = value - existing.value;
      existing.value = value;
      await existing.save();
    } else if (!existing && value !== 0) {
      delta = value;
      await Vote.create({ user: req.user._id, targetType, target: target._id, value });
    }
    if (delta !== 0) {
      target.score += delta;
      await target.save();
    }
    res.json({ ok: true, score: target.score, myVote: value });
  } catch (err) {
    res.status(500).json({ error: "Vote did not go through." });
  }
}

router.post("/doubts/:id/vote", throttle, auth, (req, res) => castVote(req, res, "doubt"));
router.post("/answers/:id/vote", throttle, auth, (req, res) => castVote(req, res, "answer"));

// ---------- stats ----------

router.get("/stats", async (req, res) => {
  try {
    const [total, cleared, open] = await Promise.all([
      Doubt.countDocuments(),
      Doubt.countDocuments({ bestAnswerId: { $ne: null } }),
      Doubt.countDocuments({ answerCount: 0 })
    ]);
    res.json({ total, cleared, open });
  } catch (err) {
    res.status(500).json({ error: "Stats unavailable." });
  }
});

router.get("/health", (req, res) => res.json({ ok: true }));

module.exports = { router, SUBJECTS };
