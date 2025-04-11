import type { Plugin } from 'vite'
import { parse } from 'vue/compiler-sfc'
import { createFilter } from '@rollup/pluginutils'
import MagicString from 'magic-string'
import { Options } from './types'

const defaultOptions = {
  args: '',
  modulePath: '',
  importName: '',
  importType: 'default',
}

export default function injectBeforeCreate(options?: Options): Plugin {
  const mergedOpts = { ...defaultOptions, ...options }

  // 检查必填项
  if (!mergedOpts.modulePath || !mergedOpts.importName) {
    throw new Error('modulePath and importName are required')
  }

  return {
    name: 'vite-plugin-injectBeforeCreate',
    enforce: 'pre',

    transform(code: string, id: string) {
      // 只处理 .vue 文件
      const filter = createFilter(/\.vue$/)

      if (!filter(id)) return null
      
      try {
        const s = new MagicString(code)
        const { descriptor } = parse(code)
        
        // 不仅检查 scriptSetup 是否存在，还检查源代码中是否包含 <script setup> 标签
        const isVue3 = !!descriptor.scriptSetup || code.includes('<script setup>')
        
        const hookName = isVue3 ? 'onBeforeMount' : 'beforeCreate'
        const functionCall = typeof mergedOpts.call === 'function'
          ? `(${mergedOpts.call.toString()})(${mergedOpts.args})`
          : `${mergedOpts.importName}(${mergedOpts.args || ''})`
        const importStatement = getImportStatement(mergedOpts)
        
        // 处理没有脚本标签的情况
        if (!descriptor.script && !descriptor.scriptSetup) {
          return handleNoScript(code, s, id, hookName, importStatement, functionCall)
        }
        
        const script = descriptor.script || descriptor.scriptSetup
        const scriptStart = script?.loc.start.offset as number
        const scriptContent = script?.content || ''
        
        if (!hasExistingImport(scriptContent, mergedOpts)) {
          s.appendRight(scriptStart, `\n${importStatement}`)
        }        

        injectLifecycle(s, scriptContent, scriptStart, isVue3, hookName, functionCall)
        
        const result = {
          code: s.toString(),
          map: s.generateMap({ hires: true })
        }
        
        return result
      } catch (error) {
        return null
      }
    }
  }
}

// 处理没有脚本标签的情况
function handleNoScript(code: string, s: MagicString, id: string, hookName: string, importStatement: string, functionCall: string) {
  // 如果没有找到脚本标签，但文件中确实包含 script setup
  if (code.includes('<script setup>')) {
    const scriptMatch = /<script setup>([\s\S]*?)<\/script>/g.exec(code)

    if (scriptMatch) {
      const scriptStart = scriptMatch.index + '<script setup>'.length
      
      // 构建注入内容
      const injection = `
import { ${hookName} } from 'vue';
${importStatement}

${hookName}(() => {
  ${functionCall};
});
`
      // 注入到 script 标签内
      s.appendLeft(scriptStart, injection)

      return {
        code: s.toString(),
        map: s.generateMap({ hires: true })
      }
    }
  }
  
  return null
}

// 生成导入语句
function getImportStatement(options: typeof defaultOptions) {
  const { importName, modulePath, importType } = options
  
  // 直接使用用户传入的路径，不做转换
  let finalPath = modulePath
  
  // 只移除 .ts 扩展名
  if (finalPath.endsWith('.ts')) {
    finalPath = finalPath.replace(/\.ts$/, '')
  }
  
  if (importType === 'named') {
    return `import { ${importName} } from '${finalPath}';`
  } else if (importType === 'namespace') {
    return `import * as ${importName} from '${finalPath}';`
  } else {
    return `import ${importName} from '${finalPath}';`
  }
}

// 检查是否已存在导入语句
function hasExistingImport(script: string, options: typeof defaultOptions) {
  const { importName, modulePath, importType } = options
  
  let importPattern
  if (importType === 'named') {
    // 更灵活地处理空格，允许任意数量的空格或没有空格
    importPattern = `import\\s*{\\s*${importName}\\s*}\\s*from\\s*['"]${modulePath}['"]`
  } else if (importType === 'namespace') {
    // 修复命名空间导入的正则表达式
    importPattern = `import\\s*{\\s*as\\s*${importName}\\s*from\\s*['"]${modulePath}['"]`
  } else {
    importPattern = `import\\s*${importName}\\s*from\\s*['"]${modulePath}['"]`
  }
  
  // 使用更灵活的正则表达式匹配
  const regex = new RegExp(importPattern.replace(/\\s\*/g, '\\s*'), 'i')
  return regex.test(script)
}

// 注入生命周期钩子
function injectLifecycle(
  s: MagicString,
  scriptContent: string,
  scriptStart: number,
  isVue3: boolean,
  hookName: string,
  functionCall: string
) {
  // 处理Vue3的空script setup内容
  // 这种情况是脚本标签存在，但内容为空
  if (isVue3 && scriptContent.trim() === '') {
    const setupInsert = `\nimport { ${hookName} } from 'vue';\n\n${hookName}(() => {\n  ${functionCall};\n});\n`
    s.appendLeft(scriptStart, setupInsert)
    return
  }

  // 检查是否已存在生命周期钩子
  const hookRegex = isVue3
    ? new RegExp(`${hookName}\\s*\\(\\s*(?:async\\s*)?(?:\\([^)]*\\)|[^,)]+)\\s*=>\\s*{`)
    : new RegExp(`${hookName}\\s*\\(\\s*\\)\\s*{`)

  const hookMatch = hookRegex.exec(scriptContent)  

  if (hookMatch) {
    // 已存在钩子，在其中插入函数调用
    const hookContentStart = scriptStart + hookMatch.index + hookMatch[0].length
    s.appendLeft(hookContentStart, `\n    ${functionCall};`)
    return
  }
  
  // 处理Vue3情况
  if (isVue3) {
    // 检查是否需要导入钩子
    if (!scriptContent.includes(`import`) || !new RegExp(`\\b${hookName}\\b`).test(scriptContent)) {
      s.appendLeft(scriptStart + 1, `\nimport { ${hookName} } from 'vue';\n`)
    }
    
    // 在setup中添加钩子或直接在script内容中添加
    if (scriptContent.includes('setup')) {
      const setupMatch = /setup\s*\([^)]*\)\s*{/.exec(scriptContent)
      if (setupMatch) {
        const setupBodyStart = scriptStart + setupMatch.index + setupMatch[0].length
        s.appendLeft(setupBodyStart, `\n  ${hookName}(() => {\n    ${functionCall};\n  });`)
      }
    } else {
      s.appendLeft(scriptStart + 1, `\n\n${hookName}(() => {\n  ${functionCall};\n});\n`)
    }
    return
  }
  
  // 处理Vue2情况
  const exportMatch = /export\s+default\s+{/.exec(scriptContent)
  if (exportMatch) {
    const exportObjStart = scriptStart + exportMatch.index + exportMatch[0].length
    s.appendLeft(exportObjStart, `\n  ${hookName}() {\n    ${functionCall};\n  },`)
  } else {
    s.appendLeft(scriptStart + scriptContent.length, `\n\nexport default {\n  ${hookName}() {\n    ${functionCall};\n  }\n}`)
  }
}