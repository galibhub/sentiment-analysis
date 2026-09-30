
console.log("Sentiment AI: Content script loaded");

let collectionCancelled = false;
let isCollecting = false;

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function getCommentNodes() {
  return document.querySelectorAll(
    "ytd-comment-thread-renderer #content-text"
  );
}

function collectVisibleComments(comments) {
  getCommentNodes().forEach((node) => {
    const text = node.innerText?.trim();

    if (!text) return;

    // Keep separate comments even if their text is identical,
    // when YouTube exposes a distinct comment thread ID.
    const thread = node.closest("ytd-comment-thread-renderer");
    const id = thread?.getAttribute("id");

    const key = id || text;

    if (!comments.has(key)) {
      comments.set(key, {
        id: key,
        text
      });
    }
  });
}

function sendCollectionProgress(count, target) {
  chrome.runtime.sendMessage({
    type: "COLLECTION_PROGRESS",
    collected: count,
    target
  }).catch(() => {});
}

async function autoScrollAndFetchAll(maxComments = 1000) {
  const comments = new Map();
  let unchangedRounds = 0;
  let previousCount = 0;

  // Allow YouTube to render the comments section.
  await sleep(1000);

  const commentsSection = document.querySelector("#comments");

  if (commentsSection) {
    commentsSection.scrollIntoView({
      behavior: "instant",
      block: "start"
    });
    await sleep(1000);
  }

  for (let round = 0; round < 100; round++) {
    if (collectionCancelled) {
      break;
    }

    collectVisibleComments(comments);

    if (comments.size >= maxComments) {
      break;
    }

    sendCollectionProgress(
      Math.min(comments.size, maxComments),
      maxComments
    );

    if (comments.size === previousCount) {
      unchangedRounds++;
    } else {
      unchangedRounds = 0;
    }

    if (unchangedRounds >= 8) {
      break;
    }

    previousCount = comments.size;

    window.scrollBy({
      top: Math.max(window.innerHeight * 1.5, 1200),
      behavior: "instant"
    });

    await sleep(1000);
  }

  collectVisibleComments(comments);

  return Array.from(comments.values())
    .slice(0, maxComments)
    .map((item) => item.text);
}

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