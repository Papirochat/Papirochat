'use strict';
/* ── SALAS: solo se revela la sala actual (nombre + meta). La siguiente
   permanece en secreto hasta desbloquearse. ── */
async function actualizarTotalUsuarios(){
  try{
    var {count} = await sb.from('pc_usuarios').select('*',{count:'exact',head:true}).not('estado','in','(eliminado,caducada_inasistencia)');
    TOTAL_USUARIOS_CACHE = count || 1;
  }catch(x){}
}
function salaMasAltaDesbloqueada(){
  var maxOrden = 1;
  SALAS.forEach(function(s){ if(TOTAL_USUARIOS_CACHE >= s.meta) maxOrden = Math.max(maxOrden, s.orden); });
  return maxOrden;
}
async function puedeParticipar(orden){ return true; } // ya no se exige referidos mínimos para participar (se eliminó esa regla)

async function cambiarSala(orden){
  await actualizarTotalUsuarios();
  var maxDesbloqueada = salaMasAltaDesbloqueada();
  orden = Math.min(orden, maxDesbloqueada);
  SALA_ACTUAL = orden;
  var s = SALAS.find(x=>x.orden===orden);

  document.getElementById('h-sala-titulo').textContent = s.nombre;
  document.getElementById('h-sala-meta').textContent = TOTAL_USUARIOS_CACHE+' / '+s.meta+' usuarios · publica cada '+Math.round(s.seg/60)+' min';
  document.getElementById('h-sala-secreta').textContent = (orden<7) ? '🔒 la siguiente sala es un secreto hasta desbloquearse' : '';

  document.getElementById('msgs').innerHTML='';
  ultimoMsgId=null;
  document.getElementById('input-row').style.display='flex';

  await cargarMensajes();
  clearInterval(pollTid);
  pollTid = setInterval(function(){ cambiarSalaSiloDesbloqueaOtra(); cargarMensajes(); }, 5000);
}
async function cambiarSalaSiloDesbloqueaOtra(){
  await actualizarTotalUsuarios();
  var nueva = salaMasAltaDesbloqueada();
  if(nueva !== SALA_ACTUAL){
    await sb.from('pc_notificaciones').insert({usuario_destino:U.nombre, tipo:'sistema', contenido:'¡Se desbloqueó una nueva sala! Ahora estás en: '+SALAS.find(x=>x.orden===nueva).nombre}).catch(()=>{});
    cambiarSala(nueva);
  }
}

/* ── MENSAJES DE SALA ── */
async function cargarMensajes(){
  try{
    await limpiarMensajesSalaExpirados();
    var q = sb.from('pc_mensajes').select('id,usuario,contenido_cifrado,iv,creado_en')
      .eq('sala_orden', SALA_ACTUAL).order('creado_en',{ascending:true}).limit(80);
    if(ultimoMsgId) q = q.gt('id', ultimoMsgId);
    var {data,error} = await q;
    if(error || !data || !data.length) return;
    for(var i=0;i<data.length;i++){
      var m = data[i];
      var texto = await descifrar(m.contenido_cifrado, m.iv, SALA_ACTUAL);
      await agregarMensajeDOM(m.id, m.usuario, texto, m.creado_en);
      ultimoMsgId = m.id;
    }
    document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
  }catch(x){}
}

async function agregarMensajeDOM(id,usuario,texto,creado_en){
  if(document.getElementById('m-'+id)) return;
  var msgsEl = document.getElementById('msgs');
  var mio = eqNombre(usuario, U.nombre);
  var div = document.createElement('div');
  div.className='msg '+(mio?'mio':'otro');
  div.id='m-'+id;
  var hora = new Date(creado_en).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
  var expiraMs = new Date(creado_en).getTime() + 24*3600*1000;
  var rolTag = await tagRolDe(usuario);
  var avatarUrl = await avatarDe(usuario);

  div.innerHTML =
    '<img class="msg-avatar" src="'+(avatarUrl||'')+'" onclick="verFotoAmpliada(\''+(avatarUrl||'').replace(/'/g,"\\'")+'\',\''+usuario.replace(/'/g,"\\'")+'\')">' +
    '<div class="msg-cuerpo">' +
    (mio?'':'<div class="msg-header" onclick="abrirMenuUsuario(\''+usuario.replace(/'/g,"\\'")+'\')">'+escHtml(usuario)+rolTag+'</div>') +
    '<div class="msg-burbuja">'+escHtml(texto)+'</div>' +
    '<div class="msg-reacciones" data-mid="'+id+'">' +
      '<span class="reac-btn" onclick="reaccionar('+id+',\'gris\')" id="reac-gris-'+id+'">🩶 <span class="num">0</span></span>' +
      '<span class="reac-btn" onclick="reaccionar('+id+',\'violeta\')" id="reac-violeta-'+id+'">💜 <span class="num">0</span></span>' +
    '</div>' +
    '<div class="msg-time">'+hora+' · <span class="msg-caduca" data-expira="'+expiraMs+'">⏳</span></div>' +
    '</div>';
  msgsEl.appendChild(div);
  actualizarUnTemporizador(div.querySelector('.msg-caduca'));
  if(typeof id === 'number') cargarReacciones(id);
  if(U.rol==='centro_mando' && typeof id==='number') activarBorrarLargoPresion(div, id);
}

/* ── El C.E.O. puede borrar cualquier publicación manteniéndola presionada ── */
function activarBorrarLargoPresion(div, mensajeId){
  var burbuja = div.querySelector('.msg-burbuja');
  if(!burbuja) return;
  var tid = null;
  var iniciar = function(){ tid = setTimeout(function(){ confirmarBorrarPublicacion(mensajeId, div); }, 550); };
  var cancelar = function(){ clearTimeout(tid); };
  burbuja.addEventListener('touchstart', iniciar);
  burbuja.addEventListener('touchend', cancelar);
  burbuja.addEventListener('touchmove', cancelar);
  burbuja.addEventListener('mousedown', iniciar);
  burbuja.addEventListener('mouseup', cancelar);
  burbuja.addEventListener('mouseleave', cancelar);
  burbuja.style.cursor = 'pointer';
}
async function confirmarBorrarPublicacion(mensajeId, div){
  if(!confirm('¿Eliminar esta publicación? (acción del Centro de Mando, no se puede deshacer)')) return;
  try{
    await sb.from('pc_mensajes').delete().eq('id',mensajeId);
    div.remove();
  }catch(x){ alert('Error al eliminar la publicación'); }
}

function verFotoAmpliada(url, nombre){
  var overlay = document.createElement('div');
  overlay.className = 'overlay on';
  overlay.style.zIndex = 600;
  overlay.onclick = function(){ overlay.remove(); };
  overlay.innerHTML =
    '<div style="max-width:90vw;max-height:80vh;text-align:center;" onclick="event.stopPropagation()">' +
    (url ? '<img src="'+url+'" style="max-width:100%;max-height:70vh;border-radius:8px;border:2px solid var(--accent);">' : '<div style="width:220px;height:220px;border-radius:50%;background:rgba(128,128,128,.3);margin:0 auto;"></div>') +
    '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center;">' +
      '<button class="btn secundario" style="width:auto;padding:10px 18px;" onclick="this.closest(\'.overlay\').remove();verPerfil(\''+nombre.replace(/'/g,"\\'")+'\')">Ver perfil</button>' +
      '<button class="btn secundario" style="width:auto;padding:10px 18px;" onclick="this.closest(\'.overlay\').remove()">Cerrar</button>' +
    '</div></div>';
  document.body.appendChild(overlay);
}

async function avatarDe(nombre){
  try{
    var {data} = await sb.from('pc_usuarios').select('imagen_url').ilike('nombre',nombre).maybeSingle();
    return data ? data.imagen_url : null;
  }catch(x){ return null; }
}
async function tagRolDe(nombre){
  if(esCEO(nombre)) return ' <span class="rol-tag rol-ceo">CEO</span>';
  try{
    var {data} = await sb.from('pc_usuarios').select('rol').ilike('nombre',nombre).maybeSingle();
    if(data && data.rol==='moderador') return ' <span class="rol-tag rol-mod">MOD</span>';
  }catch(x){}
  return '';
}

/* ── REACCIONES (corazón gris / corazón violeta) ── */
async function cargarReacciones(mensajeId){
  try{
    var {data} = await sb.from('pc_reacciones').select('usuario,tipo').eq('mensaje_id',mensajeId);
    var gris=0, violeta=0, miReaccion=null;
    (data||[]).forEach(function(r){
      if(r.tipo==='gris') gris++; else violeta++;
      if(eqNombre(r.usuario,U.nombre)) miReaccion=r.tipo;
    });
    var elG = document.getElementById('reac-gris-'+mensajeId);
    var elV = document.getElementById('reac-violeta-'+mensajeId);
    if(elG){ elG.querySelector('.num').textContent=gris; elG.classList.toggle('activo', miReaccion==='gris'); }
    if(elV){ elV.querySelector('.num').textContent=violeta; elV.classList.toggle('activo', miReaccion==='violeta'); }
  }catch(x){}
}
async function reaccionar(mensajeId, tipo){
  try{
    var {data:existente} = await sb.from('pc_reacciones').select('id,tipo').eq('mensaje_id',mensajeId).eq('usuario',U.nombre).maybeSingle();
    if(existente && existente.tipo===tipo){
      await sb.from('pc_reacciones').delete().eq('id',existente.id); // toca de nuevo para quitar la reacción
    } else if(existente){
      await sb.from('pc_reacciones').update({tipo:tipo}).eq('id',existente.id);
    } else {
      await sb.from('pc_reacciones').insert({mensaje_id:mensajeId, usuario:U.nombre, tipo:tipo});
    }
    cargarReacciones(mensajeId);
    // notificar al autor del mensaje (si no soy yo mismo)
    var {data:msg} = await sb.from('pc_mensajes').select('usuario,contenido_cifrado,iv,creado_en').eq('id',mensajeId).maybeSingle();
    if(msg && !eqNombre(msg.usuario,U.nombre) && tipo==='violeta'){
      var texto = await descifrar(msg.contenido_cifrado, msg.iv, SALA_ACTUAL);
      var hora = new Date(msg.creado_en).toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'});
      await sb.from('pc_notificaciones').insert({
        usuario_destino: msg.usuario, tipo:'reaccion',
        contenido: U.nombre+' le dio 💜 corazón violeta a tu comentario de las '+hora+': "'+texto.slice(0,60)+'"'
      });
    }
  }catch(x){}
}

/* ── AUTO-LIMPIEZA: mensajes de sala 24h, DM 72h ── */
function actualizarUnTemporizador(el){
  if(!el) return;
  var restanteMs = parseInt(el.dataset.expira,10) - Date.now();
  if(restanteMs<=0){ var msg = el.closest('.msg'); if(msg) msg.remove(); return; }
  var h = Math.floor(restanteMs/3600000); var m = Math.floor((restanteMs%3600000)/60000);
  el.textContent = '⏳ se borra en '+h+'h '+m+'m';
}
function actualizarTodosTemporizadores(){ document.querySelectorAll('.msg-caduca').forEach(actualizarUnTemporizador); }
setInterval(actualizarTodosTemporizadores, 60000);
async function limpiarMensajesSalaExpirados(){
  var cutoff = new Date(Date.now() - 24*3600*1000).toISOString();
  try{ await sb.from('pc_mensajes').delete().lt('creado_en', cutoff); }catch(x){}
}
async function limpiarDMExpirados(){
  var cutoff = new Date(Date.now() - 72*3600*1000).toISOString();
  try{ await sb.from('pc_dm').delete().lt('creado_en', cutoff); }catch(x){}
}
async function limpiarNotificacionesExpiradas(){
  var cutoff = new Date(Date.now() - 48*3600*1000).toISOString();
  try{ await sb.from('pc_notificaciones').delete().lt('creado_en', cutoff); }catch(x){}
}

/* ── ENVIAR MENSAJE DE SALA ── */
var enviando = false;
var ultimoTextoEnviado = '';
var ultimoTextoEnviadoSeg = 0;
async function enviar(){
  if(enviando) return; // evita doble-envío por doble-toque en móvil
  var inp = document.getElementById('msg-input');
  var txt = inp.value.trim();
  if(!txt) return;

  // Red de seguridad extra: si el mismo texto exacto se intenta enviar de
  // nuevo dentro de los 20 segundos siguientes, se bloquea. (Antes eran 4s,
  // muy poco tiempo — si alguien no ve respuesta inmediata y vuelve a tocar
  // 5-6 segundos después, esos 4s ya se habían vencido y dejaba pasar un
  // segundo envío real. 20s da mucho más margen.)
  var ahoraTxt = Date.now()/1000;
  if(txt===ultimoTextoEnviado && (ahoraTxt-ultimoTextoEnviadoSeg)<20){ return; }

  var s = SALAS.find(x=>x.orden===SALA_ACTUAL);
  var ahora = Date.now()/1000;
  if(ahora-ultimoEnvioSeg < s.seg){
    document.getElementById('wait-ind').textContent = 'Espera '+Math.ceil(s.seg-(ahora-ultimoEnvioSeg))+'s para publicar de nuevo en esta sala';
    return;
  }
  enviando = true;
  var btn = document.getElementById('btn-send');
  var iconoOriginal = btn.textContent;
  btn.disabled = true; btn.textContent = '⏳'; // retroalimentación visual clara: "se está enviando"
  inp.disabled = true;
  ultimoTextoEnviado = txt; ultimoTextoEnviadoSeg = ahoraTxt;
  inp.value='';
  var enc = await cifrar(txt, SALA_ACTUAL);
  try{
    // .select().single() devuelve la fila REAL insertada (con su id real de
    // la base de datos). Antes se dibujaba un id falso 'tmp-...' aparte, y
    // cuando el sondeo traía después la fila real (con OTRO id), la app no
    // reconocía que era el mismo mensaje y lo mostraba dos veces. Usando el
    // id real desde el principio, el sondeo posterior lo reconoce como ya
    // mostrado (mismo id) y no lo repite.
    var {data,error} = await sb.from('pc_mensajes')
      .insert({ sala_orden:SALA_ACTUAL, usuario:U.nombre, contenido_cifrado:enc.c, iv:enc.iv })
      .select().single();
    if(error) throw error;
    incrementarContadorPosts();
    ultimoEnvioSeg = ahora;
    document.getElementById('wait-ind').textContent='';
    ultimoMsgId = Math.max(ultimoMsgId||0, data.id); // el sondeo ya no volverá a traer este mensaje
    await agregarMensajeDOM(data.id, U.nombre, txt, data.creado_en);
    document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
  }catch(x){ alert('No se pudo enviar el mensaje. Intenta de nuevo.'); }
  enviando = false;
  btn.disabled = false; btn.textContent = iconoOriginal;
  inp.disabled = false;
}
function keyEnter(e){
  if(e.isComposing) return; // evita el doble-disparo de Enter que hacen algunos teclados móviles al aceptar emoji/autocorrección
  if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); enviar(); }
}
async function incrementarContadorPosts(){
  try{
    var {data} = await sb.from('pc_usuarios').select('posts_totales').ilike('nombre',U.nombre).maybeSingle();
    var actual = (data && data.posts_totales) || 0;
    await sb.from('pc_usuarios').update({posts_totales: actual+1}).ilike('nombre',U.nombre);
  }catch(x){}
}

