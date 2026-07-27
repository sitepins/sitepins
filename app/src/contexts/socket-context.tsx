"use client";

import { API_URL } from "@/lib/constant";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";

// ---------------------------------------------------------------------------
// Socket configuration
// ---------------------------------------------------------------------------

function getSocketOrigin(): string {
  if (!API_URL) return "";
  try {
    return new URL(API_URL).origin;
  } catch {
    return API_URL;
  }
}

const SOCKET_OPTIONS = {
  withCredentials: true,
  transports: ["websocket", "polling"],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EventMap = Record<string, unknown>;

export type OnReceive<TServerEvents extends EventMap> = <
  K extends keyof TServerEvents & string,
>(
  event: K,
  payload: TServerEvents[K],
) => void;

export type SendEvent<TClientEvents extends EventMap> = <
  K extends keyof TClientEvents & string,
>(
  event: K,
  payload: TClientEvents[K],
) => void;

type Subscribe = (
  handler: (event: string, payload: unknown) => void,
) => () => void;

// ---------------------------------------------------------------------------
// useLatestRef
// ---------------------------------------------------------------------------

function useLatestRef<T>(value: T): React.RefObject<T> {
  const ref = useRef<T>(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface SocketContextValue {
  sendEvent: SendEvent<EventMap>;
  subscribe: Subscribe;
}

const SocketContext = createContext<SocketContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface SocketProviderProps<TServerEvents extends EventMap> {
  onReceive?: OnReceive<TServerEvents>;
  children: ReactNode;
}

export function SocketProvider<TServerEvents extends EventMap>({
  onReceive,
  children,
}: SocketProviderProps<TServerEvents>) {
  const socketRef = useRef<Socket | null>(null);
  const onReceiveRef = useLatestRef(onReceive);

  useEffect(() => {
    const socket = io(getSocketOrigin(), {
      autoConnect: false,
      ...SOCKET_OPTIONS,
    });

    socketRef.current = socket;

    socket.onAny((event: string, payload: unknown) => {
      const typedEvent = event as keyof TServerEvents & string;
      onReceiveRef.current?.(
        typedEvent,
        payload as unknown as TServerEvents[typeof typedEvent],
      );
    });

    socket.connect();

    return () => {
      socket.disconnect();
      socket.removeAllListeners();
      socketRef.current = null;
    };
    // onReceiveRef is a stable ref — intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendEvent = useCallback<SendEvent<EventMap>>((event, payload) => {
    if (!socketRef.current?.connected) return;
    socketRef.current.emit(event, payload);
  }, []);

  const subscribe = useCallback<Subscribe>((handler) => {
    socketRef.current?.onAny(handler);
    return () => {
      socketRef.current?.offAny(handler);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ sendEvent, subscribe }}>
      {children}
    </SocketContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// useSocket
// ---------------------------------------------------------------------------

export interface UseSocketOptions<TServerEvents extends EventMap> {
  onReceive?: OnReceive<TServerEvents>;
}

export interface UseSocketReturn<TClientEvents extends EventMap> {
  sendEvent: SendEvent<TClientEvents>;
}

export function useSocket<
  TServerEvents extends EventMap,
  TClientEvents extends EventMap,
>({
  onReceive,
}: UseSocketOptions<TServerEvents> = {}): UseSocketReturn<TClientEvents> {
  const ctx = useContext(SocketContext);

  if (!ctx) {
    throw new Error("useSocket must be used within <SocketProvider>.");
  }

  const { sendEvent, subscribe } = ctx;
  const onReceiveRef = useLatestRef(onReceive);

  useEffect(() => {
    if (typeof onReceive !== "function") return;

    const unsubscribe = subscribe((event, payload) => {
      onReceiveRef.current?.(
        event as keyof TServerEvents & string,
        payload as unknown as TServerEvents[keyof TServerEvents & string],
      );
    });

    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    sendEvent: sendEvent as SendEvent<TClientEvents>,
  };
}
