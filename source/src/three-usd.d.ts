// three's USD parsers (bundled; three r183+), which @types/three does not declare: each reads one layer into its specs,
// a map of prim and attribute paths ("/Root/Crate", "/Root/Crate.faceVertexCounts") to their fields.
declare module "three/examples/jsm/loaders/usd/USDAParser.js" {
  export class USDAParser { parseData(text: string): { specsByPath: Record<string, { specType: number; fields: Record<string, any> }> } }
}
declare module "three/examples/jsm/loaders/usd/USDCParser.js" {
  export class USDCParser { parseData(buffer: ArrayBuffer): { specsByPath: Record<string, { specType: number; fields: Record<string, any> }> } }
}
