import {pocHtml} from '../../lib/poc-page';
export function GET(){return new Response(pocHtml,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});}
