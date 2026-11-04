import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root=resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'};
http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}const data=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(404).end('Not found');}}).listen(5188,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:5188'));
