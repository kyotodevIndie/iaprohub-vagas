/** Config do AdSense que o servidor injeta no <head> (sem ela, o site não mostra bloco nenhum). */
const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content || null;

export const adsense = (() => {
  const client = meta("google-adsense-account");
  const slot = meta("iaprohub-adsense-slot");
  return client && slot ? { client, slot } : null;
})();

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}
