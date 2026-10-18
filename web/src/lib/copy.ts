import {t as english} from "./copy.en";
import {tx} from "./translate";
export {tx} from "./translate";
// Module-level references remain current without remounting wallet providers.
function localized<T extends object>(source:T):T{
 const children=new Map<PropertyKey,object>();
 return new Proxy(source,{get(target,key,receiver){
  const value=Reflect.get(target,key,receiver);
  if(typeof value==="string")return tx(value);
  if(Array.isArray(value))return value.map(item=>translateValue(item));
  if(value&&typeof value==="object"){
   if(!children.has(key))children.set(key,localized(value));
   return children.get(key);
  }
  return value;
 }});
}
function translateValue(value:unknown):unknown{
 if(typeof value==="string")return tx(value);
 if(Array.isArray(value))return value.map(translateValue);
 return value;
}
export const t=localized(english);
