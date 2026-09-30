
const btn = document.getElementById("analyze");
const cancelBtn = document.getElementById("cancel");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progressBar");

let isRunning = false;
let cancelled = false;
let currentTabId = null;
let abortController = null;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function setProgress(percent) {
  progressBar.style.width =
    `${Math.max(0, Math.min(100, percent))}%`;
}

function setRunning(value) {
  isRunning = value;
  btn.disabled = value;
  cancelBtn.hidden = !value;
}

function showError(message) {
  statusEl.textContent = message;
}

function normalizeSentiment(value) {
  const sentiment = String(value || "").toLowerCase();

  if (sentiment.startsWith("positive")) return "positive";
  if (sentiment.startsWith("negative")) return "negative";
  if (sentiment.startsWith("neutral")) return "neutral";

  return null;
}

function calculateMood(pos, neu, neg) {
  const max = Math.max(pos, neu, neg);

  if (max === 0) return "No results";

  const leaders = [
    ["Positive", pos],
    ["Neutral", neu],
    ["Negative", neg]
  ].filter(([, count]) => count === max);

  if (leaders.length > 1) return "Mixed 🤔";

  if (leaders[0][0] === "Positive") return "Positive 😊";
  if (leaders[0][0] === "Negative") return "Negative 😡";

  return "Neutral 😐";
}

function drawPie(pos, neu, neg) {
  const total = pos + neu + neg;
  const pie = document.getElementById("pieChart");

  if (!total) {
    pie.style.background = "#334155";
    return;
  }

  const positiveEnd = (pos / total) * 100;
  const neutralEnd = positiveEnd + (neu / total) * 100;

  pie.style.background = `conic-gradient(
    #10b981 0% ${positiveEnd}%,
    #94a3b8 ${positiveEnd}% ${neutralEnd}%,
    #f43f5e ${neutralEnd}% 100%
  )`;
}

function renderDashboard(stats) {
  const {
    total,
    positive,
    neutral,
    negative,
    failed,
    averageWords
  } = stats;

  document.getElementById("dashboard").style.display = "block";

  document.getElementById("total").textContent = total;
  document.getElementById("avg").textContent = averageWords;
  document.getElementById("pos").textContent = positive;
  document.getElementById("neu").textContent = neutral;
  document.getElementById("neg").textContent = negative;
  document.getElementById("failed").textContent = failed;

  document.getElementById("centerTotal").textContent = total;
  document.getElementById("mood").textContent =
    calculateMood(positive, neutral, negative);

  document.getElementById("details").textContent =
    `Successfully analyzed: ${total} | Failed: ${failed}`;

  drawPie(positive, neutral, negative);
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function updateCollectionProgress(count, target) {
  const percentage = target
    ? Math.min(50, (count / target) * 50)
    : 0;

  setProgress(percentage);
  statusEl.textContent =
    `Collecting comments: ${count.toLocaleString()} / ${target.toLocaleString()}`;
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!isRunning || message.type !== "COLLECTION_PROGRESS") return;

  if (
    currentTabId !== null &&
    sender.tab?.id !== currentTabId
  ) {
    return;
  }

  updateCollectionProgress(
    message.collected || 0,
    message.target || 0
  );
});

async function predictOne(text, signal) {
  const response = await fetch(
    "http://127.0.0.1:5001/predict",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text }),
      signal
    }
  );

  if (!response.ok) {
    throw new Error(`Prediction API returned ${response.status}`);
  }

  const data = await response.json();
  const sentiment = normalizeSentiment(data.sentiment);

  if (!sentiment) {
    throw new Error("Unknown sentiment returned by backend");
  }

  return sentiment;
}

async function analyzeComments(texts) {
  const stats = {
    total: 0,
    positive: 0,
    neutral: 0,
    negative: 0,
    failed: 0,
    averageWords: 0
  };

  let totalWords = 0;
  const concurrency = 5;

  for (let i = 0; i < texts.length; i += concurrency) {
    if (cancelled) break;

    const chunk = texts.slice(i, i + concurrency);

    statusEl.textContent =
      `Analyzing ${Math.min(i + chunk.length, texts.length).toLocaleString()} / ${texts.length.toLocaleString()}`;

    const results = await Promise.all(
      chunk.map(async (text) => {
        if (cancelled) return { failed: true };

        try {
          const sentiment = await predictOne(
            text,
            abortController.signal
          );

          return { text, sentiment };
        } catch (error) {
          if (error.name === "AbortError") {
            return { cancelled: true };
          }

          console.error("Prediction failed:", error);
          return { failed: true };
        }
      })
    );

    for (const result of results) {
      if (result.cancelled) continue;

      if (result.failed) {
        stats.failed++;
        continue;
      }

      stats.total++;

      totalWords += result.text.trim()
        .split(/\s+/)
        .filter(Boolean).length;

      if (result.sentiment === "positive") {
        stats.positive++;
      } else if (result.sentiment === "negative") {
        stats.negative++;
      } else {
        stats.neutral++;
      }
    }

    setProgress(
      50 + ((i + chunk.length) / texts.length) * 50
    );

    // Allow the popup to update between batches.
    await sleep(0);
  }

  stats.averageWords = stats.total
    ? Number((totalWords / stats.total).toFixed(1))
    : 0;

  return stats;
}

btn.addEventListener("click", async () => {
  if (isRunning) return;

  setRunning(true);
  cancelled = false;
  currentTabId = null;
  abortController = new AbortController();

  statusEl.textContent = "Connecting to YouTube...";
  setProgress(0);
  document.getElementById("dashboard").style.display = "none";

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url?.startsWith("https://www.youtube.com/")) {
      throw new Error("Please open a YouTube video first.");
    }

    currentTabId = tab.id;

    const maxComments = Number(
      document.getElementById("maxComments").value
    );

    if (
      !Number.isInteger(maxComments) ||
      maxComments < 1 ||
      maxComments > 5000
    ) {
      throw new Error("Enter a number between 1 and 5000.");
    }

    statusEl.textContent = "Collecting YouTube comments...";

    const response = await sendTabMessage(tab.id, {
      action: "getComments",
      maxComments
    });

    if (cancelled) return;

    if (!response?.success) {
      throw new Error(response?.error || "Could not collect comments.");
    }

    const texts = response.texts || [];

    if (!texts.length) {
      throw new Error("No comments found. Try a video with comments enabled.");
    }

    if (response.cancelled) {
      throw new Error("Comment collection was cancelled.");
    }

    statusEl.textContent =
      `Collected ${texts.length.toLocaleString()} comments. Starting analysis...`;

    const stats = await analyzeComments(texts);

    if (cancelled) return;

    if (!stats.total) {
      throw new Error("No comments were successfully analyzed.");
    }

    renderDashboard(stats);
    setProgress(100);

    statusEl.textContent = cancelled
      ? "Analysis cancelled."
      : "Analysis completed successfully.";
  } catch (error) {
    if (!cancelled) {
      console.error(error);
      showError(error.message);
    }
  } finally {
    setRunning(false);
    abortController = null;
    currentTabId = null;
  }
});

cancelBtn.addEventListener("click", async () => {
  if (!isRunning) return;

  cancelled = true;

  if (currentTabId !== null) {
    await sendTabMessage(currentTabId, {
      action: "CANCEL_COLLECTION"
    }).catch(() => {});
  }

  abortController?.abort();
  statusEl.textContent = "Cancelling analysis...";
  setRunning(false);
});