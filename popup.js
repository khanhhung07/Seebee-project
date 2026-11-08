'use strict';
async function openOnPage() {
  const button = document.getElementById('open');
  const status = document.getElementById('status');
  button.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab.');
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['content.js']});
    window.close();
  } catch (error) {
    status.textContent = 'Chrome cannot open Seebee here. Try a regular website. For a local file, enable “Allow access to file URLs” in extension details, or use the demo below.';
    button.disabled = false;
  }
}
document.getElementById('open').addEventListener('click', openOnPage);
openOnPage();
document.getElementById('demo').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('demo/index.html') });
  window.close();
});
