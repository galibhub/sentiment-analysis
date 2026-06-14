document.getElementById("analyze").addEventListener("click", async () => {
  const btn = document.getElementById("analyze");
  btn.innerText = "Fetching ALL comments... Please wait.";

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  chrome.tabs.sendMessage(tab.id, { action: "getComments" }, async (texts) => {
    
    // ১. Error Handling: যদি YouTube পেজ রিলোড করা না থাকে বা content.js না পায়
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError.message);
      alert("Error: Extention not connected. Please REFRESH the YouTube page and try again.");
      btn.innerText = "Analyze Comments";
      return;
    }

    // ২. যদি কোনো কমেন্ট না পায়
    if (!texts || texts.length === 0) {
      alert("No comments found. Scroll down and try again.");
      btn.innerText = "Analyze Comments";
      return;
    }

    btn.innerText = `Analyzing ${texts.length} comments fast...`;

    let pos = 0;
    let neg = 0;
    let neu = 0;
    let totalWords = 0;

    // ৩. অপ্টিমাইজেশন: একসাথে ৫০টি রিকোয়েস্ট পাঠানোর জন্য Chunking বা ব্যাচ তৈরি করা
    const chunkSize = 50; 

    for (let i = 0; i < texts.length; i += chunkSize) {
      const chunk = texts.slice(i, i + chunkSize);
      
      // Promise.all ব্যবহার করে একসাথে ৫০টি রিকোয়েস্ট পাঠানো হচ্ছে
      const promises = chunk.map(async (text) => {
        try {
          const res = await fetch("http://127.0.0.1:5001/predict", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text })
          });
          const data = await res.json();
          return { text, sentiment: data.sentiment };
        } catch (error) {
          console.error(error);
          return null; // এরর হলে স্কিপ করবে
        }
      });

      // ৫০টি রিকোয়েস্টের রেজাল্ট একসাথে রিসিভ করা
      const results = await Promise.all(promises);

      // রেজাল্টগুলো কাউন্ট করা
      results.forEach(result => {
        if (result) {
          totalWords += result.text.split(" ").length;
          if (result.sentiment === "Positive") pos++;
          else if (result.sentiment === "Negative") neg++;
          else neu++;
        }
      });
    }

    // ৪. ড্যাশবোর্ড আপডেট করা
    const total = pos + neg + neu;
    const avg = total > 0 ? (totalWords / total).toFixed(1) : 0;

    // --- UPDATED MOOD LOGIC (BUG FIX) ---
    let mood = "Neutral 😐";
    const highestCount = Math.max(pos, neg, neu);

    if (highestCount === neu && neu > 0) {
      mood = "Neutral 😐";
    } else if (highestCount === pos && pos > 0) {
      mood = "Positive 😊";
    } else if (highestCount === neg && neg > 0) {
      mood = "Negative 😡";
    } else if (pos === neg && pos > neu) {
      mood = "Mixed 🤔"; 
    }
    // ------------------------------------

    document.getElementById("dashboard").style.display = "block";
    document.getElementById("total").innerText = total;
    document.getElementById("avg").innerText = avg;
    
    document.getElementById("pos").innerText = pos;
    document.getElementById("neg").innerText = neg;
    document.getElementById("neu").innerText = neu;
    document.getElementById("mood").innerText = mood;

    drawPie(pos, neu, neg);
    btn.innerText = "Analyze Comments";
  });
});

// ৫. পাই চার্ট (Donut Chart) তৈরি করার ফাংশন
function drawPie(pos, neu, neg) {
  const total = pos + neu + neg;
  if (total === 0) return;

  const p = (pos / total) * 100;
  const n = (neu / total) * 100;

  const pie = document.getElementById("pieChart");

  pie.style.background = `conic-gradient(
    #10b981 0% ${p}%,
    #94a3b8 ${p}% ${p + n}%,
    #f43f5e ${p + n}% 100%
  )`;

  document.getElementById("centerText").innerHTML = `
    <div style="font-size: 28px; font-weight: 800; color: #f8fafc;">
      ${total}
    </div>
    <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px;">
      Total
    </div>
  `;
}