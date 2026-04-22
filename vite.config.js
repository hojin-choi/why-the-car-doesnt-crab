import { defineConfig } from 'vite';

const repoBase = '/why-the-car-doesnt-crab/';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? repoBase : '/',
});
