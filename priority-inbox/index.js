const axios = require("axios");
const { Log } = require("../logging-middleware");

const TYPE_WEIGHT = { Placement: 3, Result: 2, Event: 1 };

function computeScore(notification) {
  const typeWeight = TYPE_WEIGHT[notification.Type] || 0;
  const timestamp = new Date(notification.Timestamp).getTime();
  return typeWeight * 1e15 + timestamp;
}

class MinHeap {
  constructor(capacity) {
    this.capacity = capacity;
    this.items = [];
  }
  push(item) {
    if (this.items.length < this.capacity) {
      this.items.push(item);
      this.items.sort((a, b) => a.score - b.score);
    } else if (item.score > this.items[0].score) {
      this.items[0] = item;
      this.items.sort((a, b) => a.score - b.score);
    }
  }
  getTopN() {
    return [...this.items].sort((a, b) => b.score - a.score);
  }
}

async function fetchTopNNotifications(n = 10) {
  try {
    const res = await axios.get(
      "http://4.224.186.213/evaluation-service/notifications"
    );
    const notifications = res.data.notifications;

    const heap = new MinHeap(n);
    for (const notif of notifications) {
      heap.push({ ...notif, score: computeScore(notif) });
    }

    const top = heap.getTopN();
    await Log("backend", "info", "service", `Computed top ${n} priority notifications`);
    return top;
  } catch (err) {
    await Log("backend", "error", "service", "Failed to fetch/process notifications");
    console.error("Error:", err.message);
    return [];
  }
}

fetchTopNNotifications(10).then((top) => {
  console.log(JSON.stringify(top, null, 2));
});

module.exports = { fetchTopNNotifications, computeScore, MinHeap };