import {getLanguage} from "./locale";
import {messages} from "./messages";
export function tx(source:string,values:Record<string,string|number>={}):string{
 const language=getLanguage();
 const translated=language==="en"?source:messages[source]?.[language==="es"?0:language==="zh-Hant"?1:2]??source;
 return translated.replace(/\{(\w+)\}/g,(match,key)=>Object.prototype.hasOwnProperty.call(values,key)?String(values[key]):match);
}
