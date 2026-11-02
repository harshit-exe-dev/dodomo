const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000";

const TOKEN_KEY = "dodomo:token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch (e) { /* private mode etc. */ }
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["x-user-token"] = token;
  const res = await fetch(API_URL + path, { ...options, headers });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  base: API_URL,
  signIn: (payload) => request("/api/users", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/api/me"),
  doubts: (subject) => request("/api/doubts?sort=hot" + (subject ? "&subject=" + encodeURIComponent(subject) : "")),
  postDoubt: (payload) => request("/api/doubts", { method: "POST", body: JSON.stringify(payload) }),
  postAnswer: (doubtId, text) => request("/api/doubts/" + doubtId + "/answers", { method: "POST", body: JSON.stringify({ text }) }),
  pinAnswer: (doubtId, answerId) => request("/api/doubts/" + doubtId + "/pin", { method: "POST", body: JSON.stringify({ answerId }) }),
  voteDoubt: (id, value) => request("/api/doubts/" + id + "/vote", { method: "POST", body: JSON.stringify({ value }) }),
  voteAnswer: (id, value) => request("/api/answers/" + id + "/vote", { method: "POST", body: JSON.stringify({ value }) }),
  stats: () => request("/api/stats")
};
