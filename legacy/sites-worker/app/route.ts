import {explorerHtml} from "../lib/explorer-content";
export function GET(){return new Response(explorerHtml,{headers:{"Content-Type":"text/html;charset=utf-8"}})}
