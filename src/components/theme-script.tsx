/**
 * Sets the color theme before first paint to avoid a flash of the wrong theme.
 * Reads `aios-theme` from localStorage, falling back to the OS preference.
 * Rendered in <head>. No dependency on a theme provider.
 */
export function ThemeScript() {
  const code = `(function(){try{var t=localStorage.getItem('aios-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
