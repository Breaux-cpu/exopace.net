/* Triggers fire only from real events the caller passes in. */
(function (root) {
  var KEY = "exopace-playbook";
  var rules = [];
  var log = [];

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "{}");
      rules = raw.rules || [];
      log = raw.log || [];
    } catch (err) {
      rules = [];
      log = [];
    }
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify({ rules: rules, log: log.slice(-40) })); } catch (err) {}
  }

  function add(rule) {
    rules.push({
      id: rule.id || "pb_" + Date.now().toString(36),
      trigger: rule.trigger,
      action: rule.action,
      cooldownMs: rule.cooldownMs || 60000,
      last: 0,
    });
    save();
  }

  function run(event, now) {
    load();
    var clock = now || Date.now();
    var fired = [];
    rules.forEach(function (rule) {
      if (rule.trigger !== event.trigger) return;
      if (clock - rule.last < rule.cooldownMs) {
        log.push({ t: clock, id: rule.id, outcome: "COOLDOWN" });
        return;
      }
      rule.last = clock;
      log.push({ t: clock, id: rule.id, trigger: event.trigger, action: rule.action, outcome: "QUEUED" });
      fired.push(rule);
    });
    save();
    return fired;
  }

  root.EXO = root.EXO || {};
  root.EXO.playbook = { add: add, run: run, load: load, rules: function () { return rules; }, log: function () { return log; } };
})(typeof globalThis !== "undefined" ? globalThis : window);
