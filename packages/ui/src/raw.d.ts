/** Vite/Vitest "?raw" imports give a file's text, e.g. tokens.css for the contrast test. */
declare module "*.css?raw" {
  const content: string;
  export default content;
}
