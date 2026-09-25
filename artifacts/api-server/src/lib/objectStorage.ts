import { randomUUID } from "node:crypto";
import { File, Storage } from "@google-cloud/storage";

const SIDECAR = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
  }
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2 || !parts[0] || !parts.slice(1).join("/")) {
    throw new Error("Invalid object storage path");
  }
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function signObjectUrl(
  bucketName: string,
  objectName: string,
  method: "PUT" | "GET",
): Promise<string> {
  const response = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Failed to sign object URL (${response.status})`);
  const body = (await response.json()) as { signed_url?: string };
  if (!body.signed_url) throw new Error("Object storage returned no signed URL");
  return body.signed_url;
}

export class ObjectStorageService {
  private privateDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR;
    if (!dir) throw new Error("PRIVATE_OBJECT_DIR is not configured");
    return dir.replace(/\/+$/, "");
  }

  async getProductUploadUrl(): Promise<{ uploadURL: string; objectPath: string }> {
    const objectPath = `/objects/products/${randomUUID()}`;
    const { bucketName, objectName } = parseObjectPath(
      `${this.privateDir()}${objectPath.slice("/objects".length)}`,
    );
    return {
      uploadURL: await signObjectUrl(bucketName, objectName, "PUT"),
      objectPath,
    };
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!/^\/objects\/products\/[0-9a-f-]+$/i.test(objectPath)) {
      throw new ObjectNotFoundError();
    }
    const { bucketName, objectName } = parseObjectPath(
      `${this.privateDir()}${objectPath.slice("/objects".length)}`,
    );
    const file = objectStorageClient.bucket(bucketName).file(objectName);
    const [exists] = await file.exists();
    if (!exists) throw new ObjectNotFoundError();
    return file;
  }
}