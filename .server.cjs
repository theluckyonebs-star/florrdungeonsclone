const http=require('http'),fs=require('fs'),path=require('path');
const root=process.cwd();
http.createServer((req,res)=>{
  let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/index.html';
  const fp=path.join(root,p);
  fs.readFile(fp,(e,data)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':'text/html'});res.end(data);});
}).listen(8001,()=>console.log('up'));
