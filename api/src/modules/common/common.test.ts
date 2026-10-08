import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks for Gateway dependencies
const isOrgMemberMock = vi.fn();
vi.mock("@/lib/orgAccess", () => ({
  isOrgMember: (...args: unknown[]) => isOrgMemberMock(...args),
}));

type Listener = (...args: any[]) => void | Promise<void>;

describe("Common Module", () => {
  beforeEach(() => {
    isOrgMemberMock.mockReset();
  });

  describe("Editor Gateway", () => {
    function createMockSocket(userData?: {
      user_id: string;
      full_name?: string;
    }) {
      const handlers: Record<string, Listener> = {};
      const rooms = new Set<string>();

      const socket = {
        data: { user: userData },
        rooms,
        on: vi.fn((event: string, handler: Listener) => {
          handlers[event] = handler;
        }),
        join: vi.fn((room: string) => {
          rooms.add(room);
        }),
        leave: vi.fn((room: string) => {
          rooms.delete(room);
        }),
        emit: vi.fn(),
        to: vi.fn(() => ({
          emit: vi.fn(),
        })),
      };

      return { socket, handlers };
    }

    it("prevents non-members from joining an editor room", async () => {
      const { initEditorGateway } = await import("./editor.gateway.js");
      let connectionHandler: Listener | undefined;
      const ioMock = {
        on: vi.fn((event: string, handler: Listener) => {
          if (event === "connection") connectionHandler = handler;
        }),
      };

      initEditorGateway(ioMock as any);
      const { socket, handlers } = createMockSocket({ user_id: "u1" });
      connectionHandler!(socket);

      isOrgMemberMock.mockResolvedValueOnce(false);

      await handlers["join-editor"]({
        org_id: "org-1",
        project_id: "proj-1",
        file: "index.md",
      });

      expect(isOrgMemberMock).toHaveBeenCalledWith("u1", "org-1");
      expect(socket.join).not.toHaveBeenCalled();
    });

    it("allows verified org members to join and leave editor rooms", async () => {
      const { initEditorGateway } = await import("./editor.gateway.js");
      let connectionHandler: Listener | undefined;
      const ioMock = {
        on: vi.fn((event: string, handler: Listener) => {
          if (event === "connection") connectionHandler = handler;
        }),
      };

      initEditorGateway(ioMock as any);
      const { socket, handlers } = createMockSocket({ user_id: "u1" });
      connectionHandler!(socket);

      isOrgMemberMock.mockResolvedValueOnce(true);

      await handlers["join-editor"]({
        org_id: "org-1",
        project_id: "proj-1",
        file: "index.md",
      });

      const expectedRoomKey = "org-1:proj-1:index.md";
      expect(socket.join).toHaveBeenCalledWith(expectedRoomKey);
      expect(socket.rooms.has(expectedRoomKey)).toBe(true);

      handlers["leave-editor"]({
        org_id: "org-1",
        project_id: "proj-1",
        file: "index.md",
      });
      expect(socket.leave).toHaveBeenCalledWith(expectedRoomKey);
    });

    it("rejects commits if socket is not joined to the file room", async () => {
      const { initEditorGateway } = await import("./editor.gateway.js");
      let connectionHandler: Listener | undefined;
      const ioMock = {
        on: vi.fn((event: string, handler: Listener) => {
          if (event === "connection") connectionHandler = handler;
        }),
      };

      initEditorGateway(ioMock as any);
      const { socket, handlers } = createMockSocket({ user_id: "u1" });
      connectionHandler!(socket);

      handlers["commit"]({
        org_id: "org-1",
        project_id: "proj-1",
        file: "index.md",
        action: "update",
      });

      expect(socket.emit).toHaveBeenCalledWith("commit:error", {
        message: "Not joined to this file.",
      });
    });

    it("broadcasts authenticated commit details when user is in the room", async () => {
      const { initEditorGateway } = await import("./editor.gateway.js");
      let connectionHandler: Listener | undefined;
      const ioMock = {
        on: vi.fn((event: string, handler: Listener) => {
          if (event === "connection") connectionHandler = handler;
        }),
      };

      initEditorGateway(ioMock as any);
      const { socket, handlers } = createMockSocket({
        user_id: "u1",
        full_name: "Alice Developer",
      });
      connectionHandler!(socket);

      const roomKey = "org-1:proj-1:index.md";
      socket.rooms.add(roomKey);

      const roomEmitMock = vi.fn();
      socket.to.mockReturnValueOnce({ emit: roomEmitMock } as any);

      handlers["commit"]({
        org_id: "org-1",
        project_id: "proj-1",
        file: "index.md",
        action: "save",
      });

      expect(socket.to).toHaveBeenCalledWith(roomKey);
      expect(roomEmitMock).toHaveBeenCalledWith(
        "commit:completed",
        expect.objectContaining({
          file: "index.md",
          action: "save",
          user_id: "u1",
          user_name: "Alice Developer",
        }),
      );
    });
  });

  describe("Presence Gateway", () => {
    it("verifies membership before joining a presence room and broadcasts updates", async () => {
      const { initPresenceGateway } = await import("./presence.gateway.js");
      let connectionHandler: Listener | undefined;
      const toRoomEmitMock = vi.fn();
      const ioMock = {
        on: vi.fn((event: string, handler: Listener) => {
          if (event === "connection") connectionHandler = handler;
        }),
        to: vi.fn(() => ({
          emit: toRoomEmitMock,
        })),
      };

      initPresenceGateway(ioMock as any);

      const handlers: Record<string, Listener> = {};
      const socket = {
        id: "socket-1",
        data: {
          user: {
            user_id: "user-presence-1",
            full_name: "Bob",
            email: "bob@example.com",
          },
        },
        on: vi.fn((event: string, handler: Listener) => {
          handlers[event] = handler;
        }),
        join: vi.fn(),
        leave: vi.fn(),
      };

      connectionHandler!(socket);

      // 1. Non-member is blocked
      isOrgMemberMock.mockResolvedValueOnce(false);
      await handlers["join-file"]({
        orgId: "org-1",
        projectId: "p-1",
        filePath: "doc.md",
      });
      expect(socket.join).not.toHaveBeenCalled();

      // 2. Member joins
      isOrgMemberMock.mockResolvedValueOnce(true);
      await handlers["join-file"]({
        orgId: "org-1",
        projectId: "p-1",
        filePath: "doc.md",
      });

      const key = "presence:org-1:p-1:doc.md";
      expect(socket.join).toHaveBeenCalledWith(key);
      expect(ioMock.to).toHaveBeenCalledWith(key);
      expect(toRoomEmitMock).toHaveBeenCalledWith(
        "presence-update",
        expect.objectContaining({
          roomKey: key,
          users: [
            expect.objectContaining({
              id: "user-presence-1",
              name: "Bob",
              email: "bob@example.com",
            }),
          ],
        }),
      );

      // 3. Disconnect removes socket
      handlers["disconnect"]();
      expect(socket.leave).toHaveBeenCalledWith(key);
    });
  });
});
