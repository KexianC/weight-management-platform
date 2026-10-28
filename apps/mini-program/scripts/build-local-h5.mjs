import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
const root=resolve(import.meta.dirname,'..'), output=resolve(root,'dist/local-h5'), publish=resolve(root,'dist/build/h5')
function files(dir){return existsSync(dir)?readdirSync(dir).flatMap(name=>{const f=resolve(dir,name);return statSync(f).isDirectory()?files(f):[f]}):[]}
function hashTree(dir){const h=createHash('sha256');for(const f of files(dir).sort()){h.update(relative(dir,f));h.update(readFileSync(f))}return h.digest('hex')}
if(!output.startsWith(root+sep)||output===publish)throw new Error('Local output directory guard failed')
const before=hashTree(publish)
const env={...process.env,VITE_API_BASE_URL:'http://127.0.0.1:3300/api/v1',VITE_STORAGE_BASE_URL:'http://127.0.0.1:3300',UNI_OUTPUT_DIR:output}
const result=spawnSync(process.execPath,[resolve(root,'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js'),'build','-p','h5','--mode','local-qa','--outDir',output],{cwd:root,env,stdio:'inherit'})
if(result.status!==0)process.exit(result.status||1)
const js=files(output).filter(f=>f.endsWith('.js')).map(f=>readFileSync(f,'utf8')).join(String.fromCharCode(10))
if(!js.includes(env.VITE_API_BASE_URL)||js.includes('kxjzapi.hzmwmt.cn'))throw new Error('Local bundle API endpoint verification failed')
const after=hashTree(publish)
if(before!==after)throw new Error('Publishing artifact was modified')
const report={mode:'local-qa',api:env.VITE_API_BASE_URL,storage:env.VITE_STORAGE_BASE_URL,output,publishingArtifactUnchanged:true,publishingArtifactSha256:after,verifiedAt:new Date().toISOString()}
mkdirSync(resolve(root,'output'),{recursive:true});writeFileSync(resolve(root,'output/local-h5-build.json'),JSON.stringify(report,null,2))
console.log(JSON.stringify(report,null,2))
