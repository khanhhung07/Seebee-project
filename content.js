(() => {
  'use strict';
  const KEY = '__TARGETLENS_V1__';
  const automatic = globalThis.__TARGETLENS_AUTO_START__ === true;
  delete globalThis.__TARGETLENS_AUTO_START__;
  if (globalThis[KEY]) { if (!automatic) globalThis[KEY].open(); return; }
  const preview = document.currentScript?.dataset.preview === 'true';
  const tidy = value => (value || '').replace(/\s+/g, ' ').trim();
  const targetSelector = 'a[href],button,input[type="button"],input[type="submit"],input[type="reset"],[role="button"],[role="link"]';
  let host, root, panel, status, observer, scanTimer, dwellTimer, leaveTimer;
  let settingsOpen = true, tracking = true, audio = false, speed = 1, side = 'right';
  let previousFocus, current, source, controls = [], speaking = false, speechSerial = 0;
  let frameRequest = null, lensOn = true, zoom = 2, pointer;
  const proximity = 64, effects = new Map(), ownStyles = new WeakMap();
  let reader, readingOutline, readingTarget, readerReturnFocus, readingOn = false, readingSize = 28;
  let paragraphTimer, previewLeaveTimer, dismissedTarget, speechOwner, speechPort, speechUtterance, voiceWaitCancel;
  let readerResize = null;
  let panelPosition = null, dragState = null;
  let theme = 'system', settingsSize = 22, popupWidth = 480, popupHeight = 480;
  let sizePreview, previewId = null, previewFrame = null;
  let pointerOn = false, pointerColor = '#ffdc60', pointerSize = 40, pointerRing, mousePosition;
  const darkPreference = matchMedia('(prefers-color-scheme: dark)');
  let enabled = false, smart = true, mediumZoom = 1.25, largeZoom = 1, skipImages = true;
  const PREF_KEY = 'targetlens.preferences.v1';
  const extensionStorage = !!globalThis.chrome?.runtime?.id && !!globalThis.chrome?.storage?.local;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  function preferences() { return {enabled, audio, speed, lensOn, zoom, side, smart, mediumZoom, largeZoom, skipImages, readingOn, readingSize, panelPosition, theme, settingsSize, popupWidth, popupHeight, pointerOn, pointerColor, pointerSize}; }
  function applyPreferences(p) {
    if (!p || typeof p !== 'object') return;
    for (const key of ['enabled','audio','lensOn','smart','skipImages']) {
      if (typeof p[key] !== 'boolean') continue;
      if (key === 'enabled') enabled = p[key]; else if (key === 'audio') audio = p[key];
      else if (key === 'lensOn') lensOn = p[key]; else if (key === 'smart') smart = p[key]; else skipImages = p[key];
    }
    if ([.8,1,1.2,1.5].includes(p.speed)) speed = p.speed;
    if ([1.5,2,3].includes(p.zoom)) zoom = p.zoom;
    if ([1,1.15,1.25,1.5,2].includes(p.mediumZoom)) mediumZoom = p.mediumZoom;
    if ([1,1.1,1.25,1.5].includes(p.largeZoom)) largeZoom = p.largeZoom;
    if (typeof p.readingOn === 'boolean') readingOn = p.readingOn;
    else if (p.mode === 'text') readingOn = true; // Migrate the previous reader mode.
    if ([24,28,32].includes(p.readingSize)) readingSize = p.readingSize;
    if (['system','light','dark'].includes(p.theme)) theme = p.theme;
    if ([18,20,22,24].includes(p.settingsSize)) settingsSize = p.settingsSize;
    if (Number.isFinite(p.popupWidth)) popupWidth = Math.max(300,Math.min(760,p.popupWidth));
    if (Number.isFinite(p.popupHeight)) popupHeight = Math.max(280,Math.min(720,p.popupHeight));
    if (typeof p.pointerOn === 'boolean') pointerOn = p.pointerOn;
    if (['#ffdc60','#ef4444','#fb8dc9','#3478d4'].includes(p.pointerColor)) pointerColor = p.pointerColor;
    else if (['#62d9ff','#153e90'].includes(p.pointerColor)) pointerColor = '#3478d4'; // Preserve older blue choices in the simplified palette.
    if ([28,40,56].includes(p.pointerSize)) pointerSize = p.pointerSize;
    if (['left','right'].includes(p.side)) side = p.side;
    if (p.panelPosition === null) panelPosition = null;
    else if (Number.isFinite(p.panelPosition?.x) && Number.isFinite(p.panelPosition?.y)) panelPosition = {x:p.panelPosition.x,y:p.panelPosition.y};
  }
  async function loadPreferences() {
    try {
      const p = extensionStorage ? (await chrome.storage.local.get(PREF_KEY))[PREF_KEY] : JSON.parse(localStorage.getItem(PREF_KEY) || 'null');
      applyPreferences(p);
    } catch { /* Keep usable defaults if storage is unavailable. */ }
  }
  async function savePreferences() {
    try {
      if (extensionStorage) await chrome.storage.local.set({[PREF_KEY]: preferences()});
      else localStorage.setItem(PREF_KEY, JSON.stringify(preferences()));
      return true;
    } catch { announce('Settings could not be saved. Please try Done again.'); return false; }
  }
  const ready = loadPreferences();
  darkPreference.addEventListener('change', () => { applyAppearance(); stopEffects(); mark(); });
  const style = `
    :host{color-scheme:light!important;font-family:system-ui,-apple-system,sans-serif!important}
    *{box-sizing:border-box}[hidden]{display:none!important}button,input,select{font:inherit}button{cursor:pointer}
    button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #a74c00;outline-offset:3px}
    .panel{pointer-events:auto;position:fixed;inset:12px 12px auto auto;width:min(410px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:hidden;display:flex;flex-direction:column;border:1px solid #a9bfb2;border-radius:22px;background:#fff;color:#18382f;box-shadow:0 12px 70px #102b3038;padding:22px;font-size:16px;line-height:1.5}
    .settings-body{overflow-y:auto;min-height:0;padding:2px 3px 12px}.settings-actions{flex-shrink:0;border-top:1px solid #e0e5dd;padding-top:6px}.settings-actions .action{margin-top:7px}
    .panel.left{inset:12px auto auto 12px}.panel[hidden]{display:none}
    .top{flex-shrink:0;display:flex;gap:8px;align-items:center}h2{font-size:23px;flex:1;margin:0;letter-spacing:-.6px}.logo{color:#19694f;font-size:30px}
    .icon{width:48px;height:48px;flex-shrink:0;background:white;border:1px solid #bdcdbf;border-radius:12px;color:#18382f;font-size:24px}
    .drag-handle{cursor:grab;touch-action:none;user-select:none;display:grid;place-items:center;border:1px solid #d9e2dc;border-radius:12px;background:#f7f9f6;color:#496557;box-shadow:0 1px 2px #18382f08}.drag-handle:hover{background:#edf2ec;border-color:#a9bfb2}.grip{display:grid;grid-template-columns:repeat(2,4px);gap:4px 5px;pointer-events:none}.grip i{width:4px;height:4px;border-radius:50%;background:currentColor;display:block}.drag-handle:active{cursor:grabbing}.sub-options{width:calc(100% - 24px);margin:0 auto 10px;padding:2px 0 12px;border-bottom:1px solid #edf0e9}.sub-options .speed-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center}.sub-options label{align-self:center;font-weight:400}.reader-tools{align-items:center}.reader-tools label{align-self:center}
    .intro{color:#526357;margin:16px 0 22px}.setting{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 4px;cursor:pointer;font-weight:650}.setting input{width:24px;height:24px;accent-color:#19694f;flex-shrink:0}
    .speed-row{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:64px}select{min-width:110px;min-height:48px;padding:8px;border:1px solid #bdcdbf;border-radius:10px;background:white;color:#18382f}
    .hint{font-size:14px;color:#526357;line-height:1.6}.action{min-height:52px;width:100%;border:1px solid #bdcdbf;border-radius:12px;background:#f6f9f2;color:#284f3c;font-weight:700;margin-top:10px;padding:10px}.done{background:#19694f;color:#fff;border-color:#19694f;font-size:17px}
    fieldset{border:0;padding:0;margin:0;min-width:0}.speed-row.is-disabled{color:#929991}.speed-row.is-disabled select,select:disabled{color:#929991;background:#f4f5f2;border-color:#dfe3dc;opacity:1}.speed-row.active-size label{color:#111;font-weight:400}.control-options:disabled{color:#929991}.control-options:disabled .active-size label{color:#929991}
    .reader{pointer-events:auto;position:fixed;margin:0;inset:auto;width:min(480px,calc(100vw - 24px));max-height:min(480px,calc(100dvh - 24px));padding:20px;border:1px solid #a9bfb2;border-radius:22px;background:#fffdf8;color:#17251e;box-shadow:0 16px 80px #0005;overflow:auto}.reader[hidden]{display:none}.reader-top{display:flex;gap:12px;align-items:center;justify-content:space-between}.reader-top h2{font-size:18px}.reader-close{min-height:48px;padding:8px 16px;border:1px solid #bdcdbf;border-radius:10px;background:white;color:#18382f}.reader-tools{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.reader-tools button,.reader-tools select{min-height:48px;padding:8px 16px;border:1px solid #bdcdbf;border-radius:10px;background:white;color:#18382f}.reader-copy{font-size:28px;line-height:1.75;white-space:pre-wrap;overflow-wrap:anywhere;margin:22px 0;max-width:65ch;letter-spacing:.01em}.reading-outline{position:fixed;border:2px solid #19694f;border-radius:6px;pointer-events:none;background:#19694f08;display:none}.reader-help{font-size:14px;color:#526357}
    .status:empty{display:none}
    :host{--sb-bg:#fff;--sb-fg:#17382c;--sb-muted:#4d665a;--sb-control:#f5f8f2;--sb-border:#b9cbbf;--sb-accent:#19694f;--sb-accent-text:#fff;--sb-focus:#a74c00;--sb-disabled:#7c8980;--sb-font:22px}
    :host([data-theme="dark"]){--sb-bg:#445339;--sb-fg:#edf6ef;--sb-muted:#bfcec3;--sb-control:#35422e;--sb-border:#6f8e7c;--sb-accent:#a8e3bd;--sb-accent-text:#102219;--sb-focus:#ffdc60;--sb-disabled:#9aaa9e;color-scheme:dark!important}
    .panel,.reader{background:var(--sb-bg);color:var(--sb-fg);border-color:var(--sb-border)}.panel{width:min(500px,calc(100vw - 24px));font-size:var(--sb-font);line-height:1.65;padding:24px}.top h2{font-size:28px;letter-spacing:-.7px}.intro,.hint,.reader-help,.status{color:var(--sb-muted)}.intro{font-size:1em}.hint,.reader-help{font-size:max(16px,calc(var(--sb-font) - 3px))}.setting{font-weight:600;min-height:66px}.setting input{width:28px;height:28px;accent-color:var(--sb-accent)}.speed-row{min-height:70px}select,.icon,.reader-close,.reader-tools button,.reader-tools select{background:var(--sb-control);color:var(--sb-fg);border-color:var(--sb-border);font-size:inherit;min-height:52px}select{max-width:100%;min-width:112px}.action{background:var(--sb-control);color:var(--sb-fg);border-color:var(--sb-border);min-height:56px;font-size:1em}.done{background:var(--sb-accent);color:var(--sb-accent-text);border-color:var(--sb-accent)}.drag-handle{background:var(--sb-control);color:var(--sb-muted);border-color:var(--sb-border)}.drag-handle:hover{background:var(--sb-control);color:var(--sb-fg)}.logo{color:var(--sb-accent)}.settings-actions,.sub-options{border-color:var(--sb-border)}.speed-row.active-size label{color:var(--sb-fg)}.speed-row.is-disabled,select:disabled{color:var(--sb-disabled);background:var(--sb-control)}button:focus-visible,input:focus-visible,select:focus-visible{outline-color:var(--sb-focus)}
    .comfort-group{padding:10px 0 16px;margin-bottom:12px;border-bottom:1px solid var(--sb-border)}.section-title{font-size:1em;font-weight:700;margin:10px 0}.reader{width:min(480px,calc(100vw - 24px));max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);min-width:min(300px,calc(100vw - 24px));resize:none;overflow:hidden;display:flex;flex-direction:column;padding:0;min-height:min(280px,calc(100dvh - 24px))}.reader-content{overflow:auto;min-height:0;flex:1;padding:24px;scrollbar-gutter:stable}.reader-resize{position:absolute;z-index:2;padding:0;border:0;background:transparent;touch-action:none;min-width:0;min-height:0}.reader-resize:focus-visible{outline:3px solid var(--sb-focus);outline-offset:-3px}.reader-resize[data-edge="n"],.reader-resize[data-edge="s"]{left:24px;right:24px;height:10px;cursor:ns-resize}.reader-resize[data-edge="n"]{top:0}.reader-resize[data-edge="s"]{bottom:0}.reader-resize[data-edge="e"],.reader-resize[data-edge="w"]{top:24px;bottom:24px;width:10px;cursor:ew-resize}.reader-resize[data-edge="e"]{right:0}.reader-resize[data-edge="w"]{left:0}.reader-resize[data-edge="nw"],.reader-resize[data-edge="ne"],.reader-resize[data-edge="sw"],.reader-resize[data-edge="se"]{width:24px;height:24px}.reader-resize[data-edge="nw"]{top:0;left:0;cursor:nwse-resize}.reader-resize[data-edge="ne"]{top:0;right:0;cursor:nesw-resize}.reader-resize[data-edge="sw"]{bottom:0;left:0;cursor:nesw-resize}.reader-resize[data-edge="se"]{bottom:0;right:0;cursor:nwse-resize}.reader-resize[data-edge="se"]::after{content:"";position:absolute;right:6px;bottom:6px;width:9px;height:9px;border-right:2px solid var(--sb-muted);border-bottom:2px solid var(--sb-muted)}.reader-tools{font-size:18px}.reader-top h2{font-size:22px}.reader-copy{color:var(--sb-fg)}.pointer-ring{position:fixed;pointer-events:none;border:3px solid var(--ring-color,#ffdc60);border-radius:50%;background:transparent;box-shadow:0 0 0 1px #15221d,0 0 0 2px #fff,0 0 14px var(--ring-color,#ffdc60);transform:translate(-50%,-50%);display:none;z-index:1}
    .size-preview{pointer-events:auto;position:fixed;width:min(500px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;padding:24px;background:var(--sb-bg);color:var(--sb-fg);border:1px solid var(--sb-border);border-radius:22px;box-shadow:0 12px 70px #102b3038;font-size:var(--sb-font);line-height:1.65}.preview-head{display:flex;align-items:center;gap:12px;justify-content:space-between}.preview-head h3{margin:0;font-size:28px;letter-spacing:-.7px}.size-preview button{min-height:48px;min-width:48px;border:1px solid var(--sb-border);border-radius:10px;background:var(--sb-control);color:var(--sb-fg);font:inherit;padding:8px 14px}.preview-comparison{display:grid;grid-template-columns:1fr 1fr;gap:16px}.preview-sample{min-height:120px;display:flex;align-items:center;justify-content:center;background:var(--sb-control);border-radius:10px;margin:8px 0;overflow:hidden}.preview-label{font-weight:650}.preview-note{font-size:max(16px,calc(var(--sb-font) - 3px));color:var(--sb-muted)}#preview-setting{margin:8px 0 16px}#preview-summary{font-size:1em}
    @media(max-width:420px){.panel{padding:18px}.top h2{font-size:25px}.sub-options{width:100%}.sub-options .speed-row{grid-template-columns:minmax(0,1fr) auto;gap:8px}.reader-tools{font-size:18px}}
    @media(forced-colors:active){.panel,.action,.icon{border:1px solid CanvasText}}
  `;
  function isDark() { return theme === 'dark' || (theme === 'system' && darkPreference.matches); }
  function applyAppearance() {
    if (!host) return;
    host.dataset.theme = isDark() ? 'dark' : 'light';
    host.style.setProperty('--sb-font', settingsSize + 'px');
    if (pointerRing) { pointerRing.style.setProperty('--ring-color', pointerColor); pointerRing.style.width = pointerSize + 'px'; pointerRing.style.height = pointerSize + 'px'; }
    if (!pointerOn && pointerRing) pointerRing.style.display = 'none';
    if (reader && !reader.hidden) { reader.style.width = popupWidth + 'px'; reader.style.maxHeight = `min(${popupHeight}px,calc(100dvh - 24px))`; }
    updateExamples(); if (settingsOpen) requestAnimationFrame(placePanel);
  }
  function previewValues() {
    if (previewId === 'reading-size') return {label:'Reading text',base:16,result:readingSize,setting:root.querySelector('#reading-size').selectedOptions[0].textContent};
    const values = {zoom:{label:smart?'Small':'All text',base:smart?8:16,factor:zoom},medium:{label:'Medium',base:16,factor:mediumZoom},large:{label:'Large',base:24,factor:largeZoom}};
    const v = values[previewId];
    return v && {...v,result:v.base*v.factor,setting:v.factor===1?'No enlargement':v.factor+'×'};
  }
  function placeSizePreview() {
    if (!sizePreview || sizePreview.hidden || !previewId) return;
    const anchor = root.querySelector('#'+previewId), a = anchor.getBoundingClientRect();
    const scrollBox = root.querySelector('.settings-body').getBoundingClientRect();
    if (!anchor.getClientRects().length || a.bottom < scrollBox.top || a.top > scrollBox.bottom) { closeSizePreview(); return; }
    const box = sizePreview.getBoundingClientRect();
    let left = Math.max(12,Math.min(innerWidth-box.width-12,a.right-box.width));
    let top = a.bottom+12;
    if (top+box.height>innerHeight-12) top=Math.max(12,a.top-box.height-12);
    // On desktop, use a subpanel beside settings so examples do not cover its controls.
    const settings = panel.getBoundingClientRect();
    if (settings.left-box.width-16>=12) {left=settings.left-box.width-16;top=Math.max(12,Math.min(innerHeight-box.height-12,a.top));}
    else if(settings.right+box.width+16<=innerWidth-12){left=settings.right+16;top=Math.max(12,Math.min(innerHeight-box.height-12,a.top));}
    sizePreview.style.left=left+'px';sizePreview.style.top=top+'px';
  }
  function animateSizePreview() {
    const v=previewValues(); if(!v || sizePreview.hidden)return;
    const sample=sizePreview.querySelector('#preview-grown');
    cancelAnimationFrame(previewFrame);sample.style.transition='none';sample.style.fontSize=v.base+'px';
    // Paint the starting size, then visibly grow by the selected multiplier.
    previewFrame=requestAnimationFrame(()=>{previewFrame=requestAnimationFrame(()=>{
      sample.style.transition=reduceMotion.matches?'none':'font-size 350ms ease-out';sample.style.fontSize=v.result+'px';
    });});
  }
  function updateExamples() {
    if(!sizePreview || sizePreview.hidden || !previewId)return;
    const v=previewValues();if(!v)return;
    sizePreview.querySelector('#preview-title').textContent=v.label+' preview';
    sizePreview.querySelector('#preview-setting').textContent=v.setting;
    sizePreview.querySelector('#preview-original').style.fontSize=v.base+'px';
    sizePreview.querySelector('#preview-base-note').textContent=v.base+'px starting sample';
    sizePreview.querySelector('#preview-result-note').textContent=Number(v.result.toFixed(2))+'px with your setting';
    sizePreview.querySelector('#preview-summary').textContent=v.label+': '+v.base+'px → '+Number(v.result.toFixed(2))+'px';
    animateSizePreview();placeSizePreview();
  }
  function openSizePreview(id) {
    if(!settingsOpen || root.querySelector('#'+id).disabled)return;
    previewId=id;sizePreview.hidden=false;updateExamples();
  }
  function closeSizePreview() {
    cancelAnimationFrame(previewFrame);previewFrame=null;previewId=null;
    if(sizePreview)sizePreview.hidden=true;
  }
  function showPointer(event) {
    mousePosition = {x:event.clientX,y:event.clientY};
    if (!pointerRing || !pointerOn) return;
    pointerRing.style.left = mousePosition.x + 'px'; pointerRing.style.top = mousePosition.y + 'px'; pointerRing.style.display = 'block';
  }
  function visible(el) {
    if (!el.isConnected || el.closest('[hidden],[inert],[aria-hidden="true"]') || el.getClientRects().length === 0) return false;
    let node = el;
    while (node instanceof Element) {
      const css = getComputedStyle(node);
      if (css.display === 'none' || css.visibility === 'hidden' || css.visibility === 'collapse' || Number(css.opacity) === 0) return false;
      node = node.parentElement;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }
  function referenceText(el, attr) {
    return tidy((el.getAttribute(attr) || '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.textContent || '').join(' '));
  }
  function label(el) {
    return (referenceText(el, 'aria-labelledby') || tidy(el.getAttribute('aria-label')) ||
      (el instanceof HTMLInputElement ? tidy(el.value) || (el.type === 'submit' ? 'Submit' : el.type === 'reset' ? 'Reset' : '') : tidy(el.innerText)) ||
      tidy([...el.querySelectorAll('img[alt]')].map(img => img.alt).join(' ')) || tidy(el.getAttribute('title')));
  }
  function disabled(el) { return el.matches(':disabled') || !!el.closest('[aria-disabled="true"]'); }
  function info(el) {
    const explicit = referenceText(el, 'aria-describedby') || tidy(el.getAttribute('aria-description'));
    if (explicit) return explicit;
    const title = tidy(el.getAttribute('title'));
    if (title && title !== label(el)) return title;
    return 'No description provided by the website.';
  }
  function node(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function announce(message) { if (status) status.textContent = message; const rs = reader?.querySelector('.reader-status'); if (rs) rs.textContent = message; }
  function stopSpeech() {
    clearTimeout(dwellTimer); speechSerial++;
    if (voiceWaitCancel) { voiceWaitCancel(); voiceWaitCancel = null; }
    if (speechPort) { speechPort.disconnect(); speechPort = null; }
    if (speaking && !extensionStorage && 'speechSynthesis' in globalThis) speechSynthesis.cancel();
    speaking = false; speechOwner = null; speechUtterance = null;
  }
  function speechState(type, error, serial) {
    if (serial !== speechSerial) return;
    if (type === 'start') announce('Reading aloud.');
    else if (['end','interrupted','cancelled','error'].includes(type)) {
      speaking = false; speechOwner = null; speechUtterance = null;
      if (type === 'end') announce('Finished reading.');
      else if (type === 'error') announce(error || 'Audio could not start. Try Test audio in settings.');
      else announce('Speech stopped.');
    }
  }
  async function speak(control, owner = 'control') {
    stopSpeech();
    const spokenText = owner === 'paragraph' ? control.description : tidy(control.el?.innerText) || tidy(control.el?.value) || control.name;
    if (!spokenText) return;
    const lang = document.documentElement.lang || navigator.language || 'en';
    const serial = speechSerial;
    speaking = true; speechOwner = owner; announce('Preparing audio…');
    if (extensionStorage) {
      try {
        const port = chrome.runtime.connect({name:'seebee-speech'}); speechPort = port;
        port.onMessage.addListener(message => speechState(message.type, message.error, serial));
        port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          if (speechPort === port) speechPort = null;
          if (serial === speechSerial && speaking) speechState('error', error?.message || 'Audio connection closed. Reload Seebee and refresh this page.', serial);
        });
        port.postMessage({text:spokenText,lang,rate:speed});
      } catch { speechState('error','Reload Seebee in Chrome, then refresh this page to enable audio.',serial); }
      return;
    }
    // The no-install demo uses page speech; the installed extension uses native Chrome TTS.
    if (!('speechSynthesis' in globalThis)) { speechState('error','Read-aloud is unavailable in this browser.',serial); return; }
    let voices = speechSynthesis.getVoices().filter(v => v.localService);
    if (!voices.length) voices = await new Promise(resolve => {
      const finish = () => { clearTimeout(timer); speechSynthesis.removeEventListener('voiceschanged', changed); voiceWaitCancel = null; resolve(speechSynthesis.getVoices().filter(v => v.localService)); };
      const changed = () => { if (speechSynthesis.getVoices().some(v => v.localService)) finish(); };
      const timer = setTimeout(finish, 2000); voiceWaitCancel = finish;
      speechSynthesis.addEventListener('voiceschanged',changed);
    });
    if (serial !== speechSerial) return;
    if (!voices.length) { speechState('error','No local voice is available. Enable a system voice, then try Test audio.',serial); return; }
    const matching = voices.filter(v => v.lang.toLowerCase() === lang.toLowerCase());
    const voice = matching.find(v => /Samantha|Alex|Daniel/.test(v.name)) || matching[0] || voices.find(v => v.lang.split('-')[0] === lang.split('-')[0]) || voices[0];
    const utterance = new SpeechSynthesisUtterance(spokenText); speechUtterance = utterance;
    utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = speed;
    utterance.onstart = () => speechState('start',null,serial);
    utterance.onend = () => speechState('end',null,serial);
    utterance.onerror = event => speechState('error',event.error === 'not-allowed' ? 'Click Test audio once to enable speech on this demo page.' : 'Audio could not play. Try Test audio in settings.',serial);
    speechSynthesis.resume(); speechSynthesis.speak(utterance);
  }
  function clearTarget() { clearTimeout(leaveTimer); if (speechOwner !== 'paragraph') stopSpeech(); current = null; }
  function rememberStyle(el, property, value, saved) {
    const item = {property, value: el.style.getPropertyValue(property), priority: el.style.getPropertyPriority(property)};
    saved.push(item); el.style.setProperty(property, value, 'important');
    item.applied = el.style.getPropertyValue(property);
  }
  function restoreEffect(el, entry) {
    entry.animation?.cancel();
    for (const item of [...entry.styles, ...(entry.highlightStyles || [])]) {
      // Do not overwrite a website change made while magnification was active.
      if (el.style.getPropertyValue(item.property) !== item.applied || el.style.getPropertyPriority(item.property) !== 'important') continue;
      if (item.value) el.style.setProperty(item.property, item.value, item.priority);
      else el.style.removeProperty(item.property);
    }
    if (el.style.cssText === entry.originalCss) {
      if (entry.hadStyle) el.setAttribute('style', entry.originalStyle);
      else el.removeAttribute('style');
    }
    ownStyles.set(el, el.getAttribute('style'));
    effects.delete(el);
  }
  function stopEffects() {
    cancelAnimationFrame(frameRequest); frameRequest = null;
    for (const [el, entry] of effects) restoreEffect(el, entry);
  }
  function setPickedStyle(el, entry, selected) {
    if (!!entry.highlighted === selected) return;
    if (selected) {
      entry.highlightStyles = [];
      const styles = entry.highlightStyles;
      const plate = isDark() ? '#445339' : '#fffdf8';
      rememberStyle(el, 'background-color', plate, styles);
      rememberStyle(el, 'color', isDark() ? '#eef7ef' : '#16382a', styles);
      rememberStyle(el, 'text-shadow', 'none', styles);
      rememberStyle(el, 'border-radius', '3px', styles);
      rememberStyle(el, 'box-shadow', `0 0 0 4px ${plate}, 0 0 0 5px #8fa99d, 0 4px 16px #0003`, styles);
    } else {
      for (const item of entry.highlightStyles || []) {
        if (el.style.getPropertyValue(item.property) !== item.applied || el.style.getPropertyPriority(item.property) !== 'important') continue;
        if (item.value) el.style.setProperty(item.property, item.value, item.priority);
        else el.style.removeProperty(item.property);
      }
      entry.highlightStyles = [];
    }
    entry.highlighted = selected; ownStyles.set(el, el.getAttribute('style'));
  }
  function animateScale(control, factor, selected) {
    const el = control.el;
    let entry = effects.get(el);
    if (!entry && factor <= 1.005) return;
    if (!entry) {
      entry = {styles: [], hadStyle: el.hasAttribute('style'), originalStyle: el.getAttribute('style'), originalCss: el.style.cssText, from: 1, to: 1};
      const css = getComputedStyle(el);
      // Transforms do not apply to ordinary inline anchors; restore display on exit.
      if (css.display === 'inline') rememberStyle(el, 'display', 'inline-block', entry.styles);
      if (css.position === 'static') rememberStyle(el, 'position', 'relative', entry.styles);
      rememberStyle(el, 'z-index', String(2147480000 + Math.round(factor * 1000)), entry.styles);
      ownStyles.set(el, el.getAttribute('style')); effects.set(el, entry);
    }
    setPickedStyle(el, entry, selected && factor > 1.005);
    if (Math.abs(entry.to - factor) < .005) return;
    const layer = String(2147480000 + Math.round(factor * 1000));
    const savedLayer = entry.styles.find(item => item.property === 'z-index');
    if (savedLayer && el.style.getPropertyValue('z-index') === savedLayer.applied) {
      el.style.setProperty('z-index', layer, 'important'); savedLayer.applied = layer;
      ownStyles.set(el, el.getAttribute('style'));
    }
    const progress = entry.animation?.effect.getComputedTiming().progress ?? 1;
    const from = entry.from + (entry.to - entry.from) * progress;
    entry.animation?.cancel(); entry.from = from; entry.to = factor;
    // Add to the original transform; leave the page's own transforms intact.
    const animation = el.animate([{transform: `scale(${from})`}, {transform: `scale(${factor})`}],
      {duration: reduceMotion.matches ? 0 : 120, easing: 'ease-out', fill: 'both', composite: 'add'});
    entry.animation = animation;
    animation.onfinish = () => { if (entry.animation === animation && entry.to <= 1.001) restoreEffect(el, entry); };
  }
  function sizeProfile(el, rect) {
    let fontSize = 0, count = 0;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (walker.nextNode() && count++ < 60) {
      const text = walker.currentNode;
      if (tidy(text.textContent) && text.parentElement && visible(text.parentElement))
        fontSize = Math.max(fontSize, parseFloat(getComputedStyle(text.parentElement).fontSize) || 0);
    }
    if (!fontSize) fontSize = parseFloat(getComputedStyle(el).fontSize) || 16;
    const imageLink = el.matches('a[href],[role="link"]') && [...el.querySelectorAll('img,svg,video,canvas')].some(media => {
      const box = media.getBoundingClientRect();
      return (box.width >= 160 || box.height >= 100) && box.width * box.height >= rect.width * rect.height * .45;
    });
    return {fontSize, imageLink};
  }
  function maxFor(control) {
    if (skipImages && control.imageLink) return 1;
    if (!smart) return zoom;
    return control.fontSize < 16 ? zoom : control.fontSize < 24 ? mediumZoom : largeZoom;
  }
  function drawDock() {
    frameRequest = null;
    if (!host || settingsOpen || !lensOn || !pointer || document.hidden) { stopEffects(); return; }
    const hit = document.elementFromPoint(pointer.x, pointer.y);
    const picked = source === 'focus' ? current?.el : controls.find(c => c.el === hit || (hit && c.el.contains(hit)))?.el;
    for (const control of controls) {
      const r = control.rect;
      const dx = Math.max(r.left - pointer.x, 0, pointer.x - r.right);
      const dy = Math.max(r.top - pointer.y, 0, pointer.y - r.bottom);
      const distance = Math.hypot(dx, dy);
      const weight = distance < proximity ? Math.pow(1 - distance / proximity, 2) : 0;
      // Oversized controls must still fit the viewport when magnified.
      const maxScale = Math.max(1, Math.min(maxFor(control), (innerWidth - 24) / r.width, (innerHeight - 24) / r.height));
      animateScale(control, 1 + (maxScale - 1) * weight, control.el === picked);
    }
  }
  function mark() {
    if (source === 'focus' && current) {
      const r = current.rect;
      pointer = {x: r.left + r.width / 2, y: r.top + r.height / 2};
    }
    if (frameRequest === null) frameRequest = requestAnimationFrame(drawDock);
  }
  function pointerMove(event) {
    showPointer(event);
    if (settingsOpen || !host) return;
    if (readerResize || event.composedPath().includes(reader)) { clearTimeout(previewLeaveTimer); previewLeaveTimer = null; pointer = null; stopEffects(); return; }
    if (readingOn) trackParagraph(event.target, event);
    source = 'pointer'; pointer = {x: event.clientX, y: event.clientY}; mark();
  }
  function pointerExit(event) {
    if (event.relatedTarget === null) { if (pointerRing) pointerRing.style.display = 'none'; if (pointerRing) pointerRing.style.display = 'none'; pointer = null; stopEffects(); clearTarget(); closeReader(); }
  }
  function pageVisibility() { if (document.hidden) { if (pointerRing) pointerRing.style.display = 'none'; stopEffects(); clearTarget(); closeReader(); } else mark(); }
  function invalidateFrame(event) { if (event?.composedPath().includes(sizePreview) || event?.composedPath().includes(reader)) return;
    if (event?.composedPath().includes(panel)) { placeSizePreview(); return; } closeReader(); scan(); }
  function selectControl(control) {
    clearTimeout(leaveTimer);
    const changed = current?.el !== control.el;
    if (changed) stopSpeech();
    current = control; mark();
    if (changed && audio) dwellTimer = setTimeout(() => {
      if (current?.el === control.el && !settingsOpen && tracking) speak(current);
    }, 550);
  }
  function scan() {
    if (!host) return;
    stopEffects();
    controls = [...document.querySelectorAll(targetSelector)].filter(el =>
      !host.contains(el) && !el.parentElement?.closest(targetSelector) && visible(el)
    ).map(el => {
      const rect = el.getBoundingClientRect();
      return {el, name: label(el), description: info(el), disabled: disabled(el), rect, ...sizeProfile(el, rect)};
    }).filter(c => c.name);
    if (current) {
      const updated = controls.find(c => c.el === current.el);
      if (updated) current = updated; else clearTarget();
    }
    if (!settingsOpen) mark();
  }
  function schedule() { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 220); }
  function pageEnter(event) {
    if (settingsOpen || !tracking || event.target === host) return;
    const el = event.target instanceof Element ? event.target.closest(targetSelector) : null;
    const control = controls.find(c => c.el === el);
    if (control) {
      if (event.type === 'pointerover') pointer = {x: event.clientX, y: event.clientY};
      source = event.type === 'focusin' || document.activeElement === el ? 'focus' : 'pointer';
      selectControl(control);
    }
  }
  function pageLeave(event) {
    if (settingsOpen || !current) return;
    const next = event.relatedTarget;
    if (next instanceof Node && current.el.contains(next)) return;
    if (event.type === 'pointerout' && source === 'focus' && document.activeElement === current.el) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      if (current && document.activeElement === current.el) return;
      clearTarget();
    }, 120);
  }
  function clearParagraph() {
    clearTimeout(paragraphTimer); clearTimeout(previewLeaveTimer);
    paragraphTimer = null; previewLeaveTimer = null; readingTarget = null;
    if (readingOutline) readingOutline.style.display = 'none';
  }
  function paragraphFor(target) {
    if (!(target instanceof Element) || target === host || target.closest(targetSelector + ',input,textarea,select,[contenteditable]:not([contenteditable="false"]),[onclick]')) return null;
    const el = target.closest('p,li,blockquote,pre,h1,h2,h3,h4,h5,h6');
    return el && visible(el) && tidy(el.innerText).length >= 12 ? el : null;
  }
  function trackParagraph(target, event) {
    const el = paragraphFor(target);
    if (!el) {
      clearTimeout(paragraphTimer); paragraphTimer = null;
      dismissedTarget = null;
      if (!previewLeaveTimer) previewLeaveTimer = setTimeout(() => { previewLeaveTimer = null; if (!readerResize && !reader.contains(root.activeElement)) closeReader(); }, 320);
      return;
    }
    clearTimeout(previewLeaveTimer); previewLeaveTimer = null;
    if (el === dismissedTarget || el === readingTarget) return;
    clearTimeout(paragraphTimer); readingTarget = el;
    const anchor = {x: event.clientX, y: event.clientY};
    paragraphTimer = setTimeout(() => {
      paragraphTimer = null;
      if (readingOn && !settingsOpen && readingTarget === el && visible(el)) openReader(el.innerText, anchor);
    }, 500);
  }
  function closeReader(suppress = false) {
    endReaderResize();
    const oldTarget = readingTarget;
    const hadFocus = reader?.contains(root?.activeElement);
    if (speechOwner === 'paragraph') stopSpeech();
    let resizedPopup = false;
    if (reader) {
      if (!reader.hidden) {
        const w = parseFloat(reader.style.width), h = parseFloat(reader.style.height);
        resizedPopup = (Number.isFinite(w) && Math.abs(w-popupWidth)>1) || (Number.isFinite(h) && Math.abs(h-popupHeight)>1);
        if (Number.isFinite(w)) popupWidth = Math.max(300,Math.min(760,w));
        if (Number.isFinite(h)) popupHeight = Math.max(280,Math.min(720,h));
      }
      reader.hidden = true; reader.querySelector('.reader-copy').textContent = ''; }
    clearParagraph();
    if (resizedPopup && enabled) savePreferences();
    if (suppress) dismissedTarget = oldTarget;
    if (hadFocus && readerReturnFocus?.isConnected) readerReturnFocus.focus({preventScroll: true});
  }
  function resizeReader(edge, start, dx, dy) {
    const clamp = (v,min,max) => Math.max(Math.min(min,max),Math.min(v,max));
    let left=start.left, top=start.top, right=start.right, bottom=start.bottom;
    const minW=Math.min(300,innerWidth-24), minH=Math.min(280,innerHeight-24);
    if(edge.includes('w')) left=clamp(start.left+dx,Math.max(12,right-760),right-minW);
    if(edge.includes('e')) right=clamp(start.right+dx,left+minW,Math.min(innerWidth-12,left+760));
    if(edge.includes('n')) top=clamp(start.top+dy,Math.max(12,bottom-720),bottom-minH);
    if(edge.includes('s')) bottom=clamp(start.bottom+dy,top+minH,Math.min(innerHeight-12,top+720));
    reader.style.left=left+'px';reader.style.top=top+'px';
    reader.style.width=(right-left)+'px';reader.style.height=(bottom-top)+'px';
    reader.style.maxHeight='calc(100dvh - 24px)';
  }
  function startReaderResize(event) {
    if(event.button!==0)return;
    event.preventDefault();event.stopPropagation();clearTimeout(previewLeaveTimer);
    readerResize={edge:event.currentTarget.dataset.edge,start:reader.getBoundingClientRect(),x:event.clientX,y:event.clientY,handle:event.currentTarget,id:event.pointerId};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveReaderResize(event) {
    if(!readerResize)return;
    event.preventDefault();resizeReader(readerResize.edge,readerResize.start,event.clientX-readerResize.x,event.clientY-readerResize.y);
  }
  function endReaderResize() {
    if(!readerResize)return;
    const state=readerResize;readerResize=null;
    if(state.handle.hasPointerCapture(state.id))state.handle.releasePointerCapture(state.id);
    clearTimeout(previewLeaveTimer);previewLeaveTimer=null;
  }
  function keyReaderResize(event) {
    const delta=event.shiftKey?32:16;
    const keys={ArrowLeft:[-delta,0],ArrowRight:[delta,0],ArrowUp:[0,-delta],ArrowDown:[0,delta]};
    if(!keys[event.key])return;
    event.preventDefault();event.stopPropagation();
    resizeReader(event.currentTarget.dataset.edge,reader.getBoundingClientRect(),...keys[event.key]);
  }
  function openReader(text, anchor = null, focus = false) {
    const value = (text || '').trim(); if (!value || !host || settingsOpen || !readingOn) return;
    clearTimeout(previewLeaveTimer); previewLeaveTimer = null;
    readerReturnFocus = document.activeElement;
    reader.querySelector('.reader-status').textContent = '';
    reader.querySelector('.reader-copy').textContent = value;
    reader.querySelector('.reader-copy').style.fontSize = readingSize + 'px';
    reader.querySelector('#reader-size').value = String(readingSize);
    reader.style.width = popupWidth + 'px'; reader.style.height = '';
    reader.style.maxHeight = `min(${popupHeight}px,calc(100dvh - 24px))`;
    reader.hidden = false;
    const point = anchor || {x: innerWidth / 2, y: innerHeight / 3};
    const box = reader.getBoundingClientRect();
    const left = point.x + 24 + box.width <= innerWidth - 12 ? point.x + 24 : Math.max(12, point.x - box.width - 24);
    const top = Math.max(12, Math.min(innerHeight - box.height - 12, point.y + 20));
    reader.style.left = left + 'px'; reader.style.top = top + 'px';
    if (focus) reader.querySelector('.reader-close').focus();
    if (audio) speak({name: 'Text', description: value, disabled: false}, 'paragraph');
  }
  function onKey(event) {
    if (event.key === 'Escape' && sizePreview && !sizePreview.hidden) { event.preventDefault(); event.stopPropagation(); closeSizePreview(); return; }
    if (event.key === 'Escape' && reader && !reader.hidden) { closeReader(true); return; }
    if (!settingsOpen && readingOn && event.altKey && event.shiftKey && (event.code === 'KeyR' || event.key.toLowerCase() === 'r')) {
      const text = getSelection()?.toString();
      if (text?.trim()) { event.preventDefault(); openReader(text, null, true); }
      return;
    }
    if (event.key !== 'Escape') return;
    if (settingsOpen && event.target === host) {
      event.preventDefault(); event.stopPropagation(); done();
    } else if (!settingsOpen && (current || speaking || pointer)) {
      // Do not consume Escape: the original page may also need it.
      clearTarget(); pointer = null; stopEffects(); clearParagraph();
    }
  }
  async function done() {
    closeSizePreview();
    enabled = true;
    if (!await savePreferences()) return;
    settingsOpen = false; stopEffects(); closeReader();
    clearTarget(); panel.hidden = true; pointer = null;
    announce('Settings hidden. Use the Chrome extension icon to change them.');
    root.activeElement?.blur();
    if (previousFocus?.isConnected && previousFocus !== document.body) previousFocus.focus({preventScroll: true});
  }
  function voiceStatus() {
    if (!audio) return 'Audio is off. Text and button enlargement work silently.';
    if (extensionStorage) return 'Audio is on. Pause over a control or text to hear it. Use Test audio to check your sound.';
    if (!('speechSynthesis' in globalThis)) return 'Read-aloud is unavailable in this browser.';
    if (!speechSynthesis.getVoices().some(v => v.localService)) return 'No local voice is ready. Enable a system voice and try audio again.';
    return 'Audio is on. Pause to hear the visible text or label.';
  }
  function syncSizeOptions() {
    root.querySelector('label[for="zoom"]').textContent = smart ? 'Small' : 'All text';
    root.querySelector('#medium').disabled = !smart;
    root.querySelector('#medium').closest('.speed-row').hidden = !smart;
    root.querySelector('#large').closest('.speed-row').hidden = !smart;
    root.querySelector('#zoom').closest('.speed-row').classList.add('active-size');
    root.querySelector('#large').disabled = !smart;
    if (!smart && ['medium','large'].includes(previewId)) closeSizePreview();
    updateExamples();
  }
  function syncModeOptions() {
    root.querySelector('#reading-size').disabled = !readingOn;
    root.querySelector('#text-options').hidden = !readingOn;
    root.querySelector('#audio-options').hidden = !audio;
    root.querySelector('#control-options').hidden = !lensOn;
    root.querySelector('#pointer-options').hidden = !pointerOn;
    syncSizeOptions();
    if (!lensOn && ['zoom','medium','large'].includes(previewId)) closeSizePreview();
    if (!readingOn && previewId==='reading-size') closeSizePreview();
    if (settingsOpen) requestAnimationFrame(placePanel);
  }
  function placePanel() {
    if (!panel || panel.hidden) return;
    if (!panelPosition) { panel.style.removeProperty('left'); panel.style.removeProperty('top'); panel.style.removeProperty('right'); placeSizePreview(); return; }
    const rect = panel.getBoundingClientRect();
    panelPosition.x = Math.max(8, Math.min(innerWidth - rect.width - 8, panelPosition.x));
    panelPosition.y = Math.max(8, Math.min(innerHeight - rect.height - 8, panelPosition.y));
    panel.style.left = panelPosition.x + 'px'; panel.style.top = panelPosition.y + 'px'; panel.style.right = 'auto'; placeSizePreview();
  }
  function dragStart(event) {
    if (event.button !== 0) return;
    const rect = panel.getBoundingClientRect();
    dragState = {id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};
    event.currentTarget.setPointerCapture(event.pointerId); event.currentTarget.focus(); event.preventDefault();
  }
  function dragMove(event) {
    if (!dragState || event.pointerId !== dragState.id) return;
    panelPosition = {x:dragState.left+event.clientX-dragState.x,y:dragState.top+event.clientY-dragState.y};
    placePanel(); placeSizePreview(); event.preventDefault();
  }
  function dragEnd(event) { if (dragState?.id === event.pointerId) dragState = null; }
  function dragKey(event) {
    const directions = {ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    if (!directions[event.key]) return;
    event.preventDefault(); const rect = panel.getBoundingClientRect(), step = event.shiftKey ? 40 : 20;
    panelPosition = {x:rect.left+directions[event.key][0]*step,y:rect.top+directions[event.key][1]*step}; placePanel();
  }
  function setPopupChoice(id, value) {
    const select = root.querySelector('#'+id);
    if (![...select.options].some(o=>o.value===String(value))) { const option = node('option','', 'Custom'); option.value=String(value); select.append(option); }
    select.value=String(value);
  }
  function showSettings() {
    closeSizePreview();
    previousFocus = document.activeElement === host ? previousFocus : document.activeElement;
    closeReader();
    settingsOpen = true; stopEffects(); pointer = null; clearTarget(); clearParagraph(); panel.hidden = false;
    panel.classList.toggle('left', side === 'left');
    placePanel();
    if (host.matches(':popover-open')) host.hidePopover();
    host.showPopover();
    root.querySelector('#audio').checked = audio;
    root.querySelector('#magnify').checked = lensOn;
    root.querySelector('#zoom').value = String(zoom);
    root.querySelector('#speed').value = String(speed);
    root.querySelector('#smart').checked = smart;
    root.querySelector('#medium').value = String(mediumZoom);
    root.querySelector('#large').value = String(largeZoom);
    root.querySelector('#skip-images').checked = skipImages;
    root.querySelector('#read-text').checked = readingOn;
    root.querySelector('#reading-size').value = String(readingSize);
    root.querySelector('#theme').value = theme;
    root.querySelector('#settings-size').value = String(settingsSize);
    setPopupChoice('popup-width',popupWidth); setPopupChoice('popup-height',popupHeight);
    root.querySelector('#pointer-on').checked = pointerOn;
    root.querySelector('#pointer-color').value = pointerColor;
    root.querySelector('#pointer-size').value = String(pointerSize);
    syncModeOptions(); applyAppearance();
    announce(globalThis.chrome?.runtime?.id ? voiceStatus() : 'This demo uses the same Dock magnification as the extension.'); root.querySelector('.settings-body').scrollTop = 0; root.querySelector('#theme').focus({preventScroll:true});
  }
  function close() {
    if (!host) return;
    closeSizePreview(); closeReader(); clearParagraph();
    settingsOpen = true; stopEffects(); pointer = null; clearTarget(); clearTimeout(scanTimer); observer.disconnect();
    document.removeEventListener('pointermove', pointerMove, true);
    document.removeEventListener('pointerout', pointerExit, true);
    document.removeEventListener('visibilitychange', pageVisibility);
    document.removeEventListener('pointerover', pageEnter, true);
    document.removeEventListener('pointerout', pageLeave, true);
    document.removeEventListener('focusin', pageEnter, true);
    document.removeEventListener('focusout', pageLeave, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', invalidateFrame, true); window.removeEventListener('resize', resized);
    host.remove(); host = null; controls = [];
    if (previousFocus?.isConnected) previousFocus.focus({preventScroll: true});
  }
  function resized() { closeReader(); placePanel(); placeSizePreview(); scan(); }
  function open(show = true) {
    if (host) { if (show) showSettings(); return; }
    host = document.createElement('div'); host.id = 'targetlens-extension-root';
    host.setAttribute('popover', 'manual');
    host.style.cssText = 'all:initial!important;position:fixed!important;inset:0!important;width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;pointer-events:none!important;overflow:visible!important;';
    root = host.attachShadow({mode: 'open'});
    const sheet = node('style'); sheet.textContent = style;
    panel = node('section', `panel${side === 'left' ? ' left' : ''}`);
    panel.setAttribute('aria-label', 'Seebee settings');
    panel.innerHTML = `<div class="top"><span class="logo" aria-hidden="true">◎</span><h2>Seebee settings</h2><button type="button" class="icon drag-handle" id="drag" aria-label="Move settings. Drag or use arrow keys" title="Drag to move · Arrow keys move too"><span class="grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></button></div><div class="settings-body"><p class="intro">Set it once. Keep your page clear.</p><div class="comfort-group"><h3 class="section-title">Make Seebee comfortable</h3><div class="speed-row"><label for="theme">Appearance</label><select id="theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></div><div class="speed-row"><label for="settings-size">Settings text</label><select id="settings-size"><option value="18">Normal</option><option value="20">Medium</option><option value="22">Large</option><option value="24">Extra large</option></select></div><label class="setting"><input id="pointer-on" type="checkbox">Bright pointer ring</label><div class="sub-options" id="pointer-options"><div class="speed-row"><label for="pointer-color">Pointer color</label><select id="pointer-color"><option value="#ffdc60">Yellow</option><option value="#ef4444">Red</option><option value="#fb8dc9">Pink</option><option value="#3478d4">Blue</option></select></div><div class="speed-row"><label for="pointer-size">Pointer size</label><select id="pointer-size"><option value="28">Normal</option><option value="40">Medium</option><option value="56">Large</option></select></div></div></div><label class="setting"><input id="read-text" type="checkbox">Enlarge text on hover</label><div class="sub-options" id="text-options"><div class="speed-row"><label for="reading-size">Reading text size</label><select id="reading-size"><option value="24">Normal</option><option value="28">Medium</option><option value="32">Large</option></select></div><div class="speed-row"><label for="popup-width">Popup width</label><select id="popup-width"><option value="360">Compact</option><option value="480">Medium</option><option value="640">Wide</option></select></div><div class="speed-row"><label for="popup-height">Popup height</label><select id="popup-height"><option value="320">Short</option><option value="480">Medium</option><option value="640">Tall</option></select></div><p class="hint">Drag any edge or corner of the reading popup to resize it.</p></div><label class="setting"><input id="audio" type="checkbox"><span id="audio-label">Audio on hover or focus</span></label><div class="sub-options" id="audio-options"><div class="speed-row"><label for="speed">Reading speed</label><select id="speed"><option value="0.8">0.8×</option><option value="1">1×</option><option value="1.2">1.2×</option><option value="1.5">1.5×</option></select></div><button type="button" class="action" id="test-audio">Test audio</button><button type="button" class="action" id="stop">Stop audio</button></div><label class="setting"><input id="magnify" type="checkbox" checked>Dock magnification near controls</label><fieldset class="control-options sub-options" id="control-options" aria-label="Button enlargement settings"><label class="setting"><input id="smart" type="checkbox" checked>Adapt enlargement to text size</label><div class="speed-row"><label for="zoom">Small</label><select id="zoom"><option value="1.5">1.5×</option><option value="2">2×</option><option value="3">3×</option></select></div><div class="speed-row"><label for="medium">Medium</label><select id="medium"><option value="1">No enlargement</option><option value="1.15">1.15×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></div><div class="speed-row"><label for="large">Large</label><select id="large"><option value="1">No enlargement</option><option value="1.1">1.1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option></select></div><label class="setting"><input id="skip-images" type="checkbox" checked>Keep large linked pictures at normal size</label></fieldset><p class="hint">Choose text enlargement, button magnification and audio independently. Done saves your choices for every website. Pause over a paragraph for a larger text popup; move away to dismiss it. No click needed. Selected text: Alt+Shift+R.<br><br>Chrome icon: reopen settings · Escape: stop audio and restore sizes.</p></div><div class="settings-actions"><button type="button" class="action done" id="done">Done · hide settings</button><button type="button" class="action" id="close">Turn off Seebee on all websites</button></div>`;
    status = node('p', 'hint status'); status.id = 'speech-status'; status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); panel.append(status);
    reader = node('section', 'reader'); reader.hidden = true; reader.setAttribute('role','region'); reader.setAttribute('aria-labelledby', 'reader-title');
    reader.innerHTML = '<div class="reader-top"><h2 id="reader-title">Read text</h2><button type="button" class="reader-close">Close</button></div><div class="reader-tools"><label for="reader-size">Text size</label><select id="reader-size"><option value="24">Normal</option><option value="28">Medium</option><option value="32">Large</option></select><button type="button" id="reader-listen">Listen</button><button type="button" id="reader-stop">Stop audio</button></div><p class="reader-copy" tabindex="0"></p><p class="reader-status reader-help" role="status" aria-live="polite"></p><p class="reader-help">Original website text · Esc to close · Reading text is not saved or sent.</p>';
    const readerContent = node('div','reader-content');
    while(reader.firstChild) readerContent.append(reader.firstChild);
    reader.append(readerContent);
    const edges={n:'top',s:'bottom',e:'right',w:'left',nw:'top left',ne:'top right',sw:'bottom left',se:'bottom right'};
    for (const [edge,label] of Object.entries(edges)) {
      const handle=node('button','reader-resize');handle.type='button';handle.dataset.edge=edge;
      handle.setAttribute('aria-label','Resize reading popup from '+label+'. Use arrow keys.');
      handle.addEventListener('pointerdown',startReaderResize);handle.addEventListener('pointermove',moveReaderResize);
      handle.addEventListener('pointerup',endReaderResize);handle.addEventListener('pointercancel',endReaderResize);handle.addEventListener('keydown',keyReaderResize);
      reader.append(handle);
    }
    reader.querySelector('.reader-close').addEventListener('click', () => closeReader(true));
    reader.addEventListener('pointerenter', () => { clearTimeout(previewLeaveTimer); previewLeaveTimer = null; });
    reader.addEventListener('pointerleave', event => { if (!paragraphFor(event.relatedTarget)) { clearTimeout(previewLeaveTimer); previewLeaveTimer = setTimeout(() => { previewLeaveTimer = null; if (!readerResize && !reader.contains(root.activeElement)) closeReader(); }, 320); } });
    reader.querySelector('#reader-size').addEventListener('change', event => { readingSize = Number(event.target.value); updateExamples(); reader.querySelector('.reader-copy').style.fontSize = readingSize + 'px'; savePreferences(); });
    reader.querySelector('#reader-listen').addEventListener('click', () => speak({name: 'Text', description: reader.querySelector('.reader-copy').textContent, disabled: false}, 'paragraph'));
    reader.querySelector('#reader-stop').addEventListener('click', () => { stopSpeech(); announce('Speech stopped.'); });
    readingOutline = node('div', 'reading-outline'); readingOutline.setAttribute('aria-hidden','true');
    pointerRing = node('div','pointer-ring'); pointerRing.setAttribute('aria-hidden','true');
    sizePreview=node('section','size-preview');sizePreview.id='size-preview';sizePreview.hidden=true;
    sizePreview.setAttribute('role','region');sizePreview.setAttribute('aria-labelledby','preview-title');
    sizePreview.innerHTML='<div class="preview-head"><h3 id="preview-title">Size preview</h3><button type="button" id="preview-close" aria-label="Close size preview">×</button></div><p id="preview-setting"></p><div class="preview-comparison"><div><span class="preview-label">Starting size</span><div class="preview-sample"><span id="preview-original">Seebee</span></div><span class="preview-note" id="preview-base-note"></span></div><div><span class="preview-label">Your setting</span><div class="preview-sample"><span id="preview-grown">Seebee</span></div><span class="preview-note" id="preview-result-note"></span></div></div><p id="preview-summary" role="status" aria-live="polite"></p><p class="preview-note">Small uses an 8px starting example, Medium 16px, and Large 24px. Actual website text varies.</p>';
    sizePreview.querySelector('#preview-close').addEventListener('click',closeSizePreview);
    root.append(sheet, readingOutline, panel, reader, sizePreview, pointerRing); document.documentElement.append(host); host.showPopover();
    for (const id of ['theme','settings-size','popup-width','popup-height','pointer-color','pointer-size']) root.querySelector('#'+id).addEventListener('change', event => {
      const v = event.target.value;
      if (id === 'theme') theme = v; else if (id === 'settings-size') settingsSize = Number(v);
      else if (id === 'popup-width') popupWidth = Number(v); else if (id === 'popup-height') popupHeight = Number(v);
      else if (id === 'pointer-color') pointerColor = v; else pointerSize = Number(v);
      applyAppearance();
    });
    for(const id of ['zoom','medium','large','reading-size']) {
      const select=root.querySelector('#'+id);select.setAttribute('aria-controls','size-preview');
      select.addEventListener('focus',()=>openSizePreview(id));select.addEventListener('change',()=>openSizePreview(id));
    }
    root.querySelector('#pointer-on').addEventListener('change', event => { pointerOn = event.target.checked; syncModeOptions(); applyAppearance(); });
    root.querySelector('#read-text').addEventListener('change', event => { readingOn = event.target.checked; closeReader(); syncModeOptions(); });
    const handle = root.querySelector('#drag');
    handle.addEventListener('pointerdown', dragStart); handle.addEventListener('pointermove', dragMove);
    handle.addEventListener('pointerup', dragEnd); handle.addEventListener('pointercancel', dragEnd); handle.addEventListener('keydown', dragKey);
    root.querySelector('#reading-size').addEventListener('change', event => { readingSize = Number(event.target.value); updateExamples(); });
    root.querySelector('#magnify').addEventListener('change', event => { lensOn = event.target.checked; stopEffects(); syncModeOptions(); mark(); });
    root.querySelector('#zoom').addEventListener('change', event => {
      zoom = Number(event.target.value);
      lensOn = true; root.querySelector('#magnify').checked = true;
      syncModeOptions(); mark();
    });
    root.querySelector('#audio').addEventListener('change', event => { audio = event.target.checked; stopSpeech(); syncModeOptions(); announce(voiceStatus()); });
    root.querySelector('#speed').addEventListener('change', event => { speed = Number(event.target.value); });
    root.querySelector('#smart').addEventListener('change', event => { smart = event.target.checked; syncSizeOptions(); });
    root.querySelector('#medium').addEventListener('change', event => { mediumZoom = Number(event.target.value); updateExamples(); });
    root.querySelector('#large').addEventListener('change', event => { largeZoom = Number(event.target.value); updateExamples(); });
    root.querySelector('#skip-images').addEventListener('change', event => { skipImages = event.target.checked; });
    root.querySelector('#test-audio').addEventListener('click', () => speak({name:'Seebee audio is working.'},'test'));
    root.querySelector('#stop').addEventListener('click', () => { stopSpeech(); announce('Speech stopped.'); });
    root.querySelector('#done').addEventListener('click', done);
    root.querySelector('#close').addEventListener('click', async () => { enabled = false; if (await savePreferences()) close(); });
    document.addEventListener('pointermove', pointerMove, true);
    document.addEventListener('pointerout', pointerExit, true);
    document.addEventListener('visibilitychange', pageVisibility);
    document.addEventListener('pointerover', pageEnter, true); document.addEventListener('pointerout', pageLeave, true);
    document.addEventListener('focusin', pageEnter, true); document.addEventListener('focusout', pageLeave, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', invalidateFrame, true); window.addEventListener('resize', resized);
    observer = new MutationObserver(records => { if (records.some(r => r.target !== host && !host.contains(r.target) && !(r.type === 'attributes' && r.attributeName === 'style' && ownStyles.has(r.target) && ownStyles.get(r.target) === r.target.getAttribute('style')))) schedule(); });
    observer.observe(document.documentElement, {subtree: true, childList: true, attributes: true, characterData: true});
    if ('speechSynthesis' in globalThis) speechSynthesis.getVoices();
    applyAppearance(); scan();
    if (show) showSettings();
    else { settingsOpen = false; panel.hidden = true; }
  }
  async function invoke() { await ready; open(true); }
  globalThis[KEY] = Object.freeze({open: invoke, close, toggle: invoke});
  if (extensionStorage) chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[PREF_KEY]) return;
    applyPreferences(changes[PREF_KEY].newValue); applyAppearance();
    if (!readingOn) closeReader();
    if (!enabled) { if (host) close(); return; }
    if (!host) open(false);
    else { stopEffects(); scan(); if (settingsOpen) showSettings(); }
  });
  ready.then(() => {
    if (automatic) { if (enabled) open(false); }
    else if (!preview) open(true);
  });
})();
