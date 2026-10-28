import { createServer } from 'node:http'
import { readFileSync,statSync,existsSync } from 'node:fs'
import { resolve,extname,sep } from 'node:path'
const root=resolve(import.meta.dirname,'../dist/local-h5'),port=5174
const marker=JSON.parse(readFileSync(resolve(import.meta.dirname,'../output/local-h5-build.json'),'utf8'))
if(marker.api!=='http://127.0.0.1:3300/api/v1'||!existsSync(resolve(root,'index.html')))throw new Error('Build the verified local H5 bundle first')
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'}
createServer((req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-MedTalent-Environment','synthetic-local-qa');res.setHeader('Content-Security-Policy',"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' http://127.0.0.1:3300; img-src 'self' data: blob: http://127.0.0.1:3300; media-src 'self' blob: http://127.0.0.1:3300; frame-src 'self' blob:")
 if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return}
 try{let pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1:'+port).pathname);if(pathname==='/'||pathname==='/h5'){res.writeHead(302,{Location:'/h5/'});res.end();return}if(!pathname.startsWith('/h5/')){res.writeHead(404);res.end();return}const file=resolve(root,pathname.slice(4)||'index.html');if(!file.startsWith(root+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);res.end();return}res.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');res.writeHead(200);res.end(req.method==='HEAD'?undefined:readFileSync(file))}catch{res.writeHead(400);res.end()}
}).listen(port,'127.0.0.1',()=>console.log('LOCAL SYNTHETIC QA ONLY: http://127.0.0.1:'+port+'/h5/ ; API http://127.0.0.1:3300/api/v1'))
