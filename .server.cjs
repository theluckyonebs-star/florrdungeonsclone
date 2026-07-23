const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const root=process.cwd();
const DATA_DIR=path.join(root,'data');
const USERS_FILE=path.join(DATA_DIR,'users.json');

// in-memory session tokens: token -> username. Lost on restart — fine for local/dev use,
// avoids needing a signing scheme (JWT etc) just to keep a session alive.
const sessions=new Map();

function loadUsers(){
  try { return JSON.parse(fs.readFileSync(USERS_FILE,'utf8')); }
  catch(e){ return {}; }
}
function saveUsers(users){
  fs.mkdirSync(DATA_DIR,{recursive:true});
  fs.writeFileSync(USERS_FILE, JSON.stringify(users,null,2));
}
function hashPassword(password, salt){
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function readBody(req){
  return new Promise((resolve,reject)=>{
    let chunks=[];
    req.on('data', c=>chunks.push(c));
    req.on('end', ()=>{
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ reject(e); }
    });
    req.on('error', reject);
  });
}
function sendJson(res, status, obj){
  const body = JSON.stringify(obj);
  res.writeHead(status, {'Content-Type':'application/json'});
  res.end(body);
}
function tokenFromReq(req){
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer (.+)$/.exec(auth);
  return m ? m[1] : null;
}
function requireUser(req, res){
  const token = tokenFromReq(req);
  const username = token && sessions.get(token);
  if (!username){ sendJson(res, 401, {error:'not authenticated'}); return null; }
  return username;
}

async function handleApi(req, res, pathname){
  if (pathname==='/api/signup' && req.method==='POST'){
    const { username, password } = await readBody(req);
    if (!username || !password || typeof username!=='string' || typeof password!=='string' || password.length<4){
      return sendJson(res, 400, {error:'username and a password (4+ chars) are required'});
    }
    const users = loadUsers();
    if (users[username]) return sendJson(res, 409, {error:'username already taken'});
    const salt = crypto.randomBytes(16).toString('hex');
    users[username] = { salt, hash: hashPassword(password, salt), save: null };
    saveUsers(users);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, username);
    return sendJson(res, 200, { token, username });
  }
  if (pathname==='/api/login' && req.method==='POST'){
    const { username, password } = await readBody(req);
    const users = loadUsers();
    const rec = users[username];
    if (!rec) return sendJson(res, 401, {error:'invalid username or password'});
    const attempt = Buffer.from(hashPassword(password||'', rec.salt), 'hex');
    const expected = Buffer.from(rec.hash, 'hex');
    const ok = attempt.length===expected.length && crypto.timingSafeEqual(attempt, expected);
    if (!ok) return sendJson(res, 401, {error:'invalid username or password'});
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, username);
    return sendJson(res, 200, { token, username });
  }
  if (pathname==='/api/load' && req.method==='GET'){
    const username = requireUser(req, res); if (!username) return;
    const users = loadUsers();
    return sendJson(res, 200, { save: (users[username] && users[username].save) || null });
  }
  if (pathname==='/api/save' && req.method==='POST'){
    const username = requireUser(req, res); if (!username) return;
    const save = await readBody(req);
    const users = loadUsers();
    if (!users[username]) return sendJson(res, 404, {error:'unknown user'});
    users[username].save = save;
    saveUsers(users);
    return sendJson(res, 200, {ok:true});
  }
  sendJson(res, 404, {error:'not found'});
}

http.createServer((req,res)=>{
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  if (pathname.startsWith('/api/')){
    handleApi(req,res,pathname).catch(e=>{ sendJson(res, 400, {error:'bad request: '+e.message}); });
    return;
  }
  let p = pathname; if (p==='/') p='/index.html';
  const fp=path.join(root,p);
  // pick a content-type by extension — .js MUST be served as JavaScript or the browser refuses
  // to run <script type="module"> (strict MIME check); GitHub Pages does this automatically.
  const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
  const ctype=TYPES[path.extname(fp)] || 'application/octet-stream';
  fs.readFile(fp,(e,data)=>{ if(e){res.writeHead(404);res.end('404');return;}
    res.writeHead(200,{'Content-Type':ctype});res.end(data);});
}).listen(8001,()=>console.log('up'));
