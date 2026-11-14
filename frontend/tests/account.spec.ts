import { expect, test } from "@playwright/test";

test("password recovery requests a link and updates the password after callback", async ({ page, baseURL }) => {
  const user = { id: "e6edccd4-ce5b-459e-8a8a-967b82037249", aud: "authenticated", email: "test@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.route("http://127.0.0.1:3199/auth/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204 });
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { external: { google: false } } });
    if (url.pathname.endsWith("/recover")) {
      expect(request.postDataJSON().email).toBe(user.email);
      expect(url.searchParams.get("redirect_to")).toBe(`${baseURL}/account`);
      return route.fulfill({ json: {} });
    }
    if (url.pathname.endsWith("/user")) {
      if (request.method() === "PUT") expect(request.postDataJSON().password).toBe("MoonSight-test-123");
      return route.fulfill({ json: { user } });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto("/account");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email").fill(user.email);
  await page.getByRole("button", { name: "Send reset email" }).click();
  await expect(page.getByText(/receive a password reset email/)).toBeVisible();
  await page.goto("/account?from=mail#access_token=test-access&refresh_token=test-refresh&expires_in=3600&token_type=bearer&type=recovery");
  await page.getByLabel("New password").fill("MoonSight-test-123");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Your password was updated.")).toBeVisible();
});
