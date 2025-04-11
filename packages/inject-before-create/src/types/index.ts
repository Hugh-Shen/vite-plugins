export interface Options {
  args?: string
  modulePath: string
  importName: string
  importType?: 'default' | 'named' | 'namespace'
  call?: (args: any) => any
}