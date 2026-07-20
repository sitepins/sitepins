import app from "@/app";
import { allowedOrigins } from "@/config/cors-options";
import config from "@/config/variables";
import { initPresenceGateway } from "@/modules/common/presence.gateway";
import { Hocuspocus } from "@hocuspocus/server";
import http from "http";
import { Server as IOServer } from "socket.io";
import { WebSocketServer } from "ws";
import { auth } from "./auth";
import { dbConnect } from "./lib/dbConnect";
import { isOrgMember } from "./lib/orgAccess";
import { authenticateSocket } from "./lib/socketAuth";
import { initEditorGateway } from "./modules/common/editor.gateway";

// Collaborative document names are the editor pathname:
// "/org-<orgId>/<projectId>/…". (localePrefix is "never", so there is no
// locale segment.) App URLs prefix the bare org id with "org-", which must be
// stripped before comparing against Organization.org_id.
const orgIdFromDocumentName = (documentName: string): string | undefined => {
  const segment = documentName.split("/").filter(Boolean)[0];
  return segment?.startsWith("org-") ? segment.slice(4) : segment;
};

const hocuspocus = new Hocuspocus({
  timeout: 30000,
  debounce: 5000,
  maxDebounce: 30000,
  async onAuthenticate({ requestHeaders, documentName }) {
    const session = await auth.api.getSession({
      headers: requestHeaders,
    });
    const userId = (session as any)?.user?.user_id;
    if (!userId) throw new Error("Unauthorized");

    // Document-level access control: the user must belong to the org that
    // owns this document. Without this any authenticated user could open any
    // tenant's file by its name.
    const orgId = orgIdFromDocumentName(documentName);
    if (!(await isOrgMember(userId, orgId))) {
      throw new Error("Forbidden");
    }

    // Return value is merged into context, available in all other hooks
    return {
      user: { user_id: userId },
    };
  },

  // async onConnect({ documentName }) {
  //   console.log(`[+] "${documentName}" is connected`);
  // },

  // async onDisconnect({ documentName }) {
  //   console.log(`[-] "${documentName}" is disconnected`);
  // },
});

export async function startServer() {
  try {
    await dbConnect();

    // Config sanity: the web app's server-to-server calls (e.g. project
    // preview) authenticate with INTERNAL_API_SECRET. If it's unset in
    // production those calls silently fall back to session auth and break, so
    // surface the misconfiguration loudly at boot rather than at request time.
    if (config.env === "production" && !config.internal_secret) {
      console.warn(
        "[!] INTERNAL_API_SECRET is not set — internal server-to-server calls (project preview) will fail. Set it to the same value in both api/.env and app/.env.",
      );
    }

    const httpServer = http.createServer(app);

    const io = new IOServer(httpServer, {
      cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
      },
    });

    // Reject unauthenticated sockets before any room can be joined.
    io.use(authenticateSocket);

    initPresenceGateway(io);
    initEditorGateway(io);

    const hocuspocusWss = new WebSocketServer({ noServer: true });

    hocuspocusWss.on("connection", (ws, request) => {
      const protocol = request.headers["x-forwarded-proto"] || "http";
      const host = request.headers.host || "localhost";
      const url = `${protocol}://${host}${request.url}`;

      const headers = new Headers();
      if (request.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              value.forEach((v) => headers.append(key, v));
            } else {
              headers.set(key, value);
            }
          }
        }
      }

      const webRequest = new Request(url, { headers });
      const clientConnection = hocuspocus.handleConnection(ws, webRequest);
      if (!clientConnection) return;

      ws.on("message", (data: any) => {
        let uint8Array: Uint8Array;
        if (Buffer.isBuffer(data)) {
          uint8Array = new Uint8Array(data);
        } else if (data instanceof ArrayBuffer) {
          uint8Array = new Uint8Array(data);
        } else if (Array.isArray(data)) {
          uint8Array = new Uint8Array(Buffer.concat(data));
        } else {
          uint8Array = new Uint8Array();
        }
        clientConnection.handleMessage(uint8Array);
      });

      ws.on("close", (code, reason) => {
        clientConnection.handleClose({
          code,
          reason: reason ? reason.toString() : "",
        });
      });
    });

    httpServer.on("upgrade", (request, socket, head) => {
      const pathname = request.url ?? "";

      if (pathname.startsWith("/api/v1/editor/collab")) {
        hocuspocusWss.handleUpgrade(request, socket, head, (ws) => {
          hocuspocusWss.emit("connection", ws, request);
        });
      }
    });

    httpServer.listen(config.port, () => {
      console.log(
        `[+] Server (${process.env.NODE_ENV}) running on port ${config.port}`,
      );
      console.log(
        `[+] Hocuspocus at ws://localhost:${config.port}/api/v1/editor/collab`,
      );
    });

    const onCloseSignal = () => {
      console.log("[-] sigint received, shutting down");
      io.close();
      hocuspocusWss.close();
      httpServer.close(() => {
        console.log("[-] server closed");
        process.exit();
      });
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on("SIGINT", onCloseSignal);
    process.on("SIGTERM", onCloseSignal);
  } catch (error) {
    console.log("[-] Error starting server:", error);
    process.exit(1);
  }
}

// Start immediately when run as the entrypoint. A hosted deployment can
// instead import { startServer } after registering its own routes/providers.
if (require.main === module) {
  startServer();
}
