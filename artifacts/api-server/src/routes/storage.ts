import { Readable } from "node:stream";
import { Router, type IRouter } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireActiveUser, requireAdmin } from "../middlewares/auth";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.post("/admin/storage/uploads/request-url", requireAdmin, async (req, res, next) => {
  const parsed = RequestUploadUrlBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Only JPEG, PNG, or WebP images up to 5MB are allowed" });
    return;
  }
  try {
    const result = await storage.getProductUploadUrl();
    res.json(RequestUploadUrlResponse.parse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/storage/objects/*path", requireActiveUser, async (req, res, next) => {
  try {
    const raw = req.params.path;
    const path = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await storage.getObjectEntityFile(`/objects/${path}`);
    const [metadata] = await file.getMetadata();
    res.setHeader("Content-Type", metadata.contentType ?? "application/octet-stream");
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (metadata.size) res.setHeader("Content-Length", String(metadata.size));
    Readable.from(file.createReadStream()).pipe(res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    next(error);
  }
});

export default router;