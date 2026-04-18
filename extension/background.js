// Background service worker to handle API requests and avoid CORS issues
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_AI_ANSWERS') {
    const { applicationUrl, questions } = request.data;
    
    fetch(`https://tma.kingofthehill.pro/api/v1/ai/ask?applicationUrl=${encodeURIComponent(applicationUrl)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ questions })
    })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        sendResponse({ success: true, data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    
    // Return true to indicate we will send a response asynchronously
    return true;
  }
});
