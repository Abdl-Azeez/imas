(function () {
  const sidebar = document.getElementById("historySidebar");
  const list = document.getElementById("historyList");
  const newButton = document.getElementById("newConversationBtn");
  if (!sidebar || !list || !newButton) return;

  function render(items) {
    list.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("li");
      empty.className = "history-empty";
      empty.textContent = "Your conversations will appear here.";
      list.appendChild(empty);
      return;
    }
    items.forEach(item => {
      const button = document.createElement("button");
      button.className = "history-item" + (window.conversationId === item.id ? " active" : "");
      button.textContent = item.title;
      button.title = item.title;
      button.addEventListener("click", () => window.openConversation(item.id));
      const entry = document.createElement("li");
      entry.className = "history-entry";
      entry.appendChild(button);
      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-history-btn";
      deleteButton.type = "button";
      deleteButton.textContent = "×";
      deleteButton.title = "Delete conversation";
      deleteButton.setAttribute("aria-label", `Delete ${item.title}`);
      deleteButton.addEventListener("click", async event => {
        event.stopPropagation();
        if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
        const response = await fetch(`/conversations/${item.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${window.authToken}` }
        });
        if (!response.ok) return;
        if (window.conversationId === item.id) {
          window.conversationId = null;
          window.conversation = [];
          sessionStorage.removeItem(window.conversationStorageKey());
          window.renderConversation();
        }
        await refresh();
      });
      entry.appendChild(deleteButton);
      list.appendChild(entry);
    });
  }

  async function refresh() {
    if (!window.authToken) return;
    const response = await fetch("/conversations", { headers: { Authorization: `Bearer ${window.authToken}` } });
    if (!response.ok) return;
    render((await response.json()).conversations);
  }

  window.refreshConversationList = refresh;
  window.openConversation = async function (id) {
    const response = await fetch(`/conversations/${id}`, { headers: { Authorization: `Bearer ${window.authToken}` } });
    if (!response.ok) return;
    const data = await response.json();
    window.conversationId = data.conversationId;
    sessionStorage.setItem(window.conversationStorageKey(), window.conversationId);
    window.conversation = data.messages;
    window.renderConversation();
    await refresh();
  };

  newButton.addEventListener("click", () => {
    window.conversationId = null;
    window.conversation = [];
    sessionStorage.removeItem(window.conversationStorageKey());
    window.renderConversation();
    refresh();
  });

  window.refreshConversationList = refresh;
  refresh();
})();
