import type { Plugin } from 'vite'
import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'
import { ImageOptions } from './types'

const defaultImage = "https://cdn.apifox.com/app/project-icon/builtin/5.jpg"

export default function transformImage (options?: ImageOptions): Plugin {
  return {
    name: 'vite-plugin-transform-image',
    enforce: 'pre',
    transformIndexHtml (html: string): any {      
      const script = `
        <script>
          window.addEventListener('error', (e) => {
            const target = e.target
            const openWarn = ${options?.warn} ?? true
            if (target && target.tagName && target.tagName.toLowerCase() === 'img') {
              // 防止循环触发错误
              if (!target.dataset.fallback) {
                if (openWarn) {
                 console.warn('图片加载失败，失败图片地址：', target.src) 
                }

                target.dataset.fallback = 'true'
                target.src = '${options?.defaultImage || defaultImage}'
              }
            }
          }, true)
        </script>
      `

      return injectBodyScript(html, script)
    },
    transform (code: string, id: string) {
      // 是否是 vue jsx tsx 文件
      const filter = createFilter(['**/*.vue', '**/*.jsx', '**/*.tsx'])
      if (!filter(id)) return
    
      // 查看文件是否含有 img 标签，如果存在查看 img 标签是否有携带 loading 属性，没有新增 loading="lazy"
      const s = new MagicString(code)
      
      // 匹配所有的 img 标签
      const imgRegex = /<img\s[^>]*?(?:\/>|>)/g
      
      // 存储所有找到的 img 标签及其位置
      const imgTags = []
      
      let match
      while ((match = imgRegex.exec(code)) !== null) {
        const startIndex = match.index
        const endIndex = startIndex + match[0].length
        const imgTag = match[0]
      
        imgTags.push({
          tag: imgTag,
          startIndex,
          endIndex
        })
      }
      
      // 如果没有找到 img 标签，直接返回
      if (!imgTags.length) return
      
      imgTags.forEach(({ tag, startIndex, endIndex }) => {
        // 查看 img 标签是否有携带 loading 属性
        const loadingRegex = /loading\s*=\s*['"]lazy['"]/
        if (!loadingRegex.test(tag)) {
          s.appendRight(endIndex - 1, ' loading="lazy"')
        }
      })
    
      return {
        code: s.toString(),
        map: s.generateMap()
      }
    }
  }
}

function injectBodyScript(html: string, script: string) {
  const s = new MagicString(html)
  
  // 查找最后一个 </body> 标签的位置
  const bodyCloseIndex = html.lastIndexOf('</body>')
  
  bodyCloseIndex !== -1 ? s.appendLeft(bodyCloseIndex, script) : s.append(script)

  return {
    html: s.toString(),
    map: s.generateMap(),
    tags: []
  }
}
