import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ThemeScript } from "@/components/theme-script";

describe("ThemeScript", () => {
  it("forwards the per-request nonce and scopes hydration suppression to the script", () => {
    const nonce = "focused-csp-nonce";
    const element = ThemeScript({ nonce });

    expect(element.type).toBe("script");
    expect(element.props.nonce).toBe(nonce);
    expect(element.props.suppressHydrationWarning).toBe(true);
    expect(element.props.async).toBeUndefined();
    expect(element.props.defer).toBeUndefined();

    const markup = renderToStaticMarkup(element);
    expect(markup).toContain(`nonce="${nonce}"`);
    expect(markup).toContain("document.documentElement.classList.add('dark')");
    expect(markup).toContain("localStorage.getItem('aios-theme')");
  });
});
