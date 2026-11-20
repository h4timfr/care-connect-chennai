import { expect, test } from "./support/fixtures";
import { appointmentRow, defaultState, ids } from "./support/mock-backend";

const details = `/appointments/${ids.appointment}`;

test("appointment tabs keep their selection on deep links, reload and browser Back", async ({
  page,
  backend,
}) => {
  await backend({ appointments: [appointmentRow({ date: "2020-01-06", status: "completed" })] });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/appointments?tab=past");
  const past = page.getByRole("tab", { name: "Past (1)" });
  const cancelled = page.getByRole("tab", { name: "Cancelled (0)" });
  await expect(past).toHaveAttribute("aria-selected", "true");
  await past.press("ArrowRight");
  await expect(cancelled).toBeFocused();
  await expect(cancelled).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/appointments\?tab=cancelled$/);
  await expect(page.getByText("No cancelled appointments")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.reload();
  await expect(cancelled).toHaveAttribute("aria-selected", "true");
  await cancelled.press("ArrowLeft");
  await expect(past).toHaveAttribute("aria-selected", "true");
  await page.getByRole("link", { name: "View details" }).press("Enter");
  await expect(page).toHaveURL(new RegExp(`${details}$`));
  await expect(page.getByText("This appointment is complete.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel appointment" })).toHaveCount(0);
  await page.goBack();
  await expect(past).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("link", { name: "View details" })).toBeVisible();
});

test("appointment details report a profile load error and retry", async ({ page, backend }) => {
  const mock = await backend({ patients: "error", appointments: [appointmentRow()] });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/patients?*", async (route) => {
    await pending;
    await route.fallback();
  });
  await page.goto(details);
  try {
    await expect(page.getByRole("status").filter({ hasText: "Loading appointment" })).toBeVisible();
    await expect(page.getByText("Appointment not found")).toHaveCount(0);
  } finally {
    release();
  }
  const error = page.getByRole("alert").filter({ hasText: "We couldn't load this appointment" });
  await expect(error).toBeVisible();
  await expect(page.getByText("Appointment not found")).toHaveCount(0);
  mock.state.patients = defaultState().patients;
  await error.getByRole("button", { name: "Try again" }).press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Appointment details" })).toBeVisible();
  await expect(error).toHaveCount(0);
});

test("a cancellation failure is announced inside the keyboard confirmation dialog", async ({
  page,
  backend,
}) => {
  const mock = await backend({ appointments: [appointmentRow()], failStatusUpdate: true });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(details);
  const cancel = page.getByRole("button", { name: "Cancel appointment" });
  await cancel.press("Enter");
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByRole("button", { name: "Keep appointment" })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel appointment" }).press("Enter");
  await expect(dialog.getByRole("alert")).toHaveText(
    "This appointment can no longer be cancelled.",
  );
  await expect(dialog).toBeInViewport({ ratio: 1 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(cancel).toBeFocused();
  await cancel.press("Enter");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  expect(mock.callsTo("PATCH", "/rest/v1/appointments")).toHaveLength(1);
});
