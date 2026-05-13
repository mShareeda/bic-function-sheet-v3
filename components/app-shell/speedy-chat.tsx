"use client";

import * as React from "react";
import { Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

const WELCOME: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I'm Speedy 🏎 — your BIC AI assistant. Ask me anything about upcoming events, departments, venues, or how to use this system!",
};

function openSpeedy() {
  document.dispatchEvent(new CustomEvent("speedy:open"));
}

export function SpeedyChatTrigger({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <button
        type="button"
        onClick={openSpeedy}
        aria-label="Open Speedy AI assistant"
        title="Ask Speedy"
        className="focus-ring relative flex h-9 w-9 items-center justify-center rounded-full transition-colors hover:bg-surface/60"
      >
        <img
          src="/speedy.png"
          alt="Speedy"
          className="h-[22px] w-[22px] rounded-full object-cover ring-1 ring-primary/40"
        />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openSpeedy}
      className="focus-ring group flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all duration-300 hover:bg-surface/60 hover:text-foreground hover:translate-x-0.5"
    >
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <img
          src="/speedy.png"
          alt="Speedy"
          className="h-6 w-6 rounded-full object-cover ring-1 ring-primary/30 transition-all duration-300 group-hover:ring-primary/70 group-hover:shadow-[0_0_8px_rgba(239,68,68,0.4)]"
        />
      </span>
      <span>Ask Speedy</span>
      <span className="ml-auto text-[10px] font-semibold text-primary/50 group-hover:text-primary/80 transition-colors">
        AI
      </span>
    </button>
  );
}

export function SpeedyChat() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<Message[]>([WELCOME]);
  const [input, setInput] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    document.addEventListener("speedy:open", onOpen);
    return () => document.removeEventListener("speedy:open", onOpen);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [open]);

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 96) + "px";
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
    };

    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setLoading(true);

    const assistantId = crypto.randomUUID();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const apiMessages = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const res = await fetch("/api/speedy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        throw new Error(`${res.status}`);
      }

      if (!res.body) {
        const txt = await res.text();
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content: txt } : m)),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const snap = accumulated;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: snap } : m,
          ),
        );
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  "Oops, I hit a bump on the track! 🏎 Please try again in a moment.",
              }
            : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <>
      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] animate-fade-in lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Chat panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Speedy AI assistant"
        aria-modal="true"
        className={cn(
          "fixed right-0 top-0 z-50 flex h-dvh w-96 max-w-[90vw] flex-col border-l border-border bg-popover shadow-2xl transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-border bg-popover px-4 py-3 shrink-0">
          <div className="relative">
            <img
              src="/speedy.png"
              alt="Speedy mascot"
              className="h-10 w-10 rounded-full object-cover ring-2 ring-red-500/40 shadow-[0_0_12px_rgba(239,68,68,0.25)]"
            />
            <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-500 ring-2 ring-popover" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold leading-tight">Speedy</p>
            <p className="text-[11px] text-muted-foreground">BIC AI Assistant</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close Speedy"
            className="focus-ring flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} loading={loading && m.id === messages[messages.length - 1].id && m.role === "assistant" && m.content === ""} />
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-popover px-4 py-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={onKeyDown}
              placeholder="Ask Speedy anything…"
              rows={1}
              disabled={loading}
              className={cn(
                "flex-1 resize-none rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50 transition-all",
                "min-h-[40px] max-h-24",
              )}
              style={{ height: "40px" }}
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm transition-all hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground/50">
            Powered by Google AI · Beta 0.03
          </p>
        </div>
      </div>
    </>
  );
}

function MessageBubble({
  message,
  loading,
}: {
  message: Message;
  loading: boolean;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground shadow-sm">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2">
      <img
        src="/speedy.png"
        alt="Speedy"
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-border mb-0.5"
      />
      <div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-muted px-3.5 py-2.5 text-sm shadow-sm">
        {loading ? (
          <TypingIndicator />
        ) : (
          <span className="whitespace-pre-wrap">{message.content}</span>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}
