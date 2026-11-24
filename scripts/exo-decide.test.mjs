import { acceptAnswer, decideWith, fallbackDecision } from "../assets/exo-decide.js";

let failed = 0;
function check(name, ok) {
  if (!ok) { failed += 1; console.log("FAIL " + name); }
  else console.log("PASS " + name);
}

const choice = {
  source: "laya",
  answers: { route: { choice: "maps", probabilities: { maps: 0.8 }, answer_confidence: 0.8 } },
};
const score = {
  source: "laya",
  answers: { rank: { score: 2, probabilities: { inside: 0.7 }, answer_confidence: 0.7 } },
};
const noul = {
  source: "laya",
  answers: { spam: { noul: 0.1, answer_confidence: 0.6 } },
};
check("accept choice", acceptAnswer("choice", choice).answers.route.choice === "maps");
check("accept score", acceptAnswer("score", score).answers.rank.score === 2);
check("accept noul", acceptAnswer("noul", noul).answers.spam.noul === 0.1);
check("reject malformed", acceptAnswer("choice", { source: "laya", answers: { route: { choice: "nope" } } }) === null);
check("reject low confidence", acceptAnswer("choice", {
  source: "laya",
  answers: { route: { choice: "maps", probabilities: {}, answer_confidence: 0.2 } },
}) === null);

const spam = fallbackDecision("noul", { name: "spam" });
const place = fallbackDecision("noul", { name: "Harbor" });
check("fallback spam", spam.answers.spam.noul >= 0.8 && spam.source === "fallback");
check("fallback place", place.answers.spam.noul < 0.8);
check("fallback rank", fallbackDecision("score", { text: "SHIP INSIDE" }).answers.rank.score === 2);

const slow = decideWith("choice", { query: "maps" }, {
  url: "http://127.0.0.1:9/decide",
  ms: 40,
  fetch(_url, opts) {
    return new Promise((_resolve, reject) => {
      opts.signal.addEventListener("abort", () => reject(new Error("abort")));
    });
  },
});
const raced = await Promise.race([
  slow,
  new Promise((resolve) => setTimeout(() => resolve("LATE"), 800)),
]);
check("timeout fallback", raced && raced.source === "fallback");

if (failed) process.exit(1);
