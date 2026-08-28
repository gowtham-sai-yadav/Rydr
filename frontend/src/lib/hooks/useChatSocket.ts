"use client";
/**
 * Live chat over WebSocket, with polling as the fallback — Phase 4 W6.
 *
 * The socket is an optimisation over the REST endpoints, not a replacement.
 * The backend persists messages identically on both paths, so a client that
 * cannot hold a socket open — a locked-down network, a backgrounded mobile
 * webview, a proxy that strips Upgrade — keeps working on the existing
 * `after_id` poll with nothing but higher latency. This hook reports its
 * connection state so the page can say which mode it is in and so the poll
 * can be left running only while the socket is down.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { API_BASE_URL, TOKEN_KEY } from "@/lib/constants";
import type { ChatMessageOut } from "@/lib/api.types";

export type SocketState = "connecting" | "open" | "closed" | "unsupported";

type Options = {
  groupId: string;
  /** Called for each message frame, including the echo of your own send. */
  onMessage: (message: ChatMessageOut) => void;
  /** Non-fatal protocol errors from the server. */
  onError?: (detail: string) => void;
  enabled?: boolean;
};

// Backoff between reconnect attempts, in ms. Capped so a server that is down
// for a while does not get hammered, and so a rider who leaves the tab open
// overnight is not making a request every second.
const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

export function useChatSocket({
  groupId,
  onMessage,
  onError,
  enabled = true,
}: Options) {
  const [state, setState] = useState<SocketState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closedByUsRef = useRef(false);

  // Held in refs so reconnecting does not need the callbacks in the effect's
  // dependency list — otherwise every parent re-render would tear down and
  // rebuild the socket.
  const onMessageRef = useRef(onMessage);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onMessageRef.current = onMessage;
    onErrorRef.current = onError;
  }, [onMessage, onError]);

  const connect = useCallback(() => {
    if (typeof window === "undefined" || !("WebSocket" in window)) {
      setState("unsupported");
      return;
    }
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setState("closed");
      return;
    }

    // http -> ws, https -> wss. Deriving it from the configured API base
    // rather than from window.location, because the API is on a different
    // origin in every deployment of this app.
    const wsBase = API_BASE_URL.replace(/^http/, "ws");
    const url = `${wsBase}/api/chat/groups/${groupId}/ws?token=${encodeURIComponent(token)}`;

    setState("connecting");
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      setState("closed");
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      attemptRef.current = 0;
      setState("open");
    };

    socket.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame?.type === "message" && frame.message) {
          onMessageRef.current(frame.message as ChatMessageOut);
        } else if (frame?.type === "error") {
          onErrorRef.current?.(String(frame.detail ?? "Chat error"));
        }
        // "pong" needs no handling; it exists to keep intermediaries from
        // idling the connection out.
      } catch {
        // A frame we cannot parse is not worth dropping the connection for.
      }
    };

    socket.onclose = (event) => {
      socketRef.current = null;
      if (closedByUsRef.current) return;
      setState("closed");

      // 1008 is the policy close the server uses for a rejected token or a
      // non-member. Retrying that is pointless — it will be rejected again —
      // so fall back to polling permanently rather than looping.
      if (event.code === 1008) return;

      const delay =
        BACKOFF_MS[Math.min(attemptRef.current, BACKOFF_MS.length - 1)];
      attemptRef.current += 1;
      timerRef.current = setTimeout(connect, delay);
    };

    socket.onerror = () => {
      // onclose always follows, and that is where reconnection is handled.
      // Handling it here too would double the backoff advance.
    };
  }, [groupId]);

  useEffect(() => {
    if (!enabled) return;
    closedByUsRef.current = false;
    connect();

    return () => {
      closedByUsRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      // 1000 = normal closure. Without an explicit close the server keeps the
      // socket (and its DB session) until the TCP connection times out.
      socketRef.current?.close(1000, "navigating away");
      socketRef.current = null;
    };
  }, [connect, enabled]);

  const send = useCallback((body: string): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: "message", body }));
    return true;
  }, []);

  return { state, send };
}
