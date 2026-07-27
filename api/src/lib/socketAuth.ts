import { auth } from "@/auth";
import { authDemo } from "@/auth-demo";
import { fromNodeHeaders } from "better-auth/node";
import type { Socket } from "socket.io";

export interface SocketUser {
  user_id: string;
  full_name?: string;
  email?: string;
  image?: string;
  role?: string;
}

declare module "socket.io" {
  interface SocketData {
    user?: SocketUser;
  }
}

/**
 * Socket.IO connection middleware. Authenticates the handshake against the
 * same session cookie the HTTP API uses and attaches the verified user to
 * `socket.data.user`. Unauthenticated sockets are rejected before they can
 * join any room. Apply once with `io.use(authenticateSocket)`.
 */
export async function authenticateSocket(
  socket: Socket,
  next: (err?: Error) => void,
): Promise<void> {
  try {
    const nodeHeaders = fromNodeHeaders(socket.handshake.headers);

    // The regular app and the demo app use different session cookies. The
    // socket handshake doesn't tell us which, so try both issuers and accept
    // whichever produces a valid session.
    let session = await auth.api.getSession({ headers: nodeHeaders });
    if (!(session as any)?.user?.user_id) {
      session = await authDemo.api.getSession({ headers: nodeHeaders });
    }

    const user = (session as any)?.user;
    if (!user?.user_id) {
      return next(new Error("Unauthorized"));
    }

    socket.data.user = {
      user_id: user.user_id,
      full_name: user.full_name,
      email: user.email,
      image: user.image,
      role: user.role,
    };
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
}
