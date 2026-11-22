import React, { useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X, Loader2, RotateCcw } from "lucide-react";
import { auth } from "../../firebase";
import { useAuth } from "../../contexts/AuthProvider";

type ChatRole = "user" | "assistant";

interface ChatSource {
  source: string;
  location: string;
  snippet: string;
  score: number;
  url?: string | null;
}

interface ChatTurn {
  role: ChatRole;
  content: string;
  sources?: ChatSource[];
}

// Same python-backend FastAPI service used by plan-import (see
// PlanImportPlaceholderPage.tsx) - override via VITE_PLAN_BACKEND_URL.
const CHAT_BACKEND_URL =
  (import.meta.env.VITE_PLAN_BACKEND_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

const WELCOME_TITLE = "Welcome to Ultra-Calc!";
const WELCOME_BODY =
  "I'm here to help you get the most out of Ultra-Calc. Ask me about system design, installation methods, calculations, product features, or how things work.\nWhat would you like help with today?";

const SUGGESTED_QUESTIONS = ["What can Ultra-Calc help me with?", "Explain the installation methods"];

export const ChatWidget: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading]);

  const sendMessage = async (overrideText?: string) => {
    const trimmed = (overrideText ?? input).trim();
    if (!trimmed || isLoading) return;
    if (!CHAT_BACKEND_URL) {
      setError("The assistant isn't available right now. Please try again later.");
      return;
    }

    const history = messages;
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const headers = new Headers({ "Content-Type": "application/json" });
      if (auth.currentUser) {
        headers.set("Authorization", `Bearer ${await auth.currentUser.getIdToken()}`);
      }
      const response = await fetch(`${CHAT_BACKEND_URL}/api/v1/chat`, {
        method: "POST",
        headers,
        // Only role/content are part of the backend's request contract - strip
        // any locally-attached `sources` before sending history back up.
        body: JSON.stringify({
          message: trimmed,
          history: history.map(({ role, content }) => ({ role, content })),
        }),
      });
      if (response.status === 401) {
        throw new Error("Please sign in to use the assistant.");
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        console.error("Chat request failed:", response.status, body);
        throw new Error("We couldn't get a response right now. Please try again.");
      }
      const data: { answer: string; sources?: ChatSource[] } = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer, sources: data.sources }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't get a response right now. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setError(null);
    setInput("");
  };

  // Only signed-in users can reach the backend's chat API - no point showing the widget before auth resolves or to signed-out visitors.
  if (authLoading || !user) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open help chat"
        className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700"
      >
        <MessageCircle className="h-6 w-6" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex h-[32rem] w-80 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:w-96">
      <div className="flex items-center justify-between bg-blue-600 px-4 py-3 text-white">
        <span className="font-semibold">Ultra-Calc Assistant</span>
        <div className="flex items-center gap-3">
          <button
            onClick={startNewConversation}
            title="Start a new conversation"
            aria-label="Start a new conversation"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={() => setIsOpen(false)} aria-label="Close help chat">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-3">
        {messages.length === 0 && (
          <>
            <div className="rounded-lg bg-white px-3 py-3 text-sm text-slate-800 shadow">
              <p className="font-semibold">{WELCOME_TITLE}</p>
              <p className="mt-1 whitespace-pre-line text-slate-600">{WELCOME_BODY}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold tracking-wide text-slate-400">SUGGESTED QUESTIONS</p>
              {SUGGESTED_QUESTIONS.map((question) => (
                <button
                  key={question}
                  onClick={() => sendMessage(question)}
                  className="block w-full rounded-full border border-slate-200 bg-white px-3 py-2 text-left text-sm text-blue-700 hover:bg-blue-50"
                >
                  {question}
                </button>
              ))}
            </div>
          </>
        )}

        {messages.map((turn, index) => {
          const citations =
            turn.role === "assistant" && turn.sources
              ? Array.from(
                  new Map(
                    turn.sources.filter((source) => source.url).map((source) => [source.url, source])
                  ).values()
                )
              : [];
          return (
            <div key={index} className={`flex ${turn.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  turn.role === "user" ? "bg-blue-600 text-white" : "bg-white text-slate-800 shadow"
                }`}
              >
                {turn.content}
                {citations.length > 0 && (
                  <div className="mt-2 border-t border-slate-100 pt-2">
                    <p className="text-xs font-semibold tracking-wide text-slate-400">SOURCES</p>
                    <ul className="mt-1 space-y-1">
                      {citations.map((source) => (
                        <li key={source.url}>
                          <a
                            href={source.url ?? undefined}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-words text-xs text-blue-600 underline hover:text-blue-800"
                          >
                            {source.source}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Finding the best answer for you...
          </div>
        )}
        {error && <div className="text-sm text-red-600">{error}</div>}
      </div>

      <div className="flex items-center gap-2 border-t border-slate-200 p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage();
          }}
          placeholder="Ask me anything..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          onClick={() => sendMessage()}
          disabled={isLoading || !input.trim()}
          title="Send message"
          aria-label="Send message"
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default ChatWidget;
