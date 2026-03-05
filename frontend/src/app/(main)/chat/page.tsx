"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { ChatGroup } from "@/lib/types";

export default function ChatPage() {
  const [groups, setGroups] = useState<ChatGroup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getChatGroups()
      .then((data) => setGroups(data as ChatGroup[]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-orange-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Chat</h1>

      {groups.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No chat groups yet</p>
          <p className="text-gray-500 text-sm mt-1">Join a ride to start chatting with riders</p>
        </div>
      ) : (
        <div className="space-y-2">
          {groups.map((group) => (
            <Link key={group.id} href={`/chat/${group.id}`}>
              <div className="bg-gray-800 rounded-xl p-4 hover:bg-gray-750 hover:ring-1 hover:ring-orange-500/30 transition-all cursor-pointer flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-orange-600/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">{group.name}</h3>
                  <p className="text-gray-400 text-sm">Ride group chat</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
