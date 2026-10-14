import { useState, useRef, useEffect } from "react";
import { useStore } from "../../app/store";
import { callFunction } from "../../lib/auth";
import { Card, Field, Button, Textarea, EmptyState, Spinner } from "../../components/ui";
import { Icon } from "../../components/ui/Icon";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  diagnosisId?: string;
}

export function AIAssistantPage() {
  const { pushToast } = useStore();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hello! I'm FixFlow AI, your repair assistant. I can help with repair questions, part lookups, troubleshooting steps, and more. What can I help you with today?",
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [context, setContext] = useState<{
    deviceType?: string;
    brand?: string;
    model?: string;
    serial?: string;
    complaint?: string;
  }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || busy) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = input;
    setInput("");
    setBusy(true);

    try {
      // Build context from previous messages and explicit context
      const systemPrompt = `You are FixFlow AI, a professional repair assistant for FixFlow Repair shop. 
You help technicians and staff with repair questions, troubleshooting, part identification, and workflow guidance.

Current context:
- Device: ${context.deviceType ? `${context.brand} ${context.model} (${context.deviceType})${context.serial ? ` - SN: ${context.serial}` : ""}` : "Not specified"}
- Complaint: ${context.complaint || "Not specified"}

Guidelines:
- Be helpful, professional, and concise
- For repair questions, ask clarifying questions if needed
- Always prioritize safety - warn against dangerous procedures
- Don't make definitive diagnoses - suggest inspection steps
- Reference FixFlow workflows (repair intake, parts ordering, estimates, invoicing)
- If asked about specific repairs, suggest using the AI Diagnosis tool for structured analysis`;

      const history = messages
        .filter((m) => m.role !== "system")
        .slice(-10)
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const result = await callFunction<{ ok: boolean; response: string; error?: string }>("runAiDiagnosis", {
        prompt: `${systemPrompt}\n\nConversation history:\n${history}\n\nUser: ${currentInput}\n\nAssistant:`,
        device: {
          type: context.deviceType || "unknown",
          brand: context.brand || "unknown",
          model: context.model || "unknown",
          serial: context.serial,
        },
        complaint: currentInput,
      });

      if (result.ok && result.response) {
        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          content: result.response,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        throw new Error(result.error || "AI request failed");
      }
    } catch (error) {
      console.error("AI Assistant error:", error);
      const errorMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "system",
        content: `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
      pushToast("error", "AI Assistant request failed");
    } finally {
      setBusy(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="ai-assistant-page">
      <div className="page-head">
        <div>
          <h1>
            <Icon name="spark" size={24} />
            FixFlow AI Assistant
          </h1>
          <p>Your intelligent repair companion — ask questions, get guidance, troubleshoot issues</p>
        </div>
      </div>

      <div className="ai-assistant-layout">
        <aside className="ai-context-panel">
          <Card>
            <h3>Repair Context (Optional)</h3>
            <p className="muted">Provide context for more accurate assistance. This helps the AI understand the device and issue.</p>
            <div className="context-form">
              <Field label="Device Type">
                <input
                  type="text"
                  placeholder="e.g., Laptop, Phone, Tablet, Desktop"
                  value={context.deviceType}
                  onChange={(e) => setContext((c) => ({ ...c, deviceType: e.target.value }))}
                />
              </Field>
              <div style={{ display: "flex", gap: 12 }}>
                <Field label="Brand" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="e.g., Apple, Dell, Samsung"
                    value={context.brand}
                    onChange={(e) => setContext((c) => ({ ...c, brand: e.target.value }))}
                  />
                </Field>
                <Field label="Model" style={{ flex: 1 }}>
                  <input
                    type="text"
                    placeholder="e.g., MacBook Pro 16, iPhone 13"
                    value={context.model}
                    onChange={(e) => setContext((c) => ({ ...c, model: e.target.value }))}
                  />
                </Field>
              </div>
              <Field label="Serial Number (optional)">
                <input
                  type="text"
                  placeholder="Serial number if available"
                  value={context.serial}
                  onChange={(e) => setContext((c) => ({ ...c, serial: e.target.value }))}
                />
              </Field>
              <Field label="Customer Complaint">
                <Textarea
                  value={context.complaint ?? ""}
                  onChange={(value: string) => setContext((c) => ({ ...c, complaint: value }))}
                  placeholder="What did the customer report? e.g., 'Won't turn on', 'Screen flickering', 'Overheating'"
                  rows={3}
                  required={false}
                />
              </Field>
              <Button onClick={() => setContext({})} variant="ghost" size="sm">
                <Icon name="refresh" size={14} />
                Clear Context
              </Button>
            </div>
          </Card>
        </aside>

        <main className="ai-chat-panel">
          <Card className="chat-container">
            <div className="chat-messages">
              {messages.map((msg) => (
                <div key={msg.id} className={`chat-message ${msg.role}`}>
                  <div className="message-bubble">
                    {msg.role === "system" && (
                      <div className="system-message">
                        <Icon name="alert" size={14} />
                        <span>{msg.content}</span>
                      </div>
                    )}
                    {msg.role === "assistant" && (
                      <>
                        <div className="message-header">
                          <span className="message-role">
                            <Icon name="spark" size={12} />
                            FixFlow AI
                          </span>
                          <time className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</time>
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </>
                    )}
                    {msg.role === "user" && (
                      <>
                        <div className="message-header">
                          <span className="message-role">You</span>
                          <time className="message-time">{new Date(msg.timestamp).toLocaleTimeString()}</time>
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </>
                    )}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="chat-message assistant typing">
                  <div className="message-bubble">
                    <div className="typing-indicator">
                      <Spinner size={16} />
                      <span>FixFlow AI is thinking…</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="chat-input">
              <Field label="Message" style={{ flex: 1 }}>
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask me anything about repairs, parts, workflows, troubleshooting… (Shift+Enter for new line)"
                  rows={2}
                  disabled={busy}
                  aria-label="Message to AI Assistant"
                />
              </Field>
              <Button onClick={sendMessage} disabled={busy || !input.trim()} full>
                {busy ? <Spinner size={16} /> : "Send"}
              </Button>
            </div>
          </Card>
        </main>
      </div>
    </div>
  );
}