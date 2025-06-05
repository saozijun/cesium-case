import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import cesium from 'vite-plugin-cesium';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    cesium(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/tianditu': {
        target: 'https://t{0-7}.tianditu.gov.cn',
        changeOrigin: true,
        rewrite: (path) => {
          // 从路径中提取子域名
          const match = path.match(/\/tianditu(\d)/);
          const subdomain = match ? match[1] : Math.floor(Math.random() * 8);
          return path.replace(/\/tianditu\d?/, '').replace('{s}', subdomain);
        }
      }
    }
  }
})
