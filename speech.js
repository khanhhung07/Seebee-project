'use strict';

// Keep speech in the extension so a freshly visited page needs no audio gesture.
// A port owns each request: navigation, Stop, or a newer request cancels it.
let activeJob = null;
function send(job, message) {
  try { job.port.postMessage(message); } catch { /* Page has gone away. */ }
}
function finish(job, type, error) {
  if (activeJob !== job) return;
  activeJob = null;
  send(job, {type, ...(error ? {error} : {})});
  job.port.disconnect();
}
function chunks(text) {
  const result = [];
  while (text.length > 2000) {
    let end = text.lastIndexOf(' ', 2000);
    if (end < 1000) end = 2000;
    result.push(text.slice(0, end)); text = text.slice(end);
  }
  if (text) result.push(text);
  return result;
}
function sayChunk(job) {
  if (activeJob !== job) return;
  const text = job.parts.shift();
  if (!text) { finish(job, 'end'); return; }
  chrome.tts.speak(text, {
    voiceName: job.voice.voiceName, lang: job.voice.lang, rate: job.rate,
    volume: 1, enqueue: false,
    onEvent(event) {
      if (activeJob !== job) return;
      if (event.type === 'end') sayChunk(job);
      else if (event.type === 'error') finish(job, 'error', event.errorMessage || 'The local voice could not play. Try Test audio again.');
      else if (['interrupted','cancelled'].includes(event.type)) finish(job, event.type);
      else if (event.type === 'start') send(job, {type:'start'});
    }
  }, () => {
    const error = chrome.runtime.lastError;
    if (error) finish(job, 'error', error.message);
  });
}
async function start(job, message) {
  if (typeof message.text !== 'string' || !message.text.trim()) { finish(job,'error','There is no text to read.'); return; }
  // Voice lists can populate after the first request during Chrome startup.
  let voices = [];
  for (const delay of [0,150,350,700]) {
    if (delay) await new Promise(resolve => setTimeout(resolve,delay));
    if (activeJob !== job) return;
    voices = (await chrome.tts.getVoices()).filter(v => !v.remote && !v.extensionId);
    if (voices.length) break;
  }
  if (activeJob !== job) return;
  if (!voices.length) { finish(job,'error','No local voice is available. Enable a system speech voice, then try Test audio.'); return; }
  const lang = typeof message.lang === 'string' ? message.lang.toLowerCase() : 'en';
  const exact = voices.filter(v => v.lang?.toLowerCase() === lang);
  const matching = exact.length ? exact : voices.filter(v => v.lang?.split('-')[0].toLowerCase() === lang.split('-')[0]);
  job.voice = matching.find(v => /^(Samantha|Alex|Daniel|Karen|Moira|Tessa)$/.test(v.voiceName)) || matching[0] || voices[0];
  job.rate = [.8,1,1.2,1.5].includes(message.rate) ? message.rate : 1;
  job.parts = chunks(message.text);
  sayChunk(job);
}
chrome.runtime.onConnect.addListener(port => {
  if (port.name !== 'seebee-speech' || port.sender?.id !== chrome.runtime.id || !port.sender.tab) return;
  const job = {port}; let received = false;
  port.onDisconnect.addListener(() => {
    if (activeJob === job) { activeJob = null; chrome.tts.stop(); }
  });
  port.onMessage.addListener(message => {
    if (received) return;
    received = true;
    if (activeJob) finish(activeJob,'interrupted');
    chrome.tts.stop(); activeJob = job;
    start(job,message).catch(() => finish(job,'error','Audio could not start. Reload Seebee and try Test audio.'));
  });
});
