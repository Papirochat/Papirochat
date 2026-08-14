'use strict';

/* ══ MENÚ PRINCIPAL ∆° ══ */
function abrirMenuPrincipal(){
  actualizarBadgeContactos();
  document.getElementById('menu-overlay').classList.add('on');
}

var TAMANOS_BANNER = { pequena:'18px', mediana:'25px', grande:'34px' }; // "grande" casi toca el borde superior/inferior del banner (130px de alto)
var VELOCIDADES_BANNER = { baja:1.7, normal:1, alta:0.5 }; // multiplican la duración: más alto = más lento

function pintarPildoras(contenedorId, opciones, valorActivo, onElegir){
  var cont = document.getElementById(contenedorId);
  cont.innerHTML = '';
  Object.keys(opciones).forEach(function(clave){
    var p = document.createElement('div');
    p.className = 'opcion-pill' + (clave===valorActivo ? ' activo' : '');
    p.textContent = opciones[clave];
    p.onclick = function(){ onElegir(clave); };
    cont.appendChild(p);
  });
}

/* ══ ∆Banner° ══ */
var BANNER_ACTUAL = null;
var PALETA_BANNER = ['#a855f7','#00ff41','#ff4b3e','#ffe066','#38bdf8','#ffffff','#000000'];

function colorTextoEfectivo(d){
  return localStorage.getItem('pc_banner_color_texto') || (d && d.color) || '#a855f7';
}
function colorCajaEfectivo(d){
  return localStorage.getItem('pc_banner_color_caja') || (d && d.color_caja) || (d && d.color) || '#a855f7';
}

async function cargarBanner(){
  try{
    var {data} = await sb.from('pc_banner').select('*').eq('id',1).maybeSingle();
    BANNER_ACTUAL = data;
    var texto = (data && data.texto) ? data.texto : 'P∆pir°Chat — el tema del día aparecerá aquí';
    var colorTexto = colorTextoEfectivo(data);
    var colorCaja = colorCajaEfectivo(data);
    var track = document.getElementById('banner-texto-marquee');
    track.textContent = texto;
    track.style.color = colorTexto;
    track.style.textShadow = '0 0 6px '+colorTexto;
    track.style.fontSize = TAMANOS_BANNER[(data && data.tamano_letra) || 'pequena'];
    document.getElementById('banner-wrap').style.borderColor = colorCaja;
    document.getElementById('banner-wrap').style.background =
      'radial-gradient(circle, '+colorCaja+' 1.1px, transparent 1.3px) 0 0/7px 7px, #0b0b0b';
    var multiplicador = VELOCIDADES_BANNER[(data && data.velocidad) || 'normal'];
    var duracionSeg = Math.max(6, texto.length * 0.18 * multiplicador); // más texto = animación más larga, no más rápida
    track.style.animationDuration = duracionSeg + 's';
    var mini = document.getElementById('banner-apoyo-mini');
    if(data && data.imagen_apoyo){ mini.src = data.imagen_apoyo; mini.style.display='block'; }
    else { mini.style.display='none'; }
  }catch(x){}
}

function abrirBannerCompleto(){
  var d = BANNER_ACTUAL;
  var cont = document.getElementById('banner-lectura-content');
  var texto = (d && d.texto) ? d.texto : 'Aún no se ha publicado un tema.';
  cont.innerHTML =
    (d && d.imagen_apoyo ? '<img class="apoyo" src="'+d.imagen_apoyo+'">' : '') +
    '<div class="texto-completo">'+escHtml(texto)+'</div>';
  document.getElementById('banner-lectura-overlay').classList.add('on');
}

function abrirImagenApoyo(){
  var d = BANNER_ACTUAL;
  if(!d || !d.imagen_apoyo) return;
  document.getElementById('banner-imagen-grande').src = d.imagen_apoyo;
  document.getElementById('banner-imagen-texto').innerHTML = escHtml(d.texto || 'Aún no se ha publicado un tema.');
  document.getElementById('banner-imagen-overlay').classList.add('on');
}

/* ══ Construcción de paletas con palomita de confirmación ══ */
function pintarPaleta(contenedorId, colorActivo, onElegir){
  var cont = document.getElementById(contenedorId);
  cont.innerHTML = '';
  PALETA_BANNER.forEach(function(c){
    var sw = document.createElement('div');
    sw.className = 'color-swatch' + (c.toLowerCase()===colorActivo.toLowerCase() ? ' activo' : '');
    sw.style.background = c;
    sw.onclick = function(){ onElegir(c); };
    cont.appendChild(sw);
  });
}

/* ══ Editor completo del CEO (texto + ambos colores) ══ */
var COLOR_TEXTO_NUEVO = '#a855f7';
var COLOR_CAJA_NUEVO = '#a855f7';
var IMG_APOYO_BASE64 = null;
var TAMANO_NUEVO = 'pequena';
var VELOCIDAD_NUEVA = 'normal';

function abrirEditorBanner(){
  cerrarOverlay('menu-overlay');
  var d = BANNER_ACTUAL;
  document.getElementById('banner-texto-input').value = (d && d.texto) ? d.texto : '';
  document.getElementById('banner-char-count').textContent = document.getElementById('banner-texto-input').value.length;
  document.getElementById('banner-texto-input').oninput = function(){ document.getElementById('banner-char-count').textContent = this.value.length; };
  if(d && d.imagen_apoyo){ document.getElementById('banner-apoyo-preview').src = d.imagen_apoyo; document.getElementById('banner-apoyo-preview').style.display='block'; }
  IMG_APOYO_BASE64 = null;
  COLOR_TEXTO_NUEVO = (d && d.color) ? d.color : '#a855f7';
  COLOR_CAJA_NUEVO = (d && d.color_caja) ? d.color_caja : COLOR_TEXTO_NUEVO;
  TAMANO_NUEVO = (d && d.tamano_letra) || 'pequena';
  VELOCIDAD_NUEVA = (d && d.velocidad) || 'normal';
  redibujarPaletasEditorCEO();
  document.getElementById('banner-editor-overlay').classList.add('on');
}

function redibujarPaletasEditorCEO(){
  pintarPaleta('swatches-texto', COLOR_TEXTO_NUEVO, function(c){ COLOR_TEXTO_NUEVO=c; redibujarPaletasEditorCEO(); });
  pintarPaleta('swatches-caja', COLOR_CAJA_NUEVO, function(c){ COLOR_CAJA_NUEVO=c; redibujarPaletasEditorCEO(); });
  pintarPildoras('opciones-tamano', {pequena:'Pequeña',mediana:'Mediana',grande:'Grande'}, TAMANO_NUEVO, function(v){ TAMANO_NUEVO=v; redibujarPaletasEditorCEO(); });
  pintarPildoras('opciones-velocidad', {baja:'Baja',normal:'Normal',alta:'Alta'}, VELOCIDAD_NUEVA, function(v){ VELOCIDAD_NUEVA=v; redibujarPaletasEditorCEO(); });
}

async function previsualizarBannerApoyo(){
  var file = document.getElementById('banner-img-apoyo-input').files[0];
  if(!file) return;
  try{
    IMG_APOYO_BASE64 = await comprimirImagen(file);
    var prev = document.getElementById('banner-apoyo-preview');
    prev.src = IMG_APOYO_BASE64; prev.style.display='block';
  }catch(x){ alert('No se pudo procesar la imagen. Prueba con otra.'); }
}

async function guardarBanner(){
  var texto = document.getElementById('banner-texto-input').value.trim().slice(0,777);
  try{
    var update = { texto:texto||null, color:COLOR_TEXTO_NUEVO, color_caja:COLOR_CAJA_NUEVO, tamano_letra:TAMANO_NUEVO, velocidad:VELOCIDAD_NUEVA, actualizado_en:new Date().toISOString() };
    if(IMG_APOYO_BASE64) update.imagen_apoyo = IMG_APOYO_BASE64;
    await sb.from('pc_banner').update(update).eq('id',1);
    cerrarOverlay('banner-editor-overlay');
    cargarBanner();
    alert('Banner publicado.');
  }catch(x){ alert('Error al guardar el banner'); }
}

/* ══ ∆Banner-Color°: cualquier usuario personaliza SOLO los colores que ve ══ */
var COLOR_TEXTO_USER_TEMP = '#a855f7';
var COLOR_CAJA_USER_TEMP = '#a855f7';

function abrirEditorColorBanner(){
  cerrarOverlay('menu-overlay');
  var d = BANNER_ACTUAL;
  COLOR_TEXTO_USER_TEMP = colorTextoEfectivo(d);
  COLOR_CAJA_USER_TEMP = colorCajaEfectivo(d);
  redibujarPaletasEditorUsuario();
  document.getElementById('banner-color-overlay').classList.add('on');
}

function redibujarPaletasEditorUsuario(){
  pintarPaleta('swatches-texto-user', COLOR_TEXTO_USER_TEMP, function(c){ COLOR_TEXTO_USER_TEMP=c; redibujarPaletasEditorUsuario(); });
  pintarPaleta('swatches-caja-user', COLOR_CAJA_USER_TEMP, function(c){ COLOR_CAJA_USER_TEMP=c; redibujarPaletasEditorUsuario(); });
}

function guardarColorPersonalBanner(){
  localStorage.setItem('pc_banner_color_texto', COLOR_TEXTO_USER_TEMP);
  localStorage.setItem('pc_banner_color_caja', COLOR_CAJA_USER_TEMP);
  cerrarOverlay('banner-color-overlay');
  cargarBanner();
  alert('Listo — así se ve tu banner ahora. Solo en tu dispositivo.');
}

function restablecerColorBanner(){
  localStorage.removeItem('pc_banner_color_texto');
  localStorage.removeItem('pc_banner_color_caja');
  cerrarOverlay('banner-color-overlay');
  cargarBanner();
}

async function actualizarBadgeContactos(){
  try{
    var {count} = await sb.from('pc_contactos').select('*',{count:'exact',head:true}).eq('dueno',U.nombre);
    document.getElementById('menu-contactos-count').textContent = count||0;
  }catch(x){}
}

/* ══ ARREGLO: la campanita ahora cuenta solo lo NO LEÍDO ══
   Antes contaba todas las notificaciones del usuario, aunque ya las
   hubiera visto. Ahora cuenta únicamente las que tienen leido = false,
   así que el número desaparece en cuanto entras a ∆Notificación°
   (ver notificaciones-dm.js, función abrirNotificaciones). */
async function actualizarBadgeNotificaciones(){
  try{
    await limpiarNotificacionesExpiradas();
    var {count} = await sb.from('pc_notificaciones').select('*',{count:'exact',head:true}).eq('usuario_destino',U.nombre).eq('leido',false);
    document.getElementById('notif-badge').textContent = count>0 ? (' '+count) : '';
  }catch(x){}
}
setInterval(actualizarBadgeNotificaciones, 20000);

/* ══ EDITAR BITCHAT / BRIAR (sin restricción de tiempo, cada quien el suyo) ══ */
async function editarCodigo(campo, etiqueta){
  cerrarOverlay('menu-overlay');
  var nuevo = prompt('Nuevo '+etiqueta+':');
  if(nuevo===null) return;
  var update = {}; update[campo] = nuevo.trim()||null;
  try{ await sb.from('pc_usuarios').update(update).ilike('nombre',U.nombre); alert('Actualizado.'); }catch(x){ alert('Error al actualizar'); }
}

/* ══ ∆Seña-Cromática°: acceso directo desde el menú, sin esperar el sobre ══
   Abre sng.html en modo "registro" para que cualquier usuario pueda
   crear o reemplazar su seña cuando quiera. IMPORTANTE: el archivo se
   llama exactamente "sng.html" — si alguna vez otra IA te sugiere un
   nombre distinto, no le hagas caso, ese es el nombre real. */
function abrirSenaCromatica(){
  cerrarOverlay('menu-overlay');
  location.href = 'sng.html?modo=registro&usuario='+encodeURIComponent(U.nombre);
}
