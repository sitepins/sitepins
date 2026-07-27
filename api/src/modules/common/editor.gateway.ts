import { isOrgMember } from "@/lib/orgAccess";
import { Server as IOServer, Socket } from "socket.io";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface JoinPayload {
  org_id: string;
  project_id: string;
  file: string;
}

interface CommitPayload extends JoinPayload {
  action: string;
}

interface CommitBroadcast {
  file: string;
  action: string;
  user_id: string;
  user_name: string;
  committed_at: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRoomKey(org_id: string, project_id: string, file: string): string {
  return `${org_id}:${project_id}:${file}`;
}

function isValidJoinPayload(p: JoinPayload): boolean {
  return Boolean(p.org_id && p.project_id && p.file);
}

// ---------------------------------------------------------------------------
// Gateway
// ---------------------------------------------------------------------------

export function initEditorGateway(io: IOServer): void {
  io.on("connection", (socket: Socket) => {
    // Join a file room — must be called by the client before emitting "commit".
    // Membership is verified server-side so a client can't join another
    // organization's room by guessing ids.
    socket.on("join-editor", async (payload: JoinPayload) => {
      if (!isValidJoinPayload(payload)) return;

      const userId = socket.data.user?.user_id;
      if (!(await isOrgMember(userId, payload.org_id))) return;

      const roomKey = getRoomKey(
        payload.org_id,
        payload.project_id,
        payload.file,
      );
      socket.join(roomKey);
    });

    // Leave a file room — called when the user navigates away
    socket.on("leave-editor", (payload: JoinPayload) => {
      if (!isValidJoinPayload(payload)) return;

      const roomKey = getRoomKey(
        payload.org_id,
        payload.project_id,
        payload.file,
      );
      socket.leave(roomKey);
    });

    // Broadcast a successful commit to all OTHER users in the room. Identity
    // comes from the authenticated session, never from the client payload, so
    // commit notifications can't be spoofed.
    socket.on("commit", (payload: CommitPayload) => {
      const { org_id, project_id, file, action } = payload;
      const user = socket.data.user;

      if (!org_id || !project_id || !file || !action || !user?.user_id) {
        socket.emit("commit:error", { message: "Invalid payload." });
        return;
      }

      const roomKey = getRoomKey(org_id, project_id, file);

      // Only members currently in the room receive the broadcast, and the
      // sender must be in the room (joined via join-editor, which checked
      // membership) to reach it.
      if (!socket.rooms.has(roomKey)) {
        socket.emit("commit:error", { message: "Not joined to this file." });
        return;
      }

      const broadcast: CommitBroadcast = {
        file,
        action,
        user_id: user.user_id,
        user_name: user.full_name || "Unknown",
        committed_at: new Date().toISOString(),
      };

      // Excludes the sender — they already show their own success toast
      socket.to(roomKey).emit("commit:completed", broadcast);
    });

    // Socket.IO auto-removes the socket from all rooms on disconnect.
    socket.on("disconnect", () => {});
  });
}
