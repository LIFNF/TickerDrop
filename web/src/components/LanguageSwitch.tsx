import {languages,setLanguage,useLanguage,isLanguage} from "../lib/locale";
import {tx} from "../lib/copy";
export function LanguageSwitch(){
 const language=useLanguage();
 return <label className="language-switch" title={tx("Language")}>
  <svg viewBox="0 0 24 24" aria-hidden="true" shapeRendering="crispEdges" fill="currentColor">
   <path d="M8 2h8v2h4v4h2v8h-2v4h-4v2H8v-2H4v-4H2V8h2V4h4Zm0 4H6v4h4V4H8Zm6-2h-2v6h6V6h-4ZM4 12v4h2v2h4v-6Zm8 0v8h4v-2h2v-2h2v-4Z" fillRule="evenodd"/>
  </svg>
  <select aria-label={tx("Language")} value={language} onChange={event=>{if(isLanguage(event.target.value))setLanguage(event.target.value);}}>
   {languages.map(item=><option key={item.id} value={item.id} lang={item.id}>{item.name}</option>)}
  </select>
  <span className="language-current" aria-hidden="true">{languages.find(item=>item.id===language)!.short}</span>
  <svg className="language-arrow" viewBox="0 0 8 6" aria-hidden="true" fill="currentColor"><path d="M0 0h8v2H6v2H4v2H2V4H0Z"/></svg>
 </label>;
}
