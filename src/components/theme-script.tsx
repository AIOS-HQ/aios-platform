/**
 * Sets the color theme before first paint to avoid a flash of the wrong theme.
 * Source of truth is the `aios-theme` cookie (so the server-saved preference
 * applies pre-paint and can sync across devices), falling back to legacy
 * localStorage, then the OS preference. Rendered in <head>.
 */
export function ThemeScript() {
  const code = `(function(){try{var m=document.cookie.match(/(?:^|; )aios-theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):(localStorage.getItem('aios-theme')||'');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||((t===''||t==='system')&&d)){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
