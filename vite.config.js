import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'version-sw',
      closeBundle() {
        const swPath = path.resolve('dist/sw.js')
        if (fs.existsSync(swPath)) {
          let swContent = fs.readFileSync(swPath, 'utf8')
          const timestamp = Date.now()
          // Replace 'ravi-sweets-cache-v1' with a dynamic timestamp
          swContent = swContent.replace(
            /ravi-sweets-cache-v1/g,
            `ravi-sweets-cache-${timestamp}`
          )
          fs.writeFileSync(swPath, swContent, 'utf8')
          console.log(`\n✓ PWA Service Worker version updated to: ravi-sweets-cache-${timestamp}\n`)
        }
      }
    }
  ],
})
