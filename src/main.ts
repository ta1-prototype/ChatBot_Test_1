
import "./style.css";

type Message = {
  role: "user" | "model";
  text: string;
};

type ChatMessage = Message & {
  id: number;
};

type ChatResponse = {
  reply: string;
  summary: string;
  context: Message[];
  summarized: boolean;
};

const messagesElement = document.querySelector<HTMLDivElement>("#messages")!;
const input = document.querySelector<HTMLTextAreaElement>("#user-input")!;
const form = document.querySelector<HTMLFormElement>("#chat-form")!;
const sendButton = document.querySelector<HTMLButtonElement>("#send-button")!;
const errorElement = document.querySelector<HTMLDivElement>("#error")!;

let displayMessages: ChatMessage[] = [];
let context: Message[] = [];
let summary = "";
let busy = false;

function scrollBottom() {
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function render() {
  messagesElement.replaceChildren();

  if (displayMessages.length === 0) {
    const welcome = document.createElement("div");
    welcome.className = "welcome";

    const icon = document.createElement("div");
    icon.className = "welcome-icon";
    icon.textContent = "✦";

    const title = document.createElement("h1");
    title.textContent = "何でも聞いてください。";

    const description = document.createElement("p");
    description.textContent =
      "あなたの思考をサポートするAIアシスタントです。";

    const suggestions = document.createElement("div");
    suggestions.className = "suggestions";

    [
      "プログラミングについて教えて",
      "新しいアイデアを考えて",
      "今日のタスクを整理したい"
    ].forEach((text) => {
      const button = document.createElement("button");
      button.className = "suggestion";
      button.textContent = text;
      button.addEventListener("click", () => {
        input.value = text;
        input.focus();
      });
      suggestions.append(button);
    });

    welcome.append(icon, title, description, suggestions);
    messagesElement.append(welcome);
    return;
  }

  for (const message of displayMessages) {
    const element = document.createElement("div");
    element.className =
      `message ${message.role === "user" ? "user" : "assistant"}`;

    if (message.role === "model") {
      const role = document.createElement("div");
      role.className = "message-role";
      role.textContent = "✦ GEMINI";
      element.append(role);
    }

    const content = document.createElement("div");
    content.textContent = message.text;

    element.append(content);
    messagesElement.append(element);
  }

  scrollBottom();
}

function addMessage(role: Message["role"], text: string) {
  displayMessages.push({
    id: Date.now() + displayMessages.length,
    role,
    text
  });
  render();
}

function setBusy(value: boolean) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  sendButton.textContent = value ? "…" : "↑";
}

function showError(message: string) {
  errorElement.textContent = message;
}

async function sendMessage(text: string) {
  if (busy || !text.trim()) return;

  showError("");
  addMessage("user", text);

  const userMessage: Message = {
    role: "user",
    text
  };

  // API送信中も画面上の表示は維持する
  const nextContext = [...context, userMessage];

  input.value = "";
  input.style.height = "auto";

  setBusy(true);

  const thinking = document.createElement("div");
  thinking.className = "message assistant";
  thinking.textContent = "✦ Geminiが考えています...";
  messagesElement.append(thinking);
  scrollBottom();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
  message: text,
  summary,
  history: context
})
    });

    const data = await response.json() as
      Partial<ChatResponse> & { error?: string };

    if (!response.ok) {
      throw new Error(data.error || "API通信に失敗しました。");
    }

    if (!data.reply || !Array.isArray(data.context)) {
      throw new Error("APIから不正な応答が返されました。");
    }

    // 要約された記憶を次回以降に引き継ぐ
    summary = data.summary || "";
    context = data.context;

    displayMessages.push({
      id: Date.now(),
      role: "model",
      text: data.reply
    });

    render();

  } catch (error) {
    // 失敗したユーザーメッセージは表示に残す
    // 記憶コンテキストには確定追加しない
    showError(
      error instanceof Error
        ? error.message
        : "予期しないエラーが発生しました。"
    );
    render();
  } finally {
    setBusy(false);
    input.focus();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendMessage(input.value);
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    form.requestSubmit();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height =
    `${Math.min(input.scrollHeight, 180)}px`;
});

document.querySelector("#new-chat")?.addEventListener("click", () => {
  if (busy) return;

  displayMessages = [];
  context = [];
  summary = "";
  showError("");
  render();

  document.querySelector(".sidebar")?.classList.remove("open");
});

document.querySelector("#clear-chat")?.addEventListener("click", () => {
  if (busy) return;

  if (!confirm("現在の会話をすべて削除しますか？")) return;

  displayMessages = [];
  context = [];
  summary = "";
  showError("");
  render();
});

document.querySelector("#mobile-menu")?.addEventListener("click", () => {
  document.querySelector(".sidebar")?.classList.toggle("open");
});

render();
