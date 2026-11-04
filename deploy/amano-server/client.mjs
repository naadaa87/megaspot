const BASE='https://a24188.pweb.kr';
export class AmanoClient{
 constructor(credentials,upstream=fetch){this.credentials=credentials;this.upstream=upstream;this.cookies=new Map();}
 async request(path,form){
  const u=new URL(path,BASE);if(u.origin!==BASE)throw Error('Unexpected Amano destination');
  const r=await this.upstream(u.href,{method:form?'POST':'GET',headers:{Accept:form?'application/json,text/plain,*/*':'text/html','User-Agent':'MegaspotParkingServer/1.0 (+https://megaspot.kr)',...(this.cookies.size?{Cookie:[...this.cookies].map(([k,v])=>k+'='+v).join('; ')}:{}),...(form?{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','amano_http_ajax':'true','ajax':'true','X-Requested-With':'XMLHttpRequest'}:{})},...(form?{body:new URLSearchParams(form)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});
  for(const raw of r.headers.getSetCookie()){const pair=raw.split(';')[0],i=pair.indexOf('=');if(i>0)this.cookies.set(pair.slice(0,i),pair.slice(i+1));}
  const text=await r.text();if([401,424,428].includes(r.status))throw Error('아마노 추가 인증 또는 약관 확인이 필요합니다.');
  if(r.status>=400)throw Error('아마노 요청 실패 HTTP '+r.status);
  return {status:r.status,location:r.headers.get('location'),text};
 }
 async login(){
  await this.request('/login');
  const r=await this.request('/login',{userId:this.credentials.username,userPwd:this.credentials.passwordHash});
  if(r.status>=300 && new URL(r.location||'/',BASE).pathname==='/login')throw Error('아마노 로그인 정보를 확인해 주세요.');
  const p=await this.request('/discount/registration');
  if(p.status!==200||!p.text.includes('할인정보 등록')||!p.text.includes('차량번호 조회')||p.text.includes('id="loginForm"'))throw Error('아마노 로그인 또는 추가 인증이 필요합니다.');
  return p.text;
 }
}
