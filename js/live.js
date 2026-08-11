'use strict';
/* ── EN VIVO (LiveKit) ── */
function abrirCentroMando(){ cerrarOverlay('menu-overlay'); document.getElementById('centro-mando-overlay').classList.add('on'); }
async function pedirTokenLive(rol, passHashVerif){
  var body = { nombre:U.nombre, rol:rol };
  if(passHashVerif) body.pass_hash = passHashVerif;
  var resp = await fetch(EDGE_TOKEN_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+SBKEY,'apikey':SBKEY},
    body: JSON.stringify(body)
  });
  if(!resp.ok){ var e = await resp.json().catch(()=>({error:'error desconocido'})); throw new Error(e.error||'No se pudo obtener el token'); }
  return resp.json();
}
var iniciandoLive = false;
var liveLatidoTid = null;

function attachVideoResiliente(track){
  // Reutiliza SIEMPRE el mismo elemento <video> en vez de crear y borrar uno
  // nuevo cada vez que llega un evento de track. Antes se borraba cualquier
  // <video> existente en cada TrackSubscribed, lo que podía dejar la pantalla
  // en negro si el navegador republicaba la pista (frecuente en móvil al
  // cambiar de orientación o al haber una reconexión breve de red).
  var wrap = document.getElementById('live-video-wrap');
  var video = document.getElementById('live-video-el');
  if(!video){
    video = document.createElement('video');
    video.id = 'live-video-el';
    video.autoplay = true; video.playsInline = true;
    wrap.appendChild(video);
  }
  track.attach(video);
}

async function iniciarLive(tipo){
  if(iniciandoLive) return;
  cerrarOverlay('centro-mando-overlay');
  var passIngresada = prompt('Confirma tu contraseña para iniciar el directo:');
  if(!passIngresada){ alert('Directo cancelado: no se ingresó contraseña.'); return; }
  iniciandoLive = true;
  try{
    var passHashVerif = await hashPass(passIngresada);
    var {token,url} = await pedirTokenLive('broadcaster', passHashVerif);
    liveRoom = new LivekitClient.Room();

    // Vista previa: el propio CEO ahora SÍ ve su cámara/pantalla mientras transmite.
    liveRoom.on(LivekitClient.RoomEvent.LocalTrackPublished, function(pub){
      if(pub.track && pub.track.kind==='video'){ attachVideoResiliente(pub.track); }
    });

    await liveRoom.connect(url, token);
    esBroadcaster = true;
    if(tipo==='camara'){ await liveRoom.localParticipant.setCameraEnabled(true); await liveRoom.localParticipant.setMicrophoneEnabled(true); }
    else if(tipo==='pantalla'){ await liveRoom.localParticipant.setScreenShareEnabled(true); await liveRoom.localParticipant.setMicrophoneEnabled(true); }
    else if(tipo==='audio'){ await liveRoom.localParticipant.setMicrophoneEnabled(true); }

    await sb.from('pc_live_estado').update({activo:true, tipo:tipo, iniciado_en:new Date().toISOString(), ultimo_latido:new Date().toISOString()}).eq('id',1);
    // Latido de vida cada 15s: si el CEO se desconecta sin avisar (se le cae
    // la señal, cierra el navegador de golpe, etc.), este latido deja de
    // llegar y los espectadores dejan de ver el EN VIVO automáticamente.
    clearInterval(liveLatidoTid);
    liveLatidoTid = setInterval(function(){
      sb.from('pc_live_estado').update({ultimo_latido:new Date().toISOString()}).eq('id',1).catch(()=>{});
    }, 15000);

    abrirPantallaLive(tipo, true);
  }catch(x){
    alert('No se pudo iniciar el directo: '+x.message+'\n\nRevisa: 1) que desactivaste "Enforce JWT Verification" en la Edge Function, 2) que los 5 secretos estén bien escritos, 3) que diste permiso de cámara/micrófono al navegador.');
    if(liveRoom){ try{ await liveRoom.disconnect(); }catch(e){} liveRoom=null; }
    esBroadcaster = false;
  }
  iniciandoLive = false;
}
async function finalizarLive(){
  cerrarOverlay('centro-mando-overlay');
  clearInterval(liveLatidoTid);
  try{ if(liveRoom){ await liveRoom.disconnect(); } }catch(x){}
  liveRoom = null; esBroadcaster = false;
  try{ await sb.from('pc_live_estado').update({activo:false, tipo:null, ultimo_latido:null}).eq('id',1); }catch(x){}
  try{ await sb.from('pc_live_chat').delete().neq('id',0); }catch(x){}
  var videoEl = document.getElementById('live-video-el'); if(videoEl) videoEl.remove();
  document.getElementById('live-view').classList.remove('on');
  document.getElementById('live-indicador').classList.remove('on');
}
async function pollEstadoLive(){
  try{
    var {data} = await sb.from('pc_live_estado').select('activo,tipo,ultimo_latido').eq('id',1).maybeSingle();
    var ind = document.getElementById('live-indicador');
    // El indicador solo se enciende si activo=true Y el último latido llegó
    // hace menos de 30 segundos. Esto arregla de raíz el bug de "se queda
    // pegado EN VIVO para siempre": si el latido deja de llegar (por
    // cualquier motivo — no solo por presionar Finalizar), se apaga solo.
    var latidoReciente = data && data.ultimo_latido && (Date.now() - new Date(data.ultimo_latido).getTime()) < 30000;
    if(data && data.activo && latidoReciente){ ind.classList.add('on'); }
    else {
      ind.classList.remove('on');
      if(!esBroadcaster && liveRoom){
        // El directo terminó de verdad (o el latido se puso viejo): aquí sí
        // desconectamos por completo, a diferencia de salirDeLive() que solo
        // cierra la vista sin cortar la conexión mientras el directo sigue activo.
        try{ liveRoom.disconnect(); }catch(x){}
        liveRoom = null;
      }
      if(document.getElementById('live-view').classList.contains('on') && !esBroadcaster){
        document.getElementById('live-view').classList.remove('on');
      }
    }
  }catch(x){}
}
var entrandoLiveViewer = false;
async function entrarLive(){
  if(esBroadcaster){
    var {data} = await sb.from('pc_live_estado').select('tipo').eq('id',1).maybeSingle();
    abrirPantallaLive(data?data.tipo:'camara', true);
    return;
  }
  // Si ya estás conectado (p.ej. tocaste el botón antes y no viste respuesta
  // inmediata y volviste a tocar), NO vuelvas a conectar: LiveKit expulsa la
  // conexión anterior cuando detecta la misma identidad conectándose dos
  // veces — eso probablemente es lo que causaba el corte a los ~10s: cada
  // toque de más te desconectaba a ti mismo de tu conexión anterior.
  if(liveRoom && liveRoom.state==='connected'){
    abrirPantallaLive(null, false);
    return;
  }
  if(entrandoLiveViewer) return;
  entrandoLiveViewer = true;
  mostrarEstadoLive('Conectando...');
  try{
    var {data:estado} = await sb.from('pc_live_estado').select('activo,tipo').eq('id',1).maybeSingle();
    if(!estado || !estado.activo){ alert('El directo ya terminó.'); entrandoLiveViewer=false; return; }
    var {token,url} = await pedirTokenLive('viewer');
    liveRoom = new LivekitClient.Room();
    liveRoom.on(LivekitClient.RoomEvent.TrackSubscribed, function(track){
      if(track.kind==='video'){ attachVideoResiliente(track); mostrarEstadoLive(''); }
      else if(track.kind==='audio'){ track.attach(); }
    });
    liveRoom.on(LivekitClient.RoomEvent.TrackUnsubscribed, function(track){ track.detach(); });
    liveRoom.on(LivekitClient.RoomEvent.Reconnecting, function(){
      console.warn('[EN VIVO] Reconectando...');
      mostrarEstadoLive('Se cortó la señal, reconectando...');
    });
    liveRoom.on(LivekitClient.RoomEvent.Reconnected, function(){
      console.warn('[EN VIVO] Reconectado');
      mostrarEstadoLive('');
    });
    liveRoom.on(LivekitClient.RoomEvent.Disconnected, function(reason){
      // Este log es justo lo que pide revisar la consola (F12): aquí queda
      // la razón exacta por la que LiveKit cerró la conexión.
      console.warn('[EN VIVO] Desconectado. Razón:', reason);
      mostrarEstadoLive('Se cerró la conexión (motivo: '+(reason||'desconocido')+')');
      liveRoom = null;
    });
    await liveRoom.connect(url, token);
    abrirPantallaLive(estado.tipo, false);
    mostrarEstadoLive('');
  }catch(x){
    console.error('[EN VIVO] Error al conectar:', x);
    alert('No se pudo entrar al directo: '+x.message);
  }
  entrandoLiveViewer = false;
}
function mostrarEstadoLive(texto){
  var el = document.getElementById('live-estado-diag');
  if(!el) return;
  el.textContent = texto;
  el.style.display = texto ? 'block' : 'none';
}
function abrirPantallaLive(tipo, soyBroadcaster){
  document.getElementById('live-view').classList.add('on');
  if(tipo){
    var esquina = document.getElementById('live-logo-esquina'); var centro = document.getElementById('live-logo-centro');
    if(tipo==='audio'){ esquina.style.display='none'; centro.style.display='flex'; }
    else { esquina.style.display='block'; centro.style.display='none'; }
  }
  liveChatUltimoId = null;
  document.getElementById('live-chat-msgs').innerHTML='';
  cargarLiveChat();
}
async function salirDeLive(){
  document.getElementById('live-view').classList.remove('on');
  // Ya NO desconecta al salir de la vista si sigues siendo espectador de un
  // directo activo — así, si vuelves a tocar el botón rojo, reabre la MISMA
  // conexión en vez de crear una nueva (ver nota en entrarLive). Solo se
  // desconecta de verdad cuando el directo realmente termina (lo maneja
  // pollEstadoLive) o al cerrar sesión.
}
async function cargarLiveChat(){
  try{
    var q = sb.from('pc_live_chat').select('id,nombre,contenido_cifrado,iv,creado_en').order('creado_en',{ascending:true}).limit(60);
    if(liveChatUltimoId) q = q.gt('id', liveChatUltimoId);
    var {data} = await q;
    if(!data) return;
    var cont = document.getElementById('live-chat-msgs');
    for(var i=0;i<data.length;i++){
      var m = data[i];
      var texto = await descifrarConEtiqueta(m.contenido_cifrado, m.iv, 'papirochat-live-chat');
      var div = document.createElement('div');
      div.className='msg '+(eqNombre(m.nombre,U.nombre)?'mio':'otro');
      div.innerHTML = '<div class="msg-header">'+escHtml(m.nombre)+'</div><div class="msg-burbuja">'+escHtml(texto)+'</div>';
      cont.appendChild(div);
      liveChatUltimoId = m.id;
    }
    cont.scrollTop = cont.scrollHeight;
  }catch(x){}
}
setInterval(function(){ if(document.getElementById('live-view').classList.contains('on')) cargarLiveChat(); }, 3000);
async function enviarLiveChat(){
  var inp = document.getElementById('live-chat-input');
  var txt = inp.value.trim();
  if(!txt) return;
  var ahora = Date.now()/1000;
  if(ahora-ultimoEnvioLiveSeg < 8){ return; }
  inp.value='';
  var enc = await cifrarConEtiqueta(txt, 'papirochat-live-chat');
  try{ await sb.from('pc_live_chat').insert({nombre:U.nombre, contenido_cifrado:enc.c, iv:enc.iv}); ultimoEnvioLiveSeg = ahora; await cargarLiveChat(); }catch(x){}
}

/* ── OVERLAYS Y SESIÓN ── */
function cerrarOverlay(id){ document.getElementById(id).classList.remove('on'); }
function cerrarSesion(){
  clearInterval(pollTid); clearInterval(livePollTid); clearInterval(actividadTid); clearInterval(cleanupTid); clearInterval(liveLatidoTid);
  // Cierra cualquier ventana/panel que haya quedado abierto
  document.querySelectorAll('.overlay').forEach(function(ov){ ov.classList.remove('on'); });
  document.getElementById('live-view').classList.remove('on');
  if(liveRoom){ try{ liveRoom.disconnect(); }catch(x){} liveRoom=null; }
  sessionStorage.removeItem('pc_nombre');
  document.getElementById('app-screen').style.display='none';
  document.getElementById('login').style.display='flex';
  mostrarLogin();
}
function escHtml(txt){
  return String(txt).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/\n/g,'<br>');
}

/* ── SESIÓN SOLO MIENTRAS EL NAVEGADOR ESTÉ ABIERTO ──
   Se usa sessionStorage (no localStorage): si cierras el navegador, se
   cierra la sesión por seguridad, pero NADA de lo que escribiste en las
   salas se borra — eso vive en el servidor, no en tu dispositivo. */
(function(){
  var guardado = sessionStorage.getItem('pc_nombre');
  if(guardado){
    sb.from('pc_usuarios').select('nombre,rol,estado').ilike('nombre',guardado).maybeSingle().then(function(r){
      if(r.data && r.data.estado!=='eliminado' && r.data.estado!=='expulsado_perm' && r.data.estado!=='caducada_inasistencia'){
        U.nombre = r.data.nombre; U.rol = r.data.rol;
        entrarApp();
      }
    });
  }
})();
