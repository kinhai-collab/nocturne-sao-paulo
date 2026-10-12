/* Add this as Code.gs and add Forge.gs as a second Apps Script file. */
const POLL_ID = 'sao-paulo-2026', MAX_CHOICES = 5;
const IDS = ['evvai','tuju','d-o-m','fame-osteria','jun-sakamoto','kan-suke','kanoe','kazuo','kinoshita','kuro','mani','murakami','oizumi-sushi','picchi','ryo-gastronomia','tangara-jean-georges'];
const NAMES = ['Evvai','Tuju','D.O.M.','Fame Osteria','Jun Sakamoto','Kan Suke','KANOE','Kazuo','Kinoshita','Kuro','Maní','Murakami','Oizumi Sushi','Picchi','Ryo Gastronomia','Tangará Jean-Georges'];
function setup() {
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', SpreadsheetApp.getActiveSpreadsheet().getId());sheet_();
}
function sheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first.');
  const ss = SpreadsheetApp.openById(id);
  // Preserve the earlier anonymous Votes tab rather than mixing incompatible records.
  let sheet = ss.getSheetByName('VotesGoogleV2');
  if (!sheet) {sheet = ss.insertSheet('VotesGoogleV2');sheet.appendRow(['Timestamp','Poll ID','Google account ID','Name','Email','Choices JSON','Restaurants']);}
  return sheet;
}
function allowed_(origin) {
  return (PropertiesService.getScriptProperties().getProperty('ALLOWED_ORIGINS') || '').split(',').map(s => s.trim()).includes(origin);
}
function safeCell_(value) {
  const text = String(value || '').slice(0,300);
  return /^[\s]*[=+\-@]/.test(text) ? "'" + text : text;
}
function googleCertificates_(force) {
  const cache = CacheService.getScriptCache(), key = 'google-rs256-certs-v1', cached = force ? null : cache.get(key);
  if (cached) return JSON.parse(cached);
  const result = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v1/certs', {muteHttpExceptions:true});
  if (result.getResponseCode() !== 200) throw new Error('Google verification is temporarily unavailable. Please retry.');
  const certs = JSON.parse(result.getContentText()), headers = result.getAllHeaders();
  const cacheHeader = Object.keys(headers).find(k => k.toLowerCase() === 'cache-control');
  const maxAge = Number(String(headers[cacheHeader] || '').match(/max-age=(\d+)/)?.[1] || 300);
  if (maxAge > 0) cache.put(key, JSON.stringify(certs), Math.min(maxAge,21600));
  return certs;
}
function verifyGoogle_(token, nonce, origin) {
  const clientId = PropertiesService.getScriptProperties().getProperty('GOOGLE_CLIENT_ID');
  if (!clientId) throw new Error('Google sign-in is not configured by the organizer.');
  if (typeof token !== 'string' || token.length > 10000) throw new Error('Invalid Google credential.');
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some(s=>!s || !/^[A-Za-z0-9_-]+$/.test(s))) throw new Error('Invalid Google credential.');
  const decode = part => JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString());
  const header = decode(parts[0]), claims = decode(parts[1]);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('Invalid Google signature algorithm.');
  let certs = googleCertificates_(false);
  if (!Object.prototype.hasOwnProperty.call(certs,header.kid)) certs = googleCertificates_(true);
  const cert = certs[header.kid];if (!cert) throw new Error('Unknown Google signing key.');
  const digest = forge.md.sha256.create();digest.update(parts[0]+'.'+parts[1],'utf8');
  const signature = forge.util.decode64(parts[2].replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(parts[2].length/4)*4,'='));
  if (!forge.pki.certificateFromPem(cert).publicKey.verify(digest.digest().bytes(),signature)) throw new Error('Invalid Google signature.');
  const now = Math.floor(Date.now()/1000);
  if (claims.aud !== clientId || (claims.azp && claims.azp !== clientId)) throw new Error('Google credential was issued to a different website.');
  if (!['accounts.google.com','https://accounts.google.com'].includes(claims.iss)) throw new Error('Invalid Google issuer.');
  if (!Number.isFinite(claims.exp) || claims.exp <= now || !Number.isFinite(claims.iat) || claims.iat > now+60 || (claims.nbf && claims.nbf > now+60)) throw new Error('Google sign-in expired. Sign out and sign in again.');
  if (typeof claims.sub !== 'string' || !/^[0-9]{1,255}$/.test(claims.sub) || claims.email_verified !== true || typeof claims.email !== 'string') throw new Error('A Google account with a verified email is required.');
  if (!/^[a-zA-Z0-9-]{60,80}$/.test(nonce || '') || claims.nonce !== nonce) throw new Error('Invalid sign-in challenge. Sign in again.');
  const challenge = CacheService.getScriptCache().get('nonce:'+nonce);
  if (!challenge || JSON.parse(challenge).origin !== origin || JSON.parse(challenge).pollId !== POLL_ID) throw new Error('Sign-in challenge expired. Sign out and sign in again.');
  return {sub:claims.sub, name:claims.name || '', email:claims.email};
}
function doPost(e) {
  const p = e.parameter || {}, origin = p.origin || '', requestId = p.requestId || '';
  if (!allowed_(origin)) return HtmlService.createHtmlOutput('Origin not configured.');
  let response = {type:'mesa-vote', requestId:requestId, ok:false}, lock;
  try {
    if (p.pollId !== POLL_ID) throw new Error('Unknown poll.');
    if (!/^[a-zA-Z0-9-]{20,64}$/.test(requestId)) throw new Error('Invalid ballot identifier.');
    if ((p.choices || '').length > 1000) throw new Error('Ballot too large.');
    const choices = JSON.parse(p.choices || '[]');
    if (!Array.isArray(choices) || choices.length < 1 || choices.length > MAX_CHOICES || new Set(choices).size !== choices.length || choices.some(id => !IDS.includes(id))) throw new Error('Choose 1–5 distinct restaurants.');
    const person = verifyGoogle_(p.credential,p.nonce,origin);
    lock = LockService.getScriptLock();lock.waitLock(10000);
    const s = sheet_(), rows = s.getDataRange().getValues();
    const existing = rows.slice(1).find(row => row[1] === POLL_ID && String(row[2]) === person.sub);
    if (existing) {
      const prior = JSON.parse(existing[5]);
      if (JSON.stringify(prior.slice().sort()) !== JSON.stringify(choices.slice().sort())) throw new Error('This Google account has already submitted a different ballot.');
    } else {
      // Apostrophe preserves the long numeric Google subject as text in Sheets.
      s.appendRow([new Date(), POLL_ID, "'"+person.sub, safeCell_(person.name), safeCell_(person.email), JSON.stringify(choices), choices.map(id=>NAMES[IDS.indexOf(id)]).join(', ')]);SpreadsheetApp.flush();
    }
    response.ok = true;
  } catch (err) {response.error = String(err.message || 'Could not save ballot.');}
  finally {if (lock && lock.hasLock()) lock.releaseLock();}
  const message = JSON.stringify(response).replace(/</g,'\\u003c');
  return HtmlService.createHtmlOutput('<!doctype html><script>window.top.postMessage('+message+','+JSON.stringify(origin)+');</script>').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function doGet(e) {
  const p = e.parameter || {}, callback = p.callback || '';
  if (!/^mesaResults_[a-zA-Z0-9]{1,64}$/.test(callback)) return ContentService.createTextOutput('Invalid callback.');
  let data;
  try {
    if (p.pollId !== POLL_ID) throw new Error('Unknown poll.');
    if (p.action === 'challenge') {
      if (!allowed_(p.origin)) throw new Error('Origin not configured.');
      const nonce = Utilities.getUuid()+Utilities.getUuid();
      CacheService.getScriptCache().put('nonce:'+nonce, JSON.stringify({origin:p.origin,pollId:POLL_ID}),600);data = {nonce:nonce};
    } else {
      // Only aggregate counts are public; never names, emails, subjects or individual ballots.
      const counts = Object.fromEntries(IDS.map(id => [id,0]));
      sheet_().getDataRange().getValues().slice(1).filter(row=>row[1]===POLL_ID).forEach(row=>{
        JSON.parse(row[5]).forEach(id=>{if (IDS.includes(id)) counts[id]++;});
      });data = {counts:counts};
    }
  } catch (err) {data = {error:String(err.message || 'Could not load poll.')};}
  return ContentService.createTextOutput(callback+'('+JSON.stringify(data).replace(/</g,'\\u003c')+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}
