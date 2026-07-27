import { isOrgMember } from "@/lib/orgAccess";
import { Server as IOServer, Socket } from "socket.io";

type PresenceUser = {
  id: string;
  name: string;
  email: string;
  image?: string;
};

// room key → Map<userId, { user, socketIds }>
const rooms = new Map<
  string,
  Map<string, { user: PresenceUser; socketIds: Set<string> }>
>();

function roomKey(orgId: string, projectId: string, filePath: string) {
  return `presence:${orgId}:${projectId}:${filePath}`;
}

function getUsersInRoom(key: string): PresenceUser[] {
  const room = rooms.get(key);
  if (!room) return [];
  return Array.from(room.values()).map((entry) => entry.user);
}

export function initPresenceGateway(io: IOServer) {
  io.on("connection", (socket: Socket) => {
    // Track which rooms this socket has joined
    const joinedRooms = new Set<string>();

    socket.on(
      "join-file",
      async (data: { orgId: string; projectId: string; filePath: string }) => {
        // Identity comes from the authenticated session, not the client — a
        // client can neither impersonate another user nor leak a stranger's
        // email into a room it shouldn't see.
        const authUser = socket.data.user;
        if (!authUser?.user_id) return;
        if (!(await isOrgMember(authUser.user_id, data.orgId))) return;

        const user: PresenceUser = {
          id: authUser.user_id,
          name: authUser.full_name || "Anonymous",
          email: authUser.email || "",
          image: authUser.image,
        };

        const key = roomKey(data.orgId, data.projectId, data.filePath);

        if (!rooms.has(key)) {
          rooms.set(key, new Map());
        }

        const room = rooms.get(key)!;
        const existing = room.get(user.id);

        if (existing) {
          // Same user, different tab — just add socket id
          existing.socketIds.add(socket.id);
        } else {
          room.set(user.id, {
            user,
            socketIds: new Set([socket.id]),
          });
        }

        joinedRooms.add(key);
        socket.join(key);

        // Broadcast updated presence to everyone in the room
        io.to(key).emit("presence-update", {
          roomKey: key,
          users: getUsersInRoom(key),
        });
      },
    );

    socket.on(
      "leave-file",
      (data: { orgId: string; projectId: string; filePath: string }) => {
        const key = roomKey(data.orgId, data.projectId, data.filePath);
        removeSocketFromRoom(socket, key);
        joinedRooms.delete(key);
      },
    );

    socket.on("disconnect", () => {
      // Clean up all rooms this socket was in
      for (const key of joinedRooms) {
        removeSocketFromRoom(socket, key);
      }
      joinedRooms.clear();
    });

    function removeSocketFromRoom(sock: Socket, key: string) {
      const room = rooms.get(key);
      if (!room) return;

      // Find which user owns this socket
      for (const [userId, entry] of room) {
        if (entry.socketIds.has(sock.id)) {
          entry.socketIds.delete(sock.id);
          if (entry.socketIds.size === 0) {
            room.delete(userId);
          }
          break;
        }
      }

      // Clean up empty rooms
      if (room.size === 0) {
        rooms.delete(key);
      }

      sock.leave(key);

      // Broadcast updated presence
      io.to(key).emit("presence-update", {
        roomKey: key,
        users: getUsersInRoom(key),
      });
    }
  });
}
