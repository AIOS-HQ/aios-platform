/**
 * Sets the color theme before first paint to avoid a flash of the wrong theme.
 * Source of truth is the `aios-theme` cookie (so the server-saved preference
 * applies pre-paint and can sync across devices), falling back to legacy
 * localStorage. The Founder OS ships dark: when no preference is stored the app
 * defaults to the dark command-center theme; an explicit `system` choice
 * follows the OS, and an explicit `light`/`dark` choice always wins. The header
 * ThemeToggle remains fully functional. Rendered in <head>.
 *
 * Accepts the per-request CSP `nonce` (from middleware) so this inline script
 * is allowed under a nonce-based Content-Security-Policy.
 */
export function ThemeScript({ nonce }: { nonce?: string }) {
  const code = `(function(){try{var m=document.cookie.match(/(?:^|; )aios-theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):(localStorage.getItem('aios-theme')||'');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||t===''||(t==='system'&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;
  return (
    <script
      nonce={nonce}
      // Browsers intentionally hide a parsed nonce from the content attribute,
      // so React sees nonce="" during hydration even though script.nonce and the
      // CSP header retain the valid value. Suppress only that known mismatch.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: code }}
    />
  );
}
