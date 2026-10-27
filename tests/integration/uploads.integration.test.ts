import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app";
import { imageStorage } from "../../src/modules/uploads/image-storage.service";
import { authenticateAs } from "../helpers/auth";

let auth: string;
beforeEach(() => {
  auth = authenticateAs("ADMIN");
});
describe("Image upload API", () => {
  it("uploads an image as admin", async () => {
    const save = vi
      .spyOn(imageStorage, "save")
      .mockResolvedValue({
        key: "abc.png",
        url: "https://images.test.invalid/abc.png",
      });
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Authorization", auth)
      .attach("image", Buffer.from("png"), {
        filename: "test.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(201);
    expect(response.body.data.key).toBe("abc.png");
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        mimetype: "image/png",
        buffer: Buffer.from("png"),
      }),
    );
  });
  it("requires the image field", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Authorization", auth);
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Image file is required");
  });
  it("rejects unsupported image types", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Authorization", auth)
      .attach("image", Buffer.from("svg"), {
        filename: "test.svg",
        contentType: "image/svg+xml",
      });
    expect(response.status).toBe(400);
  });
  it("rejects images larger than 5 MB", async () => {
    const response = await request(app)
      .post("/api/admin/uploads/images")
      .set("Authorization", auth)
      .attach("image", Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: "large.png",
        contentType: "image/png",
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Image must not exceed 5 MB");
  });
  it("deletes an image through storage", async () => {
    const remove = vi.spyOn(imageStorage, "remove").mockResolvedValue();
    const response = await request(app)
      .delete("/api/admin/uploads/images/abc.png")
      .set("Authorization", auth);
    expect(response.status).toBe(200);
    expect(remove).toHaveBeenCalledWith("abc.png");
  });
  it("passes storage errors through the API error handler", async () => {
    vi.spyOn(imageStorage, "remove").mockRejectedValue(
      new Error("Storage unavailable"),
    );
    const response = await request(app)
      .delete("/api/admin/uploads/images/abc.png")
      .set("Authorization", auth);
    expect(response.status).toBe(500);
  });
  it.each(["USER", "STUDENT", "TEACHER"] as const)(
    "rejects %s uploads",
    async (role) => {
      const response = await request(app)
        .post("/api/admin/uploads/images")
        .set("Authorization", authenticateAs(role));
      expect(response.status).toBe(403);
    },
  );
});
