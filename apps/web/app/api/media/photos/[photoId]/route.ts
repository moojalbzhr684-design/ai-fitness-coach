import { Api } from "grammy";
import { authorizeDashboardPhotoView } from "@core/services/dashboard/photos";
import { TelegramMediaStorage } from "@core/media/telegram-storage";
import { getSessionActorUserId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ photoId: string }> }) {
  const actorUserId = await getSessionActorUserId();
  if (!actorUserId) return new Response("Authentication required", { status: 401 });
  try {
    const { photoId } = await params;
    const photo = await authorizeDashboardPhotoView(actorUserId, photoId);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return new Response("Private media is unavailable", { status: 503 });
    const storage = new TelegramMediaStorage(new Api(token), token);
    const reference = await storage.getReadableReference(photo.media);
    const comma = reference.dataUrl.indexOf(",");
    if (comma < 0) return new Response("Private media is unavailable", { status: 503 });
    const bytes = Buffer.from(reference.dataUrl.slice(comma + 1), "base64");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": reference.mimeType,
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch {
    return new Response("Photo not found", { status: 404 });
  }
}
