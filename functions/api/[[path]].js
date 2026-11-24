const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const enc=s=>new TextEncoder().encode(s);
function b64(bytes){return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
async function sign(value,secret){const key=await crypto.subtle.importKey('raw',enc(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);return b64(await crypto.subtle.sign('HMAC',key,enc(value)))}
async function token(secret){const payload=b64(enc(JSON.stringify({exp:Date.now()+7*864e5,nonce:crypto.randomUUID()})));return payload+'.'+await sign(payload,secret)}
async function authorized(req,env){const c=req.headers.get('Cookie')||'';const m=c.match(/(?:^|;\s*)blog_session=([^;]+)/);if(!m||!env.SESSION_SECRET)return false;const [p,s]=m[1].split('.');if(!p||!s||s!==await sign(p,env.SESSION_SECRET))return false;try{return JSON.parse(atob(p.replace(/-/g,'+').replace(/_/g,'/'))).exp>Date.now()}catch{return false}}
const cookie=(v,max)=>`blog_session=${v}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${max}`;
const id=()=>crypto.randomUUID();
function slugify(s){return String(s||'').toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'').slice(0,100)||id()}
export async function onRequest({request,env}) {
  if(!env.DB)return json({error:'尚未配置 D1 绑定 DB'},503);
  const url=new URL(request.url),path=url.pathname;
  try{
    if(path==='/api/login'&&request.method==='POST'){
      const {password}=await request.json();
      if(!env.ADMIN_PASSWORD||password!==env.ADMIN_PASSWORD)return json({error:'后台密码不正确'},401);
      const t=await token(env.SESSION_SECRET||'missing-secret');
      return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie(t,604800),'Cache-Control':'no-store'}});
    }
    if(path==='/api/logout'&&request.method==='POST')return new Response(JSON.stringify({ok:true}),{headers:{'Content-Type':'application/json','Set-Cookie':cookie('',0)}});
    if(path==='/api/me')return authorized(request,env)?json({ok:true}):json({error:'未登录'},401);
    if(path==='/api/articles'&&request.method==='GET'){
      const isAdmin=await authorized(request,env),all=url.searchParams.get('all')==='1',slug=url.searchParams.get('slug');
      if(all&&!isAdmin)return json({error:'未登录'},401);
      if(slug){const q=await env.DB.prepare(`SELECT * FROM articles WHERE slug=? ${isAdmin?'':'AND published=1'} LIMIT 1`).bind(slug).first();return json({article:q||null})}
      const q=await env.DB.prepare(`SELECT id,title,slug,category,summary,cover,content,published,created_at,updated_at FROM articles ${isAdmin?'':'WHERE published=1'} ORDER BY updated_at DESC LIMIT 200`).all();
      return json({articles:q.results||[]});
    }
    if(path==='/api/articles'&&request.method==='POST'){
      if(!await authorized(request,env))return json({error:'未登录'},401);
      const a=await request.json();if(!a.title||!a.content)return json({error:'标题和正文不能为空'},400);
      const now=new Date().toISOString(),articleId=a.id||id(),slug=slugify(a.slug||a.title);
      const existing=await env.DB.prepare('SELECT id FROM articles WHERE slug=? AND id<>?').bind(slug,articleId).first();if(existing)return json({error:'这个文章标识已被使用，请换一个'},409);
      const old=await env.DB.prepare('SELECT created_at FROM articles WHERE id=?').bind(articleId).first();
      await env.DB.prepare(`INSERT INTO articles(id,title,slug,category,summary,cover,content,published,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,slug=excluded.slug,category=excluded.category,summary=excluded.summary,cover=excluded.cover,content=excluded.content,published=excluded.published,updated_at=excluded.updated_at`)
      .bind(articleId,String(a.title).slice(0,120),slug,String(a.category||'随笔').slice(0,40),String(a.summary||'').slice(0,240),String(a.cover||'').slice(0,1000),String(a.content),a.published?1:0,old?.created_at||now,now).run();
      return json({article:{id:articleId,slug}});
    }
    if(path==='/api/articles'&&request.method==='DELETE'){
      if(!await authorized(request,env))return json({error:'未登录'},401);
      const articleId=url.searchParams.get('id');if(!articleId)return json({error:'缺少文章 ID'},400);
      await env.DB.prepare('DELETE FROM articles WHERE id=?').bind(articleId).run();return json({ok:true});
    }
    if(path==='/api/upload'&&request.method==='POST'){
      if(!await authorized(request,env))return json({error:'未登录'},401);
      if(!env.BLOG_IMAGES)return json({error:'尚未配置 R2 绑定 BLOG_IMAGES'},503);
      const fd=await request.formData(),file=fd.get('file');if(!file||typeof file==='string')return json({error:'请选择图片'},400);
      const allowed=['image/jpeg','image/png','image/webp','image/gif'];if(!allowed.includes(file.type))return json({error:'仅支持 JPG、PNG、WebP、GIF'},400);
      if(file.size>5*1024*1024)return json({error:'图片不能超过 5MB'},400);
      const ext=({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'})[file.type],key=`${new Date().toISOString().slice(0,10)}/${id()}.${ext}`;
      await env.BLOG_IMAGES.put(key,file.stream(),{httpMetadata:{contentType:file.type,cacheControl:'public, max-age=31536000'}});
      return json({url:`/api/image/${key}`});
    }
    if(path.startsWith('/api/image/')){
      if(!env.BLOG_IMAGES)return json({error:'尚未配置图片存储'},503);
      const key=decodeURIComponent(path.slice('/api/image/'.length));if(key.includes('..'))return json({error:'无效路径'},400);
      const obj=await env.BLOG_IMAGES.get(key);if(!obj)return new Response('Not found',{status:404});
      const h=new Headers();obj.writeHttpMetadata(h);h.set('etag',obj.httpEtag);h.set('Cache-Control','public, max-age=31536000');return new Response(obj.body,{headers:h});
    }
    return json({error:'Not found'},404);
  }catch(e){return json({error:'服务器错误：'+(e?.message||'未知错误')},500)}
}
