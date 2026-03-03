"use client";
import { useState, useEffect, use, useRef } from "react";
import { api } from "@/lib/api";
import { ChatMessage } from "@/lib/types";

export default function ChatRoomPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getChatMessages(groupId)
      .then((data) => setMessages(data as ChatMessage[]))
      .finally(() => setLoading(false));
  }, [groupId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      sender_name: "You",
      sender_avatar: undefined,
      content: input.trim(),
      timestamp: new Date().toISOString(),
      is_mine: true,
    };
    setMessages([...messages, newMsg]);
    setInput("");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col" style={{ height: "calc(100vh - 10rem)" }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.is_mine ? "justify-end" : "justify-start"}`}
          >
            <div className={`max-w-xs sm:max-w-md ${msg.is_mine ? "order-2" : ""}`}>
              {!msg.is_mine && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-6 h-6 rounded-full bg-orange-600 flex items-center justify-center text-xs font-bold text-white">
                    {msg.sender_name.charAt(0)}
                  </div>
                  <span className="text-gray-400 text-xs">{msg.sender_name}</span>
                </div>
              )}
              <div
                className={`px-4 py-2.5 rounded-2xl text-sm ${
                  msg.is_mine
                    ? "bg-orange-600 text-white rounded-br-md"
                    : "bg-gray-800 text-gray-200 rounded-bl-md"
                }`}
              >
                {msg.content}
              </div>
              <p className={`text-xs text-gray-500 mt-1 ${msg.is_mine ? "text-right" : ""}`}>
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="flex gap-3 pt-4 border-t border-gray-800">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-full px-5 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
        />
        <button
          type="submit"
          className="bg-orange-600 hover:bg-orange-700 text-white w-12 h-12 rounded-full flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  );
}
