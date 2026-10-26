import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  imageStorage,
  R2ImageStorage,
} from "../../src/modules/uploads/image-storage.service";
import { env } from "../../src/shared/config/env";
const file = (mimetype: string) =>
  ({ mimetype, buffer: Buffer.from("test-image") }) as Express.Multer.File;

describe("R2 image storage", () => {
  beforeEach(() => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
  });
  it.each([
    ["image/jpeg", ".jpg"],
    ["image/png", ".png"],
    ["image/webp", ".webp"],
    ["image/gif", ".gif"],
  ])(
    "uploads %s with a generated key and cache metadata",
    async (mime, extension) => {
      const result = await imageStorage.save(file(mime));
      expect(result.key).toMatch(new RegExp("^[0-9a-f-]+\\" + extension + "$"));
      expect(result.url).toBe(`https://images.test.invalid/${result.key}`);
      const command = vi.mocked(S3Client.prototype.send).mock
        .calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: "test-images",
        Key: result.key,
        Body: Buffer.from("test-image"),
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
      });
    },
  );
  it.each(["text/plain", "image/svg+xml", ""])(
    "rejects unsupported MIME type %s before uploading",
    async (mime) => {
      await expect(imageStorage.save(file(mime))).rejects.toMatchObject({
        status: 400,
      });
      expect(S3Client.prototype.send).not.toHaveBeenCalled();
    },
  );
  it("deletes a validated image key", async () => {
    await imageStorage.remove("abc-123.png");
    const command = vi.mocked(S3Client.prototype.send).mock
      .calls[0][0] as DeleteObjectCommand;
    expect(command).toBeInstanceOf(DeleteObjectCommand);
    expect(command.input).toEqual({
      Bucket: "test-images",
      Key: "abc-123.png",
    });
  });
  it.each(["../abc.png", "folder/abc.png", "abc.svg", "arbitrary.png", ""])(
    "rejects an unsafe key %s",
    async (key) => {
      await expect(imageStorage.remove(key)).rejects.toMatchObject({
        status: 400,
      });
      expect(S3Client.prototype.send).not.toHaveBeenCalled();
    },
  );
  it("propagates an upload failure", async () => {
    vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
      new Error("R2 unavailable"),
    );
    await expect(imageStorage.save(file("image/png"))).rejects.toThrow(
      "R2 unavailable",
    );
  });
  it("requires an endpoint or account id", () => {
    const original = { endpoint: env.R2_ENDPOINT, account: env.R2_ACCOUNT_ID };
    env.R2_ENDPOINT = undefined;
    env.R2_ACCOUNT_ID = undefined;
    try {
      expect(() => new R2ImageStorage()).toThrow(
        "missing R2_ENDPOINT or R2_ACCOUNT_ID",
      );
    } finally {
      env.R2_ENDPOINT = original.endpoint;
      env.R2_ACCOUNT_ID = original.account;
    }
  });
});
