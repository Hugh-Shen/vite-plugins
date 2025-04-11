# @vite-plugins/inject-before-create

一个 Vite 插件，用于在 Vue 组件的 beforeCreate (Vue 2) 或 onBeforeMount (Vue 3) 生命周期钩子中注入代码。

## 安装

```bash
npm install @vite-plugins/inject-before-create --save-dev
# 或
yarn add @vite-plugins/inject-before-create -D
# 或
pnpm add @vite-plugins/inject-before-create -D

## 如何使用
```javascript
{
  modulePath: './src/utils/analytics', // 模块引用路径
  importName: 'trackPageView', // 模块导出的函数名
  importType: 'default', // 模块导出的类型，可选值为 'default' 或 'named' 和 'namespace'
  args: '' // 函数参数
}
```