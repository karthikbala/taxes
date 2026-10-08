import {liveHtml} from "../../lib/live-page";
export function GET(){return new Response(liveHtml,{headers:{"Content-Type":"text/html;charset=utf-8"}})}
