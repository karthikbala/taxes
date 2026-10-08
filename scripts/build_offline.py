from pathlib import Path
import json,base64,mimetypes
root=Path(__file__).resolve().parents[1]/'public'
d=json.loads((root/'data.js').read_text().split('=',1)[1].rstrip(';\n'))
def embed(v):
 if isinstance(v,dict):return {k:embed(x) for k,x in v.items()}
 if isinstance(v,list):return [embed(x) for x in v]
 if isinstance(v,str) and v.startswith('assets/') and (root/v).is_file():return 'data:'+ (mimetypes.guess_type(v)[0] or 'application/octet-stream')+';base64,'+base64.b64encode((root/v).read_bytes()).decode()
 return v
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="style.css">','<style>'+(root/'style.css').read_text()+'</style>')
html=html.replace('assets/zeneral-logo.png',embed('assets/zeneral-logo.png'))
html=html.replace('<script src="data.js"></script>','<script>window.EXPLORER_DATA='+json.dumps(embed(d),ensure_ascii=False).replace('</','<\\/')+';</script>')
html=html.replace('<script src="app.js"></script>','<script>'+(root/'app.js').read_text().replace('</','<\\/')+'</script>')
html=html.replace('<a id="offline-link" href="offline.html" download="Zeneral-Property-Explorer-Offline.html">Download the offline meeting copy ↓</a>','<p>Offline meeting copy · PDFs, previews and extracted fields are embedded.</p>')
(root/'offline.html').write_text(html)
print('Updated self-contained offline copy:',len(html),'characters')
