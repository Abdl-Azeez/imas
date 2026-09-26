const QUESTION_LIMIT = 10;
var conversation = [];
let usedThisPeriod = 0;
let questionLimit = QUESTION_LIMIT;
let isWaitingForResponse = false;
var conversationId = null;
var authToken = "";
const STORAGE_KEY_CONVERSATION = "imas_cs_tutor_conversation_id";

/* ---------------- Element references ---------------- */
const chatScroll = document.getElementById("chatScroll");
const welcomeWrap = document.getElementById("welcomeWrap");
const messageList = document.getElementById("messageList");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("sendBtn");
const usageCountEl = document.getElementById("usageCount");
const usageFooterText = document.getElementById("usageFooterText");
const resetNote = document.getElementById("resetNote");
const usagePill = document.getElementById("usagePill");
const limitBanner = document.getElementById("limitBanner");
const plusMenu = document.getElementById("plusMenu");
const debugDrawer = document.getElementById("debugDrawer");
const debugTextarea = document.getElementById("debugTextarea");
const toastEl = document.getElementById("toast");
const accountNameEl = document.getElementById("accountName");
const accountButton = document.getElementById("accountButton");
let currentUser = null;

function conversationStorageKey(userId = currentUser?.id) {
  return userId ? `${STORAGE_KEY_CONVERSATION}_${userId}` : STORAGE_KEY_CONVERSATION;
}

function setUserSession(user, resetConversation = false) {
  const previousUserId = currentUser?.id;
  currentUser = user;
  renderAccount(user);
  if (resetConversation || (previousUserId && previousUserId !== user.id)) {
    conversation = [];
    conversationId = null;
  } else {
    conversationId = sessionStorage.getItem(conversationStorageKey(user.id));
  }
}

function persistConversationId() {
  if (currentUser?.id && conversationId) sessionStorage.setItem(conversationStorageKey(), conversationId);
}

function clearConversationSelection() {
  conversation = [];
  conversationId = null;
  if (currentUser?.id) sessionStorage.removeItem(conversationStorageKey());
}

function renderAccount(user) {
  currentUser = user;
  if (accountNameEl) accountNameEl.textContent = user?.displayName || "Demo";
  if (accountButton) {
    accountButton.textContent = "";
    accountButton.style.display = "none";
  }
}
function formatDate(d) {
  return d.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

async function loadUsage() {
  usedThisPeriod = 0;
  questionLimit = 0;
  usagePill.style.display = "none";
  limitBanner.classList.remove("show");
  resetNote.textContent = "";
  updateSendButtonState();
}

function incrementUsage() {
  loadUsage().catch(() => {});
}

function renderUsage(resetsAt) {
  usageCountEl.textContent = "";
  usageFooterText.textContent = "";
  usagePill.style.display = "none";
  limitBanner.classList.remove("show");
  resetNote.textContent = "";
  updateSendButtonState();
}

function limitReached() {
  return false;
}

function isGreeting(text) {
  return /^(hi|hey|hello|hiya|howdy|good morning|good afternoon|good evening|thanks|thank you|ok|okay|bye|goodbye|how are you|what'?s up|hows it going|how is it going)[!.?,\s]*$/i.test(text.trim());
}

/* ================================================================
   RENDERING: WELCOME SCREEN vs MESSAGE LIST
   ================================================================ */
function renderConversation() {
  if (conversation.length === 0) {
    welcomeWrap.style.display = "block";
    messageList.style.display = "none";
    messageList.innerHTML = "";
    return;
  }
  welcomeWrap.style.display = "none";
  messageList.style.display = "block";
  messageList.innerHTML = "";
  conversation.forEach(item => {
    if (item.role === "student") {
      messageList.appendChild(buildStudentBubble(item.text));
    } else if (item.role === "tutor") {
      messageList.appendChild(buildTutorBubble(item));
    } else if (item.role === "error") {
      messageList.appendChild(buildErrorBubble(item));
    }
  });
  scrollToBottom();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatScroll.scrollTop = chatScroll.scrollHeight;
  });
}

function buildStudentBubble(text) {
  const row = document.createElement("div");
  row.className = "msg-row student";
  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  bubble.textContent = text;
  row.appendChild(bubble);
  return row;
}

function buildTutorBubble(item) {
  const row = document.createElement("div");
  row.className = "msg-row tutor";

  const block = document.createElement("div");
  block.className = "tutor-block";

  const labelRow = document.createElement("div");
  labelRow.className = "tutor-label-row";
  labelRow.innerHTML = `<span class="tutor-dot"></span><span class="tutor-label">Tutor</span>`;
  block.appendChild(labelRow);

  const bubble = document.createElement("div");
  bubble.className = "msg-bubble";
  const responseWrap = document.createElement("div");
  bubble.appendChild(responseWrap);

  // Local-only actions: Copy / Helpful / Not helpful â€” never trigger another request.
  const actions = document.createElement("div");
  actions.className = "response-actions";
  actions.innerHTML = `
    <button class="action-btn copy-response-btn">&#128203; Copy</button>
    <button class="action-btn feedback-btn" data-value="up">&#128077; Helpful</button>
    <button class="action-btn feedback-btn" data-value="down">&#128078; Not helpful</button>
  `;
  if (item.reveal) {
    actions.classList.add("response-actions-pending");
    renderStructuredResponseProgressive(item.response, responseWrap, () => {
      actions.classList.remove("response-actions-pending");
    });
    item.reveal = false;
  } else {
    responseWrap.replaceWith(renderStructuredResponse(item.response));
  }
  bubble.appendChild(actions);

  actions.querySelector(".copy-response-btn").addEventListener("click", () => {
    copyTextToClipboard(plainTextFromResponse(item.response));
    showToast("Response copied");
  });

  actions.querySelectorAll(".feedback-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      actions.querySelectorAll(".feedback-btn").forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      if (item.messageId) {
        fetch(`/messages/${item.messageId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
          body: JSON.stringify({ helpful: btn.dataset.value === "up" })
        }).catch(() => {});
      }
      showToast(btn.dataset.value === "up" ? "Thanks for the feedback!" : "Thanks - we will use this to improve.");
    });
  });

  block.appendChild(bubble);
  row.appendChild(block);
  return row;
}

function buildErrorBubble(item) {
  const row = document.createElement("div");
  row.className = "msg-row tutor";
  const card = document.createElement("div");
  card.className = "error-card";
  const message = item.errorMessage || "Something went wrong. Please try again.";
  card.textContent = `${message} `;
  const lineBreak = document.createElement("br");
  const retryButton = document.createElement("button");
  retryButton.className = "retry-btn";
  retryButton.textContent = "Try Again";
  card.append(lineBreak, retryButton);
  retryButton.addEventListener("click", () => {
    conversation = conversation.filter(c => c !== item);
    // Retrying performs a new request and will count as a new question, same as Send.
    performTutorRequest(item.originalText, item.originalIsCodeSubmission);
  });
  row.appendChild(card);
  return row;
}

/* ================================================================
   TYPING INDICATOR â€” "Thinking..." only, no AI wording
   ================================================================ */
function showTypingIndicator() {
  const row = document.createElement("div");
  row.className = "typing-row";
  row.id = "typingRow";
  row.innerHTML = `
    <div class="typing-bubble">
      Working on your answer
      <div class="typing-dots"><span></span><span></span><span></span></div>
    </div>`;
  messageList.appendChild(row);
  scrollToBottom();
}
function removeTypingIndicator() {
  const row = document.getElementById("typingRow");
  if (row) row.remove();
}

/* ================================================================
   SENDING A QUESTION (the ONLY path that consumes one of the 10)
   ================================================================ */
function updateSendButtonState() {
  const hasText = chatInput.value.trim().length > 0;
  sendBtn.disabled = !hasText || isWaitingForResponse;
}

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 140) + "px";
  updateSendButtonState();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSendClick();
  }
});

sendBtn.addEventListener("click", handleSendClick);

function handleSendClick() {
  const text = chatInput.value.trim();
  if (!text || isWaitingForResponse) return;

  chatInput.value = "";
  chatInput.style.height = "auto";
  updateSendButtonState();

  performTutorRequest(text, false);
}

/* Paste code / error drawer: sends as ONE question, same as any Send action */
document.getElementById("debugSendBtn").addEventListener("click", () => {
  const code = debugTextarea.value.trim();
  if (!code || isWaitingForResponse) return;
  debugTextarea.value = "";
  closeDebugDrawer();
  performTutorRequest(code, true);
});

function performTutorRequest(text, isCodeSubmission) {

  conversation.push({ role: "student", text: isCodeSubmission ? `[Code submitted]\n${text}` : text });
  renderConversation();

  isWaitingForResponse = true;
  updateSendButtonState();
  showTypingIndicator();

  sendMessageToTutor(text, conversation)
    .then(response => {
      removeTypingIndicator();
      conversationId = response.conversationId || conversationId;
      persistConversationId();
      if (window.refreshConversationList) window.refreshConversationList();
      conversation.push({ role: "tutor", response: response, messageId: response.messageId, reveal: true });
      if (!isGreeting(text)) incrementUsage();
      isWaitingForResponse = false;
      renderConversation();
      updateSendButtonState();
    })
    .catch(error => {
      removeTypingIndicator();
      conversation.push({
        role: "error",
        originalText: text,
        originalIsCodeSubmission: isCodeSubmission,
        errorMessage: error.message
      });
      isWaitingForResponse = false;
      renderConversation();
      updateSendButtonState();
    });
}

/* ================================================================
   TUTOR REQUEST FUNCTION
   -----------------------------------------------------------------
   This is the ONLY function that should be modified to call the
   real secure backend in production. Everything else in this file
   calls sendMessageToTutor() and only cares about the Promise
   it returns.
   ================================================================ */
async function sendMessageToTutor(message, conversationHistory) {
  const requestBody = { message: String(message || "").trim(), mode: conversationHistory.at(-1)?.text?.startsWith("[Code submitted]") ? "debug" : "ask" };
  if (conversationId) requestBody.conversationId = conversationId;
  const response = await fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${authToken}` },
    body: JSON.stringify(requestBody)
  });
  const data = await response.json();
  if (response.status === 429) {
    usedThisPeriod = data.usage?.used ?? questionLimit;
    if (data.requiresAccount) {
      authToken = null;
      localStorage.removeItem("imas_cs_tutor_token");
      showAuthScreen("Your three guest questions are used. Create an account or sign in to continue.");
    }
    renderUsage();
    throw new Error(data.error || "limit_reached");
  }
  if (!response.ok) throw new Error(data.error || "Tutor service unavailable");
  return data;
}

/* ================================================================
  WELCOME CARDS + SUGGESTED CHIPS
   (Populate input only â€” never auto-submit, never consume a question)
   ================================================================ */
document.querySelectorAll(".starter-card, .chip").forEach(el => {
  el.addEventListener("click", () => {
    chatInput.value = el.dataset.example;
    chatInput.dispatchEvent(new Event("input"));
    chatInput.focus();
  });
});

/* ================================================================
   PLUS BUTTON MENU (UI only â€” never submits anything)
   ================================================================ */
const plusBtn = document.getElementById("plusBtn");
plusBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  plusMenu.classList.toggle("open");
});
document.addEventListener("click", (e) => {
  if (!plusMenu.contains(e.target) && e.target !== plusBtn) {
    closePlusMenu();
  }
});
function closePlusMenu() { plusMenu.classList.remove("open"); }

document.getElementById("plusPasteCode").addEventListener("click", () => {
  openDebugDrawer("Paste your code");
  closePlusMenu();
});
document.getElementById("plusAskError").addEventListener("click", () => {
  openDebugDrawer("Describe or paste your error");
  closePlusMenu();
});

function openDebugDrawer(title) {
  document.getElementById("debugDrawerTitle").textContent = title;
  debugDrawer.classList.add("open");
  debugTextarea.focus();
}
function closeDebugDrawer() {
  debugDrawer.classList.remove("open");
}
document.getElementById("debugDrawerClose").addEventListener("click", closeDebugDrawer);

debugTextarea.addEventListener("input", () => {
  document.getElementById("debugSendBtn").disabled = debugTextarea.value.trim().length === 0 || limitReached();
});

/* ================================================================
   TOAST
   ================================================================ */
let toastTimer = null;
function showToast(text) {
  toastEl.textContent = text;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2200);
}

/* ================================================================
   AUTH + INIT
   ================================================================ */
async function ensureAuthenticated() {
  authToken = "";
  currentUser = { displayName: "Demo", isGuest: false };
  renderAccount(currentUser);
}

function showAuthScreen(message) {
  return;
}

async function initialize() {
  try {
    await ensureAuthenticated();
    await loadUsage();
    await loadConversationHistory();
    if (window.refreshConversationList) await window.refreshConversationList();
    if (loginScreen) loginScreen.style.display = "none";
  } catch (error) {
    loginError.textContent = error.message || "Unable to load your session";
  }
  renderConversation();
  updateSendButtonState();
}

async function loadConversationHistory() {
  if (!conversationId) return;
  const response = await fetch(`/conversations/${conversationId}`, { headers: { Authorization: `Bearer ${authToken}` } });
  if (response.status === 404) {
    conversationId = null;
    sessionStorage.removeItem(conversationStorageKey());
    return;
  }
  if (!response.ok) throw new Error("Could not load your conversation history");
  const data = await response.json();
  conversation = data.messages;
  renderConversation();
}

initialize();
