"use client";

import { authClient } from "@/lib/auth/auth-client";
import { API_URL } from "@/lib/constant";
import { useEffect, useMemo, useState } from "react";
import { io, Socket } from "socket.io-client";

export type PresenceUser = {
  id: string;
  name: string;
  email: string;
  image?: string;
};

// Extract just the origin (protocol + host + port) from API_URL
// e.g. "http://localhost:4000/api/v1" → "http://localhost:4000"
function getSocketOrigin(): string {
  if (!API_URL) return "";
  try {
    const url = new URL(API_URL);
    return url.origin;
  } catch {
    return API_URL;
  }
}

export function usePresence(
  orgId: string,
  projectId: string,
  filePath: string,
) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const { data: session } = authClient.useSession();

  // Stabilize user identity so useEffect doesn't re-run on every render
  const userId = session?.user?.user_id ?? session?.user?.id ?? "";
  const userName = session?.user?.full_name ?? session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";
  const userImage = session?.user?.image ?? "";

  const user = useMemo<PresenceUser | null>(() => {
    if (!userId || !userEmail) return null;
    return {
      id: userId,
      name: userName,
      email: userEmail,
      image: userImage || undefined,
    };
  }, [userId, userName, userEmail, userImage]);

  useEffect(() => {
    if (!user || !orgId || !projectId || !filePath) return;

    const socketOrigin = getSocketOrigin();
    if (!socketOrigin) return;

    let socket: Socket | null = null;

    socket = io(socketOrigin, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      socket!.emit("join-file", { orgId, projectId, filePath, user });
    });

    socket.on("connect_error", (err) => {
      console.error("[Presence] Socket connection error:", err.message);
    });

    socket.on(
      "presence-update",
      (data: { roomKey: string; users: PresenceUser[] }) => {
        const others = data.users.filter((u) => u.id !== user.id);
        setActiveUsers(others);
      },
    );

    return () => {
      if (socket) {
        socket.emit("leave-file", { orgId, projectId, filePath });
        socket.disconnect();
      }
      setActiveUsers([]);
    };
  }, [user, orgId, projectId, filePath]);

  return { activeUsers };
}
