/******************** IMPORTS ********************/
const { Telegraf, session } = require("telegraf");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { authenticator } = require("otplib");


/******************** YOUR CONFIGURATION ********************/
const BOT_TOKEN = "8657128372:AAFArlAPVAaCEnriPz_3Wn3xc1EQUjldLH8";
const ADMIN_PASSWORD = "mamun1132";

// ⚠️ IMPORTANT: Replace the IDs below with your actual IDs ⚠️
const MAIN_CHANNEL = "@updaterange";
const MAIN_CHANNEL_ID = -1001893817371;

const CHAT_GROUP = "https://t.me/updaterange1";
const CHAT_GROUP_ID = -1001522463424;

const OTP_GROUP = "https://t.me/otpreceived1";
const OTP_GROUP_ID = -1001153782407;

// ─── Baileys WhatsApp API ───
const BAILEYS_URL = process.env.BAILEYS_URL || "http://localhost:3000";

// WA Sessions store (memory)
const waSessions = {}; // { userId: { connected: bool } }

/******************** FILES ********************/
const DATA_DIR = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : __dirname;

console.log(`📁 Data Directory: ${DATA_DIR}`);

const NUMBERS_FILE = path.join(DATA_DIR, "numbers.txt");
const COUNTRIES_FILE = path.join(DATA_DIR, "countries.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SERVICES_FILE = path.join(DATA_DIR, "services.json");
const ACTIVE_NUMBERS_FILE = path.join(DATA_DIR, "active_numbers.json");
const OTP_LOG_FILE = path.join(DATA_DIR, "otp_log.json");
const ADMINS_FILE = path.join(DATA_DIR, "admins.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const TOTP_SECRETS_FILE = path.join(DATA_DIR, "totp_secrets.json");
const TEMP_MAILS_FILE = path.join(DATA_DIR, "temp_mails.json");
const EARNINGS_FILE = path.join(DATA_DIR, "earnings.json");
const WITHDRAW_FILE = path.join(DATA_DIR, "withdrawals.json");
const COUNTRY_PRICES_FILE = path.join(DATA_DIR, "country_prices.json");

/******************** DEFAULT SETTINGS ********************/
let settings = {
  defaultNumberCount: 5,
  cooldownSeconds: 5,
  requireVerification: true,
  minWithdraw: 50,
  defaultOtpPrice: 0.25,
  withdrawMethods: ["bKash", "Nagad"],
  withdrawEnabled: true
};

/******************** LOAD SETTINGS ********************/
if (fs.existsSync(SETTINGS_FILE)) {
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading settings:", e);
  }
} else {
  saveSettings();
}

if (!BOT_TOKEN) {
  console.error("❌ BOT_TOKEN not set correctly");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

/******************** LOAD DATA ********************/
let countries = {};
if (fs.existsSync(COUNTRIES_FILE)) {
  try {
    countries = JSON.parse(fs.readFileSync(COUNTRIES_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading countries:", e);
    countries = {};
  }
} else {
  countries = {
    "92": { name: "Pakistan", flag: "🇵🇰" },
    "880": { name: "Bangladesh", flag: "🇧🇩" },
    "91": { name: "India", flag: "🇮🇳" },
    "1": { name: "USA", flag: "🇺🇸" },
    "44": { name: "UK", flag: "🇬🇧" },
    "7": { name: "Russia", flag: "🇷🇺" },
    "227": { name: "Niger", flag: "🇳🇪" },
    "254": { name: "Kenya", flag: "🇰🇪" },
    "593": { name: "Ecuador", flag: "🇪🇨" },
    "964": { name: "Iraq", flag: "🇮🇶" },
    "967": { name: "Yemen", flag: "🇾🇪" },
    "977": { name: "Nepal", flag: "🇳🇵" }
  };
  saveCountries();
}

let services = {};
if (fs.existsSync(SERVICES_FILE)) {
  try {
    services = JSON.parse(fs.readFileSync(SERVICES_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading services:", e);
    services = {};
  }
} else {
  services = {
    "whatsapp": { name: "WhatsApp", icon: "📱" },
    "telegram": { name: "Telegram", icon: "🪁" },
    "facebook": { name: "Facebook", icon: "📘" },
    "instagram": { name: "Instagram", icon: "📸" },
    "google": { name: "Google", icon: "🔍" },
    "other": { name: "Other", icon: "🔧" }
  };
  saveServices();
}

let numbersByCountryService = {};
if (fs.existsSync(NUMBERS_FILE)) {
  try {
    const lines = fs.readFileSync(NUMBERS_FILE, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (!lineTrimmed) continue;
      let number, countryCode, service;
      if (lineTrimmed.includes("|")) {
        const parts = lineTrimmed.split("|");
        if (parts.length >= 3) {
          number = parts[0].trim();
          countryCode = parts[1].trim();
          service = parts[2].trim();
        } else if (parts.length === 2) {
          number = parts[0].trim();
          countryCode = parts[1].trim();
          service = "other";
        } else {
          continue;
        }
      } else {
        number = lineTrimmed;
        countryCode = getCountryCodeFromNumber(number);
        service = "other";
      }
      if (!/^\d{10,15}$/.test(number)) continue;
      if (!countryCode) continue;
      numbersByCountryService[countryCode] = numbersByCountryService[countryCode] || {};
      numbersByCountryService[countryCode][service] = numbersByCountryService[countryCode][service] || [];
      if (!numbersByCountryService[countryCode][service].includes(number)) {
        numbersByCountryService[countryCode][service].push(number);
      }
    }
    console.log(`✅ Loaded numbers`);
  } catch (e) {
    console.error("❌ Error loading numbers:", e);
    numbersByCountryService = {};
  }
}

let users = {};
if (fs.existsSync(USERS_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading users:", e);
    users = {};
  }
}

let activeNumbers = {};
if (fs.existsSync(ACTIVE_NUMBERS_FILE)) {
  try {
    activeNumbers = JSON.parse(fs.readFileSync(ACTIVE_NUMBERS_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading active numbers:", e);
    activeNumbers = {};
  }
}

let otpLog = [];
if (fs.existsSync(OTP_LOG_FILE)) {
  try {
    otpLog = JSON.parse(fs.readFileSync(OTP_LOG_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading OTP log:", e);
    otpLog = [];
  }
}

let admins = [];
if (fs.existsSync(ADMINS_FILE)) {
  try {
    admins = JSON.parse(fs.readFileSync(ADMINS_FILE, 'utf8'));
  } catch (e) {
    console.error("Error loading admins:", e);
    admins = [];
  }
}

let totpSecrets = {};
if (fs.existsSync(TOTP_SECRETS_FILE)) {
  try { totpSecrets = JSON.parse(fs.readFileSync(TOTP_SECRETS_FILE, 'utf8')); }
  catch (e) { totpSecrets = {}; }
}

let tempMails = {};
if (fs.existsSync(TEMP_MAILS_FILE)) {
  try { tempMails = JSON.parse(fs.readFileSync(TEMP_MAILS_FILE, 'utf8')); }
  catch (e) { tempMails = {}; }
}

let earnings = {};
if (fs.existsSync(EARNINGS_FILE)) {
  try { earnings = JSON.parse(fs.readFileSync(EARNINGS_FILE, 'utf8')); }
  catch (e) { earnings = {}; }
}

let withdrawals = [];
if (fs.existsSync(WITHDRAW_FILE)) {
  try { withdrawals = JSON.parse(fs.readFileSync(WITHDRAW_FILE, 'utf8')); }
  catch (e) { withdrawals = []; }
}

let countryPrices = {};
if (fs.existsSync(COUNTRY_PRICES_FILE)) {
  try { countryPrices = JSON.parse(fs.readFileSync(COUNTRY_PRICES_FILE, 'utf8')); }
  catch (e) { countryPrices = {}; }
}

/******************** SAVE FUNCTIONS ********************/
function saveSettings() {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error("❌ Error saving settings:", error);
  }
}

function saveNumbers() {
  try {
    const lines = [];
    for (const countryCode in numbersByCountryService) {
      for (const service in numbersByCountryService[countryCode]) {
        for (const number of numbersByCountryService[countryCode][service]) {
          lines.push(`${number}|${countryCode}|${service}`);
        }
      }
    }
    fs.writeFileSync(NUMBERS_FILE, lines.join("\n"));
  } catch (error) {
    console.error("❌ Error saving numbers:", error);
  }
}

function saveCountries() {
  try {
    fs.writeFileSync(COUNTRIES_FILE, JSON.stringify(countries, null, 2));
  } catch (error) {
    console.error("❌ Error saving countries:", error);
  }
}

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error("❌ Error saving users:", error);
  }
}

function saveServices() {
  try {
    fs.writeFileSync(SERVICES_FILE, JSON.stringify(services, null, 2));
  } catch (error) {
    console.error("❌ Error saving services:", error);
  }
}

function saveActiveNumbers() {
  try {
    fs.writeFileSync(ACTIVE_NUMBERS_FILE, JSON.stringify(activeNumbers, null, 2));
  } catch (error) {
    console.error("❌ Error saving active numbers:", error);
  }
}

function saveOTPLog() {
  try {
    fs.writeFileSync(OTP_LOG_FILE, JSON.stringify(otpLog.slice(-1000), null, 2));
  } catch (error) {
    console.error("❌ Error saving OTP log:", error);
  }
}

function saveAdmins() {
  try {
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(admins, null, 2));
  } catch (error) {
    console.error("❌ Error saving admins:", error);
  }
}

function saveTotpSecrets() {
  try {
    fs.writeFileSync(TOTP_SECRETS_FILE, JSON.stringify(totpSecrets, null, 2));
  } catch (error) {
    console.error("❌ Error saving TOTP secrets:", error);
  }
}

function saveTempMails() {
  try {
    fs.writeFileSync(TEMP_MAILS_FILE, JSON.stringify(tempMails, null, 2));
  } catch (error) {
    console.error("❌ Error saving temp mails:", error);
  }
}

function saveEarnings() {
  try {
    fs.writeFileSync(EARNINGS_FILE, JSON.stringify(earnings, null, 2));
  } catch (error) {
    console.error("❌ Error saving earnings:", error);
  }
}

function saveWithdrawals() {
  try {
    fs.writeFileSync(WITHDRAW_FILE, JSON.stringify(withdrawals, null, 2));
  } catch (error) {
    console.error("❌ Error saving withdrawals:", error);
  }
}

function saveCountryPrices() {
  try {
    fs.writeFileSync(COUNTRY_PRICES_FILE, JSON.stringify(countryPrices, null, 2));
  } catch (error) {
    console.error("❌ Error saving country prices:", error);
  }
}

/******************** EARNINGS HELPERS ********************/
function getUserEarnings(userId) {
  const uid = userId.toString();
  if (!earnings[uid]) {
    earnings[uid] = { balance: 0, totalEarned: 0, otpCount: 0 };
  }
  return earnings[uid];
}

function getOtpPriceForCountry(countryCode) {
  return countryPrices[countryCode] !== undefined
    ? countryPrices[countryCode]
    : (settings.defaultOtpPrice || 0.25);
}

function addEarning(userId, countryCode) {
  const uid = userId.toString();
  const price = getOtpPriceForCountry(countryCode);
  if (!earnings[uid]) earnings[uid] = { balance: 0, totalEarned: 0, otpCount: 0 };
  earnings[uid].balance = parseFloat((earnings[uid].balance + price).toFixed(2));
  earnings[uid].totalEarned = parseFloat((earnings[uid].totalEarned + price).toFixed(2));
  earnings[uid].otpCount = (earnings[uid].otpCount || 0) + 1;
  saveEarnings();
  return price;
}

/******************** HELPER FUNCTIONS ********************/
function isAdmin(userId) {
  return admins.includes(userId.toString());
}

function getCountryCodeFromNumber(n) {
  const numStr = n.toString();
  const code3 = numStr.slice(0, 3);
  if (countries[code3]) return code3;
  const code2 = numStr.slice(0, 2);
  if (countries[code2]) return code2;
  const code1 = numStr.slice(0, 1);
  if (countries[code1]) return code1;
  return null;
}

function getCountryFromNumber(number) {
  const numStr = number.toString();
  for (const length of [3, 2, 1]) {
    const code = numStr.slice(0, length);
    if (countries[code]) {
      return countries[code];
    }
  }
  return { name: "Unknown", flag: "🏴‍☠️" };
}

function getAvailableCountriesForService(service) {
  const availableCountries = [];
  for (const countryCode in numbersByCountryService) {
    if (numbersByCountryService[countryCode][service] && 
        numbersByCountryService[countryCode][service].length > 0 &&
        countries[countryCode]) {
      availableCountries.push(countryCode);
    }
  }
  return availableCountries;
}

function getMultipleNumbersByCountryAndService(countryCode, service, userId, count) {
  if (!numbersByCountryService[countryCode] || !numbersByCountryService[countryCode][service]) {
    return [];
  }
  if (numbersByCountryService[countryCode][service].length < count) {
    return [];
  }
  const numbers = [];
  for (let i = 0; i < count; i++) {
    const number = numbersByCountryService[countryCode][service].shift();
    numbers.push(number);
    activeNumbers[number] = {
      userId: userId,
      countryCode: countryCode,
      service: service,
      assignedAt: new Date().toISOString(),
      lastOTP: null,
      otpCount: 0
    };
  }
  saveNumbers();
  saveActiveNumbers();
  return numbers;
}

function extractPhoneNumberFromMessage(text) {
  if (!text) return null;
  const fullMatch = text.match(/\+?(\d{10,15})/);
  if (fullMatch) {
    const num = fullMatch[1];
    if (num.length >= 10 && num.length <= 15) return num;
  }
  return null;
}

function findMatchingActiveNumber(messageText) {
  const allActive = Object.keys(activeNumbers);
  if (allActive.length === 0) return null;
  const extracted = extractPhoneNumberFromMessage(messageText);
  if (extracted) {
    if (activeNumbers[extracted]) return extracted;
    const noPlus = extracted.replace(/^\+/, '');
    if (activeNumbers[noPlus]) return noPlus;
  }
  for (const num of allActive) {
    if (messageText.includes(num)) return num;
  }
  for (const num of allActive) {
    const last8 = num.slice(-8);
    if (messageText.includes(last8)) return num;
  }
  for (const num of allActive) {
    const last6 = num.slice(-6);
    if (messageText.includes(last6)) return num;
  }
  for (const num of allActive) {
    const last4 = num.slice(-4);
    if (last4 && messageText.includes(last4)) return num;
  }
  return null;
}

function extractOTPCode(text) {
  if (!text) return null;
  const patterns = [
    /(?:otp|code|pin|verification|verify|token)[^\d]{0,10}(\d{4,8})/i,
    /(?:is|has|:)\s*(\d{4,8})\b/i,
    /\b(\d{6})\b/,
    /\b(\d{4})\b/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m && m[1] && m[1].length >= 4 && m[1].length <= 8) return m[1];
  }
  return null;
}

function getTimeAgo(date) {
  try {
    if (!date || isNaN(new Date(date))) return "unknown";
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = Math.floor(seconds / 31536000);
    if (interval >= 1) return interval + " years ago";
    interval = Math.floor(seconds / 2592000);
    if (interval >= 1) return interval + " months ago";
    interval = Math.floor(seconds / 86400);
    if (interval >= 1) return interval + " days ago";
    interval = Math.floor(seconds / 3600);
    if (interval >= 1) return interval + " hours ago";
    interval = Math.floor(seconds / 60);
    if (interval >= 1) return interval + " minutes ago";
    return Math.floor(seconds) + " seconds ago";
  } catch(e) { return "unknown"; }
}

function generateRandomString(length) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/******************** EMAIL SYSTEM - Mail.tm ********************/
function mailTmRequest(method, path, body, token) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.mail.tm',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode === 429) {
          console.error(`❌ Mail.tm rate limited`);
          resolve({ _rateLimit: true });
          return;
        }
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', (e) => { console.error(`Mail.tm request error: ${e.message}`); resolve(null); });
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    if (data) req.write(data);
    req.end();
  });
}

function randomPassword() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let pass = '';
  for (let i = 0; i < 16; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

function randomUsername() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let name = '';
  for (let i = 0; i < 12; i++) name += chars[Math.floor(Math.random() * chars.length)];
  return name;
}

async function createFreshEmail() {
  try {
    const domains = await mailTmRequest('GET', '/domains?page=1');
    const domainList = Array.isArray(domains) ? domains : (domains?.['hydra:member'] || []);
    if (!domainList.length) return null;
    const domain = domainList[0].domain;
    const username = randomUsername();
    const password = randomPassword();
    const address = `${username}@${domain}`;
    let account = null;
    for (let i = 1; i <= 3; i++) {
      account = await mailTmRequest('POST', '/accounts', { address, password });
      if (account && account.id) break;
      if (account?._rateLimit) await new Promise(r => setTimeout(r, 3000));
      else break;
    }
    if (!account || !account.id) return null;
    const tokenRes = await mailTmRequest('POST', '/token', { address, password });
    if (!tokenRes || !tokenRes.token) return null;
    return {
      address,
      sidToken: tokenRes.token,
      provider: 'mailtm',
      createdAt: new Date().toISOString()
    };
  } catch(e) {
    console.error('❌ Mail.tm error:', e.message);
    return null;
  }
}

async function getEmailInbox(emailObj) {
  try {
    const data = await mailTmRequest('GET', '/messages?page=1', null, emailObj.sidToken);
    const msgList = Array.isArray(data) ? data : (data?.['hydra:member'] || []);
    return msgList.map(m => ({
        id: m.id,
        from: m.from?.address || '',
        subject: m.subject || '',
        date: m.createdAt || ''
      }));
  } catch(e) { return []; }
}

async function getEmailMessage(id, emailObj) {
  try {
    const data = await mailTmRequest('GET', `/messages/${id}`, null, emailObj.sidToken);
    if (!data) return '';
    const text = data.text || '';
    const html = data.html?.[0] || '';
    return (text || html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  } catch(e) { return ''; }
}

function generateTOTP(secret) {
  try {
    const cleanSecret = secret.replace(/\s/g, "").toUpperCase();
    authenticator.options = { step: 30 };
    const token = authenticator.generate(cleanSecret);
    const timeRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);
    return { token, timeRemaining };
  } catch (e) { return null; }
}

/******************** BAILEYS API HELPER ********************/
function baileysRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const http = require("http");
    const data = body ? JSON.stringify(body) : null;
    const urlObj = new URL(BAILEYS_URL + urlPath);
    const options = {
      hostname: urlObj.hostname,
      port: parseInt(urlObj.port) || 3000,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(options, (res) => {
      let d = "";
      res.on("data", c => d += c);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({}); }
      });
    });
    req.on("error", () => resolve({}));
    req.setTimeout(15000, () => { req.destroy(); resolve({}); });
    if (data) req.write(data);
    req.end();
  });
}

/******************** VERIFICATION FUNCTION ********************/
async function checkUserMembership(ctx) {
  try {
    const userId = ctx.from.id;

    let isMainChannelMember = false;
    let isChatGroupMember = false;
    let isOTPGroupMember = false;

    try {
      const chatMember = await ctx.telegram.getChatMember(MAIN_CHANNEL_ID, userId);
      isMainChannelMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
      console.log("Main channel check error:", error.message);
    }

    try {
      const chatMember = await ctx.telegram.getChatMember(CHAT_GROUP_ID, userId);
      isChatGroupMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
      console.log("Chat group check error:", error.message);
    }

    try {
      const chatMember = await ctx.telegram.getChatMember(OTP_GROUP_ID, userId);
      isOTPGroupMember = ['member', 'administrator', 'creator'].includes(chatMember.status);
    } catch (error) {
      console.log("OTP group check error:", error.message);
    }

    const allJoined = isMainChannelMember && isChatGroupMember && isOTPGroupMember;

    console.log(`📊 Membership [${userId}]: main=${isMainChannelMember} chat=${isChatGroupMember} otp=${isOTPGroupMember} all=${allJoined}`);

    return {
      mainChannel: isMainChannelMember,
      chatGroup: isChatGroupMember,
      otpGroup: isOTPGroupMember,
      allJoined: allJoined
    };

  } catch (error) {
    console.error("Membership check fatal error:", error);
    return {
      mainChannel: false,
      chatGroup: false,
      otpGroup: false,
      allJoined: false
    };
  }
}

/******************** SESSION MIDDLEWARE ********************/
bot.use(session({
  defaultSession: () => ({
    verified: false,
    isAdmin: false,
    adminState: null,
    adminData: null,
    currentNumbers: [],
    currentService: null,
    currentCountry: null,
    lastNumberTime: 0,
    lastMessageId: null,
    lastChatId: null,
    lastVerificationCheck: 0,
    totpState: null,
    totpData: null,
    mailState: null,
    withdrawState: null,
    withdrawData: null,
    waState: null
  })
}));

bot.use((ctx, next) => {
  if (ctx.from) {
    const userId = ctx.from.id.toString();
    if (!users[userId]) {
      users[userId] = {
        id: userId,
        username: ctx.from.username || 'no_username',
        first_name: ctx.from.first_name || 'User',
        last_name: ctx.from.last_name || '',
        joined: new Date().toISOString(),
        last_active: new Date().toISOString(),
        verified: ctx.session?.verified || false
      };
      saveUsers();
    } else {
      users[userId].last_active = new Date().toISOString();
      saveUsers();
    }
  }
  if (!ctx.session) {
    ctx.session = {
      verified: false,
      isAdmin: false,
      adminState: null,
      adminData: null,
      currentNumbers: [],
      currentService: null,
      currentCountry: null,
      lastNumberTime: 0,
      lastMessageId: null,
      lastChatId: null,
      lastVerificationCheck: 0,
      totpState: null,
      totpData: null,
      mailState: null,
      withdrawState: null,
      withdrawData: null
    };
  }
  if (ctx.from && !ctx.session.isAdmin) {
    ctx.session.isAdmin = isAdmin(ctx.from.id.toString());
  }
  return next();
});

/******************** VERIFICATION MIDDLEWARE ********************/
bot.use(async (ctx, next) => {
  if (ctx.chat?.type !== 'private') return next();
  if (ctx.session?.isAdmin) return next();
  if (ctx.message?.text?.startsWith('/start') || 
      ctx.message?.text?.startsWith('/adminlogin') ||
      ctx.message?.text?.startsWith('/cancel')) {
    return next();
  }
  if (ctx.callbackQuery?.data === 'verify_user') return next();
  if (!ctx.from) return next();
  if (!settings.requireVerification) return next();

  const userId = ctx.from.id.toString();
  const now = Date.now();
  const RECHECK_INTERVAL = 2 * 60 * 60 * 1000;
  const lastCheck = ctx.session?.lastVerificationCheck || 0;
  const checkAge = now - lastCheck;

  if (ctx.session?.verified && checkAge < RECHECK_INTERVAL) {
    return next();
  }

  const membership = await checkUserMembership(ctx);

  if (membership.allJoined) {
    ctx.session.verified = true;
    ctx.session.lastVerificationCheck = now;
    if (users[userId]) { users[userId].verified = true; saveUsers(); }
    return next();
  }

  ctx.session.verified = false;
  ctx.session.lastVerificationCheck = 0;
  if (users[userId]) { users[userId].verified = false; saveUsers(); }
  
  console.log(`🚫 Blocked user ${userId}`);

  const verificationMessage = 
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "*Welcome to Update Otp Bot*\n\n" +
    "🌹 Please Join My All Group & Channel\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
    "[ 1️⃣ 📢 Main Channel ]    [ 2️⃣ 🌐 Number Channel ]\n\n" +
    "[ 3️⃣ 📨 OTP Group ]\n\n" +
    "[ ✅ VERIFY MEMBERSHIP ]\n\n" +
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery("⛔ Please join all groups first!", { show_alert: true });
    try {
      await ctx.editMessageText(verificationMessage, {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "1️⃣ 📢 Main Channel", url: "https://t.me/updaterange" }],
            [{ text: "2️⃣ 🌐 Number Channel", url: CHAT_GROUP }],
            [{ text: "3️⃣ 📨 OTP Group", url: OTP_GROUP }],
            [{ text: "✅ VERIFY MEMBERSHIP", callback_data: "verify_user" }]
          ]
        }
      });
    } catch(e) {}
    return;
  }

  try {
    await ctx.reply(verificationMessage, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "1️⃣ 📢 Main Channel", url: "https://t.me/updaterange" }],
          [{ text: "2️⃣ 🌐 Number Channel", url: CHAT_GROUP }],
          [{ text: "3️⃣ 📨 OTP Group", url: OTP_GROUP }],
          [{ text: "✅ VERIFY MEMBERSHIP", callback_data: "verify_user" }]
        ]
      }
    });
  } catch (error) {
    console.log("Could not reply to user:", error.message);
  }
  return;
});

/******************** HELPER: Clear all user state ********************/
function clearUserState(ctx) {
  ctx.session.withdrawState = null;
  ctx.session.withdrawData = null;
  ctx.session.totpState = null;
  ctx.session.totpData = null;
  ctx.session.adminState = null;
  ctx.session.adminData = null;
  ctx.session.waState = null;
}

/******************** SHOW MAIN MENU ********************/
async function showMainMenu(ctx) {
  try {
    await ctx.reply(
      "🏠 *Main Menu*",
      {
        parse_mode: "Markdown",
        reply_markup: {
          keyboard: [
            ["☎️ Get Number", "📧 Get Tempmail"],
            ["🔐 2FA", "💬 Support"],
            ["📱 Connect WhatsApp"]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }
    );
  } catch (error) {
    console.error("Error showing main menu:", error);
  }
}

/******************** START COMMAND ********************/
bot.start(async (ctx) => {
  try {
    const startUserId = ctx.from.id.toString();
    ctx.session.verified = users[startUserId]?.verified || false;
    ctx.session.currentNumbers = [];
    ctx.session.currentService = null;
    ctx.session.currentCountry = null;
    ctx.session.lastNumberTime = 0;
    ctx.session.lastMessageId = null;
    ctx.session.lastChatId = null;
    ctx.session.lastVerificationCheck = 0;
    ctx.session.totpState = null;
    ctx.session.totpData = null;
    ctx.session.mailState = null;
    ctx.session.withdrawState = null;
    ctx.session.withdrawData = null;
    ctx.session.adminState = null;
    ctx.session.adminData = null;
    ctx.session.isAdmin = isAdmin(ctx.from.id.toString());

    // Reply keyboard will be shown from the start
    const welcomeMessage = 
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "*Welcome to Update Otp Bot*\n\n" +
      "🌹 Please Join My All Group & Channel\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "[ 1️⃣ 📢 Main Channel ]    [ 2️⃣ 🌐 Number Channel ]\n\n" +
      "[ 3️⃣ 📨 OTP Group ]\n\n" +
      "[ ✅ VERIFY MEMBERSHIP ]\n\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

    await ctx.reply(welcomeMessage, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [{ text: "1️⃣ 📢 Main Channel", url: "https://t.me/updaterange" }],
          [{ text: "2️⃣ 🌐 Number Channel", url: CHAT_GROUP }],
          [{ text: "3️⃣ 📨 OTP Group", url: OTP_GROUP }],
          [{ text: "✅ VERIFY MEMBERSHIP", callback_data: "verify_user" }]
        ]
      }
    });
  } catch (error) {
    console.error("Start command error:", error);
  }
});

/******************** VERIFICATION BUTTON ********************/
bot.action("verify_user", async (ctx) => {
  try {
    await ctx.answerCbQuery("🔍 Checking all 3 groups...");

    const membership = await checkUserMembership(ctx);

    if (membership.allJoined) {
      ctx.session.verified = true;
      ctx.session.lastVerificationCheck = Date.now();

      const uid = ctx.from.id.toString();
      if (users[uid]) {
        users[uid].verified = true;
        saveUsers();
      }

      await ctx.editMessageText(
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "✅ *VERIFICATION SUCCESSFUL!*\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
        "[ 🏠 Go to Main Menu ]\n\n" +
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
        { 
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏠 Go to Main Menu", callback_data: "goto_main_menu" }]
            ]
          }
        }
      );

    } else {
      let notJoinedMsg = "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n❌ *JOIN ALL CHANNELS FIRST*\n\n";
      if (!membership.mainChannel) notJoinedMsg += "❌ 1️⃣ Main Channel\n";
      if (!membership.chatGroup) notJoinedMsg += "❌ 2️⃣ Number Channel\n";
      if (!membership.otpGroup) notJoinedMsg += "❌ 3️⃣ OTP Group\n";
      notJoinedMsg += "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━";

      await ctx.editMessageText(notJoinedMsg, { 
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "1️⃣ 📢 Main Channel", url: "https://t.me/updaterange" }],
            [{ text: "2️⃣ 🌐 Number Channel", url: CHAT_GROUP }],
            [{ text: "3️⃣ 📨 OTP Group", url: OTP_GROUP }],
            [{ text: "✅ VERIFY AGAIN", callback_data: "verify_user" }]
          ]
        }
      });
    }

  } catch (error) {
    console.error("Verification error:", error);
    await ctx.answerCbQuery("❌ Verification failed", { show_alert: true });
  }
});

/******************** COMMANDS ********************/
bot.command("cancel", async (ctx) => {
  ctx.session.withdrawState = null;
  ctx.session.withdrawData = null;
  ctx.session.totpState = null;
  ctx.session.totpData = null;
  ctx.session.adminState = null;
  ctx.session.adminData = null;
  ctx.session.waState = null;
  await ctx.reply("✅ Cancelled.", {
    reply_markup: {
      keyboard: [
        ["☎️ Get Number", "📧 Get Tempmail"],
        ["🔐 2FA", "💬 Support"],
        ["📱 Connect WhatsApp"]
      ],
      resize_keyboard: true
    }
  });
});

bot.command("myid", async (ctx) => {
  await ctx.reply(`📌 *Your User ID:* \`${ctx.from.id}\``, { parse_mode: "Markdown" });
});

/******************** MAIN MENU NAVIGATION ********************/
bot.action("goto_main_menu", async (ctx) => {
  await ctx.answerCbQuery();
  clearUserState(ctx);
  await showMainMenu(ctx);
});

bot.hears(["🏠 Home", "🏠 Main Menu"], async (ctx) => {
  clearUserState(ctx);
  await showMainMenu(ctx);
});

/******************** GET NUMBERS ********************/
bot.hears(["📞 Get Numbers", "☎️ Get Number"], async (ctx) => {
  clearUserState(ctx);
  const availableServices = [];
  for (const serviceId in services) {
    const service = services[serviceId];
    const availableCountries = getAvailableCountriesForService(serviceId);
    if (availableCountries.length > 0) {
      let totalNums = 0;
      for (const cc of availableCountries) {
        totalNums += (numbersByCountryService[cc]?.[serviceId]?.length || 0);
      }
      availableServices.push({ serviceId, service, totalNums });
    }
  }

  if (availableServices.length === 0) {
    return await ctx.reply(
      "📭 *No Numbers Available*\n\n" +
      "Sorry, all numbers are currently in use.\n" +
      "Please try again later or contact support.",
      { parse_mode: "Markdown" }
    );
  }

  const serviceButtons = [];
  for (let i = 0; i < availableServices.length; i += 2) {
    const row = [];
    row.push({
      text: `${availableServices[i].service.icon} ${availableServices[i].service.name} (${availableServices[i].totalNums})`,
      callback_data: `select_service:${availableServices[i].serviceId}`
    });
    if (availableServices[i + 1]) {
      row.push({
        text: `${availableServices[i+1].service.icon} ${availableServices[i+1].service.name} (${availableServices[i+1].totalNums})`,
        callback_data: `select_service:${availableServices[i+1].serviceId}`
      });
    }
    serviceButtons.push(row);
  }

  await ctx.reply(
    "🎯 *Select a Service*\n\n" +
    "Which service do you need a number for?\n" +
    "_(number in brackets = available count)_",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: serviceButtons }
    }
  );
});

/******************** SERVICE SELECTION ********************/
bot.action(/^select_service:(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];
    const availableCountries = getAvailableCountriesForService(serviceId);

    if (availableCountries.length === 0) {
      return await ctx.answerCbQuery("❌ No numbers available for this service", { show_alert: true });
    }

    const service = services[serviceId];

    const sortedCountries = [...availableCountries].sort((a, b) =>
      getOtpPriceForCountry(a) - getOtpPriceForCountry(b)
    );

    const countryButtons = [];
    for (let i = 0; i < sortedCountries.length; i += 2) {
      const row = [];
      const cc1 = sortedCountries[i];
      const c1 = countries[cc1];
      row.push({
        text: `${c1.flag} ${c1.name}`,
        callback_data: `select_country:${serviceId}:${cc1}`
      });
      if (sortedCountries[i + 1]) {
        const cc2 = sortedCountries[i + 1];
        const c2 = countries[cc2];
        row.push({
          text: `${c2.flag} ${c2.name}`,
          callback_data: `select_country:${serviceId}:${cc2}`
        });
      }
      countryButtons.push(row);
    }

    countryButtons.push([{ text: "🔙 Back to Service List", callback_data: "back_to_services" }]);

    await ctx.editMessageText(
      `${service.icon} *${service.name} — Select Country*`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: countryButtons }
      }
    );

  } catch (error) {
    console.error("Service selection error:", error);
    await ctx.answerCbQuery("❌ Error", { show_alert: true });
  }
});

/******************** COUNTRY SELECTION ********************/
bot.action(/^select_country:(.+):(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];
    const countryCode = ctx.match[2];
    const userId = ctx.from.id.toString();
    const numberCount = settings.defaultNumberCount;

    const now = Date.now();
    const timeSinceLast = now - ctx.session.lastNumberTime;
    const cooldown = settings.cooldownSeconds * 1000;

    if (timeSinceLast < cooldown && (ctx.session.currentNumbers || []).length > 0) {
      const remaining = Math.ceil((cooldown - timeSinceLast) / 1000);
      await ctx.answerCbQuery();
      return await ctx.reply(`⏳ *${remaining} seconds wait.*`, { parse_mode: "Markdown" });
    }

    const numbers = getMultipleNumbersByCountryAndService(countryCode, serviceId, userId, numberCount);

    if (numbers.length === 0) {
      return await ctx.answerCbQuery(`❌ Not enough numbers available.`, { show_alert: true });
    }

    if ((ctx.session.currentNumbers || []).length > 0) {
      (ctx.session.currentNumbers || []).forEach(num => {
        if (activeNumbers[num]) {
          delete activeNumbers[num];
        }
      });
      saveActiveNumbers();
    }

    ctx.session.currentNumbers = numbers;
    ctx.session.currentService = serviceId;
    ctx.session.currentCountry = countryCode;
    ctx.session.lastNumberTime = now;

    const country = countries[countryCode];
    const waConnected = waSessions[userId]?.connected || false;

    // Create number buttons with copy_text feature
    const numberButtons = [];
    
    // Add number buttons (with copy_text for instant copy)
    for (const num of numbers) {
      const statusIcon = waConnected ? " ⏳" : "";
      numberButtons.push([{ text: `+${num}${statusIcon}`, copy_text: { text: `+${num}` } }]);
    }
    
    // Add control buttons
    numberButtons.push([{ text: "🔄 Change Number", callback_data: `get_new_numbers:${serviceId}:${countryCode}` }]);
    numberButtons.push([{ text: "🌍 Change Country", callback_data: "back_to_services" }]);
    numberButtons.push([{ text: "📨 OTP Group", url: OTP_GROUP }]);
    
    if (!waConnected) {
      numberButtons.push([{ text: "📱 Connect WhatsApp", callback_data: "wa_connect" }]);
    } else {
      numberButtons.push([{ text: "📊 WA Status", callback_data: "wa_status" }]);
      numberButtons.push([{ text: "🔴 Disconnect WA", callback_data: "wa_disconnect" }]);
    }

    let messageText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    messageText += `${country.flag} ${country.name}\n\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    messageText += `👇 *Tap any number to copy:*\n\n`;

    const sentMessage = await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: numberButtons }
    });

    if (sentMessage && sentMessage.message_id) {
      ctx.session.lastMessageId = sentMessage.message_id;
      ctx.session.lastChatId = ctx.chat.id;
    }

    // WhatsApp check in background if connected
    if (waConnected) {
      const chatId = ctx.chat.id;
      const msgId = sentMessage.message_id;
      
      (async () => {
        const results = await Promise.all(
          numbers.map(n => checkWANumber(n, userId).catch(e => null))
        );
        const res = {};
        numbers.forEach((n, idx) => { res[n] = results[idx]; });
        
        const updatedButtons = [];
        for (const num of numbers) {
          let icon = "";
          if (res[num] === true) icon = " 📱";
          else if (res[num] === false) icon = " ❌";
          else icon = " ⬜";
          updatedButtons.push([{ text: `+${num}${icon}`, copy_text: { text: `+${num}` } }]);
        }
        
        updatedButtons.push([{ text: "🔄 Change Number", callback_data: `get_new_numbers:${serviceId}:${countryCode}` }]);
        updatedButtons.push([{ text: "🌍 Change Country", callback_data: "back_to_services" }]);
        updatedButtons.push([{ text: "📨 OTP Group", url: OTP_GROUP }]);
        updatedButtons.push([{ text: "📊 WA Status", callback_data: "wa_status" }]);
        updatedButtons.push([{ text: "🔴 Disconnect WA", callback_data: "wa_disconnect" }]);
        
        let updatedText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        updatedText += `${country.flag} ${country.name}\n\n`;
        updatedText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        updatedText += `👇 *Tap any number to copy:*\n\n`;
        updatedText += `📱=Has WhatsApp  ❌=No WhatsApp  ⬜=Checking\n\n`;
        
        try {
          await ctx.telegram.editMessageText(chatId, msgId, null, updatedText, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: updatedButtons }
          });
        } catch(e) {}
      })();
    }

  } catch (error) {
    console.error("Country selection error:", error);
    await ctx.answerCbQuery("❌ Error getting numbers", { show_alert: true });
  }
});

/******************** GET NEW NUMBERS ********************/
bot.action(/^get_new_numbers:(.+):(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const serviceId = ctx.match[1];
    const countryCode = ctx.match[2];
    const userId = ctx.from.id.toString();
    const numberCount = settings.defaultNumberCount;

    const now = Date.now();
    const timeSinceLast = now - ctx.session.lastNumberTime;
    const cooldown = settings.cooldownSeconds * 1000;

    if (timeSinceLast < cooldown) {
      const remaining = Math.ceil((cooldown - timeSinceLast) / 1000);
      await ctx.answerCbQuery();
      return await ctx.reply(`⏳ *${remaining} seconds wait.*`, { parse_mode: "Markdown" });
    }

    const numbers = getMultipleNumbersByCountryAndService(countryCode, serviceId, userId, numberCount);

    if (numbers.length === 0) {
      return await ctx.answerCbQuery(`❌ Not enough numbers available.`, { show_alert: true });
    }

    if ((ctx.session.currentNumbers || []).length > 0) {
      (ctx.session.currentNumbers || []).forEach(num => {
        if (activeNumbers[num]) {
          delete activeNumbers[num];
        }
      });
      saveActiveNumbers();
    }

    ctx.session.currentNumbers = numbers;
    ctx.session.lastNumberTime = now;

    const country = countries[countryCode];
    const waConnected = waSessions[userId]?.connected || false;

    const numberButtons = [];
    
    for (const num of numbers) {
      const statusIcon = waConnected ? " ⏳" : "";
      numberButtons.push([{ text: `+${num}${statusIcon}`, copy_text: { text: `+${num}` } }]);
    }
    
    numberButtons.push([{ text: "🔄 Change Number", callback_data: `get_new_numbers:${serviceId}:${countryCode}` }]);
    numberButtons.push([{ text: "🌍 Change Country", callback_data: "back_to_services" }]);
    numberButtons.push([{ text: "📨 OTP Group", url: OTP_GROUP }]);
    
    if (!waConnected) {
      numberButtons.push([{ text: "📱 Connect WhatsApp", callback_data: "wa_connect" }]);
    } else {
      numberButtons.push([{ text: "📊 WA Status", callback_data: "wa_status" }]);
      numberButtons.push([{ text: "🔴 Disconnect WA", callback_data: "wa_disconnect" }]);
    }

    let messageText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    messageText += `🔄 NEW NUMBERS\n\n`;
    messageText += `${country.flag} ${country.name}\n\n`;
    messageText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    messageText += `👇 *Tap any number to copy:*\n\n`;

    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: numberButtons }
    });

    // WhatsApp check in background if connected
    if (waConnected) {
      const chatId = ctx.chat.id;
      const msgId = ctx.callbackQuery.message.message_id;
      
      (async () => {
        const results = await Promise.all(
          numbers.map(n => checkWANumber(n, userId).catch(e => null))
        );
        const res = {};
        numbers.forEach((n, idx) => { res[n] = results[idx]; });
        
        const updatedButtons = [];
        for (const num of numbers) {
          let icon = "";
          if (res[num] === true) icon = " 📱";
          else if (res[num] === false) icon = " ❌";
          else icon = " ⬜";
          updatedButtons.push([{ text: `+${num}${icon}`, copy_text: { text: `+${num}` } }]);
        }
        
        updatedButtons.push([{ text: "🔄 Change Number", callback_data: `get_new_numbers:${serviceId}:${countryCode}` }]);
        updatedButtons.push([{ text: "🌍 Change Country", callback_data: "back_to_services" }]);
        updatedButtons.push([{ text: "📨 OTP Group", url: OTP_GROUP }]);
        updatedButtons.push([{ text: "📊 WA Status", callback_data: "wa_status" }]);
        updatedButtons.push([{ text: "🔴 Disconnect WA", callback_data: "wa_disconnect" }]);
        
        let updatedText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        updatedText += `🔄 NEW NUMBERS\n\n`;
        updatedText += `${country.flag} ${country.name}\n\n`;
        updatedText += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        updatedText += `👇 *Tap any number to copy:*\n\n`;
        updatedText += `📱=Has WhatsApp  ❌=No WhatsApp  ⬜=Checking\n\n`;
        
        try {
          await ctx.telegram.editMessageText(chatId, msgId, null, updatedText, {
            parse_mode: "Markdown",
            reply_markup: { inline_keyboard: updatedButtons }
          });
        } catch(e) {}
      })();
    }

  } catch (error) {
    console.error("Get new numbers error:", error);
    await ctx.answerCbQuery("❌ Error", { show_alert: true });
  }
});

/******************** BACK TO SERVICES ********************/
bot.action("back_to_services", async (ctx) => {
  try {
    await ctx.answerCbQuery();
    const availableServices = [];
    for (const serviceId in services) {
      const service = services[serviceId];
      const availableCountries = getAvailableCountriesForService(serviceId);
      if (availableCountries.length > 0) {
        let totalNums = 0;
        for (const cc of availableCountries) {
          totalNums += (numbersByCountryService[cc]?.[serviceId]?.length || 0);
        }
        availableServices.push({ serviceId, service, totalNums });
      }
    }

    const serviceButtons = [];
    for (let i = 0; i < availableServices.length; i += 2) {
      const row = [];
      row.push({
        text: `${availableServices[i].service.icon} ${availableServices[i].service.name} (${availableServices[i].totalNums})`,
        callback_data: `select_service:${availableServices[i].serviceId}`
      });
      if (availableServices[i + 1]) {
        row.push({
          text: `${availableServices[i+1].service.icon} ${availableServices[i+1].service.name} (${availableServices[i+1].totalNums})`,
          callback_data: `select_service:${availableServices[i+1].serviceId}`
        });
      }
      serviceButtons.push(row);
    }

    await ctx.editMessageText(
      "🎯 *Select a Service*\n\n" +
      "Which service do you need a number for?\n" +
      "_(number in brackets = available count)_",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: serviceButtons }
      }
    );
  } catch (error) {
    console.error("Back to services error:", error);
    await ctx.answerCbQuery("❌ Error", { show_alert: true });
  }
});

/******************** CHECK WHATSAPP NUMBER ********************/
async function checkWANumber(phone, userId) {
  if (!waSessions[userId]?.connected) {
    try {
      const result = await baileysRequest("GET", `/status?userId=${userId}`);
      if (result?.connected) {
        waSessions[userId] = { connected: true };
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }
  
  const digits = phone.replace(/\D/g, "");
  try {
    const result = await baileysRequest("POST", "/check", { numbers: [digits], userId });
    const results = result?.results || {};
    const val = results[digits];
    if (val === true) return true;
    if (val === false) return false;
    return null;
  } catch (e) {
    console.error("WA check error:", e.message);
    return null;
  }
}

/******************** CONNECT WHATSAPP ********************/
bot.hears("📱 Connect WhatsApp", async (ctx) => {
  clearUserState(ctx);
  const userId = ctx.from.id.toString();

  if (waSessions[userId]?.connected) {
    return await ctx.reply(
      "✅ *WhatsApp Already Connected!*\n\n🟢 Your WhatsApp is active.\nTap below to disconnect:",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🔴 Logout / Disconnect", callback_data: "wa_disconnect" }],
            [{ text: "📊 Check Status", callback_data: "wa_status" }]
          ]
        }
      }
    );
  }

  ctx.session.waState = "waiting_number";
  await ctx.reply(
    "📱 *WhatsApp Connect*\n\n" +
    "Send your WhatsApp number with country code:\n" +
    "Example: `8801712345678`\n\n" +
    "Type /cancel to cancel",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "wa_cancel" }]]
      }
    }
  );
});

bot.action("wa_cancel", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.waState = null;
  await ctx.editMessageText("❌ *Cancelled.*", { parse_mode: "Markdown" });
});

bot.action("wa_status", async (ctx) => {
  await ctx.answerCbQuery("⏳ Checking...");
  const userId = ctx.from.id.toString();
  let connected = false;
  try {
    const result = await baileysRequest("GET", `/status?userId=${userId}`);
    connected = result?.connected === true;
  } catch (e) {}

  if (connected) {
    waSessions[userId] = { connected: true };
  } else {
    delete waSessions[userId];
  }

  const text = connected
    ? "✅ *WhatsApp Connected!*\n\n🟢 Your WhatsApp is linked with this bot."
    : "🔴 *WhatsApp Not Connected!*\n\nTap below to connect.";

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: connected
        ? [
            [{ text: "🔴 Disconnect", callback_data: "wa_disconnect" }],
            [{ text: "🔄 Refresh", callback_data: "wa_status" }]
          ]
        : [[{ text: "📱 Connect", callback_data: "wa_reconnect" }]]
    }
  });
});

bot.action("wa_reconnect", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  ctx.session.waState = "waiting_number";
  await ctx.editMessageText(
    "📱 *WhatsApp Connect*\n\n" +
    "Send your WhatsApp number with country code:\n" +
    "Example: `8801712345678`\n\n" +
    "Type /cancel to cancel",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "wa_cancel" }]]
      }
    }
  );
});

bot.action("wa_disconnect", async (ctx) => {
  await ctx.answerCbQuery("⏳ Disconnecting...");
  const userId = ctx.from.id.toString();
  try {
    await baileysRequest("POST", "/disconnect", { userId });
  } catch (e) {
    console.error("WA disconnect error:", e.message);
  }
  delete waSessions[userId];
  await ctx.editMessageText(
    "🔴 *WhatsApp Disconnected!*\n\n" +
    "Your WhatsApp has been logged out.\n" +
    "Tap below to reconnect:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "📱 Connect WhatsApp", callback_data: "wa_reconnect" }]]
      }
    }
  );
});

/******************** TEMP MAIL ********************/
bot.hears(["📧 Temp Mail", "📧 Get Tempmail"], async (ctx) => {
  clearUserState(ctx);
  const userId = ctx.from.id.toString();
  const existing = tempMails[userId];

  if (existing) {
    await ctx.reply(
      `📧 *Temporary Email*\n\n📌 Your email:\n\`${existing.address}\`\n\n⚠️ Getting a new email will delete this one.`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "📬 Check Inbox", callback_data: "tempmail_inbox" }],
            [{ text: "📋 Show Email Address", callback_data: "tempmail_showaddress" }],
            [{ text: "🔄 Get New Email", callback_data: "tempmail_create" }],
            [{ text: "🗑️ Delete Email", callback_data: "tempmail_delete" }]
          ]
        }
      }
    );
  } else {
    await ctx.reply(
      "📧 *Temporary Email*\n\n✅ Create a new disposable email address.\n⚡ Instant • Unlimited • No signup",
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🆕 Create New Email", callback_data: "tempmail_create" }]
          ]
        }
      }
    );
  }
});

bot.action("tempmail_create", async (ctx) => {
  const userId = ctx.from.id.toString();

  await ctx.answerCbQuery("⏳ Creating email...");

  const loadingMsg = await ctx.reply("⏳ *Creating your email...*", { parse_mode: "Markdown" });

  setImmediate(async () => {
    try {
      if (tempMails[userId]) delete tempMails[userId];

      const newEmail = await createFreshEmail();

      if (!newEmail) {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, null,
          `❌ *Email creation failed.*\n\nMail.tm is busy. Please try again in 1 minute.`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Retry", callback_data: "tempmail_create" }]] } }
        );
        return;
      }

      tempMails[userId] = newEmail;
      saveTempMails();
      console.log(`📧 Email created for user ${userId}: ${newEmail.address}`);

      await ctx.telegram.editMessageText(
        ctx.chat.id, loadingMsg.message_id, null,
        `✅ *New Temporary Email Created!*\n\n📧 *Email Address:*\n\`${newEmail.address}\`\n\n📌 Use this address on any website.\n✉️ Tap *Check Inbox* after receiving an email.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "📬 Check Inbox", callback_data: "tempmail_inbox" }],
              [{ text: "📋 Show Email Address", callback_data: "tempmail_showaddress" }],
              [{ text: "🔄 Get New Email", callback_data: "tempmail_create" }],
              [{ text: "🗑️ Delete Email", callback_data: "tempmail_delete" }]
            ]
          }
        }
      );
    } catch (error) {
      console.error("Temp mail create error:", error.message);
      try {
        await ctx.telegram.editMessageText(
          ctx.chat.id, loadingMsg.message_id, null,
          `❌ *An error occurred.* Please try again.`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔄 Retry", callback_data: "tempmail_create" }]] } }
        );
      } catch(e) {}
    }
  });
});

bot.action("tempmail_inbox", async (ctx) => {
  try {
    await ctx.answerCbQuery("📬 Loading inbox...");
    const userId = ctx.from.id.toString();

    if (!tempMails[userId]) {
      return await ctx.editMessageText(
        "❌ *No email found.*\n\nPress the button below to create a new email.",
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🆕 Create New Email", callback_data: "tempmail_create" }]] } }
      );
    }

    const { address, provider, sidToken } = tempMails[userId];

    let messages = [];
    try {
      messages = await getEmailInbox(tempMails[userId]);
      console.log(`📬 Inbox (${provider}): ${address} → ${messages.length} messages`);
    } catch(e) {
      console.error('Inbox fetch error:', e.message);
    }

    const now = new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    let text = `📬 *Inbox:* \`${address}\`\n🕐 _Checked: ${now}_\n_(via ${provider})_\n\n`;

    if (messages.length === 0) {
      text += `📭 *No emails yet.*\n\nSend an email to this address, then tap Refresh.`;
    } else {
      text += `📨 *${messages.length} email(s):*\n\n`;

      for (const msg of messages.slice(0, 5)) {
        text += `━━━━━━━━━━━━━━━\n`;
        text += `📩 *From:* ${String(msg.from || '').replace(/[_*`\[]/g, '\\$&')}\n`;
        text += `📌 *Subject:* ${String(msg.subject || '(No Subject)').replace(/[_*`\[]/g, '\\$&')}\n`;
        text += `🕐 ${msg.date}\n`;

        try {
          const body = await getEmailMessage(msg.id, tempMails[userId]);
          if (body) {
            const otpMatches = body.match(/\b\d{4,8}\b/g);
            if (otpMatches && otpMatches.length > 0) {
              text += `\n🔑 *OTP Code:* \`${otpMatches[0]}\`\n`;
            }
            const preview = body.substring(0, 300).replace(/[_*`\[]/g, '\\$&');
            text += `\n📝 *Message:*\n_${preview}${body.length > 300 ? '...' : ''}_\n`;
          }
        } catch(e) {
          console.error("Read message error:", e.message);
        }

        text += `\n`;
      }
    }

    try {
      await ctx.editMessageText(text, {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: "tempmail_inbox" }],
          [{ text: "📧 Show Email Address", callback_data: "tempmail_showaddress" }],
          [{ text: "🔄 Get New Email", callback_data: "tempmail_create" }],
          [{ text: "🗑️ Delete Email", callback_data: "tempmail_delete" }]
        ]}
      });
    } catch (e) {
      if (!e.message?.includes("message is not modified")) throw e;
    }

  } catch (error) {
    console.error("Temp mail inbox error:", error);
    try {
      await ctx.editMessageText("❌ *An error occurred.* Please try again.", {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔄 Retry", callback_data: "tempmail_inbox" }]] }
      });
    } catch (e) {}
  }
});

bot.action("tempmail_showaddress", async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id.toString();
  if (!tempMails[userId]) return await ctx.answerCbQuery("❌ No email found", { show_alert: true });
  const { address } = tempMails[userId];
  await ctx.editMessageText(
    `📧 *Your Temp Email:*\n\n\`${address}\`\n\nCopy this address and use it on any website.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📬 Check Inbox", callback_data: "tempmail_inbox" }],
          [{ text: "🔄 Get New Email", callback_data: "tempmail_create" }]
        ]
      }
    }
  );
});

bot.action("tempmail_delete", async (ctx) => {
  const userId = ctx.from.id.toString();
  await ctx.answerCbQuery();
  if (tempMails[userId]) {
    delete tempMails[userId];
    saveTempMails();
    await ctx.editMessageText("✅ *Email deleted successfully.*", { parse_mode: "Markdown" });
  } else {
    await ctx.editMessageText("❌ *No email found.*", { parse_mode: "Markdown" });
  }
});

/******************** 2FA ********************/
bot.hears(["🔐 2FA", "🔐 2FA Codes"], async (ctx) => {
  clearUserState(ctx);
  await ctx.reply(
    "🔐 *2-Step Verification Code Generator*\n\nSelect a service:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📘 Facebook 2FA", callback_data: "totp_service:facebook" }],
          [{ text: "📸 Instagram 2FA", callback_data: "totp_service:instagram" }],
          [{ text: "🔍 Google 2FA", callback_data: "totp_service:google" }],
          [{ text: "⚙️ Other Service 2FA", callback_data: "totp_service:other" }]
        ]
      }
    }
  );
});

bot.action(/^totp_service:(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const service = ctx.match[1];
  const icons = { facebook: "📘", instagram: "📸", google: "🔍", other: "⚙️" };
  const names = { facebook: "Facebook", instagram: "Instagram", google: "Google", other: "Other" };

  ctx.session.totpState = "waiting_secret";
  ctx.session.totpData = { service };

  const icon = icons[service] || "🔐";
  const name = names[service] || service;

  await ctx.editMessageText(
    `${icon} *${name} Secret Key*\n\n` +
    `Send your Authenticator Secret Key.\n\n` +
    `📌 *Where to find your key:*\n` +
    `• Facebook: Settings → Security → Two-Factor Authentication → Authenticator App → Setup Key\n` +
    `• Instagram: Settings → Security → Two-Factor → Authentication App → Manual key\n\n` +
    `🔑 It looks like: \`JBSWY3DPEHPK3PXP\`\n\n` +
    `Type /cancel to cancel`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "totp_back" }]]
      }
    }
  );
});

bot.action(/^totp_refresh:([^:]+):(.+)$/, async (ctx) => {
  try {
    await ctx.answerCbQuery("🔄 Refreshing code...");
    const service = ctx.match[1];
    const secret = decodeURIComponent(ctx.match[2]);
    const result = generateTOTP(secret);

    if (!result) {
      return await ctx.editMessageText(
        "❌ *Could not generate code.* Invalid secret key.",
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "totp_back" }]] } }
      );
    }

    const icon = service === "facebook" ? "📘" : service === "instagram" ? "📸" : service === "google" ? "🔍" : "⚙️";
    const name = service === "facebook" ? "Facebook" : service === "instagram" ? "Instagram" : service === "google" ? "Google" : "2FA";

    try {
      await ctx.editMessageText(
        `${icon} *${name} 2FA Code*\n\n` +
        `🔑 *Code:* \`${result.token}\`\n\n` +
        `⏰ *${result.timeRemaining} seconds remaining*\n\n` +
        `📋 Copy the code and enter it on the site.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Refresh Code", callback_data: `totp_refresh:${service}:${encodeURIComponent(secret)}` }],
              [{ text: "🔙 Back", callback_data: "totp_back" }]
            ]
          }
        }
      );
    } catch (editErr) {
      if (!editErr.message || !editErr.message.includes("message is not modified")) throw editErr;
    }
  } catch (error) {
    console.error("TOTP refresh error:", error);
    try { await ctx.answerCbQuery("❌ Error refreshing code", { show_alert: true }); } catch(e) {}
  }
});

bot.action("totp_back", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "🔐 *2FA Code Generator*\n\nSelect a service:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📘 Facebook 2FA", callback_data: "totp_service:facebook" }],
          [{ text: "📸 Instagram 2FA", callback_data: "totp_service:instagram" }],
          [{ text: "🔍 Google 2FA", callback_data: "totp_service:google" }],
          [{ text: "⚙️ Other Service 2FA", callback_data: "totp_service:other" }]
        ]
      }
    }
  );
});

/******************** SUPPORT ********************/
bot.hears("💬 Support", async (ctx) => {
  await ctx.reply(
    "💬 *Support*\n\nFor any issues or questions, contact our admin directly:\n\n📌 Admin: @Rana1132",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "💬 Contact Support", url: "https://t.me/Rana1132" }]
        ]
      }
    }
  );
});

/******************** ADMIN LOGIN ********************/
bot.command("adminlogin", async (ctx) => {
  try {
    const parts = ctx.message.text.split(' ');

    if (parts.length < 2) {
      return await ctx.reply("❌ Usage: /adminlogin [password]");
    }

    const password = parts[1];

    if (password === ADMIN_PASSWORD) {
      ctx.session.isAdmin = true;

      if (!admins.includes(ctx.from.id.toString())) {
        admins.push(ctx.from.id.toString());
        saveAdmins();
      }

      await ctx.reply(
        "✅ *Admin Login Successful!*\n\n" +
        "You now have administrator privileges.\n" +
        "Use /admin to access admin panel.",
        { parse_mode: "Markdown" }
      );
    } else {
      await ctx.reply("❌ Wrong password. Access denied.");
    }
  } catch (error) {
    console.error("Admin login error:", error);
    await ctx.reply("❌ Error during admin login.");
  }
});

/******************** ADMIN PANEL ********************/
bot.command("admin", async (ctx) => {
  try {
    if (!ctx.session.isAdmin && !isAdmin(ctx.from.id.toString())) {
      return await ctx.reply(
        "❌ *Admin Access Required*\n\n" +
        "Use /adminlogin [password] to login as admin.",
        { parse_mode: "Markdown" }
      );
    }

    const buttons = [
      [
        { text: "📊 Stock Report", callback_data: "admin_stock" },
        { text: "👥 User Stats", callback_data: "admin_users" }
      ],
      [
        { text: "📢 Broadcast", callback_data: "admin_broadcast" },
        { text: "📋 OTP Log", callback_data: "admin_otp_log" }
      ],
      [
        { text: "➕ Add Numbers", callback_data: "admin_add_numbers" },
        { text: "📤 Upload File", callback_data: "admin_upload" }
      ],
      [
        { text: "🗑️ Delete Numbers", callback_data: "admin_delete" },
        { text: "🔧 Manage Services", callback_data: "admin_manage_services" }
      ],
      [
        { text: "🌍 Manage Countries", callback_data: "admin_manage_countries" },
        { text: "⚙️ Settings", callback_data: "admin_settings" }
      ],
      [
        { text: "💰 Country Prices", callback_data: "admin_country_prices" },
        { text: "💸 Withdrawals", callback_data: "admin_withdrawals" }
      ],
      [
        { text: "👛 Balance Management", callback_data: "admin_balance_manage" }
      ],
      [
        { text: "👑 Add Admin", callback_data: "admin_add_admin" },
        { text: "🚪 Logout", callback_data: "admin_logout" }
      ]
    ];

    await ctx.reply(
      "🛠 *Admin Dashboard*\n\n" +
      "Select an option:",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: buttons }
      }
    );

  } catch (error) {
    console.error("Admin command error:", error);
    await ctx.reply("❌ Error accessing admin panel.");
  }
});

/******************** ADMIN ADD ADMIN ********************/
bot.action("admin_add_admin", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();
  ctx.session.adminState = "waiting_add_admin";
  await ctx.editMessageText(
    "👑 *Add New Admin*\n\n" +
    "Send the user ID of the person you want to make admin.\n\n" +
    "User can get their ID by using /myid command.\n\n" +
    "Example: `123456789`",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_cancel" }]]
      }
    }
  );
});

/******************** ADMIN BACK ********************/
bot.action("admin_back", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminState = null;
  ctx.session.adminData = null;

  const buttons = [
    [
      { text: "📊 Stock Report", callback_data: "admin_stock" },
      { text: "👥 User Stats", callback_data: "admin_users" }
    ],
    [
      { text: "📢 Broadcast", callback_data: "admin_broadcast" },
      { text: "📋 OTP Log", callback_data: "admin_otp_log" }
    ],
    [
      { text: "➕ Add Numbers", callback_data: "admin_add_numbers" },
      { text: "📤 Upload File", callback_data: "admin_upload" }
    ],
    [
      { text: "🗑️ Delete Numbers", callback_data: "admin_delete" },
      { text: "🔧 Manage Services", callback_data: "admin_manage_services" }
    ],
    [
      { text: "🌍 Manage Countries", callback_data: "admin_manage_countries" },
      { text: "⚙️ Settings", callback_data: "admin_settings" }
    ],
    [
      { text: "💰 Country Prices", callback_data: "admin_country_prices" },
      { text: "💸 Withdrawals", callback_data: "admin_withdrawals" }
    ],
    [
      { text: "👛 Balance Management", callback_data: "admin_balance_manage" }
    ],
    [
      { text: "👑 Add Admin", callback_data: "admin_add_admin" },
      { text: "🚪 Logout", callback_data: "admin_logout" }
    ]
  ];

  await ctx.editMessageText(
    "🛠 *Admin Dashboard*\n\n" +
    "Select an option:",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

/******************** ADMIN CANCEL ********************/
bot.action("admin_cancel", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.adminState = null;
  ctx.session.adminData = null;

  await ctx.editMessageText(
    "❌ *Action Cancelled*\n\n" +
    "Returning to admin panel...",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🛠 Back to Admin", callback_data: "admin_back" }]
        ]
      }
    }
  );
});

/******************** ADMIN LOGOUT ********************/
bot.action("admin_logout", async (ctx) => {
  await ctx.answerCbQuery();
  ctx.session.isAdmin = false;
  ctx.session.adminState = null;
  ctx.session.adminData = null;

  await ctx.editMessageText(
    "🚪 *Admin Logged Out*\n\n" +
    "You have been logged out from admin panel.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Main Menu", callback_data: "goto_main_menu" }]
        ]
      }
    }
  );
});

/******************** ADMIN STOCK REPORT ********************/
bot.action("admin_stock", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  try {
    let report = "📊 *Stock Report*\n\n";
    let totalNumbers = 0;

    for (const countryCode in numbersByCountryService) {
      const country = countries[countryCode];
      const countryName = country ? `${country.flag} ${country.name}` : `Country ${countryCode}`;

      report += `\n${countryName} (+${countryCode}):\n`;

      let countryTotal = 0;

      for (const serviceId in numbersByCountryService[countryCode]) {
        const service = services[serviceId];
        const serviceName = service ? `${service.icon} ${service.name}` : serviceId;
        const count = numbersByCountryService[countryCode][serviceId].length;

        if (count > 0) {
          report += `  ${serviceName}: *${count}*\n`;
          countryTotal += count;
        }
      }

      report += `  *Total:* ${countryTotal}\n`;
      totalNumbers += countryTotal;
    }

    report += `\n📈 *Grand Total:* ${totalNumbers} numbers\n`;
    report += `👥 *Active Users:* ${Object.keys(activeNumbers).length}\n`;
    report += `📨 *OTPs Forwarded:* ${otpLog.length}`;

    if (report.length > 4000) {
      report = report.substring(0, 3950) + '\n\n_...truncated_';
    }

    await ctx.editMessageText(report, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: "admin_stock" }],
          [{ text: "🔙 Back", callback_data: "admin_back" }]
        ]
      }
    });
  } catch(error) {
    console.error("Stock report error:", error.message);
    if (error.message?.includes("message is not modified")) return;
    try {
      await ctx.editMessageText("❌ Error loading stock report. Please try again.", {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_back" }]] }
      });
    } catch(e) {}
  }
});

/******************** ADMIN USER STATS ********************/
bot.action("admin_users", async (ctx) => {
  if (!ctx.session.isAdmin) {
    await ctx.answerCbQuery("❌ Admin only");
    return;
  }
  await ctx.answerCbQuery();

  try {
    const totalUsers = Object.keys(users).length;
    const activeUsers = Object.keys(activeNumbers).length;

    const esc = (str) => String(str || '').replace(/[_*`\[]/g, '\\$&');

    let message = "👥 *User Statistics*\n\n";
    message += `📊 *Statistics:*\n`;
    message += `• Total Registered Users: ${totalUsers}\n`;
    message += `• Active Users (with numbers): ${activeUsers}\n`;
    message += `• Total OTPs Delivered: ${otpLog.length}\n\n`;

    if (totalUsers > 0) {
      message += `📋 *Recent Users (last 10):*\n`;

      const sortedUsers = Object.values(users)
        .sort((a, b) => new Date(b.last_active) - new Date(a.last_active))
        .slice(0, 10);

      for (const user of sortedUsers) {
        const timeAgo = getTimeAgo(new Date(user.last_active));
        const name = esc(user.first_name) + (user.last_name ? ' ' + esc(user.last_name) : '');
        const username = esc(user.username || 'no_username');
        message += `\n👤 *${name}*\n`;
        message += `🆔 ID: \`${user.id}\`\n`;
        message += `📱 @${username}\n`;
        message += `🕐 Active: ${timeAgo}\n`;
      }
    } else {
      message += `📭 No users yet`;
    }

    if (message.length > 4000) {
      message = message.substring(0, 3950) + '\n\n_...truncated_';
    }

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: "admin_users" }],
          [{ text: "🔙 Back", callback_data: "admin_back" }]
        ]
      }
    });
  } catch (error) {
    console.error("Admin users error:", error.message);
    if (error.message?.includes('message is not modified')) return;
    try {
      await ctx.editMessageText(`❌ Error: ${error.message}`, {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_back" }]] }
      });
    } catch(e) {}
  }
});

/******************** ADMIN OTP LOG ********************/
bot.action("admin_otp_log", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  try {
    let message = "📋 *Recent OTP Logs*\n\n";

    if (otpLog.length === 0) {
      message += "No OTPs forwarded yet.";
    } else {
      const recentLogs = otpLog.slice(-10).reverse();
      for (const log of recentLogs) {
        const timeAgo = getTimeAgo(new Date(log.timestamp));
        message += `📞 \`${log.phoneNumber}\` → 👤 \`${log.userId}\`\n`;
        message += `🕐 ${timeAgo}\n\n`;
      }
    }

    if (message.length > 4000) message = message.substring(0, 3950) + '\n\n_...truncated_';

    await ctx.editMessageText(message, {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Refresh", callback_data: "admin_otp_log" }],
          [{ text: "🔙 Back", callback_data: "admin_back" }]
        ]
      }
    });
  } catch(error) {
    console.error("OTP log error:", error.message);
    if (error.message?.includes("message is not modified")) return;
    try {
      await ctx.editMessageText("❌ Error loading OTP log.", {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_back" }]] }
      });
    } catch(e) {}
  }
});

/******************** ADMIN BROADCAST ********************/
bot.action("admin_broadcast", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  ctx.session.adminState = "waiting_broadcast";

  await ctx.editMessageText(
    "📢 *Broadcast Message*\n\n" +
    "Send the message you want to broadcast to all users.\n\n" +
    "*Note:* This will be sent to all registered users.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "admin_cancel" }]
        ]
      }
    }
  );
});

/******************** ADMIN ADD NUMBERS ********************/
bot.action("admin_add_numbers", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  ctx.session.adminState = "waiting_add_numbers";

  await ctx.editMessageText(
    "➕ *Add Numbers Manually*\n\n" +
    "Send numbers in format:\n`[number]|[country code]|[service]`\n\n" +
    "*Examples:*\n" +
    "`8801712345678|880|whatsapp`\n" +
    "`919876543210|91|telegram`\n" +
    "`11234567890|1|facebook`\n\n" +
    "You can send multiple numbers in one message.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "admin_cancel" }]
        ]
      }
    }
  );
});

/******************** ADMIN UPLOAD FILE ********************/
bot.action("admin_upload", async (ctx) => {
  try {
    if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
    await ctx.answerCbQuery();

    ctx.session.adminState = "waiting_upload";
    ctx.session.adminData = null;

    const serviceButtons = [];
    for (const serviceId in services) {
      const service = services[serviceId];
      serviceButtons.push([
        { 
          text: `${service.icon} ${service.name}`, 
          callback_data: `admin_select_service:${serviceId}` 
        }
      ]);
    }

    serviceButtons.push([{ text: "❌ Cancel", callback_data: "admin_cancel" }]);

    await ctx.editMessageText(
      "📤 *Upload Numbers*\n\n" +
      "Select service for the numbers:",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: serviceButtons }
      }
    );
  } catch (error) {
    console.error("Admin upload error:", error);
    try { await ctx.reply("❌ Error. Please try again."); } catch(e) {}
  }
});

bot.action(/^admin_select_service:(.+)$/, async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const serviceId = ctx.match[1];
  const service = services[serviceId];

  ctx.session.adminState = "waiting_upload_file";
  ctx.session.adminData = { serviceId };

  await ctx.editMessageText(
    `📤 *Upload Numbers for ${service.name}*\n\n` +
    "Send a .txt file with phone numbers.\n\n" +
    "*Format (one per line):*\n" +
    "1. Just number: `8801712345678`\n" +
    "2. With country: `8801712345678|880`\n" +
    "3. With country and service: `8801712345678|880|${serviceId}`\n\n" +
    "*Note:* Country code will be auto-detected if not provided.\n" +
    "*Supported:* .txt files only",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "admin_cancel" }]
        ]
      }
    }
  );
});

/******************** ADMIN SETTINGS ********************/
bot.action("admin_settings", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    "⚙️ *Bot Settings*\n\n" +
    `📞 Number Count: *${settings.defaultNumberCount}*\n` +
    `⏱ Cooldown: *${settings.cooldownSeconds} seconds*\n` +
    `🔐 Verification: *${settings.requireVerification ? "Enabled ✅" : "Disabled ❌"}*\n` +
    `💵 OTP Price (default): *${(settings.defaultOtpPrice || 0.25).toFixed(2)} taka*\n` +
    `💸 Min Withdraw: *${settings.minWithdraw} taka*\n` +
    `🏧 Withdraw: *${settings.withdrawEnabled ? "Enabled ✅" : "Disabled ❌"}*\n\n` +
    "Press a button to change settings:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📞 Number Count", callback_data: "admin_set_count" },
            { text: "⏱ Cooldown", callback_data: "admin_set_cooldown" }
          ],
          [
            { text: `🔐 Verification ${settings.requireVerification ? "Disable" : "Enable"}`, callback_data: "admin_toggle_verification" }
          ],
          [
            { text: "💵 Set OTP Price", callback_data: "admin_set_default_price" },
            { text: "💸 Set Min Withdraw", callback_data: "admin_set_min_withdraw" }
          ],
          [
            { text: `🏧 Withdraw ${settings.withdrawEnabled ? "🔴 Disable" : "🟢 Enable"}`, callback_data: "admin_toggle_withdraw" }
          ],
          [
            { text: "🔙 Back", callback_data: "admin_back" }
          ]
        ]
      }
    }
  );
});

/******************** ADMIN MANAGE SERVICES ********************/
bot.action("admin_manage_services", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  await ctx.editMessageText(
    "🔧 *Manage Services*\n\n" +
    "Select an option:",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "📋 List Services", callback_data: "admin_list_services" },
            { text: "➕ Add Service", callback_data: "admin_add_service" }
          ],
          [
            { text: "🗑️ Delete Service", callback_data: "admin_delete_service" }
          ],
          [{ text: "🔙 Back", callback_data: "admin_back" }]
        ]
      }
    }
  );
});

/******************** ADMIN LIST SERVICES ********************/
bot.action("admin_list_services", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  let report = "📋 *Services List*\n\n";

  for (const serviceId in services) {
    const service = services[serviceId];
    report += `• ${service.icon} *${service.name}* (ID: \`${serviceId}\`)\n`;
  }

  await ctx.editMessageText(report, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔙 Back", callback_data: "admin_back" }]
      ]
    }
  });
});

/******************** ADMIN ADD SERVICE ********************/
bot.action("admin_add_service", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  ctx.session.adminState = "waiting_add_service";

  await ctx.editMessageText(
    "🔧 *Add New Service*\n\n" +
    "Send in format:\n`[service_id] [name] [icon]`\n\n" +
    "*Examples:*\n" +
    "`facebook Facebook 📘`\n" +
    "`gmail Gmail 📧`\n" +
    "`instagram Instagram 📸`\n\n" +
    "Service ID should be lowercase without spaces.",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "admin_cancel" }]
        ]
      }
    }
  );
});

/******************** ADMIN DELETE SERVICE ********************/
bot.action("admin_delete_service", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const serviceButtons = [];
  for (const serviceId in services) {
    const service = services[serviceId];
    serviceButtons.push([
      { 
        text: `${service.icon} ${service.name}`, 
        callback_data: `admin_delete_service_confirm:${serviceId}` 
      }
    ]);
  }

  serviceButtons.push([{ text: "❌ Cancel", callback_data: "admin_back" }]);

  await ctx.editMessageText(
    "🗑️ *Delete Service*\n\n" +
    "Select service to delete:",
    {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: serviceButtons }
    }
  );
});

bot.action(/^admin_delete_service_confirm:(.+)$/, async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const serviceId = ctx.match[1];
  const service = services[serviceId];

  await ctx.editMessageText(
    `⚠️ *Confirm Deletion*\n\n` +
    `Are you sure you want to delete service *${service.name}*?\n\n` +
    `This will also delete all numbers assigned to this service!`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Yes, Delete", callback_data: `admin_delete_service_execute:${serviceId}` },
            { text: "❌ Cancel", callback_data: "admin_back" }
          ]
        ]
      }
    }
  );
});

bot.action(/^admin_delete_service_execute:(.+)$/, async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const serviceId = ctx.match[1];

  for (const countryCode in numbersByCountryService) {
    if (numbersByCountryService[countryCode][serviceId]) {
      delete numbersByCountryService[countryCode][serviceId];
    }
  }

  delete services[serviceId];

  saveNumbers();
  saveServices();

  await ctx.editMessageText(
    `✅ *Service Deleted Successfully!*\n\n` +
    `Service has been removed.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Admin", callback_data: "admin_back" }]
        ]
      }
    }
  );
});

/******************** ADMIN MANAGE COUNTRIES ********************/
bot.action("admin_manage_countries", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  let countryList = "🌍 *Manage Countries*\n\n";
  countryList += `📊 Total Countries: *${Object.keys(countries).length}*\n\n`;

  await ctx.editMessageText(countryList, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: "➕ Add Country", callback_data: "admin_add_country" },
          { text: "📋 List Countries", callback_data: "admin_list_countries" }
        ],
        [{ text: "🔙 Back", callback_data: "admin_back" }]
      ]
    }
  });
});

/******************** ADMIN LIST COUNTRIES ********************/
bot.action("admin_list_countries", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();
  let text = "🌍 *Country List*\n\n";
  for (const cc in countries) {
    const c = countries[cc];
    const price = countryPrices[cc] !== undefined ? countryPrices[cc] : (settings.defaultOtpPrice || 0.25);
    text += `${c.flag} *${c.name}* (+${cc}) — ${price.toFixed(2)} TK/OTP\n`;
  }
  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_manage_countries" }]] }
  });
});

/******************** ADMIN ADD COUNTRY ********************/
bot.action("admin_add_country", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  ctx.session.adminState = "waiting_add_country";

  await ctx.editMessageText(
    "🌍 *Add New Country*\n\n" +
    "Send in format:\n`[countryCode] [name] [flag]`\n\n" +
    "*Examples:*\n" +
    "`880 Bangladesh 🇧🇩`\n" +
    "`91 India 🇮🇳`\n" +
    "`1 USA 🇺🇸`\n\n" +
    "Note: Country code is dialing code (without +).",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "❌ Cancel", callback_data: "admin_cancel" }]
        ]
      }
    }
  );
});

/******************** ADMIN COUNTRY PRICES ********************/
bot.action("admin_country_prices", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  let text = "💰 *Country OTP Prices*\n\n";
  text += `📌 *Default Price:* ${(settings.defaultOtpPrice || 0.25).toFixed(2)} taka/OTP\n\n`;
  text += "*Price per Country:*\n";

  for (const cc in countries) {
    const price = countryPrices[cc] !== undefined ? countryPrices[cc] : (settings.defaultOtpPrice || 0.25);
    const custom = countryPrices[cc] !== undefined ? " ✏️" : "";
    text += `${countries[cc].flag} ${countries[cc].name} (+${cc}): *${price.toFixed(2)} TK*${custom}\n`;
  }

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "✏️ Set Country Price", callback_data: "admin_set_country_price" }],
        [{ text: "🔄 Reset All to Default", callback_data: "admin_reset_prices" }],
        [{ text: "🔙 Back", callback_data: "admin_back" }]
      ]
    }
  });
});

bot.action("admin_set_country_price", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  ctx.session.adminState = "waiting_set_country_price";

  await ctx.editMessageText(
    "✏️ *Set Country Price*\n\n" +
    "Format: `[country_code] [price]`\n\n" +
    "*Example:*\n" +
    "`880 0.50` → Bangladesh = 0.50 taka\n" +
    "`91 0.25` → India = 0.25 taka\n" +
    "`1 0.75` → USA = 0.75 taka\n\n" +
    "You can set multiple countries in one message (one per line):",
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_cancel" }]]
      }
    }
  );
});

bot.action("admin_reset_prices", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  countryPrices = {};
  saveCountryPrices();
  await ctx.answerCbQuery("✅ All prices reset!");
  await ctx.editMessageText(
    `✅ *All Country Prices Reset.*\n\nAll countries now use default price (${(settings.defaultOtpPrice || 0.25).toFixed(2)} taka).`,
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_country_prices" }]] } }
  );
});

/******************** ADMIN BALANCE MANAGEMENT ********************/
bot.action("admin_balance_manage", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const topUsers = Object.entries(earnings)
    .sort(([,a],[,b]) => b.totalEarned - a.totalEarned)
    .slice(0, 10);

  let text = "💰 *User Balance Management*\n\n";
  text += `👥 *Total Users with earnings:* ${Object.keys(earnings).length}\n`;
  const totalBalance = Object.values(earnings).reduce((s, e) => s + e.balance, 0);
  const totalEarned = Object.values(earnings).reduce((s, e) => s + e.totalEarned, 0);
  text += `💵 *Total Pending Balance:* ${totalBalance.toFixed(2)} taka\n`;
  text += `📈 *Total Ever Earned:* ${totalEarned.toFixed(2)} taka\n\n`;

  if (topUsers.length > 0) {
    text += "*🏆 Top Earners:*\n";
    topUsers.forEach(([uid, e], i) => {
      const user = users[uid];
      const name = user ? user.first_name : uid;
      text += `${i+1}. ${name} — ${e.totalEarned.toFixed(2)}TK (Balance: ${e.balance.toFixed(2)}TK)\n`;
    });
  }

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Add User Balance", callback_data: "admin_add_balance" }],
        [{ text: "➖ Deduct User Balance", callback_data: "admin_deduct_balance" }],
        [{ text: "🔄 Reset User Balance", callback_data: "admin_reset_balance" }],
        [{ text: "🔙 Back", callback_data: "admin_back" }]
      ]
    }
  });
});

bot.action("admin_add_balance", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();
  ctx.session.adminState = "waiting_add_balance";
  await ctx.editMessageText(
    "➕ *Add User Balance*\n\n" +
    "Format: `[user_id] [amount]`\n\n" +
    "Example: `123456789 50`\n\n" +
    "Find User ID via /admin → User Stats:",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_cancel" }]] } }
  );
});

bot.action("admin_deduct_balance", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();
  ctx.session.adminState = "waiting_deduct_balance";
  await ctx.editMessageText(
    "➖ *Deduct User Balance*\n\n" +
    "Format: `[user_id] [amount]`\n\n" +
    "Example: `123456789 25`",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_cancel" }]] } }
  );
});

bot.action("admin_reset_balance", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();
  ctx.session.adminState = "waiting_reset_balance";
  await ctx.editMessageText(
    "🔄 *Reset User Balance*\n\n" +
    "Send the User ID (balance will be set to 0):\n\n" +
    "Example: `123456789`",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "❌ Cancel", callback_data: "admin_cancel" }]] } }
  );
});

/******************** ADMIN WITHDRAWALS ********************/
bot.action("admin_withdrawals", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const pending = withdrawals.filter(w => w.status === "pending");
  const approved = withdrawals.filter(w => w.status === "approved");
  const rejected = withdrawals.filter(w => w.status === "rejected");
  const totalApproved = approved.reduce((s, w) => s + w.amount, 0);

  let text = `💸 *Withdraw Management*\n\n` +
    `⏳ Pending: *${pending.length}*\n` +
    `✅ Approved: *${approved.length}* (${totalApproved.toFixed(2)} taka)\n` +
    `❌ Rejected: *${rejected.length}*\n\n`;

  const buttons = [[{ text: "⏳ Pending Requests", callback_data: "admin_pending_withdrawals" }]];

  if (pending.length > 0) {
    text += `⚠️ *${pending.length} pending request(s) waiting!*`;
  }

  buttons.push([
    { text: "📋 All History", callback_data: "admin_all_withdrawals" },
    { text: "🔙 Back", callback_data: "admin_back" }
  ]);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action("admin_pending_withdrawals", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const pending = withdrawals.filter(w => w.status === "pending").slice(-10);

  if (pending.length === 0) {
    return await ctx.editMessageText("✅ *No pending requests.*", {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_withdrawals" }]] }
    });
  }

  let text = `⏳ *Pending Withdraw Requests (${pending.length}):*\n\n`;

  const buttons = [];
  pending.forEach((w, i) => {
    text += `${i + 1}. 👤 ${w.userName} | 💵 ${w.amount.toFixed(2)}TK | ${w.method} | ${w.account}\n`;
    buttons.push([
      { text: `✅ ${w.amount.toFixed(2)}TK-${w.method}`, callback_data: `wadmin_approve:${w.id}` },
      { text: `❌ Reject`, callback_data: `wadmin_reject:${w.id}` }
    ]);
  });

  buttons.push([{ text: "🔙 Back", callback_data: "admin_withdrawals" }]);

  await ctx.editMessageText(text, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action("admin_all_withdrawals", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  try {
    const recent = withdrawals.slice(-15).reverse();
    let text = "📋 *Recent Withdrawals (last 15):*\n\n";

    if (recent.length === 0) {
      text += "No requests yet.";
    } else {
      recent.forEach(w => {
        const icon = w.status === "approved" ? "✅" : w.status === "rejected" ? "❌" : "⏳";
        const name = String(w.userName || 'Unknown').replace(/[_*`\[]/g, '\\$&');
        const date = new Date(w.requestedAt).toLocaleDateString('en-GB');
        text += `${icon} ${name} | \`${w.amount.toFixed(2)}\`TK | ${w.method} | ${date}\n`;
      });
    }

    if (text.length > 4000) text = text.substring(0, 3950) + '\n\n_...truncated_';

    await ctx.editMessageText(text, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_withdrawals" }]] }
    });
  } catch(error) {
    console.error("All withdrawals error:", error.message);
    if (error.message?.includes("message is not modified")) return;
    try {
      await ctx.editMessageText("❌ Error loading withdrawals.", {
        reply_markup: { inline_keyboard: [[{ text: "🔙 Back", callback_data: "admin_withdrawals" }]] }
      });
    } catch(e) {}
  }
});

/******************** ADMIN DELETE NUMBERS ********************/
bot.action("admin_delete", async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  let report = "❌ *Delete Numbers*\n\n";
  report += "Select which numbers to delete:\n\n";

  const buttons = [];

  for (const countryCode in numbersByCountryService) {
    const country = countries[countryCode];
    const countryName = country ? `${country.flag} ${country.name}` : `Country ${countryCode}`;

    report += `${countryName} (+${countryCode}):\n`;

    for (const serviceId in numbersByCountryService[countryCode]) {
      const service = services[serviceId];
      const count = numbersByCountryService[countryCode][serviceId].length;

      if (count > 0) {
        report += `  ${service?.icon || '📞'} ${service?.name || serviceId}: ${count}\n`;

        buttons.push([
          { 
            text: `🗑️ ${countryCode}/${serviceId} (${count})`, 
            callback_data: `admin_delete_confirm:${countryCode}:${serviceId}` 
          }
        ]);
      }
    }
    report += "\n";
  }

  buttons.push([{ text: "❌ Cancel", callback_data: "admin_cancel" }]);

  await ctx.editMessageText(report, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action(/^admin_delete_confirm:(.+):(.+)$/, async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const countryCode = ctx.match[1];
  const serviceId = ctx.match[2];

  const count = numbersByCountryService[countryCode]?.[serviceId]?.length || 0;

  await ctx.editMessageText(
    `⚠️ *Confirm Deletion*\n\n` +
    `Are you sure you want to delete ${count} numbers?\n` +
    `Country: ${countryCode}\n` +
    `Service: ${services[serviceId]?.name || serviceId}\n\n` +
    `This action cannot be undone!`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Yes, Delete", callback_data: `admin_delete_execute:${countryCode}:${serviceId}` },
            { text: "❌ Cancel", callback_data: "admin_back" }
          ]
        ]
      }
    }
  );
});

bot.action(/^admin_delete_execute:(.+):(.+)$/, async (ctx) => {
  if (!ctx.session.isAdmin) return await ctx.answerCbQuery("❌ Admin only");
  await ctx.answerCbQuery();

  const countryCode = ctx.match[1];
  const serviceId = ctx.match[2];

  const count = numbersByCountryService[countryCode]?.[serviceId]?.length || 0;

  delete numbersByCountryService[countryCode][serviceId];

  if (Object.keys(numbersByCountryService[countryCode]).length === 0) {
    delete numbersByCountryService[countryCode];
  }

  saveNumbers();

  await ctx.editMessageText(
    `✅ *Deleted Successfully*\n\n` +
    `🗑️ Deleted ${count} numbers\n` +
    `📌 Country: ${countryCode}\n` +
    `🔧 Service: ${services[serviceId]?.name || serviceId}`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔙 Back to Admin", callback_data: "admin_back" }]
        ]
      }
    }
  );
});

/******************** TEXT INPUT HANDLER ********************/
bot.on("text", async (ctx, next) => {
  try {
    if (!ctx.message || !ctx.message.text) return;
    const text = ctx.message.text.trim();
    const userId = ctx.from.id.toString();

    const KEYBOARD_BUTTONS = [
      "☎️ Get Number", "📞 Get Numbers",
      "📧 Get Tempmail", "📧 Temp Mail",
      "🔐 2FA", "🔐 2FA Codes",
      "💬 Support",
      "📱 Connect WhatsApp",
      "🏠 Home", "🏠 Main Menu"
    ];

    if (KEYBOARD_BUTTONS.includes(text)) {
      ctx.session.withdrawState = null;
      ctx.session.withdrawData = null;
      ctx.session.totpState = null;
      ctx.session.totpData = null;
      ctx.session.adminState = null;
      ctx.session.adminData = null;
      ctx.session.waState = null;
      return next();
    }

    if (text.startsWith('/')) return;

    // ─── WhatsApp number input ───
    if (ctx.session.waState === "waiting_number") {
      ctx.session.waState = null;
      const phone = text.replace(/\D/g, "");
      if (phone.length < 10 || phone.length > 15) {
        return await ctx.reply(
          "❌ Invalid number.\nExample: `8801712345678`",
          { parse_mode: "Markdown" }
        );
      }

      const loading = await ctx.reply(
        "⏳ *Getting pairing code...*\n\n⌛ Please wait a few seconds.",
        { parse_mode: "Markdown" }
      );

      setImmediate(async () => {
        try {
          await baileysRequest("POST", "/start", { userId });
          await new Promise(r => setTimeout(r, 3000));
          const result = await baileysRequest("POST", "/pair", { phone, userId });

          if (result?.connected) {
            waSessions[userId] = { connected: true };
            await ctx.telegram.editMessageText(
              ctx.chat.id, loading.message_id, null,
              "✅ *WhatsApp Already Connected!*\n\n🟢 Active.",
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "🔴 Disconnect", callback_data: "wa_disconnect" }],
                    [{ text: "📊 Check Status", callback_data: "wa_status" }]
                  ]
                }
              }
            );
            return;
          }

          if (result?.code) {
            const clean = result.code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
            const formatted = clean.length >= 8
              ? `${clean.slice(0, 4)}-${clean.slice(4, 8)}`
              : clean;

            await ctx.telegram.editMessageText(
              ctx.chat.id, loading.message_id, null,
              `🔑 *Pairing Code*\n\n\`${formatted}\`\n\n` +
              `📋 *Steps:*\n` +
              `1️⃣ Open WhatsApp\n` +
              `2️⃣ Settings → Linked Devices\n` +
              `3️⃣ Link a Device → *Link with phone number*\n` +
              `4️⃣ Enter this code\n\n` +
              `✅ After entering code, tap *Check Status*`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: "✅ Check Status", callback_data: "wa_status" }],
                    [{ text: "🔄 New Code", callback_data: "wa_reconnect" }]
                  ]
                }
              }
            );
          } else {
            throw new Error(result?.error || "Failed to get pairing code");
          }

        } catch (e) {
          try {
            await ctx.telegram.editMessageText(
              ctx.chat.id, loading.message_id, null,
              `❌ *Connection failed:*\n\`${String(e.message).slice(0, 150)}\`\n\nPlease try again later.`,
              {
                parse_mode: "Markdown",
                reply_markup: {
                  inline_keyboard: [[{ text: "🔄 Try Again", callback_data: "wa_reconnect" }]]
                }
              }
            );
          } catch (_) {}
        }
      });
      return;
    }

    // TOTP Secret Key input
    if (ctx.session.totpState === "waiting_secret") {
      const secret = text.replace(/\s/g, "").toUpperCase();
      const result = generateTOTP(secret);
      if (!result) {
        return await ctx.reply(
          "❌ *Invalid Secret Key!*\n\nUse Base32 format.\nExample: `JBSWY3DPEHPK3PXP`\n\nType /cancel to cancel",
          { parse_mode: "Markdown" }
        );
      }
      const { service } = ctx.session.totpData || {};
      const icon = service === "facebook" ? "📘" : service === "instagram" ? "📸" : service === "google" ? "🔍" : "⚙️";
      const name = service === "facebook" ? "Facebook" : service === "instagram" ? "Instagram" : service === "google" ? "Google" : "2FA";
      ctx.session.totpState = null;
      ctx.session.totpData = { service, secret };
      return await ctx.reply(
        `${icon} *${name} 2FA Code*\n\n` +
        `🔑 *Code:* \`${result.token}\`\n\n` +
        `⏰ *${result.timeRemaining} seconds remaining*\n\n` +
        `📋 Copy the code and enter it on the site.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🔄 Refresh Code", callback_data: `totp_refresh:${service}:${encodeURIComponent(secret)}` }],
              [{ text: "🔙 Back", callback_data: "totp_back" }]
            ]
          }
        }
      );
    }

    // Admin-only states
    if (!ctx.session.isAdmin || !ctx.session.adminState) return;
    const adminState = ctx.session.adminState;

    if (adminState === "waiting_set_count") {
      const count = parseInt(text);
      if (isNaN(count) || count < 1 || count > 100) {
        return await ctx.reply("❌ Enter a number between 1 and 100.");
      }
      settings.defaultNumberCount = count;
      saveSettings();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Number Count Set: ${count}*`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "admin_settings" }]] } });

    } else if (adminState === "waiting_set_cooldown") {
      const seconds = parseInt(text);
      if (isNaN(seconds) || seconds < 1 || seconds > 3600) {
        return await ctx.reply("❌ Enter a number between 1 and 3600.");
      }
      settings.cooldownSeconds = seconds;
      saveSettings();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Cooldown Set: ${seconds} seconds*`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "admin_settings" }]] } });

    } else if (adminState === "waiting_set_default_price") {
      const price = parseFloat(text);
      if (isNaN(price) || price < 0) {
        return await ctx.reply("❌ Enter a valid price.");
      }
      settings.defaultOtpPrice = price;
      saveSettings();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Default OTP Price Set: ${price.toFixed(2)} taka*`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "admin_settings" }]] } });

    } else if (adminState === "waiting_set_min_withdraw") {
      const amount = parseFloat(text);
      if (isNaN(amount) || amount < 1) {
        return await ctx.reply("❌ Enter a valid amount.");
      }
      settings.minWithdraw = amount;
      saveSettings();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Min Withdraw Set: ${amount} taka*`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Settings", callback_data: "admin_settings" }]] } });

    } else if (adminState === "waiting_broadcast") {
      const message = text;
      let sent = 0, failed = 0;
      for (const uid of Object.keys(users)) {
        try {
          await bot.telegram.sendMessage(uid, message, { parse_mode: "Markdown" });
          sent++;
          await new Promise(r => setTimeout(r, 50));
        } catch (e) { failed++; }
      }
      ctx.session.adminState = null;
      await ctx.reply(`📢 *Broadcast Complete!*\n\n✅ Sent: ${sent}\n❌ Failed: ${failed}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Admin Panel", callback_data: "admin_back" }]] } });

    } else if (adminState === "waiting_add_numbers") {
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      let added = 0, failed = 0;
      for (const line of lines) {
        const parts = line.split("|");
        const num = parts[0].replace(/\D/g, "");
        const cc = parts[1] || (ctx.session.adminData?.countryCode);
        const sid = parts[2] || (ctx.session.adminData?.serviceId) || "other";
        if (!num || !cc || !sid) { failed++; continue; }
        if (!numbersByCountryService[cc]) numbersByCountryService[cc] = {};
        if (!numbersByCountryService[cc][sid]) numbersByCountryService[cc][sid] = [];
        if (!numbersByCountryService[cc][sid].includes(num)) {
          numbersByCountryService[cc][sid].push(num);
          added++;
        } else { failed++; }
      }
      saveNumbers();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Numbers Added!*\n\n✅ Added: ${added}\n❌ Failed: ${failed}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Admin Panel", callback_data: "admin_back" }]] } });

    } else if (adminState === "waiting_add_country") {
      const parts = text.trim().split(/\s+/);
      if (parts.length >= 3) {
        const countryCode = parts[0].replace(/\D/g, "");
        const flag = parts[parts.length - 1];
        const countryName = parts.slice(1, -1).join(" ");
        countries[countryCode] = { name: countryName, flag: flag };
        saveCountries();
        ctx.session.adminState = null;
        await ctx.reply(
          `✅ *Country Added!*\n\n📌 Code: +${countryCode}\n🏳️ Name: ${countryName}\n${flag} Flag: ${flag}`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Countries", callback_data: "admin_manage_countries" }]] } }
        );
      } else {
        await ctx.reply("❌ Format: `[code] [name] [flag]`\nExample: `880 Bangladesh 🇧🇩`", { parse_mode: "Markdown" });
      }

    } else if (adminState === "waiting_add_service") {
      const parts = text.trim().split(/\s+/);
      if (parts.length >= 3) {
        const serviceId = parts[0].toLowerCase();
        const serviceName = parts.slice(1, -1).join(" ");
        const icon = parts[parts.length - 1];
        services[serviceId] = { name: serviceName, icon: icon };
        saveServices();
        ctx.session.adminState = null;
        await ctx.reply(
          `✅ *Service Added!*\n\n📌 ID: \`${serviceId}\`\n🔧 Name: ${serviceName}\n${icon} Icon: ${icon}`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Services", callback_data: "admin_manage_services" }]] } }
        );
      } else {
        await ctx.reply("❌ Format: `[id] [name] [icon]`\nExample: `facebook Facebook 📘`", { parse_mode: "Markdown" });
      }

    } else if (adminState === "waiting_add_balance") {
      const parts = text.trim().split(/\s+/);
      if (parts.length >= 2) {
        const targetId = parts[0];
        const amount = parseFloat(parts[1]);
        if (isNaN(amount) || amount <= 0) return await ctx.reply("❌ Enter a valid amount.");
        const targetEarnings = getUserEarnings(targetId);
        targetEarnings.balance += amount;
        saveEarnings();
        ctx.session.adminState = null;
        await ctx.reply(`✅ *${amount.toFixed(2)} taka added to ${targetId}.*\nNew Balance: ${targetEarnings.balance.toFixed(2)} taka`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Balance Management", callback_data: "admin_balance_manage" }]] } });
      } else {
        await ctx.reply("❌ Format: `[userId] [amount]`", { parse_mode: "Markdown" });
      }

    } else if (adminState === "waiting_deduct_balance") {
      const parts = text.trim().split(/\s+/);
      if (parts.length >= 2) {
        const targetId = parts[0];
        const amount = parseFloat(parts[1]);
        if (isNaN(amount) || amount <= 0) return await ctx.reply("❌ Enter a valid amount.");
        const targetEarnings = getUserEarnings(targetId);
        targetEarnings.balance = Math.max(0, targetEarnings.balance - amount);
        saveEarnings();
        ctx.session.adminState = null;
        await ctx.reply(`✅ *${amount.toFixed(2)} taka deducted from ${targetId}.*\nNew Balance: ${targetEarnings.balance.toFixed(2)} taka`,
          { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Balance Management", callback_data: "admin_balance_manage" }]] } });
      } else {
        await ctx.reply("❌ Format: `[userId] [amount]`", { parse_mode: "Markdown" });
      }

    } else if (adminState === "waiting_reset_balance") {
      const targetId = text.trim();
      const targetEarnings = getUserEarnings(targetId);
      targetEarnings.balance = 0;
      saveEarnings();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *${targetId}'s balance reset to 0.*`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Balance Management", callback_data: "admin_balance_manage" }]] } });

    } else if (adminState === "waiting_set_country_price") {
      const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
      let updated = 0, failed = 0;
      for (const line of lines) {
        const parts = line.split(/[:\s]+/);
        if (parts.length >= 2) {
          const cc = parts[0].replace(/\D/g, "");
          const price = parseFloat(parts[1]);
          if (cc && !isNaN(price) && price >= 0) {
            countryPrices[cc] = price;
            updated++;
          } else { failed++; }
        } else { failed++; }
      }
      saveCountryPrices();
      ctx.session.adminState = null;
      await ctx.reply(`✅ *Prices Updated!*\n\n✅ Updated: ${updated}\n❌ Failed: ${failed}`,
        { parse_mode: "Markdown", reply_markup: { inline_keyboard: [[{ text: "🔙 Country Prices", callback_data: "admin_country_prices" }]] } });

    } else if (adminState === "waiting_add_admin") {
      const targetId = text.trim();
      if (admins.includes(targetId)) {
        await ctx.reply(`⚠️ *User is already an admin!*\n\nUser ID: \`${targetId}\``, { parse_mode: "Markdown" });
      } else {
        admins.push(targetId);
        saveAdmins();
        await ctx.reply(`✅ *Admin Added Successfully!*\n\nUser ID: \`${targetId}\` is now an admin.\n\nThey can now use /admin command.`, {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[{ text: "🔙 Back to Admin Panel", callback_data: "admin_back" }]] }
        });
      }
      ctx.session.adminState = null;
      return;
    }

  } catch (err) {
    console.error("Text handler error:", err);
  }
});

/******************** ADMIN FILE UPLOAD HANDLER ********************/
bot.on("document", async (ctx) => {
  try {
    if (!ctx.session.isAdmin) return;
    if (ctx.session.adminState !== "waiting_upload_file") return;

    const doc = ctx.message.document;
    if (!doc || !doc.file_name || !doc.file_name.endsWith(".txt")) {
      return await ctx.reply("❌ *Only .txt files are supported.*\n\nPlease send a plain text file.", { parse_mode: "Markdown" });
    }

    const { serviceId } = ctx.session.adminData || {};
    if (!serviceId) {
      return await ctx.reply("❌ Session expired. Please start again via /admin → Upload File.", { parse_mode: "Markdown" });
    }

    await ctx.reply("⏳ *Processing file...*", { parse_mode: "Markdown" });

    const fileLink = await ctx.telegram.getFileLink(doc.file_id);
    const fileUrl = fileLink.href || fileLink.toString();

    const fileContent = await new Promise((resolve, reject) => {
      https.get(fileUrl, (res) => {
        let data = "";
        res.on("data", chunk => data += chunk);
        res.on("end", () => resolve(data));
        res.on("error", reject);
      }).on("error", reject);
    });

    const lines = fileContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let added = 0, failed = 0;

    for (const line of lines) {
      let number, countryCode, service;

      if (line.includes("|")) {
        const parts = line.split("|");
        number = parts[0].replace(/\D/g, "");
        countryCode = parts[1] ? parts[1].trim() : null;
        service = parts[2] ? parts[2].trim() : serviceId;
      } else {
        number = line.replace(/\D/g, "");
        countryCode = getCountryCodeFromNumber(number);
        service = serviceId;
      }

      if (!number || !/^\d{10,15}$/.test(number)) { failed++; continue; }
      if (!countryCode) { failed++; continue; }
      if (!service) service = serviceId;

      if (!numbersByCountryService[countryCode]) numbersByCountryService[countryCode] = {};
      if (!numbersByCountryService[countryCode][service]) numbersByCountryService[countryCode][service] = [];

      if (!numbersByCountryService[countryCode][service].includes(number)) {
        numbersByCountryService[countryCode][service].push(number);
        added++;
      } else {
        failed++;
      }
    }

    saveNumbers();
    ctx.session.adminState = null;
    ctx.session.adminData = null;

    await ctx.reply(
      `✅ *File Upload Complete!*\n\n` +
      `📄 File: ${doc.file_name}\n` +
      `✅ Added: ${added}\n` +
      `❌ Skipped/Duplicate: ${failed}\n` +
      `📊 Total lines: ${lines.length}`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[{ text: "🔙 Admin Panel", callback_data: "admin_back" }]] }
      }
    );

  } catch (error) {
    console.error("Document upload error:", error);
    await ctx.reply("❌ Upload failed. Please try again.\n\nError: " + error.message);
    ctx.session.adminState = null;
  }
});

/******************** OTP GROUP MONITORING ********************/
bot.on("chat_member", async (ctx) => {
  try {
    const member = ctx.chatMember;
    if (!member) return;
    const chatId = ctx.chat.id.toString();
    const userId = member.new_chat_member?.user?.id?.toString();
    if (!userId) return;
    const oldStatus = member.old_chat_member?.status;
    const newStatus = member.new_chat_member?.status;
    const isRequiredGroup = (
      chatId === MAIN_CHANNEL_ID?.toString() ||
      chatId === CHAT_GROUP_ID?.toString() ||
      chatId === OTP_GROUP_ID?.toString()
    );
    if (!isRequiredGroup) return;
    const wasActive = ["member", "administrator", "creator"].includes(oldStatus);
    const nowGone = ["left", "kicked", "restricted"].includes(newStatus);
    if (wasActive && nowGone) {
      if (users[userId]) {
        users[userId].verified = false;
        saveUsers();
      }
      console.log(`🚫 User ${userId} left/kicked — access revoked`);
    }
  } catch(e) {
    console.error("chat_member event error:", e.message);
  }
});

bot.on("message", async (ctx, next) => {
  try {
    const chatId = ctx.chat.id;
    const isOtpGroup = chatId === OTP_GROUP_ID || chatId === Number(OTP_GROUP_ID) || chatId.toString() === OTP_GROUP_ID.toString();
    if (!isOtpGroup) return next();

    const messageText = ctx.message.text || ctx.message.caption || '';
    const messageId = ctx.message.message_id;
    if (!messageText) return;

    const matchedNumber = findMatchingActiveNumber(messageText);
    if (!matchedNumber) return;

    const userData = activeNumbers[matchedNumber];
    const userId = userData.userId;
    const countryCode = userData.countryCode || '';

    if (userData.lastOTP === messageId) return;
    userData.lastOTP = messageId;
    userData.otpCount = (userData.otpCount || 0) + 1;
    saveActiveNumbers();

    const otpCode = extractOTPCode(messageText);
    const earned = addEarning(userId, countryCode);
    const userBalance = getUserEarnings(userId).balance;
    const service = services[userData.service] || { icon: '📱', name: userData.service };
    const country = countries[countryCode] || { flag: '🌍', name: countryCode };

    let notifyText = `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n📨 *OTP Received!*\n\n${service.icon} *Service:* ${service.name}\n${country.flag} *Country:* ${country.name}\n📞 *Number:* \`+${matchedNumber}\`\n`;
    if (otpCode) notifyText += `\n🔑 *OTP Code:* \`${otpCode}\`\n`;
    notifyText += `\n💵 *+${earned.toFixed(2)} taka earned!*\n💰 *Current Balance: ${userBalance.toFixed(2)} taka*\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    await ctx.telegram.sendMessage(userId, notifyText, { parse_mode: 'Markdown' });
    await ctx.telegram.forwardMessage(userId, OTP_GROUP_ID, messageId);

    otpLog.push({
      phoneNumber: matchedNumber,
      userId,
      countryCode,
      service: userData.service,
      otpCode: otpCode || null,
      earned,
      messageId,
      delivered: true,
      timestamp: new Date().toISOString()
    });
    saveOTPLog();

  } catch (error) {
    console.error('OTP monitoring error:', error);
  }
});

/******************** START BOT ********************/
async function startBot() {
  try {
    console.log("=====================================");
    console.log("🚀 Starting Update Otp Bot...");
    console.log("✅ Verification system: FIXED");
    console.log("✅ WhatsApp Connect: ACTIVE");
    console.log("✅ copy_text buttons: ENABLED");
    console.log("=====================================");

    await bot.launch({
      allowedUpdates: [
        "message",
        "callback_query",
        "chat_member",
        "my_chat_member",
        "document"
      ]
    });

    console.log("✅ Bot started successfully!");
    
    // 2-hour membership check
    setInterval(async () => {
      if (!settings.requireVerification) return;
      const allUserIds = Object.keys(users);
      for (const userId of allUserIds) {
        try {
          const m1 = await bot.telegram.getChatMember(MAIN_CHANNEL_ID, userId);
          const m2 = await bot.telegram.getChatMember(CHAT_GROUP_ID, userId);
          const m3 = await bot.telegram.getChatMember(OTP_GROUP_ID, userId);
          const allJoined = ['member', 'administrator', 'creator'].includes(m1.status) &&
                           ['member', 'administrator', 'creator'].includes(m2.status) &&
                           ['member', 'administrator', 'creator'].includes(m3.status);
          users[userId].verified = allJoined;
          if (!allJoined) {
            console.log(`🚫 User ${userId} blocked`);
          }
          await new Promise(r => setTimeout(r, 100));
        } catch(e) {}
      }
      saveUsers();
    }, 2 * 60 * 60 * 1000);

  } catch (error) {
    console.error("❌ Failed to start bot:", error);
    setTimeout(startBot, 10000);
  }
}

startBot();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
