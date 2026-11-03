
import "./style.css";

type Message = {
  role: "user" | "model";
  text: string;
};

type ChatResponse = {
  reply: string;
  summary: string;
  context: Message[];
  summarized: boolean;
  error?: string;
};

const messagesElement =
  document.querySelector<HTMLDivElement>("#messages")!;

const input =
  document.querySelector<HTMLTextAreaElement>("#user-input")!;

const form =
  document.querySelector<HTMLFormElement>("#chat-form")!;

const sendButton =
  document.querySelector<HTMLButtonElement>("#send-button")!;

const errorElement =
  document.querySelector<HTMLDivElement>("#error")!;

const newChatButton =
  document.querySelector<HTMLButtonElement>("#new-chat")!;

const clearButton =
  document.querySelector<HTMLButtonElement>("#clear-chat")!;

const sidebar =
  document.querySelector<HTMLElement>("#sidebar")!;

let displayMessages: Message[] = [];
let context: Message[] = [];
let summary = "";
let busy = false;
let thinkingElement: HTMLDivElement | null = null;

function scrollBottom() {
  messagesElement.scrollTop = messagesElement.scrollHeight;
}

function createWelcome() {
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

  const examples = [
    "プログラミングについて教えて",
    "新しいアイデアを考えて",
    "今日のタスクを整理したい"
  ];

  examples.forEach((text) => {
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
  return welcome;
}

function render() {
  messagesElement.replaceChildren();

  if (displayMessages.length === 0) {
    messagesElement.append(createWelcome());
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
    content.className = "message-content";
    content.textContent = message.text;

    element.append(content);
    messagesElement.append(element);
  }

  if (thinkingElement) {
    messagesElement.append(thinkingElement);
  }

  scrollBottom();
}

function setBusy(value: boolean) {
  busy = value;
  sendButton.disabled = value;
  input.disabled = value;
  newChatButton.disabled = value;
  clearButton.disabled = value;
  sendButton.textContent = value ? "…" : "↑";
}

function showError(message: string) {
  errorElement.textContent = message;
}

async function sendMessage(text: string) {
  if (busy || !text.trim()) return;

  showError("");

  const userText = text.trim();

  // 画面には先にユーザーの質問を表示
  displayMessages.push({
    role: "user",
    text: userText
  });

  input.value = "";
  input.style.height = "auto";

  thinkingElement = document.createElement("div");
  thinkingElement.className = "message thinking";
  thinkingElement.textContent = "✦ Geminiが考えています...";

  render();
  setBusy(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        message: userText,
        summary,
        history: context
      })
    });

    const data = await response.json() as ChatResponse;

    if (!response.ok) {
      throw new Error(
        data.error || `APIエラー (${response.status})`
      );
    }

    if (
      typeof data.reply !== "string" ||
      !Array.isArray(data.context)
    ) {
      throw new Error("APIから不正な応答が返されました。");
    }

    // 次回以降に利用する記憶を更新
    summary = data.summary || "";
    context = data.context;

    displayMessages.push({
      role: "model",
      text: data.reply
    });

  } catch (error) {
    // 失敗した質問は表示から取り除く
    displayMessages.pop();

    showError(
      error instanceof Error
        ? error.message
        : "予期しないエラーが発生しました。"
    );

  } finally {
    thinkingElement = null;
    setBusy(false);
    render();
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

function resetChat() {
  if (busy) return;

  displayMessages = [];
  context = [];
  summary = "";

  showError("");
  input.value = "";
  render();
  sidebar.classList.remove("open");
  input.focus();
}

newChatButton.addEventListener("click", resetChat);

clearButton.addEventListener("click", () => {
  if (busy) return;

  if (!confirm("現在の会話をすべて削除しますか？")) {
    return;
  }

  resetChat();
});

document.querySelector("#mobile-menu")?.addEventListener(
  "click",
  () => {
    sidebar.classList.toggle("open");
  }
);

render();
