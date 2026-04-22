import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
const outputPath = path.join(projectRoot, 'car-simulator-standalone.html');

const indexHtml = await readFile(indexHtmlPath, 'utf8');

const scriptMatch = indexHtml.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/i);
const styleMatch = indexHtml.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/i);

if (!scriptMatch || !styleMatch) {
  throw new Error('dist/index.html 에서 번들 JS/CSS 경로를 찾지 못했습니다.');
}

const scriptPath = path.join(distDir, scriptMatch[1].replace(/^\//, ''));
const stylePath = path.join(distDir, styleMatch[1].replace(/^\//, ''));

const [scriptContent, styleContent] = await Promise.all([
  readFile(scriptPath, 'utf8'),
  readFile(stylePath, 'utf8'),
]);

const scriptBase64 = Buffer.from(scriptContent, 'utf8').toString('base64');
const inlineModuleLoader = [
  '<script type="module">',
  `const source = atob(${JSON.stringify(scriptBase64)});`,
  "const bytes = Uint8Array.from(source, (char) => char.charCodeAt(0));",
  "const blob = new Blob([bytes], { type: 'text/javascript;charset=utf-8' });",
  "const url = URL.createObjectURL(blob);",
  "import(url).finally(() => URL.revokeObjectURL(url));",
  '</script>',
].join('\n');

const standaloneHtml = indexHtml
  .replace(styleMatch[0], `<style>\n${styleContent}\n</style>`)
  .replace(scriptMatch[0], inlineModuleLoader);

await writeFile(outputPath, standaloneHtml, 'utf8');
console.log(`Created standalone HTML: ${outputPath}`);
