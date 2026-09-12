import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";

// Mocks for Gateway dependencies
const isOrgMemberMock = vi.fn();
vi.mock("@/lib/orgAccess", () => ({
  isOrgMember: (...args: unknown[]) => isOrgMemberMock(...args),
}));

// Mocks for Bucket route dependencies
const checkFileExistsMock = vi.fn();
const deleteFileMock = vi.fn();
vi.mock("@/lib/s3-utils", () => ({
  s3Client: { send: vi.fn() },
  checkFileExists: (...args: unknown[]) => checkFileExistsMock(...args),
  deleteFile: (...args: unknown[]) => deleteFileMock(...args),
}));

vi.mock("@/middlewares/rateLimiters", () => ({
  uploadLimiter: (_req: Request, _res: Response, next: () => void) => next(),
}));

vi.mock("@/middlewares/authMiddleware", () => ({
  authMiddleware: {
    verifyAuth: () => (_req: Request, _res: Response, next: () => void) =>
      next(),
  },
}));

vi.mock("multer-s3", () => ({
  default: () => ({
    _handleFile: vi.fn(),
    _removeFile: vi.fn(),
  }),
  AUTO_CONTENT_TYPE: "auto",
}));

type Listener = (...args: any[]) => void | Promise<void>;

describe("Common Module", () => {
  beforeEach(() => {
    isOrgMemberMock.mockReset();
    checkFileExistsMock.mockReset();
    deleteFileMock.mockReset();
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

  describe("Bucket Route", () => {
    function makeReqRes(params: Record<string, string> = {}) {
      const req = {
        params,
      } as unknown as Request;

      const json = vi.fn();
      const status = vi.fn(() => ({ json }));
      const res = { status } as unknown as Response;

      return { req, res, json, status };
    }

    function getDeleteHandler(router: unknown) {
      const stack = (
        router as {
          stack: Array<{
            route?: {
              methods: Record<string, boolean>;
              stack: Array<{
                handle: (
                  req: Request,
                  res: Response,
                  next: (err?: unknown) => void,
                ) => Promise<unknown>;
              }>;
            };
          }>;
        }
      ).stack;
      const layer = stack.find((l) => l.route?.methods?.delete);
      return layer?.route?.stack.slice(-1)[0]?.handle;
    }

    it("returns 404 when file to delete does not exist", async () => {
      const bucketRouter = (await import("./bucket.route.js")).default;
      checkFileExistsMock.mockResolvedValueOnce(false);

      const handler = getDeleteHandler(bucketRouter);
      expect(handler).toBeDefined();

      const { req, res, status, json } = makeReqRes({
        key: encodeURIComponent("sitepins/users/avatar.png"),
      });

      await handler!(req, res, vi.fn());

      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "File not found",
        }),
      );
    });

    it("returns 500 if deleteFile fails", async () => {
      const bucketRouter = (await import("./bucket.route.js")).default;
      checkFileExistsMock.mockResolvedValueOnce(true);
      deleteFileMock.mockResolvedValueOnce(false);

      const handler = getDeleteHandler(bucketRouter);
      expect(handler).toBeDefined();

      const { req, res, status, json } = makeReqRes({
        key: encodeURIComponent("sitepins/users/avatar.png"),
      });

      await handler!(req, res, vi.fn());

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: "Failed to delete file",
        }),
      );
    });

    it("successfully deletes file and returns 200", async () => {
      const bucketRouter = (await import("./bucket.route.js")).default;
      checkFileExistsMock.mockResolvedValueOnce(true); // Initial exists check
      deleteFileMock.mockResolvedValueOnce(true); // Deletion succeeds
      checkFileExistsMock.mockResolvedValueOnce(false); // Post-delete verify check

      const handler = getDeleteHandler(bucketRouter);
      expect(handler).toBeDefined();

      const { req, res, status, json } = makeReqRes({
        key: encodeURIComponent("sitepins/users/avatar.png"),
      });

      await handler!(req, res, vi.fn());

      expect(status).toHaveBeenCalledWith(200);
      expect(json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "File deleted successfully",
        }),
      );
    });
  });
});
