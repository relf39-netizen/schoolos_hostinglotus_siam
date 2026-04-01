import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runBuild() {
  try {
    // Force esbuild to not use worker threads
    process.env.ESBUILD_WORKER_THREADS = '0';
    
    // Normalize root path to use forward slashes
    const root = path.resolve(process.cwd()).replace(/\\/g, '/');
    console.log('Starting build from (CWD):', root);
    
    const srcDir = `${root}/src`;
    const componentsDir = `${root}/src/components`;
    const utilsDir = `${root}/src/utils`;
    const outDir = `${root}/dist`;

    await build({
      root: root,
      base: './',
      configFile: false,
      cacheDir: `${root}/node_modules/.vite`,
      plugins: [
        react()
      ],
      esbuild: {
        jsx: 'automatic',
        target: 'es2020',
      },
      resolve: {
        alias: {
          '@': srcDir,
          '@components': componentsDir,
          '@utils': utilsDir,
        },
        extensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
      },
      build: {
        outDir: outDir,
        emptyOutDir: true,
        chunkSizeWarningLimit: 2000,
        rollupOptions: {
          input: `${root}/index.html`,
          output: {
            manualChunks: {
              'vendor-ui': ['lucide-react', 'framer-motion'],
              'vendor-utils': ['xlsx', 'pdf-lib'],
            }
          }
        }
      }
    });
    console.log('Build successful!');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

runBuild();
