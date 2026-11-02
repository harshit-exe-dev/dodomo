const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 40 },
  college: { type: String, required: true, trim: true, maxlength: 80 },
  year: { type: String, enum: ["1st yr", "2nd yr", "3rd yr", "4th yr"], default: "3rd yr" },
  token: { type: String, required: true, unique: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

const doubtSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, required: true },
  authorYear: { type: String, default: "" },
  subject: { type: String, required: true, index: true },
  unit: { type: String, default: "General", maxlength: 24 },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  body: { type: String, default: "", trim: true, maxlength: 1200 },
  score: { type: Number, default: 0 },
  answerCount: { type: Number, default: 0 },
  bestAnswerId: { type: mongoose.Schema.Types.ObjectId, ref: "Answer", default: null },
  createdAt: { type: Date, default: Date.now, index: true }
});

const answerSchema = new mongoose.Schema({
  doubt: { type: mongoose.Schema.Types.ObjectId, ref: "Doubt", required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  authorName: { type: String, required: true },
  senior: { type: Boolean, default: false },
  text: { type: String, required: true, trim: true, maxlength: 1200 },
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const voteSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  targetType: { type: String, enum: ["doubt", "answer"], required: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true },
  value: { type: Number, enum: [1, -1], required: true }
});
voteSchema.index({ user: 1, targetType: 1, target: 1 }, { unique: true });

module.exports = {
  User: mongoose.model("User", userSchema),
  Doubt: mongoose.model("Doubt", doubtSchema),
  Answer: mongoose.model("Answer", answerSchema),
  Vote: mongoose.model("Vote", voteSchema)
};
