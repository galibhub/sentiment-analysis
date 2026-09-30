console.log("Sentiment AI: Content script loaded");

let collectionCancelled = false;
let isCollecting = false;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/* ---------- DOM helpers ---------- */

function getThreads() {
  return document.querySelectorAll("ytd-comment-thread-renderer");
}

// The "loading spinner" item at the bottom of the comment list.
// When it enters the viewport, YouTube loads the next batch.
// We ignore the "show more replies" continuation items.
function findContinuation() {
  const items = Array.from(
    document.querySelectorAll("ytd-comments ytd-continuation-item-renderer")
  ).filter((el) => !el.closest("ytd-comment-replies-renderer"));

  return items[items.length - 1] || null;
}

function getCommentId(thread) {
  const link = thread.querySelector('a[href*="lc="]');
  if (!link) return null;

  try {
    return new URL(link.href, location.origin).searchParams.get("lc");
  } catch {
    return null;
  }
}

/* ---------- Collection ---------- */

// state = { seen: WeakSet, ids: Set, texts: [] }
function collectVisibleComments(state) {
  getThreads().forEach((thread) => {
    if (state.seen.has(thread)) return;

    // Top-level comment text only (first #content-text in the thread).
    const text = thread.querySelector("#content-text")?.innerText?.trim();

    // Not rendered yet: don't mark as seen, we'll retry next round.
    if (!text) return;

    state.seen.add(thread);

    const id = getCommentId(thread);
    if (id) {
      if (state.ids.has(id)) return;
      state.ids.add(id);
    }

    state.texts.push(text);
  });
}

function sendCollectionProgress(count, target) {
  chrome.runtime
    .sendMessage({
      type: "COLLECTION_PROGRESS",
      collected: count,
      target
    })
    .catch(() => {});
}

// Scroll so that YouTube's continuation item enters the viewport,
// then "wiggle" so the IntersectionObserver fires again.
async function triggerLoadMore() {
  const threads = getThreads();
  const last = threads[threads.length - 1];

  last?.scrollIntoView({ block: "end", behavior: "instant" });

  const continuation = findContinuation();
  continuation?.scrollIntoView({ block: "center", behavior: "instant" });

  await sleep(150);
  window.scrollBy({ top: -400, behavior: "instant" });
  await sleep(150);
  window.scrollBy({ top: 800, behavior: "instant" });
}

async function autoScrollAndFetchAll(maxComments = 1000) {
  const state = {
    seen: new WeakSet(),
    ids: new Set(),
    texts: []
  };

  const MAX_STALLS = 6;                 // consecutive rounds with no new comments
  const MAX_TIME = 15 * 60 * 1000;      // 15 min safety limit
  const WAIT_STEP = 300;                // ms
  const WAIT_ROUNDS = 20;               // 20 * 300ms = up to 6s per batch

  let stalls = 0;
  const startTime = Date.now();

  // Allow YouTube to render the comments section.
  await sleep(1000);

  const commentsSection = document.querySelector("#comments");
  if (commentsSection) {
    commentsSection.scrollIntoView({
      behavior: "instant",
      block: "start"
    });
    await sleep(1500);
  }

  while (Date.now() - startTime < MAX_TIME) {
    if (collectionCancelled) break;

    collectVisibleComments(state);

    sendCollectionProgress(
      Math.min(state.texts.length, maxComments),
      maxComments
    );

    if (state.texts.length >= maxComments) break;

    const before = getThreads().length;

    await triggerLoadMore();

    // Poll until new threads appear (works on slow internet too).
    let grew = false;
    for (let i = 0; i < WAIT_ROUNDS; i++) {
      await sleep(WAIT_STEP);
      if (collectionCancelled) break;

      if (getThreads().length > before) {
        grew = true;
        break;
      }
    }

    if (collectionCancelled) break;

    if (grew) {
      stalls = 0;
      await sleep(300); // let the new batch finish rendering
    } else {
      // If there is no continuation spinner left, the video has
      // no more comments, so stop sooner.
      stalls += findContinuation() ? 1 : 2;
      if (stalls >= MAX_STALLS) break;
    }
  }

  collectVisibleComments(state);

  const result = state.texts.slice(0, maxComments);
  sendCollectionProgress(result.length, maxComments);

  return result;
}

/* ---------- Messaging ---------- */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (message.action === "CANCEL_COLLECTION") {
      collectionCancelled = true;
      sendResponse({ success: true });
      return;
    }

    if (message.action !== "getComments") {
      return;
    }

    if (isCollecting) {
      sendResponse({
        success: false,
        error: "Comment collection is already running."
      });
      return;
    }

    isCollecting = true;
    collectionCancelled = false;

    const maxComments = Math.max(
      1,
      Math.min(5000, Number(message.maxComments) || 1000)
    );

    autoScrollAndFetchAll(maxComments)
      .then((texts) => {
        sendResponse({
          success: true,
          texts,
          cancelled: collectionCancelled
        });
      })
      .catch((error) => {
        console.error("Comment collection error:", error);

        sendResponse({
          success: false,
          error: error.message
        });
      })
      .finally(() => {
        isCollecting = false;
      });

    return true;
  }
);