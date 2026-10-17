import { deflateSync } from "node:zlib";
import { ids } from "./support/mock-backend";
import { expect, test } from "./support/fixtures";

// Profile photos against the mocked Storage API (bucket and path rules mirror migration 00053).

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
/** A valid solid-colour RGB PNG of the given size. */
function png(width: number, height: number) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(2, 9); // RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(width * 3, 0x55)]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const avatarUploads = (mock: { callsTo: (m: string, p: string) => unknown[] }) =>
  mock.callsTo("POST", `/storage/v1/object/avatars/${ids.user}/avatar`).length +
  mock.callsTo("PUT", `/storage/v1/object/avatars/${ids.user}/avatar`).length;

test.describe("Profile photo", () => {
  test("upload resizes on the device, stores it privately and shows it everywhere", async ({
    page,
    backend,
  }) => {
    const mock = await backend();
    await page.goto("/profile");
    await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Your profile photo" })).toHaveCount(0);

    await page.locator('input[type="file"]').setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: png(800, 600),
    });
    await expect(page.getByText("Your profile photo has been updated.")).toBeVisible();
    // Re-encoded before upload (drops metadata such as GPS), never sent as the original PNG.
    expect(mock.state.avatarUploads).toHaveLength(1);
    expect(mock.state.avatarUploads[0]).toMatch(/image\/(webp|jpeg)/);
    await expect(page.getByRole("img", { name: "Your profile photo" })).toHaveCount(2); // header + card
    await expect(page.getByRole("button", { name: "Change photo" })).toBeVisible();
  });

  test("files that aren't usable images are rejected before upload", async ({ page, backend }) => {
    const mock = await backend();
    await page.goto("/profile");
    const input = page.locator('input[type="file"]');

    await input.setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("x"),
    });
    await expect(page.getByRole("alert")).toContainText("Please choose a JPEG, PNG or WebP image.");

    await input.setInputFiles({ name: "tiny.png", mimeType: "image/png", buffer: png(10, 10) });
    await expect(page.getByRole("alert")).toContainText("too small");

    await input.setInputFiles({
      name: "huge.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1, 1),
    });
    await expect(page.getByRole("alert")).toContainText("larger than 5 MB");

    await input.setInputFiles({
      name: "broken.png",
      mimeType: "image/png",
      buffer: Buffer.from("not really a png"),
    });
    await expect(page.getByRole("alert")).toContainText("couldn't be read as an image");
    expect(avatarUploads(mock)).toBe(0);
  });

  test("a failed upload says so and never reports success", async ({ page, backend }) => {
    const mock = await backend({ failAvatarUpload: true });
    await page.goto("/profile");
    await page.locator('input[type="file"]').setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: png(200, 200),
    });
    await expect(page.getByRole("alert")).toContainText("Your photo couldn't be uploaded.");
    await expect(page.getByText("Your profile photo has been updated.")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload photo" })).toBeEnabled();
    expect(mock.state.avatar).toBe("none");
  });

  test("removing asks for confirmation and falls back to initials", async ({ page, backend }) => {
    const mock = await backend({ avatar: "photo" });
    await page.goto("/profile");
    await expect(page.getByRole("img", { name: "Your profile photo" }).first()).toBeVisible();

    await page.getByRole("button", { name: "Remove photo" }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Remove your profile photo?");
    await dialog.getByRole("button", { name: "Keep photo" }).click();
    expect(mock.callsTo("DELETE", "/storage/v1/object/avatars")).toHaveLength(0);

    await page.getByRole("button", { name: "Remove photo" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Remove photo" }).click();
    await expect(page.getByText("Your profile photo has been removed.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Your profile photo" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Upload photo" })).toBeVisible();
    expect(mock.callsTo("DELETE", "/storage/v1/object/avatars")[0]?.body).toEqual({
      prefixes: [`${ids.user}/avatar`],
    });
  });

  test("without the storage bucket, the page says photos aren't available yet", async ({
    page,
    backend,
  }) => {
    await backend({ avatar: "noBucket" });
    await page.goto("/profile");
    await expect(page.getByText("Profile photos aren't available yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
    // Initials still identify the account in the header.
    await expect(page.getByRole("link", { name: "Your profile" })).toBeVisible();
  });

  test("a bucket without the owner policies is reported as unavailable, not as a glitch", async ({
    page,
    backend,
  }) => {
    // What production looks like until migration 00053 is applied: reads find nothing and every
    // write is refused by storage RLS.
    const mock = await backend({ avatar: "noPolicies" });
    await page.goto("/profile");
    await page.locator('input[type="file"]').setInputFiles({
      name: "me.png",
      mimeType: "image/png",
      buffer: png(200, 200),
    });
    await expect(page.getByRole("alert")).toContainText("Profile photos aren't available yet.");
    await expect(page.getByRole("button", { name: "Upload photo" })).toHaveCount(0);
    await expect(page.getByText("Your profile photo has been updated.")).toHaveCount(0);
    expect(mock.state.avatarUploads).toHaveLength(0);
  });

  test("only this account's own photo path is ever requested", async ({ page, backend }) => {
    const mock = await backend({ avatar: "photo" });
    await page.goto("/profile");
    await expect(page.getByRole("img", { name: "Your profile photo" }).first()).toBeVisible();
    const storagePaths = mock.calls
      .filter((c) => c.path.startsWith("/storage/"))
      .map((c) => c.path);
    expect(storagePaths.length).toBeGreaterThan(0);
    for (const p of storagePaths) expect(p).toContain(`avatars/${ids.user}/avatar`);
  });
});
