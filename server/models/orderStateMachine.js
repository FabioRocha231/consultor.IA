const TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready", "cancelled"],
  ready: ["delivered"],
  delivered: [],
  cancelled: [],
};

function canTransition(fromStatus, toStatus) {
  return (TRANSITIONS[fromStatus] || []).includes(toStatus);
}

module.exports = { canTransition, TRANSITIONS };
