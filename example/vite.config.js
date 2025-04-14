import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
// import transformImage from '@vite-plugins/transform-image'
import transformImage from '../packages/transform-image/src'

// https://vite.dev/config/
export default defineConfig({
  plugins: [transformImage({ warn: true }), vue()],
})
