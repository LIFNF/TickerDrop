const pages = ["engine", "cutoff", "mint", "book", "vault", "docs"] as const;
export type Page = typeof pages[number];
export type Route = {kind:"home"}|{kind:"page";page:Page}|{kind:"ticker";symbol:string};

function parse(value:string):Route|null {
 if(pages.includes(value as Page))return {kind:"page",page:value as Page};
 const match=/^t\/([A-Z0-9.-]{1,12})$/i.exec(value);
 return match?{kind:"ticker",symbol:match[1].toUpperCase()}:null;
}
export function readRoute(pathname:string,hash="",base="/"):Route {
 // Accept old shared hash links, but canonical URLs always use paths.
 if(hash.length<=129){try{const legacy=parse(decodeURIComponent(hash.replace(/^#/,"")));if(legacy)return legacy;}catch{/* Malformed old links fall back to the path. */}}
 const prefix=base.replace(/\/$/,"");
 if(prefix&&pathname!==prefix&&!pathname.startsWith(prefix+"/"))return {kind:"home"};
 let value=pathname.slice(prefix.length).replace(/^\/+|\/+$/g,"");
 if(value.length>128)return {kind:"home"};
 try{value=decodeURIComponent(value);}catch{return {kind:"home"};}
 return parse(value)||{kind:"home"};
}
export function routePath(route:Route,base="/"):string {
 const prefix=base.replace(/\/$/,"");
 if(route.kind==="home")return prefix+"/";
 return prefix+"/"+(route.kind==="page"?route.page:"t/"+encodeURIComponent(route.symbol.toUpperCase()));
}
