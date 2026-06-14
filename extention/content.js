console.log("CONTENT JS LOADED - Infinite Scroll Enabled");

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "getComments") {
    
    autoScrollAndFetchAll()
      .then(texts => {
        sendResponse(texts);
      })
      .catch(error => {
        console.error("Error fetching comments:", error);
        sendResponse([]);
      });

   
    return true; 
  }
});


async function autoScrollAndFetchAll() {
  let commentsSet = new Set(); 
  let previousHeight = 0;
  let noChangeCount = 0; 

  
  while (true) {
   
    const commentNodes = document.querySelectorAll("ytd-comment-thread-renderer #content-text");
    
    commentNodes.forEach(node => {
      const text = node.innerText.trim();
      if (text.length > 0) {
        commentsSet.add(text);
      }
    });

    
    window.scrollBy(0, 3000); 

   
    await new Promise(resolve => setTimeout(resolve, 1500));

    
    let newHeight = document.documentElement.scrollHeight;
    
    if (newHeight === previousHeight) {
      noChangeCount++;
      
  
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (document.documentElement.scrollHeight === previousHeight && noChangeCount >= 2) {
       
        break; 
      }
    } else {
     
      noChangeCount = 0; 
    }
    
    previousHeight = newHeight;
  }

  return Array.from(commentsSet);
}