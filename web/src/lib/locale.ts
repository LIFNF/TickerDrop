import {useSyncExternalStore} from "react";
export const languages=[
 {id:"en",name:"English",short:"EN",locale:"en-US"},
 {id:"es",name:"Español",short:"ES",locale:"es-ES"},
 {id:"zh-Hant",name:"繁體中文",short:"繁中",locale:"zh-TW"},
 {id:"ja",name:"日本語",short:"日本語",locale:"ja-JP"},
] as const;
export type Language=typeof languages[number]["id"];
const storageKey="tickerdrop:language:v1";
export const isLanguage=(value:unknown):value is Language=>languages.some(language=>language.id===value);
function saved():Language{try{const value=localStorage.getItem(storageKey);return isLanguage(value)?value:"en";}catch{return "en";}}
let language:Language=saved();
const listeners=new Set<()=>void>();
export const getLanguage=()=>language;
export const numberLocale=()=>languages.find(item=>item.id===language)!.locale;
function updateDocument(){if(typeof document!=="undefined")document.documentElement.lang=language;}
updateDocument();
export function setLanguage(value:Language){
 if(!isLanguage(value))return;
 try{localStorage.setItem(storageKey,value);}catch{/* In-memory preference remains usable. */}
 if(value===language)return;
 language=value;updateDocument();listeners.forEach(listener=>listener());
}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function useLanguage(){return useSyncExternalStore(subscribe,getLanguage,()=>"en" as Language);}
