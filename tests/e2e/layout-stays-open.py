import json,threading,http.server,socketserver,glob
from playwright.sync_api import sync_playwright
root='/home/claude/criptochart-terminal'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0), lambda *a,**k: Q(*a,directory=root,**k)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
chrome=glob.glob('/opt/pw-browsers/chromium-*/chrome-linux*/chrome')
kl=[[1700000000000+i*3600000,'100','101','99','100','10',1700000000000+i*3600000+3599999] for i in range(300)]
def route(r):
    u=r.request.url
    if u.startswith('http://127'): return r.continue_()
    h={'access-control-allow-origin':'*'}
    if '/klines' in u: return r.fulfill(body=json.dumps(kl),content_type='application/json',headers=h)
    return r.fulfill(body='[]',content_type='application/json',headers=h)
fails=0
def check(c,m):
    global fails; print(('OK    ' if c else 'FALLA ')+m); fails+= (not c)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path=chrome[0],args=['--no-sandbox'])
    for W in (1500,1100):
        pg=b.new_page(viewport={'width':W,'height':800}); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.route('**/*',route); pg.goto(f'http://127.0.0.1:{port}/?cct_debug=1'); pg.wait_for_timeout(1500)
        n=lambda: pg.eval_on_selector_all('.pane-fr','e=>e.length')
        check(pg.query_selector('#fitChart') is None and pg.query_selector('#fullscreen') is None, f'[{W}] botones Ajustar y Expandir eliminados')
        for lay,want in (('3',2),('4',3),('5',4)):
            pg.click('#layoutBtn'); pg.click(f'[data-ly="{lay}"]'); pg.wait_for_timeout(1500)
            check(n()==want, f'[{W}] diseño {lay}: {n()} gráficos extra')
        # estados "de la nube" con layout 1, suave y duro, varias veces
        for soft in (True,False,True):
            pg.evaluate("s=>{const o=JSON.parse(JSON.stringify(CCT_DEBUG.state)); o.layout='1'; CCT_DEBUG.applyState(o, s)}", soft); pg.wait_for_timeout(700)
        check(n()==4 and pg.evaluate("document.body.dataset.lay")=='5', f'[{W}] la nube con layout 1 no cierra el diseño ({n()} gráficos)')
        # sin preferencia guardada (dispositivo que nunca eligió)
        pg.evaluate("localStorage.removeItem('cct_layout_pref_v1')")
        pg.evaluate("()=>{const o=JSON.parse(JSON.stringify(CCT_DEBUG.state)); o.layout='1'; CCT_DEBUG.applyState(o,false)}"); pg.wait_for_timeout(700)
        check(n()==4, f'[{W}] sin preferencia local tampoco se cierra ({n()})')
        pg.wait_for_timeout(8000)
        check(n()==4, f'[{W}] sigue abierto tras 8 s más')
        # elegir cripto en el segundo gráfico
        fr=pg.frame_locator('#pane2'); fr.locator('#symbolButton').click(); pg.wait_for_timeout(600)
        check(fr.locator('#sheet.open').count()==1, f'[{W}] se puede abrir el selector de cripto dentro del gráfico 2')
        check(not errs, f'[{W}] sin errores de JS {errs[:2]}')
        pg.close()
    b.close()
print('FALLAS:',fails)
